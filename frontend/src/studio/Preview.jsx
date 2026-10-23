import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/chrome.jsx';
import { CAPTION_STYLES } from '@shared/captions.js';
import { formatTimecode } from '@shared/timecode.js';
import { useClock, timelinePosition } from './playback.js';

const ASPECTS = [['16:9', 'Cinema'], ['9:16', 'Reel'], ['1:1', 'Square']];
const RATIO = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1 };

function useFitBox(ref, ratio) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const w = Math.min(width, height * ratio);
      setBox({ width: w, height: w / ratio });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, ratio]);
  return box;
}

function CaptionOverlay({ clock, segments, cues, wordsById, styleId }) {
  const key = useClock(clock, s => {
    const t = timelinePosition(segments, s);
    const i = cues.findIndex(c => t >= c.start && t < c.end);
    if (i < 0) return '';
    const w = cues[i].wordIds.find(id => { const x = wordsById.get(id); return x && s >= x.sourceStart && s < x.sourceEnd; });
    return `${i}|${w ?? ''}`;
  });
  if (!key) return null;
  const [i, activeId] = key.split('|');
  const cue = cues[Number(i)];
  const style = CAPTION_STYLES[styleId] ?? CAPTION_STYLES['minimal-clean'];
  return (
    <div className="absolute inset-x-0 bottom-20 flex justify-center px-6 pointer-events-none">
      <p className="px-3 py-1.5 rounded-lg text-center max-w-[90%] leading-snug"
        style={{ fontFamily: style.font, fontSize: style.size, color: style.color, background: style.background, textShadow: style.background === 'transparent' ? '0 1px 3px rgba(0,0,0,.9)' : 'none', fontStyle: styleId === 'cinematic-serif' ? 'italic' : 'normal', fontWeight: styleId === 'neon-pill' ? 700 : 500 }}>
        {cue.wordIds.map(id => {
          const w = wordsById.get(id);
          return <span key={id} style={id === activeId ? { color: style.highlight } : undefined}>{w?.text} </span>;
        })}
      </p>
    </div>
  );
}

function TimecodeBadge({ clock, segments, fps }) {
  const t = useClock(clock, s => Math.floor(timelinePosition(segments, s) * fps));
  return <>{formatTimecode(t / fps, fps)}</>;
}

export default function Preview({ videoRef, src, poster, media, aspect, onAspect, clock, segments, cues, words, captionStyle, captionsVisible, onToggleCaptions, controls, playing, previewing }) {
  const stageRef = useRef(null);
  const [guides, setGuides] = useState(false);
  const [error, setError] = useState(null);
  const box = useFitBox(stageRef, RATIO[aspect] ?? 16 / 9);
  const wordsById = useMemo(() => new Map(words.map(w => [w.id, w])), [words]);
  const fps = media.frameRate || 30;
  const sourceRatio = media.width && media.height ? media.width / media.height : 16 / 9;
  const fitPct = Math.round((box.height / (media.height || box.height || 1)) * 100) || 0;

  return (
    <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col h-[560px]">
      <div className="flex items-center justify-between pb-3 gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`w-2.5 h-2.5 rounded-full ${playing ? 'bg-primary animate-pulse' : 'bg-primary'}`} />
          <span className="font-label-code text-label-code uppercase tracking-wider text-on-surface font-semibold whitespace-nowrap">PREVIEW ({aspect})</span>
          <span className="font-label-timecode text-label-timecode text-on-surface-variant whitespace-nowrap">{media.width}×{media.height} • {fps} fps</span>
          <span className="hidden xl:inline font-label-code text-label-code text-tertiary truncate">{[media.videoCodec, media.audioCodec].filter(Boolean).join(' / ').toUpperCase()}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setGuides(g => !g)} aria-pressed={guides} title="Safe-area guides" className={`p-1 rounded hover:bg-surface-container-low ${guides ? 'text-secondary' : 'text-on-surface-variant hover:text-on-surface'}`}><Icon name="grid_4x4" className="text-[18px]" /></button>
          <button onClick={onToggleCaptions} aria-pressed={captionsVisible} title="Caption overlay" className={`p-1 rounded hover:bg-surface-container-low ${captionsVisible ? 'text-secondary' : 'text-on-surface-variant hover:text-on-surface'}`}><Icon name="subtitles" className="text-[18px]" /></button>
          <span className="font-label-code text-label-code text-on-surface-variant bg-surface-container-low px-2 py-0.5 rounded">Fit {fitPct}%</span>
        </div>
      </div>

      <div ref={stageRef} className="relative flex-1 rounded-xl bg-inverse-surface overflow-hidden flex items-center justify-center shadow-inner min-h-0">
        <div className="relative overflow-hidden" style={{ width: box.width, height: box.height }}>
          <video ref={videoRef} src={src} poster={poster} playsInline preload="auto" className="w-full h-full bg-black"
            style={{ objectFit: Math.abs(sourceRatio - (RATIO[aspect] ?? sourceRatio)) < 0.01 ? 'contain' : 'cover' }}
            onError={() => setError('The browser could not load this video. If the file uses an unusual codec, convert it to MP4 (H.264/AAC) and relink it.')}
            onLoadedData={() => setError(null)} onClick={() => controls.toggle()} />
          {guides && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-[5%] border border-dashed border-white/50 rounded" />
              <div className="absolute inset-[10%] border border-dashed border-secondary-fixed/70 rounded" />
              <div className="absolute left-1/3 inset-y-0 w-px bg-white/20" /><div className="absolute left-2/3 inset-y-0 w-px bg-white/20" />
              <div className="absolute top-1/3 inset-x-0 h-px bg-white/20" /><div className="absolute top-2/3 inset-x-0 h-px bg-white/20" />
            </div>
          )}
          {captionsVisible && cues.length > 0 && <CaptionOverlay clock={clock} segments={segments} cues={cues} wordsById={wordsById} styleId={captionStyle} />}
        </div>

        <div className="absolute top-3 left-3 bg-inverse-surface/85 backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-2 shadow-md max-w-[55%]">
          <Icon name="crop_free" className="text-secondary-fixed text-[14px]" />
          <span className="font-label-code text-label-code text-surface-container-lowest truncate">Voxcut Clip: {media.fileName}</span>
        </div>
        <div className="absolute top-3 right-3 flex items-center gap-1 bg-surface-container-lowest/90 backdrop-blur-md p-1 rounded-lg shadow-sm" role="radiogroup" aria-label="Preview aspect ratio">
          {ASPECTS.map(([a, label]) => (
            <button key={a} role="radio" aria-checked={aspect === a} onClick={() => onAspect(a)}
              className={`px-2.5 py-1 rounded font-label-code text-label-code ${aspect === a ? 'text-primary font-bold bg-surface-container-low' : 'text-on-surface-variant hover:text-on-surface'}`}>
              {a} <span className="hidden 2xl:inline">{label}</span>
            </button>
          ))}
        </div>
        {previewing && <div className="absolute top-14 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary-container text-on-primary-container font-label-code text-label-code shadow-md">PREVIEWING PROPOSED CUT</div>}
        {error && <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 p-3 rounded-lg bg-error-container text-on-error-container font-body-sm text-body-sm text-center">{error}</div>}

        <div className="absolute bottom-4 inset-x-0 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-4 bg-surface-container-lowest/90 backdrop-blur-md px-5 py-2 rounded-full shadow-lg pointer-events-auto">
            <button onClick={controls.toStart} aria-label="Go to start" className="text-on-surface-variant hover:text-on-surface"><Icon name="skip_previous" className="text-[20px]" /></button>
            <button onClick={() => controls.nudge(-5)} aria-label="Back 5 seconds" className="text-on-surface-variant hover:text-on-surface"><Icon name="fast_rewind" className="text-[20px]" /></button>
            <button onClick={() => controls.toggle()} aria-label={playing ? 'Pause (Space)' : 'Play (Space)'} className="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shadow-md hover:bg-primary transition-all">
              <Icon name={playing ? 'pause' : 'play_arrow'} filled className="text-[22px]" />
            </button>
            <button onClick={() => controls.nudge(5)} aria-label="Forward 5 seconds" className="text-on-surface-variant hover:text-on-surface"><Icon name="fast_forward" className="text-[20px]" /></button>
            <button onClick={controls.toEnd} aria-label="Go to end" className="text-on-surface-variant hover:text-on-surface"><Icon name="skip_next" className="text-[20px]" /></button>
            <span className="hidden sm:inline font-label-timecode text-label-timecode text-on-surface tabular-nums"><TimecodeBadge clock={clock} segments={segments} fps={fps} /></span>
          </div>
        </div>
      </div>
    </div>
  );
}
