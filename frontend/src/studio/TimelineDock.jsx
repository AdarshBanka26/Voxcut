import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/chrome.jsx';
import { api } from '../api.js';
import { formatClock, formatSeconds, formatTimecode } from '@shared/timecode.js';
import { useClock, timelinePosition } from './playback.js';

const TICK_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600];
const LABEL_W = 104; // label column (w-24) + gap-2

function useWaveform(projectId, media) {
  const [peaks, setPeaks] = useState(null);
  useEffect(() => {
    setPeaks(null);
    if (!media?.stored || !media.hasAudio) return;
    let alive = true;
    api.waveform(projectId).then(r => alive && setPeaks(r.peaks)).catch(() => {});
    return () => { alive = false; };
  }, [projectId, media?.id, media?.stored, media?.hasAudio]);
  return peaks;
}

/** SVG polyline of the peaks inside one retained source range. */
const Wave = memo(function Wave({ peaks, sourceDuration, start, end }) {
  if (!peaks?.length) return null;
  const a = Math.floor((start / sourceDuration) * peaks.length);
  const b = Math.max(a + 1, Math.ceil((end / sourceDuration) * peaks.length));
  const slice = peaks.slice(a, b);
  const step = Math.max(1, Math.floor(slice.length / 240));
  const pts = [];
  for (let i = 0; i < slice.length; i += step) {
    const v = Math.max(...slice.slice(i, i + step));
    pts.push(`${(i / slice.length) * 500},${12 - v * 11} ${((i + step / 2) / slice.length) * 500},${12 + v * 11}`);
  }
  return (
    <svg className="absolute inset-0 w-full h-full text-on-tertiary-fixed-variant opacity-80" preserveAspectRatio="none" viewBox="0 0 500 24" aria-hidden>
      <polyline points={pts.join(' ')} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
});

function Playhead({ clock, segments, duration }) {
  const pct = useClock(clock, s => Math.round((timelinePosition(segments, s) / (duration || 1)) * 10000) / 100);
  return (
    <div className="absolute top-0 bottom-0 z-30 pointer-events-none flex flex-col items-center -translate-x-1/2" style={{ left: `${pct}%` }}>
      <div className="w-3.5 h-3.5 bg-primary rotate-45 -mt-1.5 shadow-md" />
      <div className="w-0.5 flex-1 bg-primary" />
    </div>
  );
}

function BigTimecode({ clock, segments, fps }) {
  const frame = useClock(clock, s => Math.floor(timelinePosition(segments, s) * fps));
  return <span className="font-label-timecode text-headline-sm font-bold text-primary tracking-wider tabular-nums">{formatTimecode(frame / fps, fps)}</span>;
}

function SavedAgo({ save }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 15000); return () => clearInterval(t); }, []);
  if (save.state === 'saving') return <span className="text-amber-700 font-semibold">Saving…</span>;
  if (save.state === 'error') return <span className="text-error font-semibold">Save failed — last change not stored</span>;
  const s = Math.round((Date.now() - save.at) / 1000);
  return <span className="text-tertiary font-semibold">Auto-Save {s < 10 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`}</span>;
}

export default function TimelineDock({ projectId, snap, segments, cues, clock, controls, selectionRange, onCutSelection, actions, save, muted, onToggleMute }) {
  const { media, timeline } = snap;
  const fps = media.frameRate || 30;
  const duration = timeline.duration;
  const [zoom, setZoom] = useState(1);
  const [showCaptions, setShowCaptions] = useState(true);
  const peaks = useWaveform(projectId, media);
  const layerRef = useRef(null);
  const scrubbing = useRef(false);

  const ticks = useMemo(() => {
    const step = TICK_STEPS.find(s => duration / s <= 8 * zoom) ?? 3600;
    const out = [];
    for (let t = 0; t <= duration + 1e-6; t += step) out.push(t);
    return out;
  }, [duration, zoom]);

  const pct = t => `${(t / (duration || 1)) * 100}%`;
  const seekAt = clientX => {
    const r = layerRef.current?.getBoundingClientRect();
    if (!r || !duration) return;
    controls.seekTimeline(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration);
  };

  const sel = selectionRange && duration ? { a: timelinePosition(segments, selectionRange.start), b: timelinePosition(segments, selectionRange.end) } : null;
  const tag = `${media.height}p ${Math.round(fps)}`;

  return (
    <div className="w-full bg-surface-container-lowest px-4 py-3 shadow-lg flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
        <div className="flex items-center gap-1.5 text-on-surface-variant">
          <button title="Select (click words or scrub)" className="p-1.5 rounded-lg bg-surface-container-high text-on-surface"><Icon name="near_me" className="text-[18px]" /></button>
          <button title="Cut selection (Delete)" disabled={!selectionRange} onClick={onCutSelection} className="p-1.5 rounded-lg hover:bg-surface-container-high disabled:opacity-40"><Icon name="content_cut" className="text-[18px]" /></button>
          <button title="Undo (Ctrl+Z)" disabled={!timeline.canUndo} onClick={actions.undo} className="p-1.5 rounded-lg hover:bg-surface-container-high disabled:opacity-40"><Icon name="undo" className="text-[18px]" /></button>
          <button title="Redo (Ctrl+Shift+Z)" disabled={!timeline.canRedo} onClick={actions.redo} className="p-1.5 rounded-lg hover:bg-surface-container-high disabled:opacity-40"><Icon name="redo" className="text-[18px]" /></button>
          <button title="Show caption track" aria-pressed={showCaptions} onClick={() => setShowCaptions(v => !v)} className={`p-1.5 rounded-lg hover:bg-surface-container-high ${showCaptions ? 'text-secondary' : ''}`}><Icon name="view_timeline" className="text-[18px]" /></button>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
          <BigTimecode clock={clock} segments={segments} fps={fps} />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setZoom(z => Math.max(1, z / 1.5))} aria-label="Zoom out"><Icon name="zoom_out" className="text-[18px] text-on-surface-variant" /></button>
          <input type="range" min="1" max="12" step="0.1" value={zoom} onChange={e => setZoom(Number(e.target.value))} aria-label="Timeline zoom" className="vx-range w-28" style={{ '--fill': `${((zoom - 1) / 11) * 100}%` }} />
          <button onClick={() => setZoom(z => Math.min(12, z * 1.5))} aria-label="Zoom in"><Icon name="zoom_in" className="text-[18px] text-on-surface-variant" /></button>
          <span className="font-label-code text-label-code text-on-surface-variant font-semibold w-10">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      <div className="relative w-full bg-surface-container-low rounded-xl p-2 overflow-x-auto shadow-inner thin-scrollbar">
        <div className="relative flex flex-col gap-1.5 cursor-text select-none" style={{ width: `${zoom * 100}%`, minWidth: '100%' }}
          onPointerDown={e => {
            const r = layerRef.current?.getBoundingClientRect();
            if (e.button !== 0 || !r || e.clientX < r.left) return;
            scrubbing.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            seekAt(e.clientX);
          }}
          onPointerMove={e => scrubbing.current && seekAt(e.clientX)}
          onPointerUp={() => { scrubbing.current = false; }}>
          <div className="flex items-center text-on-surface-variant font-label-timecode text-label-timecode pb-1 h-5">
            <div className="w-24 shrink-0 sticky left-0 z-40 bg-surface-container-low h-full" />
            <div className="relative flex-1 ml-2 h-full">
              {ticks.map(t => <span key={t} className="absolute top-0 -translate-x-1/2 whitespace-nowrap first:translate-x-0" style={{ left: pct(t) }}>{formatClock(t)}</span>)}
            </div>
          </div>

          {showCaptions && (
            <Row label="C1 Captions" labelCls="text-primary" right={<Icon name="visibility" className="text-[14px]" />}>
              {cues.map(c => (
                <div key={c.id} title={c.text}
                  className="absolute h-8 rounded-md bg-primary-fixed text-on-primary-fixed flex items-center px-2 gap-1 shadow-sm overflow-hidden"
                  style={{ left: pct(c.start), width: `calc(${pct(c.end - c.start)} - 2px)` }}>
                  <Icon name="title" className="text-[13px] shrink-0" />
                  <span className="font-label-code text-label-code font-bold truncate">{c.text}</span>
                </div>
              ))}
              {!cues.length && <span className="absolute left-2 font-label-code text-label-code text-on-surface-variant">No captions yet — transcribe to generate them</span>}
            </Row>
          )}

          <Row label="V1 Master" labelCls="text-secondary" right={<Icon name="visibility" className="text-[14px]" />} tall>
            {segments.map((s, i) => (
              <React.Fragment key={s.id}>
                <div className="absolute h-9 rounded-md bg-secondary text-on-secondary flex items-center px-2 justify-between gap-2 shadow-sm overflow-hidden"
                  style={{ left: pct(s.timelineStart), width: `calc(${pct(s.duration)} - 2px)` }} title={`Source ${formatSeconds(s.sourceStart)} → ${formatSeconds(s.sourceEnd)}`}>
                  <span className="font-label-code text-label-code font-bold truncate">{media.fileName}</span>
                  <span className="font-label-code text-[10px] text-surface-container-highest whitespace-nowrap">{tag}</span>
                </div>
                {i > 0 && (
                  <div className="absolute z-10 w-4 h-4 -translate-x-1/2 rounded-full bg-surface-container-lowest flex items-center justify-center shadow-sm" style={{ left: pct(s.timelineStart) }} title="Cut point">
                    <Icon name="content_cut" className="text-[10px] text-primary" />
                  </div>
                )}
              </React.Fragment>
            ))}
          </Row>

          <Row label="A1 Voice" labelCls="text-tertiary" right={<button onClick={onToggleMute} aria-pressed={muted} title="Mute preview audio" className={`font-label-code text-[10px] font-bold px-1 rounded ${muted ? 'bg-tertiary text-on-tertiary' : 'text-tertiary'}`}>M</button>}>
            {media.hasAudio ? segments.map((s, i) => (
              <div key={s.id} className="absolute h-8 rounded-md bg-tertiary-fixed text-on-tertiary-fixed flex items-center px-2 gap-2 shadow-sm overflow-hidden"
                style={{ left: pct(s.timelineStart), width: `calc(${pct(s.duration)} - 2px)` }}>
                <Wave peaks={peaks} sourceDuration={timeline.sourceDuration} start={s.sourceStart} end={s.sourceEnd} />
                {i === 0 && <span className="relative z-10 flex items-center gap-1 shrink-0 bg-tertiary-fixed/90 rounded px-1"><Icon name="graphic_eq" className="text-[14px]" /><span className="font-label-code text-label-code font-bold truncate">{media.fileName.replace(/\.[^.]+$/, '')}.audio</span></span>}
              </div>
            )) : <span className="absolute left-2 font-label-code text-label-code text-on-surface-variant">No audio track</span>}
          </Row>

          <div ref={layerRef} className="absolute top-0 bottom-0 right-0 pointer-events-none" style={{ left: LABEL_W }}>
            {sel && sel.b > sel.a && <div className="absolute top-5 bottom-0 bg-primary-container/20 border-x-2 border-primary-container pointer-events-none" style={{ left: pct(sel.a), width: pct(sel.b - sel.a) }} />}
            <Playhead clock={clock} segments={segments} duration={duration} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-on-surface-variant font-label-code text-label-code pt-1 px-1">
        <div className="flex flex-wrap items-center gap-4">
          <span>Timeline In: <strong className="text-on-surface">{formatTimecode(0, fps)}</strong></span>
          <span>Timeline Out: <strong className="text-on-surface">{formatTimecode(duration, fps)}</strong></span>
          <SavedAgo save={save} />
        </div>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-tertiary" />{timeline.cuts.length} cut{timeline.cuts.length === 1 ? '' : 's'} · {formatSeconds(timeline.removed, 1)} removed · source untouched</span>
      </div>
    </div>
  );
}

function Row({ label, labelCls, right, tall, children }) {
  return (
    <div className={`flex items-center w-full gap-2 ${tall ? 'h-11' : 'h-10'}`}>
      <div className="w-24 shrink-0 sticky left-0 z-40 flex items-center justify-between px-2 bg-surface-container-lowest rounded-lg h-full">
        <span className={`font-label-code text-label-code font-bold ${labelCls}`}>{label}</span>
        <div className="flex items-center gap-1 text-on-surface-variant">{right}</div>
      </div>
      <div className="flex-1 h-full bg-surface-container-lowest/60 rounded-lg relative overflow-hidden flex items-center">{children}</div>
    </div>
  );
}
