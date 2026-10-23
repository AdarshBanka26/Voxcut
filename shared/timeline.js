// Timeline engine (SRS §7.3). Pure functions with no I/O and no React, so they
// can be unit-tested directly. All times are in seconds of *source* media unless
// a name says "timeline".
//
// Core invariant: source timestamps stay anchored to the original media; the
// timeline is derived from the ordered list of retained (non-cut) segments.

export const EPSILON = 1e-6;
/** Word timestamps from speech models can overshoot the media end slightly. */
export const DURATION_TOLERANCE = 0.05;

export class RangeValidationError extends Error {
  constructor(message, range) {
    super(message);
    this.name = 'RangeValidationError';
    this.range = range;
  }
}

/**
 * Validate a single {start, end} range against the source duration.
 * Rejects NaN, negative, reversed and out-of-duration ranges (SRS §8.1).
 * Ranges that overshoot the end by less than DURATION_TOLERANCE are clamped.
 */
export function validateRange(range, duration = Infinity) {
  if (!range || typeof range !== 'object') throw new RangeValidationError('Range must be an object with start and end', range);
  const { start, end } = range;
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new RangeValidationError('Range start and end must be finite numbers', range);
  if (start < 0) throw new RangeValidationError('Range start cannot be negative', range);
  if (end < start) throw new RangeValidationError('Range end cannot be before its start', range);
  if (start > duration + DURATION_TOLERANCE) throw new RangeValidationError('Range starts after the end of the media', range);
  if (end > duration + DURATION_TOLERANCE) throw new RangeValidationError('Range extends past the end of the media', range);
  return { start, end: Math.min(end, duration) };
}

/**
 * Validate, sort and merge ranges. Overlapping or touching ranges are merged and
 * zero-length ranges dropped, so the result never contains duplicate or
 * negative intervals (SRS §3.1, TC-04).
 */
export function normalizeRanges(ranges, duration = Infinity) {
  const valid = ranges
    .map(r => validateRange(r, duration))
    .filter(r => r.end - r.start > EPSILON)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const r of valid) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end + EPSILON) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

/** Remove every range in `remove` from `base`. Both inputs must be normalized. */
export function subtractRanges(base, remove) {
  const out = [];
  for (const b of base) {
    let pieces = [{ ...b }];
    for (const r of remove) {
      const next = [];
      for (const p of pieces) {
        if (r.end <= p.start + EPSILON || r.start >= p.end - EPSILON) { next.push(p); continue; }
        if (r.start > p.start + EPSILON) next.push({ start: p.start, end: r.start });
        if (r.end < p.end - EPSILON) next.push({ start: r.end, end: p.end });
      }
      pieces = next;
    }
    out.push(...pieces);
  }
  return out;
}

export function totalLength(ranges) {
  return ranges.reduce((sum, r) => sum + (r.end - r.start), 0);
}

/**
 * Replay edit operations in order to get the active cut list. Operations are
 * deterministic, so persisting them is enough to rebuild the exact timeline
 * (SRS §8.1). Undone operations are skipped.
 */
export function cutsFromOperations(operations, duration = Infinity) {
  let cuts = [];
  for (const op of operations) {
    if (op.undone) continue;
    const ranges = normalizeRanges(op.sourceRanges ?? [], duration);
    if (op.type === 'cut') cuts = normalizeRanges([...cuts, ...ranges], duration);
    else if (op.type === 'restore') cuts = subtractRanges(cuts, ranges);
  }
  return cuts;
}

/**
 * Retained segments with accumulated timelineStart values. Each segment is
 * { id, sourceStart, sourceEnd, timelineStart, duration }.
 */
export function computeSegments(sourceDuration, cuts) {
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) return [];
  const kept = subtractRanges([{ start: 0, end: sourceDuration }], normalizeRanges(cuts, sourceDuration));
  let timelineStart = 0;
  return kept
    .filter(r => r.end - r.start > EPSILON)
    .map((r, i) => {
      const seg = { id: `seg-${i}`, sourceStart: r.start, sourceEnd: r.end, timelineStart, duration: r.end - r.start };
      timelineStart += seg.duration;
      return seg;
    });
}

export function timelineDuration(segments) {
  const last = segments[segments.length - 1];
  return last ? last.timelineStart + last.duration : 0;
}

/** Index of the segment whose [a, b) interval contains x, by binary search. */
function findSegment(segments, x, startKey, lengthOf) {
  let lo = 0;
  let hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = segments[mid];
    const a = s[startKey];
    const b = a + lengthOf(s);
    if (x < a - EPSILON) hi = mid - 1;
    else if (x >= b - EPSILON) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/** sourceTime = sourceStart + (t - timelineStart). Returns null outside the timeline. */
export function timelineToSource(segments, t) {
  if (!segments.length || !Number.isFinite(t) || t < 0) return null;
  const total = timelineDuration(segments);
  if (t >= total - EPSILON) return t <= total + EPSILON ? segments[segments.length - 1].sourceEnd : null;
  const i = findSegment(segments, t, 'timelineStart', s => s.duration);
  if (i < 0) return null;
  const s = segments[i];
  return s.sourceStart + (t - s.timelineStart);
}

/** timelineTime = timelineStart + (s - sourceStart). Null when s is inside a cut. */
export function sourceToTimeline(segments, s) {
  if (!segments.length || !Number.isFinite(s)) return null;
  const i = findSegment(segments, s, 'sourceStart', seg => seg.duration);
  if (i < 0) {
    const last = segments[segments.length - 1];
    return Math.abs(s - last.sourceEnd) <= EPSILON ? timelineDuration(segments) : null;
  }
  const seg = segments[i];
  return seg.timelineStart + (s - seg.sourceStart);
}

/**
 * Where playback should be for a given source position (SRS §4.4 step 6).
 * Returns { sourceTime, jumped } or null once playback has passed the last
 * retained segment.
 */
export function resolvePlayback(segments, sourceTime) {
  if (!segments.length) return null;
  const i = findSegment(segments, sourceTime, 'sourceStart', seg => seg.duration);
  if (i >= 0) return { sourceTime, jumped: false };
  const next = segments.find(seg => seg.sourceStart > sourceTime - EPSILON);
  return next ? { sourceTime: next.sourceStart, jumped: true } : null;
}

/**
 * Turn selected word ids into source ranges. Words that are adjacent in the
 * transcript are merged into one range so the silence between them is removed
 * too (SRS §3.1: union of the selected words' intervals).
 */
export function rangesForWords(words, wordIds) {
  const selected = new Set(wordIds);
  const ranges = [];
  let current = null;
  for (const w of words) {
    if (!selected.has(w.id)) { current = null; continue; }
    if (current) current.end = Math.max(current.end, w.sourceEnd);
    else { current = { start: w.sourceStart, end: w.sourceEnd }; ranges.push(current); }
  }
  return ranges;
}

/** A word counts as cut when its midpoint lies inside a cut range. */
export function isWordCut(word, cuts) {
  const mid = (word.sourceStart + word.sourceEnd) / 2;
  return cuts.some(c => mid >= c.start - EPSILON && mid <= c.end + EPSILON);
}

/** Index of the word being spoken at source time s, or -1. */
export function activeWordIndex(words, s) {
  let lo = 0;
  let hi = words.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const w = words[mid];
    if (s < w.sourceStart) hi = mid - 1;
    else if (s >= w.sourceEnd) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/** Snap a time to the nearest frame boundary for rendering (SRS §7.3). */
export function quantizeToFrame(t, fps) {
  if (!Number.isFinite(fps) || fps <= 0) return t;
  return Math.round(t * fps) / fps;
}

/** Full derived timeline state for a set of operations. */
export function buildTimeline(sourceDuration, operations) {
  const cuts = cutsFromOperations(operations, sourceDuration);
  const segments = computeSegments(sourceDuration, cuts);
  return {
    sourceDuration,
    cuts,
    segments,
    duration: timelineDuration(segments),
    removed: totalLength(cuts),
    canUndo: operations.some(op => !op.undone),
    canRedo: operations.some(op => op.undone)
  };
}
