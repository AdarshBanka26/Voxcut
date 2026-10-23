// Client for the Voxcut backend. Every failure becomes an ApiError carrying
// the server's plain-language message so the UI can show it as-is.

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(method, url, body) {
  let res;
  try {
    res = await fetch(`/api${url}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new ApiError(0, 'OFFLINE', 'Cannot reach the Voxcut server. Check that the backend is running, then retry.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(res.status, e?.code ?? 'HTTP_ERROR', e?.message ?? `The server responded with ${res.status}.`, e?.details);
  }
  return data;
}

/** Upload with progress (fetch has no upload progress events). */
function upload(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append('file', file);
    xhr.open('POST', `/api${url}`);
    xhr.upload.onprogress = e => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onerror = () => reject(new ApiError(0, 'OFFLINE', 'The upload failed because the server could not be reached.'));
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(xhr.status, data?.error?.code ?? 'HTTP_ERROR', data?.error?.message ?? `Upload failed (${xhr.status}).`, data?.error?.details));
    };
    xhr.send(form);
  });
}

const p = id => `/projects/${encodeURIComponent(id)}`;

export const api = {
  capabilities: () => request('GET', '/capabilities'),
  listProjects: () => request('GET', '/projects'),
  createProject: name => request('POST', '/projects', { name }),
  getProject: id => request('GET', p(id)),
  updateProject: (id, patch) => request('PATCH', p(id), patch),
  deleteProject: id => request('DELETE', p(id)),
  importProject: json => request('POST', '/projects/import', json),
  uploadMedia: (id, file, { confirm = false, onProgress } = {}) => upload(`${p(id)}/media${confirm ? '?confirm=true' : ''}`, file, onProgress),
  removeStoredMedia: id => request('DELETE', `${p(id)}/media/file`),
  waveform: id => request('GET', `${p(id)}/media/waveform`),
  transcribe: id => request('POST', `${p(id)}/transcribe`),
  putTranscript: (id, body) => request('PUT', `${p(id)}/transcript`, body),
  correctWord: (id, wordId, text) => request('PATCH', `${p(id)}/words/${encodeURIComponent(wordId)}`, { text }),
  operation: (id, body) => request('POST', `${p(id)}/operations`, body),
  undo: id => request('POST', `${p(id)}/undo`),
  redo: id => request('POST', `${p(id)}/redo`),
  detectSuggestions: (id, body) => request('POST', `${p(id)}/suggestions/detect`, body),
  reviewSuggestion: (id, sid, body) => request('PATCH', `${p(id)}/suggestions/${encodeURIComponent(sid)}`, body),
  acceptSuggestions: (id, body) => request('POST', `${p(id)}/suggestions/accept`, body),
  captions: id => request('GET', `${p(id)}/captions`),
  startExport: (id, body) => request('POST', `${p(id)}/exports`, body),
  jobs: (id, kind) => request('GET', `${p(id)}/jobs${kind ? `?kind=${kind}` : ''}`),
  job: jobId => request('GET', `/jobs/${encodeURIComponent(jobId)}`),
  cancelJob: jobId => request('POST', `/jobs/${encodeURIComponent(jobId)}/cancel`)
};

export const urls = {
  media: id => `/api${p(id)}/media/file`,
  thumbnail: (id, t, w = 960) => `/api${p(id)}/media/thumbnail?w=${w}${t !== undefined ? `&t=${t.toFixed(2)}` : ''}`,
  captions: (id, format) => `/api${p(id)}/captions?format=${format}`,
  projectFile: id => `/api${p(id)}/project.json`,
  download: (jobId, file = 'video') => `/api/jobs/${encodeURIComponent(jobId)}/download?file=${file}`
};

export const isActiveJob = job => job && (job.status === 'queued' || job.status === 'running');

/** Poll a job until it finishes. Returns a stop function. */
export function watchJob(jobId, onUpdate, interval = 500) {
  let stopped = false;
  let timer;
  const tick = async () => {
    try {
      const { job } = await api.job(jobId);
      if (stopped) return;
      onUpdate(job);
      if (isActiveJob(job)) timer = setTimeout(tick, interval);
    } catch (err) {
      if (!stopped) timer = setTimeout(tick, interval * 4);
    }
  };
  tick();
  return () => { stopped = true; clearTimeout(timer); };
}
