// Display helpers for timecodes and durations.

export function formatTimecode(seconds, fps = 30) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const rate = Math.max(1, Math.round(fps || 30));
  const totalFrames = Math.floor(seconds * rate + 1e-6);
  const f = totalFrames % rate;
  const s = Math.floor(totalFrames / rate) % 60;
  const m = Math.floor(totalFrames / rate / 60) % 60;
  const h = Math.floor(totalFrames / rate / 3600);
  return [h, m, s, f].map(n => String(n).padStart(2, '0')).join(':');
}

export function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

export function formatSeconds(seconds, digits = 2) {
  return `${(Number.isFinite(seconds) ? seconds : 0).toFixed(digits)}s`;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}
