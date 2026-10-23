import React, { useState } from 'react';
import { Icon } from '../components/chrome.jsx';
import { urls } from '../api.js';
import { CAPTION_STYLES } from '@shared/captions.js';
import { DEFAULT_FILLERS } from '@shared/transcript.js';
import { formatBytes, formatClock, formatSeconds } from '@shared/timecode.js';

export const TABS = [['inspect', 'Inspect'], ['captions', 'Captions'], ['review', 'Review'], ['media', 'Media']];

function Card({ title, action, children }) {
  return (
    <div className="p-3 bg-surface-container-low rounded-xl flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-body-md text-body-sm font-semibold text-on-surface">{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-surface-container-lowest p-2 rounded-lg">
      <span className="font-label-code text-label-code text-on-surface-variant block">{label}</span>
      <span className="font-label-code text-body-sm font-semibold text-on-surface">{value}</span>
    </div>
  );
}

function Nudge({ label, value, onChange }) {
  return (
    <div className="bg-surface-container-lowest p-2 rounded-lg flex flex-col gap-1">
      <span className="font-label-code text-label-code text-on-surface-variant">{label}</span>
      <div className="flex items-center justify-between gap-1">
        <button onClick={() => onChange(-0.05)} aria-label={`${label} earlier`} className="w-6 h-6 rounded bg-surface-container-low hover:bg-surface-container"><Icon name="remove" className="text-[14px]" /></button>
        <span className="font-label-code text-body-sm font-semibold tabular-nums">{value.toFixed(2)}s</span>
        <button onClick={() => onChange(0.05)} aria-label={`${label} later`} className="w-6 h-6 rounded bg-surface-container-low hover:bg-surface-container"><Icon name="add" className="text-[14px]" /></button>
      </div>
    </div>
  );
}

function InspectTab({ selectionInfo, adjust, setAdjust, snap }) {
  const tl = snap.timeline;
  const kept = tl.sourceDuration ? tl.duration / tl.sourceDuration : 1;
  const history = [...snap.operations].reverse().slice(0, 12);
  return (
    <div className="space-y-4 pt-2">
      <Card title="Selection" action={selectionInfo && <button onClick={() => setAdjust(null)} className="font-label-code text-label-code text-secondary hover:underline">Reset</button>}>
        {selectionInfo ? (
          <>
            <div className="flex justify-between font-label-code text-label-code text-on-surface-variant"><span>{selectionInfo.count} word{selectionInfo.count === 1 ? '' : 's'} · source time</span><span className="font-bold text-on-surface">−{formatSeconds(selectionInfo.removes)}</span></div>
            <p className="font-body-sm text-body-sm text-on-surface line-clamp-3 italic">“{selectionInfo.text}”</p>
            <div className="grid grid-cols-2 gap-2">
              <Nudge label="Cut in" value={selectionInfo.range.start} onChange={d => setAdjust(a => ({ start: Math.max(0, (a ?? selectionInfo.base).start + d), end: (a ?? selectionInfo.base).end }))} />
              <Nudge label="Cut out" value={selectionInfo.range.end} onChange={d => setAdjust(a => ({ start: (a ?? selectionInfo.base).start, end: Math.max((a ?? selectionInfo.base).start + 0.05, (a ?? selectionInfo.base).end + d) }))} />
            </div>
            {selectionInfo.multiRange && <p className="font-body-sm text-body-sm text-on-surface-variant">The selection spans already-cut words; boundary adjustment applies to the outer edges.</p>}
            {selectionInfo.approximate && <p className="font-body-sm text-body-sm text-amber-800">Timing for these words is approximate. Preview the cut and adjust the edges if needed.</p>}
            <div className="flex flex-wrap gap-2">
              {!selectionInfo.allCut && <button onClick={selectionInfo.preview} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-full bg-surface-container-lowest font-label-pill text-label-pill"><Icon name="play_arrow" className="text-[14px]" />Preview cut</button>}
              {!selectionInfo.allCut && <button onClick={selectionInfo.cut} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-full bg-primary-container text-on-primary-container font-label-pill text-label-pill shadow-cta"><Icon name="content_cut" className="text-[14px]" />Delete from video</button>}
              {selectionInfo.anyCut && <button onClick={selectionInfo.restore} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-pill text-label-pill"><Icon name="undo" className="text-[14px]" />Restore</button>}
            </div>
          </>
        ) : (
          <p className="font-body-sm text-body-sm text-on-surface-variant">Drag across words in the transcript (or shift-click) to select a passage. Press <kbd className="px-1 rounded bg-surface-container-lowest">Delete</kbd> to cut it from the video.</p>
        )}
      </Card>

      <Card title="Edit Summary" action={<Icon name="tune" className="text-on-surface-variant text-[16px]" />}>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[['SOURCE', formatClock(tl.sourceDuration), 'bg-secondary/15', 'bg-secondary'], ['REMOVED', formatSeconds(tl.removed, 1), 'bg-primary/15', 'bg-primary'], ['KEPT', `${Math.round(kept * 100)}%`, 'bg-tertiary/15', 'bg-tertiary']].map(([label, value, ring, dot]) => (
            <div key={label} className="flex flex-col items-center gap-1.5">
              <span className="font-label-code text-[10px] tracking-wider text-on-surface-variant uppercase">{label}</span>
              <div className="w-14 h-14 rounded-full bg-surface-container-lowest flex items-center justify-center shadow-inner">
                <div className={`w-8 h-8 rounded-full ${ring} flex items-center justify-center`}><span className={`w-2.5 h-2.5 rounded-full ${dot} shadow-sm`} /></div>
              </div>
              <span className="font-label-code text-[11px] text-on-surface font-medium">{value}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between font-label-code text-label-code text-on-surface-variant"><span>Edited duration</span><span className="font-semibold text-on-surface">{formatClock(tl.duration)} · {tl.cuts.length} cut{tl.cuts.length === 1 ? '' : 's'}</span></div>
      </Card>

      <Card title="Edit History" action={<span className="font-label-code text-label-code text-on-surface-variant">{snap.operations.length}</span>}>
        {history.length ? (
          <ol className="flex flex-col gap-1.5">
            {history.map(op => (
              <li key={op.id} className={`flex items-center justify-between gap-2 bg-surface-container-lowest px-2 py-1.5 rounded-lg ${op.undone ? 'opacity-50' : ''}`}>
                <span className="flex items-center gap-1.5 min-w-0">
                  <Icon name={op.type === 'cut' ? 'content_cut' : 'undo'} className={`text-[14px] ${op.type === 'cut' ? 'text-primary' : 'text-secondary'}`} />
                  <span className="font-body-sm text-body-sm truncate">{op.parameters.label || (op.type === 'cut' ? 'Cut' : 'Restore')}</span>
                </span>
                <span className="font-label-code text-label-code text-on-surface-variant shrink-0">{op.undone ? 'undone' : formatSeconds(op.parameters.changedSeconds ?? op.sourceRanges.reduce((s, r) => s + r.end - r.start, 0), 1)}</span>
              </li>
            ))}
          </ol>
        ) : <p className="font-body-sm text-body-sm text-on-surface-variant">No edits yet. Your original file is never changed.</p>}
      </Card>
    </div>
  );
}

const STYLE_ART = { 'cinematic-serif': '/assets/art-sunset.jpg', 'neon-pill': '/assets/art-clouds.jpg', 'minimal-clean': '/assets/art-fish.jpg' };

function CaptionsTab({ snap, cues, actions, projectId }) {
  const { captionStyle = 'minimal-clean', captionsVisible = true } = snap.project.settings;
  return (
    <div className="space-y-4 pt-2">
      <Card title="Caption Style" action={<span className="font-label-code text-label-code text-on-surface-variant">{cues.length} cues</span>}>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(CAPTION_STYLES).map(([id, s]) => (
            <button key={id} onClick={() => actions.setSettings({ captionStyle: id })} aria-pressed={captionStyle === id}
              className={`flex flex-col gap-1 p-1.5 rounded-lg bg-surface-container-lowest text-left transition-opacity ${captionStyle === id ? 'shadow-sm ring-2 ring-primary-container' : 'opacity-75 hover:opacity-100'}`}>
              <div className="relative w-full h-11 rounded overflow-hidden bg-cover bg-center" style={{ backgroundImage: `url(${STYLE_ART[id]})` }}>
                <span className="absolute bottom-1 inset-x-1 text-center text-[9px] rounded px-0.5 truncate" style={{ fontFamily: s.font, color: s.color, background: s.background === 'transparent' ? 'transparent' : s.background, textShadow: '0 1px 2px rgba(0,0,0,.8)' }}>Aa caption</span>
              </div>
              <span className="font-label-code text-[10px] font-bold text-on-surface truncate">{s.label}</span>
              <span className={`font-label-code text-[9px] ${captionStyle === id ? 'text-primary' : 'text-on-surface-variant'}`}>{captionStyle === id ? 'Active' : 'Preset'}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center justify-between font-label-code text-label-code text-on-surface-variant">
          <span>Show in preview</span>
          <input type="checkbox" checked={captionsVisible} onChange={e => actions.setSettings({ captionsVisible: e.target.checked })} className="w-4 h-4 accent-[#dc3313]" />
        </label>
      </Card>
      <Card title="Subtitle Files">
        <p className="font-body-sm text-body-sm text-on-surface-variant">Captions are built from the words you kept and timed to the edited sequence.</p>
        <div className="flex gap-2">
          <a href={urls.captions(projectId, 'srt')} className="flex-1 text-center px-3 py-2 rounded-full bg-surface-container-lowest font-label-pill text-label-pill hover:bg-surface-container">Download .srt</a>
          <a href={urls.captions(projectId, 'vtt')} className="flex-1 text-center px-3 py-2 rounded-full bg-surface-container-lowest font-label-pill text-label-pill hover:bg-surface-container">Download .vtt</a>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">Burned-in captions are chosen on the Export page.</p>
      </Card>
    </div>
  );
}

function ReviewTab({ snap, kind, setKind, actions, controls, hasWords }) {
  const [vocab, setVocab] = useState((snap.project.settings.fillerVocabulary ?? DEFAULT_FILLERS).join(', '));
  const [minPause, setMinPause] = useState(snap.project.settings.pauseThreshold ?? 0.5);
  const [method, setMethod] = useState(null);
  const pending = snap.suggestions.filter(s => s.type === kind && s.status === 'pending');
  const reviewed = snap.suggestions.filter(s => s.type === kind && s.status !== 'pending');

  async function scan() {
    if (kind === 'filler') {
      const vocabulary = vocab.split(',').map(v => v.trim()).filter(Boolean);
      await actions.setSettings({ fillerVocabulary: vocabulary });
      await actions.detect('filler', { vocabulary });
    } else {
      await actions.setSettings({ pauseThreshold: minPause });
      const r = await actions.detect('pause', { minPause });
      if (r) setMethod(r.method);
    }
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center bg-surface-container-low rounded-lg p-0.5" role="tablist">
        {[['filler', 'Filler words'], ['pause', 'Pauses']].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={`flex-1 px-2.5 py-1 rounded font-label-code text-label-code ${kind === k ? 'bg-surface-container-lowest shadow-sm text-on-surface font-bold' : 'text-on-surface-variant'}`}>{label}</button>
        ))}
      </div>
      <Card title={kind === 'filler' ? 'Find Fillers' : 'Detect Pauses'}>
        {kind === 'filler' ? (
          <label className="flex flex-col gap-1">
            <span className="font-label-code text-label-code text-on-surface-variant">Vocabulary (comma separated)</span>
            <input value={vocab} onChange={e => setVocab(e.target.value)} className="px-2 py-1.5 rounded-lg bg-surface-container-lowest outline-none focus:ring-2 ring-secondary font-body-sm text-body-sm" />
          </label>
        ) : (
          <label className="flex flex-col gap-1.5">
            <span className="flex justify-between font-label-code text-label-code text-on-surface-variant"><span>Minimum pause</span><span className="font-bold text-on-surface">{Number(minPause).toFixed(1)}s</span></span>
            <input type="range" min="0.2" max="3" step="0.1" value={minPause} onChange={e => setMinPause(Number(e.target.value))} className="vx-range" style={{ '--fill': `${((minPause - 0.2) / 2.8) * 100}%` }} />
          </label>
        )}
        <button disabled={kind === 'filler' && !hasWords} onClick={scan} className="self-start px-4 py-1.5 rounded-full bg-secondary text-on-secondary font-label-pill text-label-pill disabled:opacity-40">Scan</button>
        {method && kind === 'pause' && <span className="font-label-code text-label-code text-on-surface-variant">Method: {method === 'audio-energy' ? 'audio energy' : 'gaps between words'}</span>}
        <p className="font-body-sm text-body-sm text-on-surface-variant">Nothing is cut until you accept. Some pauses and repetitions are meaningful.</p>
      </Card>
      <Card title={`${pending.length} to review`} action={pending.length > 1 && <button onClick={() => actions.acceptAll(kind)} className="font-label-code text-label-code text-primary font-semibold hover:underline">Accept all</button>}>
        {pending.length ? (
          <ul className="flex flex-col gap-1.5">
            {pending.map(s => (
              <li key={s.id} className="flex items-center gap-2 bg-surface-container-lowest px-2 py-1.5 rounded-lg">
                <button onClick={() => controls.playRange({ start: s.sourceStart, end: s.sourceEnd })} aria-label="Preview" className="w-7 h-7 rounded-full bg-secondary-fixed text-secondary flex items-center justify-center shrink-0"><Icon name="play_arrow" className="text-[16px]" /></button>
                <span className="flex flex-col min-w-0 flex-1">
                  <span className="font-body-sm text-body-sm font-semibold truncate">{s.label}</span>
                  <span className="font-label-code text-[10px] text-on-surface-variant">{formatSeconds(s.sourceStart)} → {formatSeconds(s.sourceEnd)} · {formatSeconds(s.sourceEnd - s.sourceStart)}</span>
                </span>
                <button onClick={() => actions.review(s.id, { status: 'accepted' })} aria-label={`Cut ${s.label}`} className="w-7 h-7 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center"><Icon name="check" className="text-[16px]" /></button>
                <button onClick={() => actions.review(s.id, { status: 'rejected' })} aria-label={`Keep ${s.label}`} className="w-7 h-7 rounded-full bg-surface-container flex items-center justify-center"><Icon name="close" className="text-[16px]" /></button>
              </li>
            ))}
          </ul>
        ) : <p className="font-body-sm text-body-sm text-on-surface-variant">No pending {kind === 'filler' ? 'filler words' : 'pauses'}. Run a scan to look for some.</p>}
        {reviewed.length > 0 && <span className="font-label-code text-label-code text-on-surface-variant">{reviewed.filter(s => s.status === 'accepted').length} accepted · {reviewed.filter(s => s.status === 'rejected').length} kept</span>}
      </Card>
    </div>
  );
}

function MediaTab({ snap, projectId, actions, onRelink }) {
  const m = snap.media;
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="space-y-4 pt-2">
      <Card title="Source Media" action={<span className="font-label-code text-label-code text-tertiary">{m.stored ? 'ON SERVER' : 'NEEDS RELINK'}</span>}>
        <p className="font-body-sm text-body-sm font-semibold break-all">{m.fileName}</p>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Duration" value={formatClock(m.duration)} />
          <Stat label="Frame" value={`${m.width}×${m.height}`} />
          <Stat label="Frame rate" value={`${m.frameRate ?? '—'} fps`} />
          <Stat label="Size" value={formatBytes(m.sizeBytes)} />
          <Stat label="Video" value={(m.videoCodec ?? '—').toUpperCase()} />
          <Stat label="Audio" value={m.hasAudio ? `${(m.audioCodec ?? '').toUpperCase()} · ${m.audioTracks} trk` : 'None'} />
        </div>
        <span className="font-label-code text-[10px] text-on-surface-variant break-all">ID {m.fingerprint.slice(7, 23)}…</span>
      </Card>
      <Card title="Project">
        <a href={urls.projectFile(projectId)} className="text-center px-3 py-2 rounded-full bg-surface-container-lowest font-label-pill text-label-pill hover:bg-surface-container">Download project file (.json)</a>
        <button onClick={onRelink} className="px-3 py-2 rounded-full bg-surface-container-lowest font-label-pill text-label-pill hover:bg-surface-container">Relink / replace source</button>
        {m.stored && (confirm ? (
          <div className="flex flex-col gap-2 p-2 rounded-lg bg-error-container text-on-error-container">
            <p className="font-body-sm text-body-sm">Remove the server copy? Your transcript and edits stay; you’ll need to relink the file to preview or export.</p>
            <div className="flex gap-2">
              <button onClick={() => { setConfirm(false); actions.removeStoredMedia(); }} className="px-3 py-1 rounded-full bg-error text-on-error font-label-pill text-label-pill">Remove</button>
              <button onClick={() => setConfirm(false)} className="px-3 py-1 rounded-full bg-surface-container-lowest font-label-pill text-label-pill">Cancel</button>
            </div>
          </div>
        ) : <button onClick={() => setConfirm(true)} className="px-3 py-2 rounded-full text-error font-label-pill text-label-pill hover:bg-error-container">Remove server copy</button>)}
      </Card>
    </div>
  );
}

export default function Inspector({ tab, setTab, reviewKind, setReviewKind, snap, cues, actions, controls, selectionInfo, adjust, setAdjust, projectId, hasWords, onRelink }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col h-[560px] overflow-y-auto thin-scrollbar">
      <div className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-3" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`font-headline-sm text-body-md ${tab === id ? 'font-bold text-primary' : 'font-normal text-on-surface-variant hover:text-on-surface'}`}>{label}</button>
          ))}
        </div>
        <Icon name="more_horiz" className="text-on-surface-variant text-[18px]" />
      </div>
      {tab === 'inspect' && <InspectTab selectionInfo={selectionInfo} adjust={adjust} setAdjust={setAdjust} snap={snap} />}
      {tab === 'captions' && <CaptionsTab snap={snap} cues={cues} actions={actions} projectId={projectId} />}
      {tab === 'review' && <ReviewTab snap={snap} kind={reviewKind} setKind={setReviewKind} actions={actions} controls={controls} hasWords={hasWords} />}
      {tab === 'media' && <MediaTab snap={snap} projectId={projectId} actions={actions} onRelink={onRelink} />}
    </div>
  );
}
