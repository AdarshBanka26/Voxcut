// Object URLs for files picked in this session, so preview plays the local
// file without re-downloading it. URLs are revoked when replaced or released.

const files = new Map();

export function rememberLocalFile(projectId, file) {
  releaseLocalFile(projectId);
  files.set(projectId, { file, url: URL.createObjectURL(file) });
}

export function localUrl(projectId) {
  return files.get(projectId)?.url ?? null;
}

export function releaseLocalFile(projectId) {
  const entry = files.get(projectId);
  if (entry) URL.revokeObjectURL(entry.url);
  files.delete(projectId);
}
