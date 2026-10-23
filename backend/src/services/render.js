// Render adapter (SRS §7.4): freeze a snapshot → render plan → capability
// check → trim/concat/scale/captions → encode → validate → expose download.

import fs from 'node:fs/promises';
import path from 'node:path';
import { FFMPEG, run, probe, capabilities, CancelledError, ProcessError } from './ffmpeg.js';
import { JobError } from './jobs.js';
import { quantizeToFrame, timelineDuration } from '../../../shared/timeline.js';
import { buildCaptions, toSRT, CAPTION_STYLES } from '../../../shared/captions.js';

export const RESOLUTIONS = { 2160: '4K UHD', 1080: '1080p FHD', 720: '720p HD' };
export const ASPECTS = ['16:9', '9:16', '1:1', 'source'];
export const CODECS = {
  h264: { label: 'H.264 (MP4)', ext: 'mp4', encoder: ['libx264'] },
  prores: { label: 'Apple ProRes 422 (MOV)', ext: 'mov', encoder: ['prores_ks'] },
  av1: { label: 'AV1 (MP4)', ext: 'mp4', encoder: ['libsvtav1', 'libaom-av1'] }
};

const even = n => Math.max(2, Math.round(n / 2) * 2);

/** Output frame size. The resolution is the short side, so 9:16 at 1080 is 1080×1920. */
export function targetSize(resolution, aspect, media) {
  const r = Number(resolution);
  if (aspect === '9:16') return { width: r, height: even((r * 16) / 9) };
  if (aspect === '1:1') return { width: r, height: r };
  if (aspect === 'source' && media.width && media.height) {
    const scale = r / Math.min(media.width, media.height);
    return { width: even(media.width * scale), height: even(media.height * scale) };
  }
  return { width: even((r * 16) / 9), height: r };
}

const ASS_STYLE = {
  'cinematic-serif': "FontName=Georgia,FontSize=18,PrimaryColour=&H00FFFFFF,BackColour=&H8C182711,BorderStyle=4,Outline=0,Shadow=0,MarginV=40",
  'neon-pill': "FontName=Arial,FontSize=16,Bold=1,PrimaryColour=&H00271811,BackColour=&H0047F8AC,BorderStyle=4,Outline=0,Shadow=0,MarginV=40",
  'minimal-clean': "FontName=Arial,FontSize=15,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=1,Outline=1,Shadow=0,MarginV=36"
};

/**
 * Build a deterministic render plan from a frozen project snapshot. Segment
 * boundaries are snapped to frames and the timeline is re-accumulated from the
 * snapped values, so captions and output duration agree exactly.
 */
export function buildRenderPlan({ media, words, segments }, settings) {
  const fps = media.frameRate || 30;
  const planned = [];
  let t = 0;
  for (const s of segments) {
    const start = quantizeToFrame(s.sourceStart, fps);
    const end = Math.min(quantizeToFrame(s.sourceEnd, fps), media.duration);
    if (end - start < 1 / fps / 2) continue;
    planned.push({ id: s.id, sourceStart: start, sourceEnd: end, timelineStart: t, duration: end - start });
    t += end - start;
  }
  if (!planned.length) throw new JobError('EMPTY_TIMELINE', 'Everything has been cut, so there is nothing to export. Undo some cuts first.', 'Planning');
  const size = targetSize(settings.resolution, settings.aspect, media);
  const captions = settings.captions?.mode && settings.captions.mode !== 'none' && words.length ? buildCaptions(words, planned) : [];
  return { fps, segments: planned, expectedDuration: timelineDuration(planned), ...size, hasAudio: media.audioTracks > 0, captions };
}

export function filterScript(plan, settings) {
  const lines = [];
  const inputs = [];
  plan.segments.forEach((s, i) => {
    const a = s.sourceStart.toFixed(6);
    const b = s.sourceEnd.toFixed(6);
    lines.push(`[0:v:0]trim=start=${a}:end=${b},setpts=PTS-STARTPTS[v${i}];`);
    if (plan.hasAudio) lines.push(`[0:a:0]atrim=start=${a}:end=${b},asetpts=PTS-STARTPTS[a${i}];`);
    inputs.push(plan.hasAudio ? `[v${i}][a${i}]` : `[v${i}]`);
  });
  lines.push(`${inputs.join('')}concat=n=${plan.segments.length}:v=1:a=${plan.hasAudio ? 1 : 0}[vcat]${plan.hasAudio ? '[aout]' : ''};`);
  const { width: W, height: H } = plan;
  // Crop fills the frame, pad letterboxes; neither stretches (TC-08).
  const fit = settings.fitMode === 'pad'
    ? `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`
    : `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;
  const burn = settings.captions?.mode === 'burn' && plan.captions.length
    ? `,subtitles=captions.srt:force_style='${ASS_STYLE[settings.captions.style] ?? ASS_STYLE['minimal-clean']}'`
    : '';
  lines.push(`[vcat]${fit},setsar=1,fps=${plan.fps}${burn}[vout]`);
  return lines.join('\n');
}

function encoderArgs(codec, caps) {
  if (codec === 'prores') return ['-c:v', 'prores_ks', '-profile:v', '2', '-pix_fmt', 'yuv422p10le', '-c:a', 'pcm_s16le'];
  if (codec === 'av1') {
    return caps.encoders.libsvtav1
      ? ['-c:v', 'libsvtav1', '-crf', '35', '-preset', '8', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart']
      : ['-c:v', 'libaom-av1', '-crf', '32', '-b:v', '0', '-cpu-used', '8', '-row-mt', '1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'];
  }
  return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'];
}

/** Validate settings against what this ffmpeg build supports. Returns problems. */
export async function checkCapabilities(settings) {
  const caps = await capabilities();
  const problems = [];
  const codec = CODECS[settings.codec];
  if (!codec) problems.push(`Unknown codec "${settings.codec}".`);
  else if (!codec.encoder.some(e => caps.encoders[e])) problems.push(`${codec.label} is not available in this server's ffmpeg build.`);
  if (settings.captions?.mode === 'burn' && !caps.filters.subtitles) problems.push('Burned-in captions need the ffmpeg "subtitles" filter, which this build lacks. Export an .srt file instead.');
  return problems;
}

/**
 * Run the export. `snapshot` must be frozen before the job is queued so later
 * edits cannot change a render in progress.
 */
export async function renderExport({ snapshot, settings, outDir, baseName, signal, update }) {
  update({ stage: 'Planning', progress: 0.01 });
  const plan = buildRenderPlan(snapshot, settings);
  const caps = await capabilities();
  const problems = await checkCapabilities(settings);
  if (problems.length) throw new JobError('CAPABILITY_UNAVAILABLE', problems.join(' '), 'Validating capabilities');

  await fs.mkdir(outDir, { recursive: true });
  const ext = CODECS[settings.codec].ext;
  const outName = `${baseName}.${ext}`;
  const outPath = path.join(outDir, outName);
  const scriptPath = path.join(outDir, 'filter.txt');
  await fs.writeFile(scriptPath, filterScript(plan, settings));
  let srtName = null;
  if (plan.captions.length && settings.captions?.mode !== 'none') {
    await fs.writeFile(path.join(outDir, 'captions.srt'), toSRT(plan.captions));
    srtName = `${baseName}.srt`;
    await fs.copyFile(path.join(outDir, 'captions.srt'), path.join(outDir, srtName));
  }

  const totalFrames = Math.round(plan.expectedDuration * plan.fps);
  const args = ['-hide_banner', '-y', '-nostats', '-progress', 'pipe:1', '-i', snapshot.media.storagePath,
    '-filter_complex_script', 'filter.txt', '-map', '[vout]'];
  if (plan.hasAudio) args.push('-map', '[aout]');
  args.push(...encoderArgs(settings.codec, caps), '-r', String(plan.fps), outName);

  update({ stage: 'Rendering', progress: 0.02, metrics: { frame: 0, totalFrames } });
  const metrics = { frame: 0, totalFrames, speed: null, bytesWritten: 0, renderFps: null };
  let buffer = '';
  try {
    await run(FFMPEG, args, {
      cwd: outDir,
      signal,
      onStdout: chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          const [k, v] = line.trim().split('=');
          if (k === 'frame') metrics.frame = Number(v) || metrics.frame;
          else if (k === 'fps') metrics.renderFps = Number(v) || metrics.renderFps;
          else if (k === 'total_size') metrics.bytesWritten = Number(v) || metrics.bytesWritten;
          else if (k === 'speed') metrics.speed = Number.parseFloat(v) || metrics.speed;
          else if (k === 'out_time_us' || k === 'out_time_ms') {
            const sec = Number(v) / 1e6;
            if (Number.isFinite(sec)) update({ progress: 0.02 + Math.min(1, sec / plan.expectedDuration) * 0.93, metrics: { ...metrics } });
          }
        }
      }
    });
  } catch (err) {
    await fs.rm(outPath, { force: true });
    if (err instanceof CancelledError) throw err;
    const hint = err instanceof ProcessError && /memory|Cannot allocate/i.test(err.stderr ?? '')
      ? ' The server ran out of memory; try a lower resolution or a shorter clip.' : ' Try a lower resolution or the H.264 codec.';
    throw new JobError('RENDER_FAILED', `Rendering failed.${hint}`, 'Rendering');
  }

  update({ stage: 'Validating output', progress: 0.97, metrics: { ...metrics, frame: totalFrames } });
  let out;
  try {
    out = await probe(outPath);
  } catch {
    out = null;
  }
  const stat = await fs.stat(outPath).catch(() => null);
  const tolerance = 1 / plan.fps + 0.25;
  if (!out || !stat || !out.hasVideo || !Number.isFinite(out.duration) || Math.abs(out.duration - plan.expectedDuration) > tolerance) {
    await fs.rm(outPath, { force: true });
    throw new JobError('OUTPUT_INVALID', 'The rendered file did not match the edited timeline, so it was discarded. Try again or use simpler settings.', 'Validating output');
  }
  await fs.rm(scriptPath, { force: true });
  await fs.rm(path.join(outDir, 'captions.srt'), { force: true });

  return {
    fileName: outName,
    subtitleFileName: srtName,
    sizeBytes: stat.size,
    duration: out.duration,
    expectedDuration: plan.expectedDuration,
    width: out.width,
    height: out.height,
    frameRate: out.frameRate,
    codec: settings.codec,
    segments: plan.segments.length,
    captions: plan.captions.length
  };
}

export const captionStyleIds = Object.keys(CAPTION_STYLES);
