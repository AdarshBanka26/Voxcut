// Preview controller (SRS §4.4). Playback is driven by the retained-segment
// list: the <video> plays source media and is moved across cuts so the viewer
// sees the edited sequence. The current source time lives in a tiny external
// store so only components that display it re-render each frame.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { resolvePlayback, sourceToTimeline, timelineToSource, timelineDuration, computeSegments, normalizeRanges } from '@shared/timeline.js';

export function createClock() {
  let value = 0;
  const listeners = new Set();
  return {
    get: () => value,
    set(v) {
      if (v === value) return;
      value = v;
      listeners.forEach(l => l());
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    }
  };
}

/** Subscribe to a derived primitive of the clock; re-renders only when it changes. */
export function useClock(clock, select = v => v) {
  return useSyncExternalStore(clock.subscribe, () => select(clock.get()));
}

/** Timeline position of a source time; inside a cut it snaps to the next kept frame. */
export function timelinePosition(segments, s) {
  const t = sourceToTimeline(segments, s);
  if (t !== null) return t;
  const next = segments.find(seg => seg.sourceStart >= s);
  return next ? next.timelineStart : timelineDuration(segments);
}

export function usePlayback(videoRef, segments, sourceDuration, cuts) {
  const clock = useMemo(createClock, []);
  const [playing, setPlaying] = useState(false);
  const [preview, setPreview] = useState(null); // { range, stopAt } while previewing a proposed cut
  const effective = useMemo(() => {
    if (!preview) return segments;
    try { return computeSegments(sourceDuration, normalizeRanges([...cuts, preview.range], sourceDuration)); } catch { return segments; }
  }, [preview, segments, cuts, sourceDuration]);
  const segRef = useRef(effective);
  segRef.current = effective;
  const previewRef = useRef(preview);
  previewRef.current = preview;

  useEffect(() => {
    let raf;
    const tick = () => {
      const v = videoRef.current;
      if (v && v.readyState >= 1) {
        let t = v.currentTime;
        if (!v.paused) {
          const r = resolvePlayback(segRef.current, t);
          if (!r) {
            v.pause();
          } else if (r.jumped) {
            v.currentTime = r.sourceTime;
            t = r.sourceTime;
          }
          const p = previewRef.current;
          if (p && t >= p.stopAt) { v.pause(); setPreview(null); }
        }
        clock.set(t);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [videoRef, clock]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    const on = () => setPlaying(true);
    const off = () => setPlaying(false);
    v.addEventListener('play', on);
    v.addEventListener('pause', off);
    v.addEventListener('ended', off);
    return () => { v.removeEventListener('play', on); v.removeEventListener('pause', off); v.removeEventListener('ended', off); };
  });

  const controls = useMemo(() => {
    const seekSource = s => {
      const v = videoRef.current;
      if (!v || !Number.isFinite(s)) return;
      v.currentTime = Math.max(0, Math.min(s, sourceDuration || s));
      clock.set(v.currentTime);
    };
    const seekTimeline = t => {
      const segs = segRef.current;
      if (!segs.length) return;
      const total = timelineDuration(segs);
      const s = timelineToSource(segs, Math.max(0, Math.min(t, total - 1e-3)));
      if (s !== null) seekSource(s);
    };
    return {
      seekSource,
      seekTimeline,
      play() {
        const v = videoRef.current;
        const segs = segRef.current;
        if (!v || !segs.length) return;
        // From the end (or past the last kept segment), restart at the beginning.
        if (!resolvePlayback(segs, v.currentTime)) v.currentTime = segs[0].sourceStart;
        v.play().catch(() => {});
      },
      pause() { videoRef.current?.pause(); setPreview(null); },
      toggle() { const v = videoRef.current; if (!v) return; if (v.paused) this.play(); else this.pause(); },
      nudge(seconds) { seekTimeline(timelinePosition(segRef.current, clock.get()) + seconds); },
      toStart() { const segs = segRef.current; if (segs.length) seekSource(segs[0].sourceStart); },
      toEnd() { seekTimeline(timelineDuration(segRef.current) - 0.05); },
      /** Play around a proposed cut as if it were applied (SRS: preview before applying). */
      previewCut(range, lead = 2) {
        const v = videoRef.current;
        if (!v) return;
        setPreview({ range, stopAt: range.end + lead });
        v.currentTime = Math.max(0, range.start - lead);
        v.play().catch(() => {});
      },
      /** Play a source range as-is (suggestion preview). */
      playRange(range, lead = 0.5) {
        const v = videoRef.current;
        if (!v) return;
        setPreview({ range: { start: 0, end: 0 }, stopAt: range.end + lead });
        v.currentTime = Math.max(0, range.start - lead);
        v.play().catch(() => {});
      }
    };
  }, [videoRef, clock, sourceDuration]);

  return { clock, playing, previewing: Boolean(preview), segments: effective, controls };
}
