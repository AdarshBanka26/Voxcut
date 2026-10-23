// Welcome / New Project screen (SRS §9.1): new project, recent projects,
// format guidance and the processing disclosure.

import React, { useEffect, useRef, useState } from 'react';
import { api, urls } from '../api.js';
import { Icon, Notice } from '../components/chrome.jsx';
import { navigate, links } from '../router.js';
import { formatClock } from '@shared/timecode.js';
import { StudioShell } from './Shell.jsx';
import { DropZone, Disclosure, useCapabilities } from './MediaGate.jsx';
import { rememberLocalFile } from './localMedia.js';

export default function Welcome() {
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const importRef = useRef(null);
  const caps = useCapabilities();

  const refresh = () => api.listProjects().then(r => setProjects(r.projects)).catch(setError);
  useEffect(() => { refresh(); }, []);

  async function createWithFile(file, onProgress) {
    setBusy('Creating project…');
    setError(null);
    try {
      const { project } = await api.createProject(name.trim() || file.name.replace(/\.[^.]+$/, ''));
      const snap = await api.uploadMedia(project.id, file, { onProgress });
      rememberLocalFile(snap.project.id, file);
      navigate(`/studio/${project.id}`);
    } catch (err) {
      setError(err);
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function importFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      const snap = await api.importProject(json);
      navigate(`/studio/${snap.project.id}`);
    } catch (err) {
      setError(err instanceof SyntaxError ? new Error('That file is not valid JSON.') : err);
    }
  }

  async function remove(id) {
    try {
      await api.deleteProject(id);
      setConfirmDelete(null);
      refresh();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <StudioShell active="projects">
      <div className="px-margin-mobile md:px-8 py-8 max-w-6xl mx-auto flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="font-label-code text-label-code text-on-surface-variant uppercase tracking-widest">Studio Console</span>
            </div>
            <h1 className="font-headline-lg text-headline-lg md:text-[48px] md:leading-[56px] text-on-surface tracking-tight">Edit the text. Rewrite the video.</h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mt-1">Start a project, transcribe your footage, then delete words to cut the video. Your source file is never modified.</p>
          </div>
          <button onClick={() => importRef.current?.click()} className="self-start md:self-auto flex items-center gap-2 px-5 py-2.5 rounded-full bg-surface-container hover:bg-surface-variant font-body-md text-body-md font-semibold">
            <Icon name="upload_file" className="text-[18px]" /> Open project file
          </button>
          <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={importFile} />
        </div>

        {error && <Notice title="That didn’t work" onClose={() => setError(null)}>{error.message}</Notice>}

        <section className="bg-surface-container-lowest rounded-xl p-5 md:p-6 shadow-sm grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Icon name="add_circle" className="text-primary text-[22px]" />
              <h2 className="font-headline-sm text-headline-sm">New Project</h2>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="font-label-code text-label-code text-on-surface-variant uppercase">Project name (optional)</span>
              <input value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder="e.g. Coastline Interview"
                className="px-3 py-2.5 rounded-lg bg-surface-container-low border border-surface-container focus:border-secondary outline-none font-body-md text-body-md" />
            </label>
            <div className="p-3 rounded-xl bg-surface-container-low flex flex-col gap-1.5">
              <span className="font-label-code text-label-code text-on-surface-variant uppercase">Supported formats</span>
              <p className="font-body-sm text-body-sm text-on-surface">{caps?.upload.guidance ?? 'MP4 (H.264/AAC), MOV, WebM or MKV.'}</p>
              {caps && <p className="font-label-code text-label-code text-on-surface-variant">Up to {Math.round(caps.upload.maxBytes / 1024 / 1024)} MB · {Math.round(caps.upload.maxDurationSeconds / 60)} min</p>}
            </div>
            <Disclosure caps={caps} />
          </div>
          <div className="lg:col-span-3">
            <DropZone busyLabel={busy} onFile={createWithFile} caps={caps} />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-headline-md text-headline-md">Recent projects</h2>
            <span className="font-label-code text-label-code text-on-surface-variant">{projects ? `${projects.length} PROJECT${projects.length === 1 ? '' : 'S'}` : 'LOADING'}</span>
          </div>
          {projects && !projects.length && <p className="font-body-md text-on-surface-variant">No projects yet. Drop a video above to start your first edit.</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {projects?.map(p => (
              <article key={p.id} className="group rounded-xl bg-surface-container-lowest shadow-sm hover:shadow-lg transition-all overflow-hidden flex flex-col">
                <a href={links.studio(p.id)} className="relative aspect-video bg-inverse-surface block overflow-hidden">
                  {p.media ? <img alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src={urls.thumbnail(p.id, undefined, 480)} onError={e => { e.currentTarget.style.display = 'none'; }} />
                    : <div className="w-full h-full flex items-center justify-center text-inverse-on-surface/70"><Icon name="movie" className="text-[32px]" /></div>}
                  {p.media && <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-inverse-surface/80 text-inverse-on-surface font-label-timecode text-label-timecode">{formatClock(p.media.duration)}</span>}
                </a>
                <div className="p-4 flex flex-col gap-1 flex-1">
                  <a href={links.studio(p.id)} className="font-headline-sm text-body-lg font-semibold text-on-surface group-hover:text-primary truncate">{p.name}</a>
                  <span className="font-label-code text-label-code text-on-surface-variant truncate">{p.media ? p.media.fileName : 'No video yet'} · {p.wordCount} words</span>
                  <div className="flex items-center justify-between mt-2">
                    <span className="font-label-timecode text-label-timecode text-on-surface-variant">Edited {new Date(p.updatedAt).toLocaleString()}</span>
                    {confirmDelete === p.id ? (
                      <span className="flex items-center gap-2">
                        <button onClick={() => remove(p.id)} className="px-3 py-1 rounded-full bg-error text-on-error font-label-pill text-label-pill">Delete</button>
                        <button onClick={() => setConfirmDelete(null)} className="px-3 py-1 rounded-full bg-surface-container font-label-pill text-label-pill">Keep</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmDelete(p.id)} aria-label={`Delete ${p.name}`} className="p-1 rounded text-on-surface-variant hover:text-error"><Icon name="delete" className="text-[18px]" /></button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </StudioShell>
  );
}
