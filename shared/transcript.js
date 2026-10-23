// Transcript model: normalizing recognizer output into stable word objects and
// detecting filler / pause suggestions (SRS §3.2, §4.2).

import { DURATION_TOLERANCE, EPSILON, isWordCut } from './timeline.js';

export const DEFAULT_FILLERS = ['um', 'uh', 'erm', 'uhm', 'umm', 'hmm', 'mm', 'ah', 'er'];
export const MAX_WORD_LENGTH = 200;

let counter = 0;
export function makeWordId() {
  counter = (counter + 1) % 1e6;
  return `w_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Lowercase and strip punctuation so "Um," matches "um". */
export function normalizeToken(text) {
  return String(text).toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}']+/gu, '').replace(/^'+|'+$/g, '');
}

/**
 * Convert recognizer chunks ([{ text, timestamp: [start, end] }]) into word
 * objects { id, text, sourceStart, sourceEnd, confidence, speakerId, precision }.
 * Missing end times borrow the next start; everything is clamped to the media
 * and forced to be monotonic so later range maths never sees reversed words.
 */
export function normalizeChunks(chunks, duration, { offset = 0, precision = 'word' } = {}) {
  const words = [];
  const items = chunks
    .map(c => ({ text: String(c.text ?? '').trim(), start: c.timestamp?.[0], end: c.timestamp?.[1] }))
    .filter(c => c.text.length > 0);
  for (let i = 0; i < items.length; i++) {
    const c = items[i];
    let start = Number.isFinite(c.start) ? c.start + offset : (words.at(-1)?.sourceEnd ?? offset);
    let end = Number.isFinite(c.end) ? c.end + offset : (Number.isFinite(items[i + 1]?.start) ? items[i + 1].start + offset : start + 0.3);
    const prevEnd = words.at(-1)?.sourceEnd ?? 0;
    start = Math.max(start, prevEnd, 0);
    end = Math.max(end, start);
    if (Number.isFinite(duration)) { start = Math.min(start, duration); end = Math.min(end, duration); }
    words.push({
      id: makeWordId(),
      text: c.text.slice(0, MAX_WORD_LENGTH),
      sourceStart: round(start),
      sourceEnd: round(end),
      confidence: null,
      speakerId: null,
      precision
    });
  }
  return words;
}

/**
 * Spread the words of segment-level output evenly (by character length) across
 * each segment. The result is labelled "approximate" (SRS §4.2 step 6).
 */
export function distributeSegments(segments, duration, { offset = 0 } = {}) {
  const chunks = [];
  for (const seg of segments) {
    const tokens = String(seg.text ?? '').trim().split(/\s+/).filter(Boolean);
    const start = seg.timestamp?.[0] ?? 0;
    const end = seg.timestamp?.[1] ?? start + tokens.length * 0.35;
    const weights = tokens.map(t => Math.max(1, t.length));
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    let cursor = start;
    tokens.forEach((t, i) => {
      const len = ((end - start) * weights[i]) / total;
      chunks.push({ text: t, timestamp: [cursor, cursor + len] });
      cursor += len;
    });
  }
  return normalizeChunks(chunks, duration, { offset, precision: 'approximate' });
}

/** Manual transcript entry for media without usable speech (SRS §4.2 step 2). */
export function wordsFromText(text, duration) {
  const segment = { text: String(text ?? ''), timestamp: [0, duration] };
  return distributeSegments([segment], duration);
}

/** Validate imported words (untrusted input, NFR-07). Returns cleaned words. */
export function validateWords(words, duration) {
  if (!Array.isArray(words)) throw new TypeError('words must be an array');
  let prevStart = -Infinity;
  return words.map((w, i) => {
    const text = String(w?.text ?? '').trim();
    const start = Number(w?.sourceStart);
    const end = Number(w?.sourceEnd);
    if (!text) throw new TypeError(`Word ${i} has no text`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) throw new TypeError(`Word ${i} has invalid timing`);
    if (Number.isFinite(duration) && end > duration + DURATION_TOLERANCE) throw new TypeError(`Word ${i} ends after the media`);
    if (start < prevStart - EPSILON) throw new TypeError(`Word ${i} is out of order`);
    prevStart = start;
    return {
      id: typeof w.id === 'string' && /^[\w-]{1,64}$/.test(w.id) ? w.id : makeWordId(),
      text: text.slice(0, MAX_WORD_LENGTH),
      sourceStart: start,
      sourceEnd: Number.isFinite(duration) ? Math.min(end, duration) : end,
      confidence: Number.isFinite(w.confidence) ? w.confidence : null,
      speakerId: typeof w.speakerId === 'string' ? w.speakerId.slice(0, 64) : null,
      precision: w.precision === 'approximate' ? 'approximate' : 'word'
    };
  });
}

/**
 * Filler candidates. Vocabulary entries may be multi-word ("you know").
 * Words that are already cut are skipped.
 */
export function findFillers(words, { vocabulary = DEFAULT_FILLERS, cuts = [] } = {}) {
  const phrases = vocabulary.map(v => String(v).split(/\s+/).map(normalizeToken).filter(Boolean)).filter(p => p.length);
  phrases.sort((a, b) => b.length - a.length);
  const tokens = words.map(w => normalizeToken(w.text));
  const out = [];
  for (let i = 0; i < words.length; i++) {
    if (isWordCut(words[i], cuts)) continue;
    const match = phrases.find(p => p.every((t, k) => tokens[i + k] === t));
    if (!match) continue;
    const span = words.slice(i, i + match.length);
    out.push({
      type: 'filler',
      sourceStart: span[0].sourceStart,
      sourceEnd: span.at(-1).sourceEnd,
      label: span.map(w => w.text).join(' '),
      confidence: span.every(w => w.precision === 'word') ? 0.9 : 0.6,
      wordIds: span.map(w => w.id)
    });
    i += match.length - 1;
  }
  return out;
}

/**
 * Pause candidates from gaps between word timings. `padding` seconds of the
 * pause are kept on each side so cuts don't feel clipped (SRS §12 "retain
 * configurable pauses"). 0.5 s is a starting default, not a rule.
 */
export function findPausesFromWords(words, { minPause = 0.5, padding = 0.1, duration, cuts = [] } = {}) {
  const out = [];
  const gaps = [];
  if (words.length && words[0].sourceStart > 0) gaps.push([0, words[0].sourceStart, 'Leading silence']);
  for (let i = 1; i < words.length; i++) gaps.push([words[i - 1].sourceEnd, words[i].sourceStart, 'Pause']);
  if (words.length && Number.isFinite(duration) && duration > words.at(-1).sourceEnd) gaps.push([words.at(-1).sourceEnd, duration, 'Trailing silence']);
  for (const [a, b, label] of gaps) {
    if (b - a < minPause) continue;
    const start = label === 'Leading silence' ? a : a + padding;
    const end = label === 'Trailing silence' ? b : b - padding;
    if (end - start <= EPSILON) continue;
    if (cuts.some(c => c.start <= start + EPSILON && c.end >= end - EPSILON)) continue;
    out.push({ type: 'pause', sourceStart: round(start), sourceEnd: round(end), label: `${label} · ${(b - a).toFixed(2)}s`, confidence: 0.7, wordIds: [] });
  }
  return out;
}

/**
 * Turn silence intervals from audio analysis into pause candidates with the
 * same padding rules as the word-gap method.
 */
export function pausesFromSilences(silences, { minPause = 0.5, padding = 0.1, duration, cuts = [] } = {}) {
  return silences
    .filter(s => s.end - s.start >= minPause)
    .map(s => {
      const atStart = s.start <= EPSILON;
      const atEnd = Number.isFinite(duration) && s.end >= duration - 0.05;
      return { start: atStart ? s.start : s.start + padding, end: atEnd ? s.end : s.end - padding, len: s.end - s.start, atStart, atEnd };
    })
    .filter(s => s.end - s.start > EPSILON && !cuts.some(c => c.start <= s.start + EPSILON && c.end >= s.end - EPSILON))
    .map(s => ({
      type: 'pause',
      sourceStart: round(s.start),
      sourceEnd: round(s.end),
      label: `${s.atStart ? 'Leading silence' : s.atEnd ? 'Trailing silence' : 'Silence'} · ${s.len.toFixed(2)}s`,
      confidence: 0.8,
      wordIds: []
    }));
}

function round(t) {
  return Math.round(t * 1000) / 1000;
}
