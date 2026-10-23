// Export dialog / delivery page (SRS §4.8, page4 design). Settings are
// checked against the server's ffmpeg capabilities; downloads appear only for
// renders that finished and passed output validation.

import React, { useEffect, useMemo, useState } from 'react';
import { api, isActiveJob, urls } from '../api.js';
import { Icon, Notice, SiteFooter, SiteHeader } from '../components/chrome.jsx';
import { links, navigate } from '../router.js';
import { buildCaptions, CAPTION_STYLES } from '@shared/captions.js';
import { formatBytes, formatClock, formatTimecode } from '@shared/timecode.js';

const RES = [
  { value: 2160, name: '4K UHD', size: '3840 × 2160', tag: 'MASTER', note: 'Archival Master' },
  { value: 1080, name: '1080p FHD', size: '1920 × 1080', tag: 'OPTIMAL', note: 'Recommended for Web' },
  { value: 720, name: '720p HD', size: '1280 × 720', tag: 'FAST', note: 'Rapid Client Screener' }
];
const ASPECTS = [
  { id: '16:9', label: '16:9 Widescreen', sub: 'YouTube, Vimeo, Cinematic Master, OTT', note: 'Center Framed', noteCls: 'text-secondary' },
  { id: '9:16', label: '9:16 Vertical Story', sub: 'TikTok, Instagram Reels, YouTube Shorts', note: 'Center Crop', noteCls: 'text-tertiary' },
  { id: '1:1', label: '1:1 Square Feed', sub: 'LinkedIn, Instagram Feed Carousel', note: 'Standard Crop', noteCls: 'text-on-surface-variant' }
];
const CODECS = {
  prores: { name: 'Apple ProRes 422', spec: '10-Bit · 4:2:2', desc: 'Edit-ready master archive' },
  h264: { name: 'H.264 MP4', spec: '8-Bit · Constant CRF 18', desc: 'Maximum player compatibility' },
  av1: { name: 'AV1 Modern Web', spec: '10-Bit · Next-Gen', desc: 'Smaller files, slow to encode' }
};

function Section({ icon, title, label, labelCls = 'font-label-code text-label-code text-on-surface-variant', children }) {
  return (
    <section className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-3 font-headline-sm text-[20px] leading-7 font-medium text-on-surface"><Icon name={icon} className="text-primary text-[22px]" />{title}</h2>
        {label && <span className={labelCls}>{label}</span>}
      </div>
      {children}
    </section>
  );
}

function Choice({ selected, disabled, onClick, children, tone = 'primary' }) {
  const ring = tone === 'secondary' ? 'ring-secondary bg-secondary-fixed/40' : 'ring-primary-container bg-surface-container';
  return (
    <button disabled={disabled} onClick={onClick} aria-pressed={selected}
      className={`text-left p-4 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed ${selected ? `ring-2 ${ring}` : 'bg-surface-container-low hover:bg-surface-container'}`}>
      {children}
    </button>
  );
}

export default function ExportStudio({ projectId }) {
  const [projects, setProjects] = useState(null);
  const [snap, setSnap] = useState(null);
  const [caps, setCaps] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [resolution, setResolution] = useState(1080);
  const [aspects, setAspects] = useState({ '16:9': true, '9:16': true, '1:1': false });
  const [codec, setCodec] = useState('h264');
  const [fitMode, setFitMode] = useState('crop');
  const [subtitle, setSubtitle] = useState({ on: false, mode: 'burn', style: 'cinematic-serif' });
  const [safe, setSafe] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.capabilities().then(setCaps).catch(setError);
    api.listProjects().then(r => {
      setProjects(r.projects);
      if (!projectId && r.projects[0]) navigate(`/export/${r.projects[0].id}`);
    }).catch(setError);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    setSnap(null);
    api.getProject(projectId).then(s => {
      setSnap(s);
      setJobs(s.jobs.filter(j => j.kind === 'export'));
      if (s.project.settings.captionStyle) setSubtitle(v => ({ ...v, style: s.project.settings.captionStyle }));
      if (s.media?.height) setResolution(s.media.height >= 2000 ? 2160 : s.media.height >= 1000 ? 1080 : 720);
    }).catch(setError);
  }, [projectId]);

  const active = jobs.filter(isActiveJob);
  useEffect(() => {
    if (!active.length) return undefined;
    const t = setInterval(() => api.jobs(projectId, 'export').then(r => setJobs(r.jobs)).catch(() => {}), 600);
    return () => clearInterval(t);
  }, [projectId, active.length]);

  const codecAvailable = id => caps?.codecs.find(c => c.id === id)?.available !== false;
  const chosenAspects = Object.keys(aspects).filter(a => aspects[a]);
  const timeline = snap?.timeline;
  const fps = snap?.media?.frameRate || 30;
  const firstCue = useMemo(() => (snap && timeline ? buildCaptions(snap.transcript.words, timeline.segments)[0] : null), [snap, timeline]);
  const problems = [];
  if (!snap?.media) problems.push('This project has no video yet.');
  else if (!snap.media.stored) problems.push('The source video must be relinked in the editor before exporting.');
  if (timeline && !timeline.segments.length) problems.push('Everything has been cut, so there is nothing to export.');
  if (!chosenAspects.length) problems.push('Choose at least one aspect ratio.');
  if (subtitle.on && !snap?.transcript.words.length) problems.push('Captions need a transcript. Transcribe the video in the editor or turn captions off.');
  if (subtitle.on && subtitle.mode === 'burn' && caps && !caps.burnInCaptions) problems.push('Burned-in captions are not supported by this server; choose an .srt file instead.');
  if (!codecAvailable(codec)) problems.push(`${CODECS[codec].name} is not available on this server.`);

  async function render() {
    setSubmitting(true);
    setError(null);
    try {
      const r = await api.startExport(projectId, {
        resolution, aspects: chosenAspects, codec, fitMode,
        captions: { mode: subtitle.on ? subtitle.mode : 'none', style: subtitle.style }
      });
      setWarnings(r.warnings);
      setJobs(j => [...r.jobs, ...j]);
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  const done = jobs.filter(j => j.status === 'completed');
  const failed = jobs.filter(j => j.status === 'failed').slice(0, 3);
  const overall = active.length ? active.reduce((s, j) => s + j.progress, 0) / active.length : null;
  const current = active.find(j => j.status === 'running') ?? active[0];
  const m = current?.metrics ?? {};
  const remaining = current && m.speed > 0 ? ((current.settings.expectedDuration ?? 0) * (1 - current.progress)) / m.speed : null;
  const resName = RES.find(r => r.value === resolution)?.name;

  return (
    <div className="bg-surface font-body-md text-on-surface antialiased">
      <SiteHeader active="pricing" />
      <main className="w-full pt-16 bg-surface-bright min-h-screen">
        <div className="max-w-7xl mx-auto px-margin-mobile md:px-margin py-space-xl flex flex-col gap-8">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="px-2.5 py-1 rounded-full bg-surface-container font-label-code text-label-code text-on-surface uppercase">Engine v2.4 / FFmpeg Pipeline</span>
                <span className="px-2.5 py-1 rounded-full bg-secondary-fixed font-label-code text-label-code text-on-secondary-fixed flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${caps ? 'bg-secondary' : 'bg-outline'}`} />{caps ? 'Render Server Online' : 'Connecting…'}
                </span>
              </div>
              <h1 className="font-headline-lg text-headline-lg md:text-[44px] md:leading-[52px] text-on-surface tracking-tight">Export &amp; Delivery Studio</h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">Render client-ready files across every platform, cut exactly as your transcript edit.</p>
            </div>
            <div className="flex items-stretch gap-6 p-4 rounded-xl bg-surface-container-low shadow-sm self-start lg:self-auto">
              <label className="flex flex-col gap-1">
                <span className="font-label-code text-label-code text-on-surface-variant uppercase">Project</span>
                <select value={projectId ?? ''} onChange={e => navigate(`/export/${e.target.value}`)} className="bg-transparent font-label-code text-body-sm font-semibold text-on-surface outline-none max-w-[220px]">
                  {!projects?.length && <option value="">No projects</option>}
                  {projects?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <div className="w-px bg-surface-variant" />
              <div className="flex flex-col gap-1">
                <span className="font-label-code text-label-code text-on-surface-variant uppercase">Edited Duration</span>
                <span className="font-label-code text-body-sm font-semibold text-tertiary">{timeline ? `${formatClock(timeline.duration)} · ${timeline.cuts.length} cuts` : '—'}</span>
              </div>
            </div>
          </div>

          {error && <Notice title="Export problem" onClose={() => setError(null)}>{error.message}</Notice>}
          {projects && !projects.length && <Notice tone="info" title="No projects yet" actions={<a href={links.studio()} className="px-4 py-1.5 rounded-full bg-surface-container-lowest font-label-pill text-label-pill">Open the studio</a>}>Create a project and edit it before exporting.</Notice>}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-6 flex flex-col gap-6">
              <Section icon="aspect_ratio" title="Target Resolution" label="SHORT EDGE · NEVER STRETCHED">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {RES.map(r => (
                    <Choice key={r.value} selected={resolution === r.value} onClick={() => setResolution(r.value)}>
                      <div className="flex items-center justify-between gap-2"><b className="font-body-lg text-body-lg font-semibold">{r.name}</b><span className={`px-1.5 py-0.5 rounded font-label-code text-[9px] ${resolution === r.value ? 'bg-primary-fixed text-primary' : 'bg-surface-container text-on-surface-variant'}`}>{r.tag}</span></div>
                      <span className="block font-label-code text-label-code text-on-surface-variant mt-1">{r.size}</span>
                      <span className="block font-body-sm text-body-sm text-on-surface-variant mt-2">{r.note}</span>
                    </Choice>
                  ))}
                </div>
                {snap?.media && resolution > snap.media.height && <p className="font-body-sm text-body-sm text-amber-800">Your source is {snap.media.height}p; rendering larger upscales it and won’t add detail.</p>}
              </Section>

              <Section icon="view_agenda" title="Multi-Aspect Auto-Render" label={
                <span className="flex items-center gap-1 bg-secondary-fixed rounded-full p-0.5">
                  {['crop', 'pad'].map(f => <button key={f} onClick={() => setFitMode(f)} aria-pressed={fitMode === f} className={`px-2.5 py-0.5 rounded-full font-label-code text-label-code ${fitMode === f ? 'bg-secondary text-on-secondary' : 'text-on-secondary-fixed'}`}>{f === 'crop' ? 'Crop to fill' : 'Letterbox'}</button>)}
                </span>
              } labelCls="">
                <div className="flex flex-col gap-2">
                  {ASPECTS.map(a => (
                    <label key={a.id} className="flex items-center gap-4 p-4 rounded-xl bg-surface-container-low hover:bg-surface-container cursor-pointer">
                      <input type="checkbox" checked={aspects[a.id]} onChange={e => setAspects(v => ({ ...v, [a.id]: e.target.checked }))} className="w-5 h-5 accent-[#dc3313]" />
                      <span className="w-10 h-7 rounded bg-surface-container-high flex items-center justify-center font-label-code text-[9px] text-on-surface-variant">{a.id}</span>
                      <span className="flex-1 min-w-0"><b className="block font-body-lg text-body-lg font-medium">{a.label}</b><span className="block font-body-sm text-body-sm text-on-surface-variant">{a.sub}</span></span>
                      <span className={`hidden sm:inline font-label-code text-label-code ${a.noteCls}`}>{fitMode === 'pad' ? 'Letterboxed' : a.note}</span>
                    </label>
                  ))}
                </div>
              </Section>

              <Section icon="video_settings" title="Codec & Color Bit-Depth" label="SERVER ENCODED">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {Object.entries(CODECS).map(([id, c]) => (
                    <Choice key={id} tone="secondary" selected={codec === id} disabled={!codecAvailable(id)} onClick={() => setCodec(id)}>
                      <b className="block font-body-lg text-body-lg font-semibold">{c.name}</b>
                      <span className="block font-label-code text-label-code text-secondary mt-1">{c.spec}</span>
                      <span className="block font-body-sm text-body-sm text-on-surface-variant mt-2">{codecAvailable(id) ? c.desc : 'Not available on this server'}</span>
                    </Choice>
                  ))}
                </div>
              </Section>

              <section className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm flex flex-col gap-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <Icon name="subtitles" className="text-primary text-[22px] mt-0.5" />
                    <div><h2 className="font-body-lg text-body-lg font-medium">Smart Subtitle Burn-In</h2><p className="font-body-sm text-body-sm text-on-surface-variant">Captions from your edited transcript, timed to the cut.</p></div>
                  </div>
                  <button role="switch" aria-checked={subtitle.on} aria-label="Captions" onClick={() => setSubtitle(s => ({ ...s, on: !s.on }))}
                    className={`relative w-12 h-7 rounded-full transition-colors ${subtitle.on ? 'bg-primary-container' : 'bg-surface-container-high'}`}>
                    <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${subtitle.on ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
                <div className={`grid grid-cols-3 gap-3 ${subtitle.on ? '' : 'opacity-40 pointer-events-none'}`}>
                  {Object.entries(CAPTION_STYLES).map(([id, s]) => (
                    <button key={id} onClick={() => setSubtitle(v => ({ ...v, style: id }))} aria-pressed={subtitle.style === id}
                      className={`py-2.5 rounded-xl font-body-md text-body-md ${subtitle.style === id ? 'ring-2 ring-primary-container bg-surface-container' : 'bg-surface-container-low hover:bg-surface-container'}`}>{s.label}</button>
                  ))}
                </div>
                <div className={`flex items-center gap-2 ${subtitle.on ? '' : 'opacity-40 pointer-events-none'}`}>
                  {[['burn', 'Burn into video + .srt'], ['srt', '.srt file only']].map(([mode, label]) => (
                    <button key={mode} onClick={() => setSubtitle(v => ({ ...v, mode }))} aria-pressed={subtitle.mode === mode}
                      className={`px-3 py-1 rounded-full font-label-pill text-label-pill ${subtitle.mode === mode ? 'bg-on-surface text-on-primary' : 'bg-surface-container-low'}`}>{label}</button>
                  ))}
                </div>
              </section>

              {problems.length > 0 && snap && <Notice tone="warning" title="Fix before rendering">{problems.map(p => <p key={p}>{p}</p>)}</Notice>}
              {warnings.map(w => <Notice key={w} tone="info" onClose={() => setWarnings(ws => ws.filter(x => x !== w))}>{w}</Notice>)}

              <div className="flex flex-col gap-3">
                <button disabled={!snap || problems.length > 0 || submitting} onClick={render}
                  className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-full bg-primary-container text-on-primary-container font-body-lg text-[17px] font-semibold shadow-[0_10px_25px_-4px_rgba(224,54,22,0.4)] hover:bg-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                  <Icon name="bolt" className="text-[22px]" />
                  {submitting ? 'Queuing renders…' : `Render ${chosenAspects.length > 1 ? 'All Formats' : 'Format'} (${resName} · ${chosenAspects.join(' + ') || 'none'})`}
                </button>
                <p className="text-center font-label-code text-label-code text-on-surface-variant uppercase tracking-wider">
                  Edited duration: {timeline ? formatClock(timeline.duration) : '—'} &nbsp;•&nbsp; {chosenAspects.length} file{chosenAspects.length === 1 ? '' : 's'} &nbsp;•&nbsp; {CODECS[codec].name}
                </p>
              </div>
            </div>

            <div className="lg:col-span-6 flex flex-col gap-6">
              <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <span className="flex items-center gap-2 font-label-code text-label-code uppercase"><span className="w-2 h-2 rounded-full bg-primary" /><span className="text-primary font-bold">Edited Sequence</span><span className="text-on-surface">TC {timeline ? formatTimecode(timeline.duration, fps) : '—'}</span></span>
                  <span className="flex gap-2">
                    <button onClick={() => setSafe(s => !s)} className="px-2 py-1 rounded bg-surface-container-low font-label-code text-label-code">Safe Zones: {safe ? 'ON' : 'OFF'}</button>
                    <span className="px-2 py-1 rounded bg-surface-container-low font-label-code text-label-code">{fitMode === 'crop' ? 'Fit: Crop' : 'Fit: Letterbox'}</span>
                  </span>
                </div>
                <div className="relative aspect-video rounded-xl overflow-hidden bg-inverse-surface">
                  {snap?.media?.stored
                    ? <img alt="Frame from the source video" src={urls.thumbnail(projectId, timeline?.segments[0] ? timeline.segments[0].sourceStart + Math.min(2, timeline.segments[0].duration / 2) : undefined, 1280)} className="w-full h-full object-cover" />
                    : <img alt="" src="/assets/art-ribbons.jpg" className="w-full h-full object-cover opacity-80" />}
                  <span className="absolute top-3 left-3 px-2.5 py-1 rounded bg-inverse-surface/85 text-inverse-on-surface font-label-code text-label-code">{resName} Master</span>
                  {codec && <span className="absolute top-3 right-3 px-2 py-0.5 rounded bg-tertiary-fixed text-on-tertiary-fixed font-label-code text-[10px] font-bold uppercase">{CODECS[codec].name}</span>}
                  {safe && chosenAspects.includes('9:16') && (
                    <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 border-2 border-dashed border-secondary-container" style={{ aspectRatio: '9 / 16' }}>
                      <span className="absolute top-0 left-0 px-1.5 py-0.5 bg-secondary-container text-on-secondary-container font-label-code text-[9px]">9:16 SAFE ZONE</span>
                    </div>
                  )}
                  {safe && chosenAspects.includes('1:1') && <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 aspect-square border border-dashed border-white/60" />}
                  {subtitle.on && firstCue && (
                    <div className="absolute inset-x-0 bottom-6 flex justify-center px-6">
                      <p className="px-4 py-2 rounded-lg text-center max-w-[80%]" style={{ fontFamily: CAPTION_STYLES[subtitle.style].font, color: CAPTION_STYLES[subtitle.style].color, background: CAPTION_STYLES[subtitle.style].background === 'transparent' ? 'transparent' : CAPTION_STYLES[subtitle.style].background, fontStyle: subtitle.style === 'cinematic-serif' ? 'italic' : 'normal', textShadow: '0 1px 3px rgba(0,0,0,.7)', fontSize: 18 }}>
                        “{firstCue.text}”
                      </p>
                    </div>
                  )}
                </div>
                {timeline && (
                  <div className="flex items-center gap-3 px-1">
                    <span className="font-label-code text-label-code text-on-surface-variant whitespace-nowrap">CUT MAP</span>
                    <div className="h-2 flex-1 rounded-full overflow-hidden flex bg-primary-container" title="Blue: kept · Red: removed">
                      {(() => {
                        const parts = [];
                        let at = 0;
                        for (const s of timeline.segments) {
                          if (s.sourceStart > at) parts.push(['cut', s.sourceStart - at]);
                          parts.push(['keep', s.duration]);
                          at = s.sourceEnd;
                        }
                        if (timeline.sourceDuration > at) parts.push(['cut', timeline.sourceDuration - at]);
                        return parts.map(([k, d], i) => <span key={i} className={k === 'keep' ? 'bg-secondary h-full' : 'bg-primary-container h-full'} style={{ width: `${(d / timeline.sourceDuration) * 100}%` }} />);
                      })()}
                    </div>
                    <span className="font-label-code text-label-code text-tertiary">{Math.round((timeline.duration / (timeline.sourceDuration || 1)) * 100)}% KEPT</span>
                  </div>
                )}
              </div>

              <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm flex flex-col gap-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="flex items-center gap-2 font-headline-sm text-[20px] leading-7 font-medium"><Icon name="memory" className="text-secondary text-[22px]" />Render Dispatch</h2>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{active.length ? active.map(j => `${j.settings.aspect} · ${j.settings.width}×${j.settings.height}`).join(' • ') : 'No render running'}</p>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-code text-label-code font-bold whitespace-nowrap">{overall !== null ? `${Math.round(overall * 100)}% RENDERED` : `${done.length} READY`}</span>
                </div>
                <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-secondary to-primary transition-all" style={{ width: `${Math.round((overall ?? (done.length ? 1 : 0)) * 100)}%` }} />
                </div>
                <div className="flex items-center justify-between font-label-code text-label-code">
                  <span className="text-on-surface">{current ? `${current.stage} · Frame ${(m.frame ?? 0).toLocaleString()} / ${(m.totalFrames ?? 0).toLocaleString()}` : 'Idle'}</span>
                  <span className="text-secondary">{remaining !== null ? `${formatClock(remaining)} Remaining` : current ? 'Estimating…' : ''}</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[['EXPORT SPEED', m.speed ? `${m.speed.toFixed(1)}×` : '—', m.renderFps ? `Render FPS: ${Math.round(m.renderFps)}` : 'Realtime multiple'],
                    ['WRITTEN DATA', m.bytesWritten ? formatBytes(m.bytesWritten) : '—', current ? `${current.settings.codec.toUpperCase()} stream` : 'Current file'],
                    ['QUEUE', `${active.length}`, `${active.filter(j => j.status === 'queued').length} waiting`]].map(([k, v, s]) => (
                    <div key={k} className="p-3 rounded-xl bg-surface-container-low">
                      <span className="block font-label-code text-[10px] text-on-surface-variant">{k}</span>
                      <span className="block font-headline-sm text-[22px] leading-8 font-medium">{v}</span>
                      <span className="block font-label-code text-[10px] text-tertiary">{s}</span>
                    </div>
                  ))}
                </div>
                {active.map(j => (
                  <div key={j.id} className="flex items-center justify-between gap-2 font-body-sm text-body-sm">
                    <span>{j.settings.aspect} · {j.status === 'queued' ? 'Queued' : `${j.stage} ${Math.round(j.progress * 100)}%`}</span>
                    <button onClick={() => api.cancelJob(j.id).catch(setError)} className="px-3 py-1 rounded-full bg-surface-container-high font-label-pill text-label-pill">Cancel</button>
                  </div>
                ))}
                {failed.map(j => (
                  <Notice key={j.id} title={`${j.settings.aspect} render failed at “${j.stage}”`} actions={<button onClick={render} className="px-3 py-1 rounded-full bg-surface-container-lowest font-label-pill text-label-pill">Retry</button>}>
                    {j.errorMessage} Your project is unchanged.
                  </Notice>
                ))}
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between px-1 font-label-code text-label-code uppercase">
                  <span className="text-on-surface-variant">Output Deliverables Ready</span>
                  <span className="text-tertiary">{done.length} File{done.length === 1 ? '' : 's'} Available</span>
                </div>
                {!done.length && <p className="px-1 font-body-sm text-body-sm text-on-surface-variant">Finished renders appear here after the output is checked against your edit.</p>}
                {done.slice(0, 8).map((j, i) => (
                  <div key={j.id} className="flex flex-wrap items-center gap-4 p-4 rounded-2xl bg-surface-container-lowest shadow-sm">
                    <span className={`w-11 h-11 rounded-xl flex items-center justify-center ${j.settings.aspect === '9:16' ? 'bg-secondary-fixed text-secondary' : 'bg-primary-fixed text-primary'}`}><Icon name={j.settings.aspect === '9:16' ? 'smartphone' : 'description'} className="text-[22px]" /></span>
                    <div className="flex-1 min-w-0">
                      <b className="block font-body-lg text-body-lg font-semibold truncate">{j.result.fileName}</b>
                      <span className="block font-label-code text-label-code text-on-surface-variant">{CODECS[j.result.codec]?.name} · {j.result.width}×{j.result.height} · {formatBytes(j.result.sizeBytes)} · {formatClock(j.result.duration)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {j.result.subtitleFileName && <a href={urls.download(j.id, 'subtitles')} className="px-3 py-2 rounded-full bg-surface-container-low font-label-pill text-label-pill">.srt</a>}
                      <a href={urls.download(j.id)} className={`flex items-center gap-2 px-4 py-2 rounded-full font-body-sm text-body-sm font-semibold ${i === 0 ? 'bg-inverse-surface text-inverse-on-surface' : 'bg-secondary-fixed text-on-secondary-fixed'}`}>
                        <Icon name="download" className="text-[16px]" />Download {j.settings.aspect === '9:16' ? 'Vertical Cut' : `${j.settings.height}p`}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-6 font-label-code text-label-code uppercase tracking-wider">
            <span className="flex items-center gap-2 text-on-surface"><span className={`w-2 h-2 rounded-full ${caps ? 'bg-tertiary' : 'bg-outline'}`} />{caps ? `${caps.ffmpeg.version.split(' ').slice(0, 3).join(' ')} · Output validated before download` : 'Checking render server…'}</span>
            <span className="flex gap-6 text-on-surface-variant">
              {projectId && <a href={links.studio(projectId)} className="hover:text-on-surface">Back to Editor</a>}
              {projectId && <a href={urls.captions(projectId, 'srt')} className="hover:text-on-surface">Captions .SRT</a>}
              {projectId && <a href={urls.projectFile(projectId)} className="hover:text-on-surface">Project File</a>}
            </span>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
