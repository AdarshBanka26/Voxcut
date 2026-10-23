import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/chrome.jsx';
import { isActiveJob } from '../api.js';
import { activeWordIndex, sourceToTimeline } from '@shared/timeline.js';
import { formatTimecode, formatSeconds } from '@shared/timecode.js';
import { normalizeToken } from '@shared/transcript.js';
import { useClock } from './playback.js';

const STAGES = ['Preparing audio', 'Loading model', 'Transcribing', 'Aligning words', 'Finalizing'];

/** Group words into readable cue blocks at long gaps or sentence ends. */
function makeBlocks(words) {
  const blocks = [];
  let start = 0;
  for (let i = 0; i < words.length; i++) {
    const next = words[i + 1];
    const len = i - start + 1;
    const gap = next ? next.sourceStart - words[i].sourceEnd : Infinity;
    const sentenceEnd = /[.?!]["')\]]?$/.test(words[i].text);
    if (!next || gap > 1.2 || (sentenceEnd && len >= 22) || len >= 60) {
      blocks.push({ start, end: i });
      start = i + 1;
    }
  }
  return blocks;
}

const Block = memo(function Block({ words, block, selMin, selMax, activeIdx, live, matches, segments, fps, editingId, handlers }) {
  const firstKept = words.slice(block.start, block.end + 1).find(w => w.status === 'kept');
  const tl = firstKept ? sourceToTimeline(segments, firstKept.sourceStart) : null;
  const speaker = words[block.start].speakerId ?? 'Speaker 1';
  return (
    <div className={`p-3 rounded-xl transition-all ${live ? 'bg-surface-container-lowest shadow-md ring-1 ring-surface-container' : 'bg-surface-container-low'}`}>
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`rounded-full ${live ? 'w-2.5 h-2.5 bg-primary animate-pulse' : 'w-2 h-2 bg-secondary'}`} />
          <span className={`font-body-md text-body-sm truncate ${live ? 'font-bold text-primary' : 'font-semibold text-on-surface'}`}>{speaker}</span>
          {live && <span className="font-label-code text-label-code uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary-fixed text-on-primary-fixed">LIVE</span>}
        </div>
        <span className={`font-label-timecode text-label-timecode shrink-0 ${live ? 'font-bold text-primary' : 'text-on-surface-variant'}`}>{tl === null ? 'CUT' : formatTimecode(tl, fps)}</span>
      </div>
      <p className="font-body-md text-body-sm leading-relaxed text-on-surface select-none">
        {words.slice(block.start, block.end + 1).map((w, k) => {
          const i = block.start + k;
          if (editingId === w.id) return <WordEditor key={w.id} word={w} onDone={handlers.onEditDone} />;
          const selected = i >= selMin && i <= selMax;
          const cls = [
            'word',
            selected ? 'bg-primary-container text-on-primary-container font-semibold hover:bg-primary-container' : '',
            !selected && i === activeIdx ? 'bg-amber-200/80' : '',
            w.status === 'cut' ? 'line-through decoration-2 text-error opacity-60' : '',
            matches?.has(i) ? 'ring-1 ring-amber-500' : '',
            w.corrected ? 'underline decoration-dotted decoration-secondary underline-offset-2' : '',
            w.precision === 'approximate' ? 'italic' : ''
          ].join(' ');
          return (
            <React.Fragment key={w.id}>
              <span data-idx={i} className={cls}
                title={`${formatSeconds(w.sourceStart)} – ${formatSeconds(w.sourceEnd)} source${w.corrected ? ` · was “${w.originalText}”` : ''}`}
                onMouseDown={e => handlers.onDown(i, e)} onMouseEnter={() => handlers.onEnter(i)} onDoubleClick={() => handlers.onEdit(w.id)}>
                {w.text}
              </span>{' '}
            </React.Fragment>
          );
        })}
      </p>
    </div>
  );
});

function WordEditor({ word, onDone }) {
  const [value, setValue] = useState(word.text);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const finish = save => onDone(word, save ? value.trim() : null);
  return (
    <input ref={ref} value={value} aria-label={`Correct “${word.text}”`} onChange={e => setValue(e.target.value)} onBlur={() => finish(true)}
      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); }}
      style={{ width: `${Math.max(3, value.length + 1)}ch` }}
      className="px-1 py-0 rounded bg-secondary-fixed text-on-secondary-fixed outline-none ring-2 ring-secondary font-body-md text-body-sm mr-1" />
  );
}

function TranscribeCard({ media, job, onTranscribe, onCancel, onManual, caps }) {
  const [manual, setManual] = useState(!media.hasAudio);
  const [text, setText] = useState('');
  const running = isActiveJob(job);
  const stageIdx = running ? Math.max(0, STAGES.indexOf(job.stage)) : -1;
  return (
    <div className="flex-1 overflow-y-auto thin-scrollbar flex flex-col gap-3 pr-1">
      {running ? (
        <div className="p-4 rounded-xl bg-surface-container-low flex flex-col gap-3" role="status" aria-live="polite">
          <div className="flex items-center justify-between">
            <span className="font-body-md text-body-sm font-semibold">Transcribing on the server</span>
            <span className="font-label-code text-label-code text-primary">{Math.round(job.progress * 100)}%</span>
          </div>
          <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden"><div className="bg-primary-container h-full transition-all" style={{ width: `${Math.max(3, job.progress * 100)}%` }} /></div>
          <ol className="flex flex-col gap-1.5">
            {STAGES.map((s, i) => (
              <li key={s} className={`flex items-center gap-2 font-body-sm text-body-sm ${i < stageIdx ? 'text-tertiary' : i === stageIdx ? 'text-on-surface font-semibold' : 'text-on-surface-variant'}`}>
                <Icon name={i < stageIdx ? 'check_circle' : i === stageIdx ? 'progress_activity' : 'radio_button_unchecked'} className={`text-[16px] ${i === stageIdx ? 'animate-spin' : ''}`} />
                {s}{i === stageIdx && job.metrics?.chunks ? ` · part ${job.metrics.chunk ?? 0}/${job.metrics.chunks}` : ''}
              </li>
            ))}
          </ol>
          <p className="font-body-sm text-body-sm text-on-surface-variant">The first run downloads the speech model, which can take a minute.</p>
          <button onClick={onCancel} className="self-start px-4 py-1.5 rounded-full bg-surface-container-high font-label-pill text-label-pill">Cancel</button>
        </div>
      ) : (
        <>
          {media.hasAudio ? (
            <div className="p-4 rounded-xl bg-surface-container-low flex flex-col gap-3">
              <div className="flex items-center gap-2"><Icon name="auto_awesome" className="text-secondary text-[20px]" /><span className="font-body-md text-body-md font-semibold">Generate a timed transcript</span></div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Speech is recognized with {caps?.transcription.model?.split('/').pop() ?? 'Whisper'} on the Voxcut server. Each word gets source timestamps so deleting text cuts the video.</p>
              {job?.status === 'failed' && <p className="font-body-sm text-body-sm text-error">Last attempt failed at “{job.stage}”: {job.errorMessage}</p>}
              {job?.status === 'cancelled' && <p className="font-body-sm text-body-sm text-on-surface-variant">The last transcription was cancelled.</p>}
              <button onClick={onTranscribe} className="self-start flex items-center gap-2 px-5 py-2 rounded-full bg-primary-container text-on-primary-container font-body-md text-body-md font-semibold shadow-cta hover:bg-primary transition-all">
                <Icon name="graphic_eq" className="text-[18px]" />{job?.status === 'failed' ? 'Retry transcription' : 'Transcribe'}
              </button>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 font-body-sm text-body-sm flex gap-2">
              <Icon name="volume_off" className="text-[18px]" /> This video has no audio track, so speech can’t be transcribed. Type or paste a transcript below; its timing is spread evenly and marked approximate.
            </div>
          )}
          {!manual ? (
            <button onClick={() => setManual(true)} className="self-start font-body-sm text-body-sm text-secondary hover:underline">Or type / paste the transcript yourself</button>
          ) : (
            <div className="flex flex-col gap-2">
              <textarea value={text} onChange={e => setText(e.target.value)} rows={8} placeholder="Paste or type the spoken words…"
                className="w-full p-3 rounded-xl bg-surface-container-low border border-surface-container focus:border-secondary outline-none font-body-md text-body-sm resize-y" />
              <button disabled={!text.trim()} onClick={() => onManual(text)} className="self-start px-4 py-1.5 rounded-full bg-secondary text-on-secondary font-label-pill text-label-pill disabled:opacity-40">Use this transcript</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function TranscriptPanel({ snap, words, precision, media, segments, clock, selection, setSelection, controls, actions, transcription, caps, onReview, selectionInfo }) {
  const [search, setSearch] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const dragging = useRef(false);
  const listRef = useRef(null);
  const blocks = useMemo(() => makeBlocks(words), [words]);
  const fps = media.frameRate || 30;
  const activeIdx = useClock(clock, s => activeWordIndex(words, s));
  const liveBlock = blocks.findIndex(b => activeIdx >= b.start && activeIdx <= b.end);
  const selMin = selection ? Math.min(selection.anchor, selection.focus) : -1;
  const selMax = selection ? Math.max(selection.anchor, selection.focus) : -2;

  const matches = useMemo(() => {
    const q = search ? normalizeToken(search) : '';
    if (!q) return null;
    const set = new Set();
    words.forEach((w, i) => { if (normalizeToken(w.text).includes(q)) set.add(i); });
    return set;
  }, [search, words]);

  // Keep the spoken word in view during playback.
  useEffect(() => {
    if (activeIdx < 0 || dragging.current || editingId) return;
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`);
    const box = listRef.current?.getBoundingClientRect();
    if (el && box) {
      const r = el.getBoundingClientRect();
      if (r.top < box.top + 20 || r.bottom > box.bottom - 20) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [activeIdx, editingId]);

  useEffect(() => {
    const up = () => { dragging.current = false; };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  const handlers = useMemo(() => ({
    onDown(i, e) {
      if (e.button !== 0) return;
      if (e.shiftKey && selection) { setSelection({ anchor: selection.anchor, focus: i }); return; }
      dragging.current = true;
      setSelection({ anchor: i, focus: i });
      const w = words[i];
      if (w.status === 'kept') controls.seekSource(w.sourceStart);
    },
    onEnter(i) { if (dragging.current) setSelection(s => (s ? { anchor: s.anchor, focus: i } : s)); },
    onEdit(id) { setEditingId(id); },
    onEditDone(word, value) {
      setEditingId(null);
      if (value && value !== word.text) actions.correctWord(word.id, value);
    }
  }), [words, selection, setSelection, controls, actions]);

  const pendingFillers = snap.suggestions.filter(s => s.type === 'filler' && s.status === 'pending').length;
  const hasWords = words.length > 0;

  return (
    <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col h-[560px]">
      <div className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <Icon name="description" className="text-primary text-[20px]" />
          <h2 className="font-headline-sm text-body-md font-semibold text-on-surface">Script &amp; Transcript</h2>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-code text-label-code font-bold">BI-SYNC</span>
      </div>

      {hasWords && (
        <div className="flex items-center gap-2 pt-1 pb-3">
          <button onClick={() => (pendingFillers ? actions.acceptAll('filler') : actions.detect('filler').then(r => r && onReview('filler')))}
            className="flex-1 whitespace-nowrap flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-primary-fixed text-on-primary-fixed font-label-pill text-label-pill font-semibold shadow-sm hover:opacity-90 transition-opacity">
            <Icon name="bolt" className="text-[14px]" />{pendingFillers ? `Remove ${pendingFillers} Filler${pendingFillers === 1 ? '' : 's'}` : 'Find Fillers'}
          </button>
          <button onClick={() => actions.detect('pause').then(r => r && onReview('pause'))}
            className="flex-1 whitespace-nowrap flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-surface-container-high text-on-surface font-label-pill text-label-pill font-medium hover:bg-surface-container transition-colors">
            <Icon name="content_cut" className="text-[14px]" />Cut Silence
          </button>
          <button onClick={() => setSearch(s => (s === null ? '' : null))} aria-label="Search transcript" aria-pressed={search !== null}
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${search !== null ? 'bg-secondary-fixed text-secondary' : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'}`}>
            <Icon name="search" className="text-[16px]" />
          </button>
        </div>
      )}
      {search !== null && (
        <div className="pb-3 flex items-center gap-2">
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a word…" onKeyDown={e => e.key === 'Escape' && setSearch(null)}
            className="flex-1 px-3 py-1.5 rounded-lg bg-surface-container-low border border-surface-container focus:border-secondary outline-none font-body-sm text-body-sm" />
          <span className="font-label-code text-label-code text-on-surface-variant">{matches ? matches.size : 0} found</span>
          {matches?.size > 0 && (
            <button className="font-label-pill text-label-pill text-secondary" onClick={() => {
              const idx = [...matches];
              setSelection({ anchor: idx[0], focus: idx[0] });
              listRef.current?.querySelector(`[data-idx="${idx[0]}"]`)?.scrollIntoView({ block: 'center' });
            }}>Go</button>
          )}
        </div>
      )}

      {!hasWords ? (
        <TranscribeCard media={media} job={transcription} caps={caps} onTranscribe={actions.transcribe} onCancel={actions.cancelTranscription} onManual={actions.setTranscriptText} />
      ) : (
        <div ref={listRef} className="flex-1 overflow-y-auto space-y-4 pr-1 thin-scrollbar" aria-label="Transcript. Click a word to seek, drag or shift-click to select, double-click to correct.">
          {blocks.map((b, bi) => (
            <Block key={words[b.start].id} words={words} block={b} fps={fps} segments={segments} live={bi === liveBlock} editingId={editingId}
              selMin={selMax >= b.start && selMin <= b.end ? selMin : -1} selMax={selMax >= b.start && selMin <= b.end ? selMax : -2}
              activeIdx={bi === liveBlock ? activeIdx : -1} matches={matches} handlers={handlers} />
          ))}
        </div>
      )}

      {selectionInfo ? (
        <div className="mt-3 flex items-center justify-between gap-2 bg-surface-container-high px-2.5 py-1.5 rounded-lg">
          <div className="flex items-center gap-1.5 text-primary min-w-0">
            <Icon name="content_cut" className="text-[16px]" />
            <span className="font-label-code text-label-code font-bold truncate">{selectionInfo.count} word{selectionInfo.count === 1 ? '' : 's'} · {selectionInfo.allCut ? 'cut' : `−${formatSeconds(selectionInfo.removes)}`}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!selectionInfo.allCut && <button onClick={selectionInfo.preview} className="px-2 py-1 rounded-md bg-surface-container-lowest font-label-pill text-label-pill">Preview</button>}
            {selectionInfo.anyCut && <button onClick={selectionInfo.restore} className="px-2 py-1 rounded-md bg-secondary-fixed text-on-secondary-fixed font-label-pill text-label-pill">Restore</button>}
            {!selectionInfo.allCut && <button onClick={selectionInfo.cut} className="px-2 py-1 rounded-md bg-primary-container text-on-primary-container font-label-pill text-label-pill">Delete</button>}
          </div>
        </div>
      ) : (
        <div className="pt-3 mt-auto flex items-center justify-between">
          <span className="flex items-center gap-2 text-on-surface-variant font-body-sm text-body-sm">
            <Icon name={precision === 'approximate' ? 'timer' : 'mic'} className="text-[18px]" />
            {!hasWords ? 'No transcript yet' : precision === 'approximate' ? 'Approximate timing' : 'Word-level timing'}
          </span>
          <span className="font-label-code text-label-code text-on-surface-variant">{words.length.toLocaleString()} words</span>
        </div>
      )}
    </div>
  );
}
