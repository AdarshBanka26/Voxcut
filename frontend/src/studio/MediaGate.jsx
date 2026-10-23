// Import and relink screens (SRS §4.1, §4.9). Files are checked in the browser
// first (extension, size, playable metadata) and only uploaded after that.

import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Icon, Notice } from '../components/chrome.jsx';
import { formatBytes, formatSeconds } from '@shared/timecode.js';

let capsPromise = null;
export function useCapabilities() {
  const [caps, setCaps] = useState(null);
  useEffect(() => {
    capsPromise ??= api.capabilities().catch(err => { capsPromise = null; throw err; });
    capsPromise.then(setCaps).catch(() => setCaps(null));
  }, []);
  return caps;
}

/** Read duration/dimensions with a hidden <video>; fails if this browser can't decode it. */
export function probeInBrowser(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    const done = fn => { clearTimeout(timer); v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); fn(); };
    const timer = setTimeout(() => done(() => reject(new Error('Reading the file took too long. It may be very large or damaged.'))), 15000);
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () => done(() => resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight }));
    v.onerror = () => done(() => reject(new Error('This browser cannot play this file, so it cannot be previewed. Convert it to MP4 (H.264 video, AAC audio) and try again.')));
    v.src = url;
  });
}

export function Disclosure({ caps }) {
  return (
    <details className="p-3 rounded-xl bg-secondary-fixed/50 text-on-secondary-fixed group">
      <summary className="flex items-center gap-2 cursor-pointer list-none font-body-sm text-body-sm font-semibold">
        <Icon name="shield_lock" className="text-[18px]" /> Where your video is processed
        <Icon name="expand_more" className="text-[18px] ml-auto group-open:rotate-180 transition-transform" />
      </summary>
      <div className="mt-2 font-body-sm text-body-sm flex flex-col gap-1.5">
        <p>Your file is uploaded to the Voxcut server at <b>{window.location.host}</b> for transcription and rendering. {caps?.transcription.disclosure}</p>
        <p>{caps?.transcription.retention ?? 'The file stays on the server until you delete it.'}</p>
        <p>Only upload footage you have the rights to edit and publish.</p>
      </div>
    </details>
  );
}

export function DropZone({ onFile, busyLabel, caps, title = 'Drop a video to start', compact = false }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);

  async function accept(file) {
    if (!file) return;
    setError(null);
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
    const allowed = caps?.upload.extensions ?? ['.mp4', '.mov', '.m4v', '.webm', '.mkv'];
    if (!allowed.includes(ext)) return setError(`“${file.name}” is not a supported video type. ${caps?.upload.guidance ?? ''}`);
    if (caps && file.size > caps.upload.maxBytes) return setError(`This file is ${formatBytes(file.size)}; the limit is ${formatBytes(caps.upload.maxBytes)}. Try a shorter or lower-resolution clip.`);
    setChecking(true);
    try {
      await probeInBrowser(file);
    } catch (err) {
      setChecking(false);
      return setError(err.message);
    }
    setChecking(false);
    setProgress(0);
    try {
      await onFile(file, p => setProgress(p));
    } finally {
      setProgress(null);
    }
  }

  const busy = checking || progress !== null || busyLabel;
  return (
    <div className="flex flex-col gap-3 h-full">
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); if (!busy) accept(e.dataTransfer.files?.[0]); }}
        className={`flex-1 ${compact ? 'min-h-[220px]' : 'min-h-[300px]'} rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-4 p-6 text-center transition-colors ${drag ? 'border-primary-container bg-primary-fixed/40' : 'border-surface-variant bg-surface-container-low'}`}>
        <div className="w-14 h-14 rounded-2xl bg-primary-fixed flex items-center justify-center"><Icon name={busy ? 'hourglass_top' : 'movie'} className="text-primary text-[30px]" /></div>
        {busy ? (
          <div className="w-full max-w-sm flex flex-col gap-2" role="status">
            <p className="font-headline-sm text-headline-sm">{checking ? 'Checking the file…' : progress !== null && progress < 1 ? `Uploading ${Math.round(progress * 100)}%` : busyLabel || 'Reading video metadata…'}</p>
            <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden"><div className="bg-primary-container h-full transition-all" style={{ width: `${Math.round((progress ?? 0.05) * 100)}%` }} /></div>
          </div>
        ) : (
          <>
            <div>
              <p className="font-headline-sm text-headline-sm">{title}</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Drag a file here, or choose one from your computer.</p>
            </div>
            <button onClick={() => inputRef.current?.click()} className="px-6 py-2.5 rounded-full bg-primary-container text-on-primary-container font-body-md text-body-md font-semibold shadow-cta hover:bg-primary transition-all flex items-center gap-2">
              <Icon name="upload" className="text-[18px]" /> Choose video
            </button>
          </>
        )}
        <input ref={inputRef} type="file" accept="video/*,.mkv" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; accept(f); }} />
      </div>
      {error && <Notice title="File not accepted" onClose={() => setError(null)}>{error}</Notice>}
    </div>
  );
}

/**
 * Relink: the project has edits but the source is not available. The server
 * checks identity and refuses a different file unless the user confirms.
 */
export function RelinkGate({ media, onUpload }) {
  const caps = useCapabilities();
  const [mismatch, setMismatch] = useState(null);
  const [error, setError] = useState(null);

  async function upload(file, onProgress, confirm = false) {
    setError(null);
    const r = await onUpload(file, { confirm, onProgress });
    if (r.ok) return;
    if (r.error.code === 'MEDIA_MISMATCH') setMismatch({ file, error: r.error });
    else setError(r.error);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto flex flex-col gap-4">
      <Notice tone="warning" title="Source video needs relinking">
        The original file for this project (<b>{media.fileName}</b>, {formatSeconds(media.duration)}) is not available on the server. Choose the same file again; Voxcut checks that it matches before applying your edits.
      </Notice>
      {mismatch && (
        <Notice title="This file doesn’t match the original" actions={<>
          <button onClick={() => { const f = mismatch.file; setMismatch(null); upload(f, undefined, true); }} className="px-4 py-1.5 rounded-full bg-error text-on-error font-label-pill text-label-pill">Use it anyway</button>
          <button onClick={() => setMismatch(null)} className="px-4 py-1.5 rounded-full bg-surface-container-lowest font-label-pill text-label-pill">Choose another file</button>
        </>}>
          {mismatch.error.message} Applying edits to a different file can cut the wrong moments.
        </Notice>
      )}
      {error && <Notice onClose={() => setError(null)}>{error.message}</Notice>}
      <DropZone caps={caps} title={`Relink “${media.fileName}”`} onFile={(f, p) => upload(f, p)} compact />
    </div>
  );
}
