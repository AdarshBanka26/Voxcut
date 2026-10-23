// Thin wrapper around the ffmpeg / ffprobe binaries. Every call is cancellable
// through an AbortSignal and never logs media content (NFR-12).

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export const FFMPEG = process.env.FFMPEG_PATH || require('ffmpeg-static');
export const FFPROBE = process.env.FFPROBE_PATH || require('ffprobe-static').path;

export class ProcessError extends Error {
  constructor(message, { code, stderr } = {}) {
    super(message);
    this.exitCode = code;
    this.stderr = stderr;
  }
}

export class CancelledError extends Error {
  constructor() { super('Cancelled'); this.cancelled = true; }
}

/**
 * Run a binary. `onStdout` receives raw chunks (for PCM / progress); stderr is
 * kept (last 8 KB) for error reporting only.
 */
export function run(bin, args, { signal, onStdout, onStderrLine, cwd } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new CancelledError());
    const child = spawn(bin, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    let stderr = '';
    let pending = '';
    const abort = () => child.kill('SIGKILL');
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', chunk => (onStdout ? onStdout(chunk) : out.push(chunk)));
    child.stderr.on('data', chunk => {
      const text = chunk.toString();
      stderr = (stderr + text).slice(-8192);
      if (onStderrLine) {
        pending += text;
        const lines = pending.split(/\r?\n|\r/);
        pending = lines.pop();
        lines.forEach(onStderrLine);
      }
    });
    child.on('error', err => { signal?.removeEventListener('abort', abort); reject(err); });
    child.on('close', code => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) return reject(new CancelledError());
      if (code !== 0) return reject(new ProcessError(`${bin.split(/[\\/]/).pop()} exited with code ${code}`, { code, stderr }));
      resolve(onStdout ? undefined : Buffer.concat(out));
    });
  });
}

function parseRate(rate) {
  if (!rate || rate === '0/0') return null;
  const [n, d] = rate.split('/').map(Number);
  const v = d ? n / d : n;
  return Number.isFinite(v) && v > 0 ? Math.round(v * 1000) / 1000 : null;
}

/** Inspect duration, dimensions, frame rate and streams (SRS §4.2 step 1). */
export async function probe(file) {
  const raw = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  const info = JSON.parse(raw.toString());
  const video = info.streams?.find(s => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
  const audios = info.streams?.filter(s => s.codec_type === 'audio') ?? [];
  const duration = Number(info.format?.duration ?? video?.duration ?? audios[0]?.duration);
  return {
    container: info.format?.format_name ?? null,
    duration: Number.isFinite(duration) ? duration : null,
    hasVideo: Boolean(video),
    width: video?.width ?? null,
    height: video?.height ?? null,
    frameRate: parseRate(video?.avg_frame_rate) ?? parseRate(video?.r_frame_rate),
    videoCodec: video?.codec_name ?? null,
    audioCodec: audios[0]?.codec_name ?? null,
    audioTracks: audios.length
  };
}

let capabilityCache = null;
/** What this ffmpeg build can do, so the UI can disable unsupported options (NFR-09). */
export async function capabilities() {
  if (capabilityCache) return capabilityCache;
  const [encoders, filters, version] = await Promise.all([
    run(FFMPEG, ['-hide_banner', '-encoders']).then(b => b.toString()),
    run(FFMPEG, ['-hide_banner', '-filters']).then(b => b.toString()),
    run(FFMPEG, ['-hide_banner', '-version']).then(b => b.toString().split('\n')[0])
  ]);
  const has = (list, name) => new RegExp(`^\\s*\\S+\\s+${name}\\s`, 'm').test(list);
  capabilityCache = {
    version,
    encoders: {
      libx264: has(encoders, 'libx264'),
      prores_ks: has(encoders, 'prores_ks'),
      libsvtav1: has(encoders, 'libsvtav1'),
      'libaom-av1': has(encoders, 'libaom-av1'),
      aac: has(encoders, 'aac'),
      libopus: has(encoders, 'libopus')
    },
    filters: { subtitles: has(filters, 'subtitles'), silencedetect: has(filters, 'silencedetect') }
  };
  return capabilityCache;
}

/** Decode the first audio track to 16 kHz mono float PCM for speech models. */
export async function decodePcm(file, { signal } = {}) {
  const chunks = [];
  await run(FFMPEG, ['-v', 'error', '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pipe:1'], {
    signal, onStdout: c => chunks.push(c)
  });
  const buf = Buffer.concat(chunks);
  // Copy into an aligned buffer; Buffer slices may not be 4-byte aligned.
  const pcm = new Float32Array(buf.length >> 2);
  new Uint8Array(pcm.buffer).set(buf.subarray(0, pcm.length * 4));
  return pcm;
}

/** Audio-energy silence detection (SRS §3.2). Returns [{start, end}]. */
export async function detectSilences(file, { noiseDb = -35, minDuration = 0.5, duration, signal } = {}) {
  const silences = [];
  let open = null;
  await run(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-map', '0:a:0', '-af', `silencedetect=noise=${noiseDb}dB:d=${minDuration}`, '-f', 'null', '-'], {
    signal,
    onStderrLine: line => {
      const s = line.match(/silence_start:\s*(-?[\d.]+)/);
      const e = line.match(/silence_end:\s*([\d.]+)/);
      if (s) open = Math.max(0, Number(s[1]));
      if (e && open !== null) { silences.push({ start: open, end: Number(e[1]) }); open = null; }
    }
  });
  if (open !== null && Number.isFinite(duration)) silences.push({ start: open, end: duration });
  return silences;
}

/** Peak envelope for drawing the audio waveform on the timeline. */
export async function waveformPeaks(file, points = 1000, { signal } = {}) {
  const sampleRate = 2000;
  const chunks = [];
  await run(FFMPEG, ['-v', 'error', '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', String(sampleRate), '-f', 's16le', 'pipe:1'], {
    signal, onStdout: c => chunks.push(c)
  });
  const buf = Buffer.concat(chunks);
  const samples = buf.length >> 1;
  const per = Math.max(1, Math.floor(samples / points));
  const peaks = [];
  for (let i = 0; i < samples; i += per) {
    let max = 0;
    for (let j = i; j < Math.min(samples, i + per); j++) max = Math.max(max, Math.abs(buf.readInt16LE(j * 2)));
    peaks.push(Math.round((max / 32768) * 1000) / 1000);
  }
  return { sampleRate, samplesPerPeak: per, peaks };
}

export async function thumbnail(file, t, { width = 640 } = {}) {
  return run(FFMPEG, ['-v', 'error', '-ss', String(Math.max(0, t)), '-i', file, '-frames:v', '1', '-vf', `scale=${width}:-2`, '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1']);
}
