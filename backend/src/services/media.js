// Media manager (SRS §7.1): validation, metadata and source identity.

import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { probe } from './ffmpeg.js';
import { ApiError } from '../errors.js';

export const SUPPORTED_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.webm', '.mkv'];
export const FORMAT_GUIDANCE = 'Supported: MP4 or MOV (H.264/HEVC video, AAC audio), WebM (VP8/VP9, Opus) and MKV. MP4 with H.264 + AAC works in every browser.';

const SAMPLE = 1024 * 1024;

/**
 * Identity check for relinking (SRS §4.9): size plus hashes of the first and
 * last megabyte. Cheap for large files and stable across renames.
 */
export async function fingerprint(file) {
  const handle = await fs.open(file, 'r');
  try {
    const { size } = await handle.stat();
    const hash = createHash('sha256').update(String(size));
    const head = Buffer.alloc(Math.min(SAMPLE, size));
    await handle.read(head, 0, head.length, 0);
    hash.update(head);
    if (size > SAMPLE) {
      const tail = Buffer.alloc(Math.min(SAMPLE, size - SAMPLE));
      await handle.read(tail, 0, tail.length, size - tail.length);
      hash.update(tail);
    }
    return `sha256:${hash.digest('hex')}`;
  } finally {
    await handle.close();
  }
}

/** Probe an uploaded file and explain any problem in plain language (FR-02). */
export async function inspectUpload(file, originalName, { maxDuration }) {
  const ext = path.extname(originalName).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA', `"${ext || 'no extension'}" files are not supported. ${FORMAT_GUIDANCE}`);
  }
  let info;
  try {
    info = await probe(file);
  } catch {
    throw new ApiError(422, 'CORRUPT_MEDIA', `This file could not be read. It may be damaged or use an unusual codec. ${FORMAT_GUIDANCE}`);
  }
  if (!info.hasVideo) throw new ApiError(422, 'NO_VIDEO_STREAM', `No video stream was found in this file. ${FORMAT_GUIDANCE}`);
  if (!info.duration || info.duration <= 0) throw new ApiError(422, 'UNKNOWN_DURATION', 'The video duration could not be determined. Try re-saving it as MP4.');
  if (info.duration > maxDuration) {
    throw new ApiError(422, 'MEDIA_TOO_LONG', `This video is ${Math.round(info.duration / 60)} minutes long; the limit is ${Math.round(maxDuration / 60)} minutes. Trim it first or use a shorter clip.`);
  }
  return { ...info, fingerprint: await fingerprint(file) };
}

/** Compare a candidate file against the media a project was edited with. */
export function compareIdentity(original, candidate) {
  const reasons = [];
  if (original.fingerprint !== candidate.fingerprint) reasons.push('the file contents differ');
  if (Math.abs(original.duration - candidate.duration) > 0.05) {
    reasons.push(`the duration differs (${original.duration.toFixed(2)}s vs ${candidate.duration.toFixed(2)}s)`);
  }
  return { matches: reasons.length === 0, reasons };
}
