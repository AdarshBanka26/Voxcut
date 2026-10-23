import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { ApiError, asyncRoute, conflict, notFound } from '../errors.js';
import { requireProject, publicMedia, snapshot } from '../services/projectState.js';
import { inspectUpload, compareIdentity, FORMAT_GUIDANCE } from '../services/media.js';
import { waveformPeaks, thumbnail } from '../services/ffmpeg.js';
import { newId } from '../db/repositories.js';
import { number } from '../validate.js';

export function mediaRoutes({ repos, config }) {
  const r = Router();
  const upload = multer({
    storage: multer.diskStorage({
      destination: config.mediaDir,
      // Never trust the client file name on disk; keep only a known extension.
      filename: (req, file, cb) => cb(null, `${newId('upl')}${path.extname(file.originalname).toLowerCase().replace(/[^.\w]/g, '').slice(0, 6)}`)
    }),
    limits: { fileSize: config.maxUploadBytes, files: 1 }
  });

  const storedMedia = projectId => {
    const media = repos.media.forProject(projectId);
    if (!media) throw new ApiError(409, 'NO_MEDIA', 'This project has no source video yet.');
    if (!media.storagePath) throw new ApiError(409, 'MEDIA_MISSING', 'The source video is not available on the server. Relink the original file to continue.');
    return media;
  };

  /**
   * Upload or relink the source video. If the project already has transcript
   * or edits, the new file must match the original's identity; a mismatch is
   * refused unless the client explicitly confirms with ?confirm=true (SRS §4.9, §9.3).
   */
  r.post('/projects/:id/media', upload.single('file'), asyncRoute(async (req, res) => {
    const project = requireProject(repos, req.params.id);
    if (!req.file) throw new ApiError(400, 'NO_FILE', `Choose a video file to upload. ${FORMAT_GUIDANCE}`);
    const file = req.file.path;
    try {
      const info = await inspectUpload(file, req.file.originalname, { maxDuration: config.maxDurationSeconds });
      const previous = repos.media.forProject(project.id);
      const words = repos.words.list(project.id);
      const ops = repos.operations.list(project.id);
      const hasEdits = words.length > 0 || ops.length > 0;

      if (previous && hasEdits) {
        const identity = compareIdentity(previous, info);
        const lastUsed = Math.max(0, ...words.map(w => w.sourceEnd), ...ops.flatMap(o => o.sourceRanges.map(x => x.end)));
        if (!identity.matches && info.duration + 0.05 < lastUsed) {
          throw new ApiError(409, 'MEDIA_TOO_SHORT', `This file is shorter (${info.duration.toFixed(2)}s) than the existing transcript and edits (${lastUsed.toFixed(2)}s), so they cannot be applied to it.`);
        }
        if (!identity.matches && req.query.confirm !== 'true') {
          throw conflict('MEDIA_MISMATCH', `This does not look like the original file: ${identity.reasons.join(' and ')}. Your edits were made for "${previous.fileName}".`, {
            expected: { fileName: previous.fileName, duration: previous.duration, sizeBytes: previous.sizeBytes },
            received: { fileName: req.file.originalname, duration: info.duration, sizeBytes: req.file.size },
            reasons: identity.reasons
          });
        }
      }

      const media = repos.media.create(project.id, {
        fileName: req.file.originalname.slice(0, 255), sizeBytes: req.file.size, mimeType: req.file.mimetype,
        container: info.container, duration: info.duration, width: info.width, height: info.height, frameRate: info.frameRate,
        videoCodec: info.videoCodec, audioCodec: info.audioCodec, audioTracks: info.audioTracks, fingerprint: info.fingerprint, storagePath: file
      });
      repos.projects.setSourceMedia(project.id, media.id);
      if (previous) {
        if (previous.storagePath) await fs.rm(previous.storagePath, { force: true });
        repos.media.remove(previous.id);
      }
      if (!hasEdits) repos.suggestions.clear(project.id);
      res.status(201).json(snapshot(repos, project.id));
    } catch (err) {
      await fs.rm(file, { force: true });
      throw err;
    }
  }));

  r.get('/projects/:id/media', (req, res) => {
    requireProject(repos, req.params.id);
    const media = repos.media.forProject(req.params.id);
    if (!media) throw notFound('Media');
    res.json({ media: publicMedia(media) });
  });

  // Streams with HTTP range support so the browser can seek.
  r.get('/projects/:id/media/file', (req, res, next) => {
    const media = storedMedia(req.params.id);
    res.sendFile(media.storagePath, { headers: { 'Cache-Control': 'private, max-age=3600', 'Content-Type': media.mimeType || 'video/mp4' } }, err => err && next(err));
  });

  r.get('/projects/:id/media/waveform', asyncRoute(async (req, res) => {
    const media = storedMedia(req.params.id);
    if (!media.hasAudio) return res.json({ peaks: [], duration: media.duration });
    const cache = path.join(config.cacheDir, `${media.id}.waveform.json`);
    let data = await fs.readFile(cache, 'utf8').then(JSON.parse).catch(() => null);
    if (!data) {
      data = { ...(await waveformPeaks(media.storagePath, 1500)), duration: media.duration };
      await fs.writeFile(cache, JSON.stringify(data));
    }
    res.json(data);
  }));

  r.get('/projects/:id/media/thumbnail', asyncRoute(async (req, res) => {
    const media = storedMedia(req.params.id);
    const t = number(req.query.t ?? media.duration / 3, 't', { min: 0, max: media.duration });
    const w = number(req.query.w ?? 640, 'w', { min: 64, max: 1920 });
    const jpg = await thumbnail(media.storagePath, t, { width: Math.round(w) });
    res.set('Cache-Control', 'private, max-age=600').type('jpeg').send(jpg);
  }));

  // Remove the stored copy but keep metadata, transcript and edits; the
  // project then needs a relink before transcription or export.
  r.delete('/projects/:id/media/file', asyncRoute(async (req, res) => {
    const media = storedMedia(req.params.id);
    await fs.rm(media.storagePath, { force: true });
    await fs.rm(path.join(config.cacheDir, `${media.id}.waveform.json`), { force: true });
    repos.media.clearStoragePath(media.id);
    res.json(snapshot(repos, req.params.id));
  }));

  return r;
}
