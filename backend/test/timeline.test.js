import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRanges, subtractRanges, computeSegments, timelineToSource, sourceToTimeline, resolvePlayback,
  cutsFromOperations, rangesForWords, buildTimeline, isWordCut, quantizeToFrame, RangeValidationError
} from '../../shared/timeline.js';
import { findFillers, findPausesFromWords, normalizeChunks, validateWords, wordsFromText } from '../../shared/transcript.js';
import { buildCaptions, toSRT } from '../../shared/captions.js';

const words = [
  { id: 'a', text: 'Hello', sourceStart: 0.0, sourceEnd: 0.5, precision: 'word' },
  { id: 'b', text: 'um,', sourceStart: 0.6, sourceEnd: 0.9, precision: 'word' },
  { id: 'c', text: 'world.', sourceStart: 1.0, sourceEnd: 1.5, precision: 'word' },
  { id: 'd', text: 'Next', sourceStart: 3.0, sourceEnd: 3.4, precision: 'word' },
  { id: 'e', text: 'line', sourceStart: 3.5, sourceEnd: 4.0, precision: 'word' }
];

test('rejects NaN, negative, reversed and out-of-duration ranges', () => {
  assert.throws(() => normalizeRanges([{ start: NaN, end: 1 }], 10), RangeValidationError);
  assert.throws(() => normalizeRanges([{ start: -1, end: 1 }], 10), RangeValidationError);
  assert.throws(() => normalizeRanges([{ start: 3, end: 2 }], 10), RangeValidationError);
  assert.throws(() => normalizeRanges([{ start: 3, end: 11 }], 10), RangeValidationError);
  // Small model overshoot is clamped, not rejected.
  assert.deepEqual(normalizeRanges([{ start: 9, end: 10.02 }], 10), [{ start: 9, end: 10 }]);
});

test('TC-04: overlapping and adjacent cuts are merged, zero-length dropped', () => {
  const r = normalizeRanges([{ start: 5, end: 6 }, { start: 1, end: 3 }, { start: 2, end: 4 }, { start: 4, end: 4.5 }, { start: 7, end: 7 }], 10);
  assert.deepEqual(r, [{ start: 1, end: 4.5 }, { start: 5, end: 6 }]);
});

test('subtractRanges splits around holes', () => {
  assert.deepEqual(subtractRanges([{ start: 0, end: 10 }], [{ start: 2, end: 3 }, { start: 5, end: 6 }]),
    [{ start: 0, end: 2 }, { start: 3, end: 5 }, { start: 6, end: 10 }]);
});

test('TC-03: deleting a middle word ripples the timeline', () => {
  const segs = computeSegments(10, [{ start: 2, end: 3 }]);
  assert.equal(segs.length, 2);
  assert.deepEqual(segs.map(s => [s.sourceStart, s.sourceEnd, s.timelineStart]), [[0, 2, 0], [3, 10, 2]]);
  assert.equal(timelineToSource(segs, 2.5), 3.5);
  assert.equal(sourceToTimeline(segs, 3.5), 2.5);
  assert.equal(sourceToTimeline(segs, 2.5), null, 'source time inside a cut has no timeline position');
});

test('cuts at the very start and end', () => {
  const segs = computeSegments(10, [{ start: 0, end: 1 }, { start: 9, end: 10 }]);
  assert.deepEqual(segs.map(s => [s.sourceStart, s.sourceEnd, s.timelineStart]), [[1, 9, 0]]);
  assert.equal(timelineToSource(segs, 0), 1);
  assert.equal(timelineToSource(segs, 8), 9);
  assert.equal(timelineToSource(segs, 8.5), null);
});

test('TC-06: playback jumps across a cut to the next retained segment', () => {
  const segs = computeSegments(10, [{ start: 2, end: 3 }]);
  assert.deepEqual(resolvePlayback(segs, 1.5), { sourceTime: 1.5, jumped: false });
  assert.deepEqual(resolvePlayback(segs, 2.2), { sourceTime: 3, jumped: true });
  assert.equal(resolvePlayback(computeSegments(10, [{ start: 8, end: 10 }]), 8.5), null);
});

test('TC-05: undo/redo restore the exact previous timeline', () => {
  const ops = [
    { type: 'cut', sourceRanges: [{ start: 1, end: 2 }] },
    { type: 'cut', sourceRanges: [{ start: 5, end: 6 }] }
  ];
  const full = buildTimeline(10, ops);
  const undone = buildTimeline(10, [ops[0], { ...ops[1], undone: true }]);
  assert.deepEqual(undone.cuts, buildTimeline(10, [ops[0]]).cuts);
  assert.equal(undone.duration, 9);
  assert.equal(full.duration, 8);
  assert.ok(undone.canRedo && undone.canUndo);
});

test('restore operations subtract from earlier cuts', () => {
  const cuts = cutsFromOperations([
    { type: 'cut', sourceRanges: [{ start: 1, end: 5 }] },
    { type: 'restore', sourceRanges: [{ start: 2, end: 3 }] }
  ], 10);
  assert.deepEqual(cuts, [{ start: 1, end: 2 }, { start: 3, end: 5 }]);
});

test('adjacent selected words become one range, non-adjacent stay separate', () => {
  assert.deepEqual(rangesForWords(words, ['a', 'b']), [{ start: 0, end: 0.9 }]);
  assert.deepEqual(rangesForWords(words, ['a', 'c']), [{ start: 0, end: 0.5 }, { start: 1, end: 1.5 }]);
  assert.ok(isWordCut(words[1], [{ start: 0.6, end: 0.9 }]));
  assert.ok(!isWordCut(words[2], [{ start: 0.6, end: 0.9 }]));
});

test('frame quantization', () => {
  assert.equal(quantizeToFrame(1.01, 25), 1);
  assert.equal(quantizeToFrame(1.03, 25), 1.04);
});

test('a 10,000-word cut updates the timeline within 250 ms (SRS §6.1)', () => {
  const many = Array.from({ length: 10000 }, (_, i) => ({ id: `w${i}`, text: 'x', sourceStart: i * 0.4, sourceEnd: i * 0.4 + 0.3 }));
  const ops = Array.from({ length: 200 }, (_, i) => ({ type: 'cut', sourceRanges: rangesForWords(many, [`w${i * 37}`]) }));
  const t = performance.now();
  const tl = buildTimeline(4000, ops);
  many.forEach(w => isWordCut(w, tl.cuts));
  assert.ok(performance.now() - t < 250, `took ${performance.now() - t}ms`);
});

test('filler detection normalizes case/punctuation and skips cut words', () => {
  const f = findFillers(words);
  assert.equal(f.length, 1);
  assert.deepEqual(f[0].wordIds, ['b']);
  assert.equal(findFillers(words, { cuts: [{ start: 0.6, end: 0.9 }] }).length, 0);
  assert.equal(findFillers([{ id: 'x', text: 'You', sourceStart: 0, sourceEnd: 1 }, { id: 'y', text: 'know,', sourceStart: 1, sourceEnd: 2 }], { vocabulary: ['you know'] }).length, 1);
});

test('pause detection from word gaps keeps padding', () => {
  const p = findPausesFromWords(words, { minPause: 0.5, padding: 0.1, duration: 5 });
  // Padding is kept after the last word too, so its tail is never clipped.
  assert.deepEqual(p.map(x => [x.sourceStart, x.sourceEnd]), [[1.6, 2.9], [4.1, 5]]);
});

test('recognizer chunks normalize to monotonic, clamped words', () => {
  const w = normalizeChunks([{ text: ' Hi', timestamp: [0, 0.4] }, { text: 'there', timestamp: [0.3, null] }, { text: '', timestamp: [1, 2] }, { text: 'end', timestamp: [9.8, 12] }], 10);
  assert.equal(w.length, 3);
  assert.equal(w[1].sourceStart, 0.4);
  assert.equal(w[2].sourceEnd, 10);
  assert.ok(new Set(w.map(x => x.id)).size === 3);
});

test('imported words are validated', () => {
  assert.throws(() => validateWords([{ text: 'a', sourceStart: 2, sourceEnd: 1 }], 10));
  assert.throws(() => validateWords([{ text: '', sourceStart: 0, sourceEnd: 1 }], 10));
  assert.equal(validateWords([{ id: 'ok', text: 'a', sourceStart: 0, sourceEnd: 1 }], 10)[0].id, 'ok');
  const manual = wordsFromText('one two three', 3);
  assert.equal(manual.length, 3);
  assert.equal(manual[2].sourceEnd, 3);
  assert.equal(manual[0].precision, 'approximate');
});

test('captions use retained words in timeline time', () => {
  const segs = computeSegments(5, [{ start: 0.55, end: 0.95 }]);
  const cues = buildCaptions(words, segs);
  assert.equal(cues[0].text, 'Hello world.');
  assert.ok(Math.abs(cues[0].end - 1.1) < 1e-9);
  assert.equal(cues[1].text, 'Next line');
  assert.match(toSRT(cues), /^1\n00:00:00,000 --> 00:00:01,100\nHello world\./);
});
