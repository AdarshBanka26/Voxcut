// Caption engine (SRS §4.7). Captions are built from retained words only and
// timed in *timeline* time, using the same mapping as preview and export.

import { sourceToTimeline } from './timeline.js';

export const CAPTION_STYLES = {
  'cinematic-serif': { label: 'Cinematic Serif', font: 'Georgia', size: 22, color: '#FFFFFF', background: 'rgba(17,24,39,0.55)', highlight: '#F59E0B' },
  'neon-pill': { label: 'Neon Pill Box', font: 'Arial', size: 20, color: '#111827', background: '#ACF847', highlight: '#E03616' },
  'minimal-clean': { label: 'Minimal Clean', font: 'Arial', size: 18, color: '#FFFFFF', background: 'transparent', highlight: '#93C5FD' }
};

/**
 * Group retained words into caption cues. A cue ends at sentence punctuation,
 * when it would exceed maxChars / maxDuration, or at a long gap.
 */
export function buildCaptions(words, segments, { maxChars = 42, maxDuration = 4, maxGap = 0.8 } = {}) {
  const cues = [];
  let cur = null;
  const flush = () => { if (cur) cues.push(cur); cur = null; };
  for (const w of words) {
    const mid = (w.sourceStart + w.sourceEnd) / 2;
    if (sourceToTimeline(segments, mid) === null) continue; // word was cut
    const start = sourceToTimeline(segments, w.sourceStart) ?? sourceToTimeline(segments, mid);
    const end = sourceToTimeline(segments, w.sourceEnd) ?? sourceToTimeline(segments, mid);
    if (cur) {
      const text = `${cur.text} ${w.text}`;
      if (text.length > maxChars || end - cur.start > maxDuration || start - cur.end > maxGap) flush();
    }
    if (!cur) cur = { id: `cap-${cues.length}`, wordIds: [], text: '', start, end, sourceStart: w.sourceStart, sourceEnd: w.sourceEnd };
    cur.wordIds.push(w.id);
    cur.text = cur.text ? `${cur.text} ${w.text}` : w.text;
    cur.end = Math.max(cur.end, end);
    cur.sourceEnd = w.sourceEnd;
    if (/[.?!]["')\]]?$/.test(w.text)) flush();
  }
  flush();
  return cues.map((c, i) => ({ ...c, id: `cap-${i}` }));
}

function stamp(t, sep) {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const f = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(f).padStart(3, '0')}`;
}

export function toSRT(cues) {
  return cues.map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.text}\n`).join('\n');
}

export function toVTT(cues) {
  return `WEBVTT\n\n${cues.map(c => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.text}\n`).join('\n')}`;
}
