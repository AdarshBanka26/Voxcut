// Editor workspace (SRS §4.3): top project bar, transcript, preview,
// inspector and timeline, wired to the shared timeline engine.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { urls } from '../api.js';
import { Icon, Notice } from '../components/chrome.jsx';
import { links, navigate } from '../router.js';
import { buildCaptions } from '@shared/captions.js';
import { subtractRanges, totalLength } from '@shared/timeline.js';
import { useProject } from './useProject.js';
import { usePlayback } from './playback.js';
import { StudioShell, SaveIndicator } from './Shell.jsx';
import { DropZone, Disclosure, RelinkGate, useCapabilities } from './MediaGate.jsx';
import { localUrl, releaseLocalFile, rememberLocalFile } from './localMedia.js';
import TranscriptPanel from './TranscriptPanel.jsx';
import Preview from './Preview.jsx';
import Inspector from './Inspector.jsx';
import TimelineDock from './TimelineDock.jsx';

const MODES = [
  { id: 'inspect', label: 'Editing' },
  { id: 'captions', label: 'Captions' },
  { id: 'review-pause', label: 'Audio' },
  { id: 'media', label: 'Media' },
  { id: 'review-filler', label: 'AI Review', icon: 'auto_awesome' }
];

const isTextField = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

function ProjectName({ name, onRename }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  const commit = () => { setEditing(false); if (value.trim() && value.trim() !== name) onRename(value.trim()); else setValue(name); };
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icon name="movie_edit" className="text-primary text-[20px]" />
      {editing ? (
        <input autoFocus value={value} maxLength={120} onChange={e => setValue(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setValue(name); setEditing(false); } }}
          className="font-headline-sm text-body-md font-semibold px-2 py-0.5 rounded bg-surface-container-low outline-none ring-2 ring-secondary" />
      ) : (
        <>
          <span className="font-headline-sm text-body-md font-semibold text-on-surface tracking-tight truncate max-w-[260px]">{name}</span>
          <button onClick={() => setEditing(true)} aria-label="Rename project"><Icon name="edit" className="text-on-surface-variant text-[16px] hover:text-on-surface" /></button>
        </>
      )}
    </div>
  );
}

export default function Editor({ projectId }) {
  const { data, words, loadError, save, notice, transcription, busy, actions } = useProject(projectId);
  const caps = useCapabilities();
  const videoRef = useRef(null);
  const [selection, setSelection] = useState(null);
  const [adjust, setAdjust] = useState(null);
  const [tab, setTab] = useState('inspect');
  const [reviewKind, setReviewKind] = useState('filler');
  const [relink, setRelink] = useState(false);
  const [muted, setMuted] = useState(false);
  const [, forceLocal] = useState(0);

  const timeline = data?.timeline;
  const playback = usePlayback(videoRef, timeline?.segments ?? [], timeline?.sourceDuration ?? 0, timeline?.cuts ?? []);
  const { controls, clock } = playback;

  useEffect(() => () => releaseLocalFile(projectId), [projectId]);
  useEffect(() => { setSelection(null); }, [words.length]);
  useEffect(() => { setAdjust(null); }, [selection?.anchor, selection?.focus]);
  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted, data?.media?.id]);

  // Warn before leaving with unsaved changes or a running task (SRS §4.9 step 5).
  useEffect(() => {
    const onLeave = e => { if (busy) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [busy]);

  const cues = useMemo(() => (timeline ? buildCaptions(words, timeline.segments) : []), [words, timeline]);

  const selectionInfo = useMemo(() => {
    if (!selection || !words.length || !timeline) return null;
    const min = Math.min(selection.anchor, selection.focus);
    const max = Math.max(selection.anchor, selection.focus);
    const sel = words.slice(min, max + 1);
    if (!sel.length) return null;
    const ids = sel.map(w => w.id);
    const base = { start: sel[0].sourceStart, end: sel.at(-1).sourceEnd };
    const range = adjust ?? base;
    const text = sel.map(w => w.text).join(' ');
    const label = `Delete “${text.length > 40 ? `${text.slice(0, 40)}…` : text}”`;
    const clear = () => setSelection(null);
    return {
      count: sel.length, ids, base, range, text,
      removes: totalLength(subtractRanges([range], timeline.cuts)),
      allCut: sel.every(w => w.status === 'cut'),
      anyCut: sel.some(w => w.status === 'cut'),
      multiRange: sel.some(w => w.status === 'cut') && !sel.every(w => w.status === 'cut'),
      approximate: sel.some(w => w.precision === 'approximate'),
      preview: () => controls.previewCut(range),
      cut: () => (adjust ? actions.cutRange(range, label) : actions.cutWords(ids, label)).then(r => r && clear()),
      restore: () => (adjust ? actions.restoreRange(range, `Restore “${text.slice(0, 40)}”`) : actions.restoreWords(ids, `Restore “${text.slice(0, 40)}”`)).then(r => r && clear())
    };
  }, [selection, words, timeline, adjust, actions, controls]);

  const onKey = useCallback(e => {
    if (isTextField(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.code === 'Space') { e.preventDefault(); controls.toggle(); }
    else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); actions.undo(); }
    else if (mod && ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y')) { e.preventDefault(); actions.redo(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selectionInfo && !selectionInfo.allCut) { e.preventDefault(); selectionInfo.cut(); }
    else if (e.key === 'Escape') setSelection(null);
    else if (e.key === 'ArrowLeft' && !mod) { e.preventDefault(); controls.nudge(e.shiftKey ? -5 : -1); }
    else if (e.key === 'ArrowRight' && !mod) { e.preventDefault(); controls.nudge(e.shiftKey ? 5 : 1); }
  }, [controls, actions, selectionInfo]);

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  if (loadError) {
    return (
      <StudioShell projectId={projectId}>
        <div className="p-8 max-w-2xl mx-auto">
          <Notice title={loadError.status === 404 ? 'Project not found' : 'Could not open the project'} actions={<>
            <button onClick={actions.reload} className="px-4 py-1.5 rounded-full bg-surface-container-lowest font-label-pill text-label-pill">Retry</button>
            <a href={links.studio()} className="px-4 py-1.5 rounded-full bg-surface-container-lowest font-label-pill text-label-pill">All projects</a>
          </>}>{loadError.message}</Notice>
        </div>
      </StudioShell>
    );
  }
  if (!data) {
    return <StudioShell projectId={projectId}><div className="p-10 flex items-center gap-3 text-on-surface-variant" role="status"><Icon name="progress_activity" className="animate-spin" /> Loading project…</div></StudioShell>;
  }

  const media = data.media;
  const src = localUrl(projectId) ?? (media?.stored ? urls.media(projectId) : null);
  const ratio = timeline.sourceDuration ? timeline.duration / timeline.sourceDuration : null;
  const badge = media ? `${media.height}p ${Math.round(media.frameRate || 30)}` : null;

  const upload = async (file, opts) => {
    const r = await actions.uploadMedia(file, opts);
    if (r.ok) { rememberLocalFile(projectId, file); setRelink(false); forceLocal(x => x + 1); }
    return r;
  };

  if (!media || (!src && !relink) || relink) {
    return (
      <StudioShell projectId={projectId} badge={badge} ratio={ratio}>
        <div className="w-full bg-surface-container-lowest px-6 py-2.5 flex items-center justify-between shadow-sm">
          <ProjectName name={data.project.name} onRename={actions.rename} />
          {relink && <button onClick={() => setRelink(false)} className="font-label-pill text-label-pill text-secondary">Back to editor</button>}
        </div>
        {!media ? (
          <div className="p-6 max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3"><DropZone caps={caps} title="Add the video for this project" onFile={async (f, p) => { const r = await upload(f, { onProgress: p }); if (!r.ok) actions.notify({ tone: 'error', title: 'Upload failed', message: r.error.message }); }} /></div>
            <div className="lg:col-span-2 flex flex-col gap-3">{notice && <Notice tone={notice.tone} title={notice.title} onClose={actions.dismissNotice}>{notice.message}</Notice>}<Disclosure caps={caps} /></div>
          </div>
        ) : <RelinkGate media={media} onUpload={upload} />}
      </StudioShell>
    );
  }

  const modeActive = id => (id === 'inspect' && tab === 'inspect') || (id === 'captions' && tab === 'captions') || (id === 'media' && tab === 'media')
    || (id === 'review-pause' && tab === 'review' && reviewKind === 'pause') || (id === 'review-filler' && tab === 'review' && reviewKind === 'filler');
  const setMode = id => {
    if (id.startsWith('review-')) { setTab('review'); setReviewKind(id.slice(7)); } else setTab(id);
  };

  return (
    <StudioShell projectId={projectId} badge={badge} ratio={ratio}>
      <div className="flex flex-col w-full text-on-surface">
        <div className="w-full bg-surface-container-lowest px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-5 min-w-0">
            <ProjectName name={data.project.name} onRename={actions.rename} />
            <div className="flex items-center bg-surface-container-low rounded-lg p-0.5" role="radiogroup" aria-label="Aspect ratio">
              {['16:9', '9:16', '1:1'].map(a => (
                <button key={a} role="radio" aria-checked={data.project.settings.aspect === a} onClick={() => actions.setSettings({ aspect: a })}
                  className={`px-2.5 py-1 rounded font-label-code text-label-code ${data.project.settings.aspect === a ? 'text-on-surface font-bold bg-surface-container-lowest shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}>{a}</button>
              ))}
            </div>
            <div className="flex items-center gap-1 text-on-surface-variant">
              <button onClick={actions.undo} disabled={!timeline.canUndo} title="Undo (Ctrl+Z)" className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-container-low disabled:opacity-40"><Icon name="undo" className="text-[18px]" /></button>
              <button onClick={actions.redo} disabled={!timeline.canRedo} title="Redo (Ctrl+Shift+Z)" className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-container-low disabled:opacity-40"><Icon name="redo" className="text-[18px]" /></button>
              <button onClick={actions.reload} title="Sync with server" className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-container-low text-secondary"><Icon name="sync" className="text-[18px]" /></button>
            </div>
          </div>
          <div className="hidden xl:flex items-center gap-1 bg-surface-container-low p-1 rounded-full" role="tablist" aria-label="Workspace">
            {MODES.map(m => (
              <button key={m.id} role="tab" aria-selected={modeActive(m.id)} onClick={() => setMode(m.id)}
                className={`px-4 py-1 rounded-full font-body-md text-body-md transition-colors flex items-center gap-1.5 ${modeActive(m.id) ? 'bg-surface-container-lowest text-primary font-semibold shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}>
                {m.icon && <Icon name={m.icon} className="text-secondary text-[16px]" />}{m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <SaveIndicator save={save} />
            <button onClick={() => navigate(`/export/${projectId}`)} className="flex items-center gap-2 px-5 py-2 rounded-full bg-primary-container text-on-primary-container font-body-md text-body-md font-semibold shadow-cta hover:bg-primary transition-all">
              <Icon name="publish" className="text-[18px]" /><span>Export</span>
            </button>
          </div>
        </div>

        {notice && (
          <div className="px-3 pt-3"><Notice tone={notice.tone} title={notice.title} onClose={actions.dismissNotice}
            actions={notice.tone === 'error' && save.state === 'error' ? <button onClick={actions.reload} className="px-3 py-1 rounded-full bg-surface-container-lowest font-label-pill text-label-pill">Reload project</button> : null}>{notice.message}</Notice></div>
        )}

        <div className="grid grid-cols-12 gap-3 p-3 bg-surface-bright">
          <section className="col-span-12 lg:col-span-3 flex flex-col gap-3">
            <TranscriptPanel snap={data} words={words} precision={data.transcript.precision} media={media} segments={timeline.segments} clock={clock}
              selection={selection} setSelection={setSelection} controls={controls} actions={actions} transcription={transcription} caps={caps}
              selectionInfo={selectionInfo} onReview={kind => { setTab('review'); setReviewKind(kind); }} />
          </section>
          <section className="col-span-12 lg:col-span-6 flex flex-col gap-3">
            <Preview videoRef={videoRef} src={src} poster={media.stored ? urls.thumbnail(projectId, timeline.segments[0]?.sourceStart ?? 0, 1280) : undefined} media={media} aspect={data.project.settings.aspect ?? '16:9'} onAspect={a => actions.setSettings({ aspect: a })}
              clock={clock} segments={playback.segments} cues={cues} words={words} captionStyle={data.project.settings.captionStyle}
              captionsVisible={data.project.settings.captionsVisible !== false} onToggleCaptions={() => actions.setSettings({ captionsVisible: data.project.settings.captionsVisible === false })}
              controls={controls} playing={playback.playing} previewing={playback.previewing} />
          </section>
          <section className="col-span-12 lg:col-span-3 flex flex-col gap-3">
            <Inspector tab={tab} setTab={setTab} reviewKind={reviewKind} setReviewKind={setReviewKind} snap={data} cues={cues} actions={actions} controls={controls}
              selectionInfo={selectionInfo} adjust={adjust} setAdjust={setAdjust} projectId={projectId} hasWords={words.length > 0} onRelink={() => setRelink(true)} />
          </section>
        </div>

        <TimelineDock projectId={projectId} snap={data} segments={timeline.segments} cues={cues} clock={clock} controls={controls}
          selectionRange={selectionInfo && !selectionInfo.allCut ? selectionInfo.range : null} onCutSelection={() => selectionInfo?.cut()}
          actions={actions} save={save} muted={muted} onToggleMute={() => setMuted(m => !m)} />
      </div>
    </StudioShell>
  );
}
