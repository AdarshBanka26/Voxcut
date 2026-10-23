import path from 'node:path';
import fs from 'node:fs/promises';
import { Router } from 'express';
import { ApiError, asyncRoute, badRequest, notFound } from '../errors.js';
import { requireProject, timelineFor } from '../services/projectState.js';
import { renderExport, checkCapabilities, CODECS, RESOLUTIONS, ASPECTS, targetSize, captionStyleIds } from '../services/render.js';
import { capabilities } from '../services/ffmpeg.js';
import { fingerprint, FORMAT_GUIDANCE, SUPPORTED_EXTENSIONS } from '../services/media.js';
import { transcriptionInfo } from '../services/transcription.js';
import { JobError } from '../services/jobs.js';
import { CAPTION_STYLES } from '../../../shared/captions.js';
import { oneOf, slug } from '../validate.js';

export function exportRoutes({ repos, jobs, config }) {
  const r = Router();

  r.get('/capabilities', asyncRoute(async (req, res) => {
    const caps = await capabilities();
    res.json({
      ffmpeg: caps,
      codecs: Object.entries(CODECS).map(([id, c]) => ({ id, label: c.label, ext: c.ext, available: c.encoder.some(e => caps.encoders[e]) })),
      resolutions: Object.entries(RESOLUTIONS).map(([value, label]) => ({ value: Number(value), label })),
      aspects: ASPECTS,
      captionStyles: Object.entries(CAPTION_STYLES).map(([id, s]) => ({ id, ...s })),
      burnInCaptions: caps.filters.subtitles,
      transcription: transcriptionInfo(),
      upload: { maxBytes: config.maxUploadBytes, maxDurationSeconds: config.maxDurationSeconds, extensions: SUPPORTED_EXTENSIONS, guidance: FORMAT_GUIDANCE }
    });
  }));

  /**
   * Queue one render job per requested aspect ratio. The project state is
   * frozen now, so edits made while rendering don't change the output.
   */
  r.post('/projects/:id/exports', asyncRoute(async (req, res) => {
    const project = requireProject(repos, req.params.id);
    const media = repos.media.forProject(project.id);
    if (!media) throw new ApiError(409, 'NO_MEDIA', 'Add a video before exporting.');
    if (!media.storagePath) throw new ApiError(409, 'MEDIA_MISSING', 'The source video is not on the server. Relink it before exporting.');

    const body = req.body ?? {};
    const resolution = Number(oneOf(String(body.resolution ?? 1080), 'resolution', Object.keys(RESOLUTIONS)));
    const aspects = Array.isArray(body.aspects) && body.aspects.length ? [...new Set(body.aspects)] : [project.settings.aspect ?? '16:9'];
    aspects.forEach(a => oneOf(a, 'aspects', ASPECTS));
    const codec = oneOf(body.codec ?? 'h264', 'codec', Object.keys(CODECS));
    const fitMode = oneOf(body.fitMode ?? 'crop', 'fitMode', ['crop', 'pad']);
    const captionMode = oneOf(body.captions?.mode ?? 'none', 'captions.mode', ['none', 'burn', 'srt']);
    const captionStyle = oneOf(body.captions?.style ?? project.settings.captionStyle ?? 'minimal-clean', 'captions.style', captionStyleIds);
    const base = { resolution, codec, fitMode, captions: { mode: captionMode, style: captionStyle } };

    const problems = await checkCapabilities(base);
    if (problems.length) throw new ApiError(422, 'CAPABILITY_UNAVAILABLE', problems.join(' '));

    const timeline = timelineFor(repos, project.id);
    if (!timeline.segments.length) throw badRequest('Everything has been cut, so there is nothing to export.');
    const words = repos.words.list(project.id);
    if (captionMode !== 'none' && !words.length) throw badRequest('Captions need a transcript. Transcribe the video or turn captions off.');

    // Memory/size warning (SRS §4.8 step 3) — informational, returned to the client.
    const warnings = [];
    if (resolution === 2160 && timeline.duration > 600) warnings.push('4K exports of more than 10 minutes can take a long time and a lot of memory.');
    if (codec === 'prores') warnings.push('ProRes files are very large (roughly 1 GB per minute at 1080p).');
    if (codec === 'av1') warnings.push('AV1 encoding is slow; expect several times longer than H.264.');

    const snapshotMedia = { ...media };
    const created = aspects.map(aspect => {
      const settings = { ...base, aspect };
      const size = targetSize(resolution, aspect, media);
      const baseName = `${slug(project.name)}_${aspect.replace(':', 'x')}_${size.height}p`;
      return jobs.start({ projectId: project.id, kind: 'export', settings: { ...settings, ...size, expectedDuration: timeline.duration } }, async ({ job, signal, update }) => {
        update({ stage: 'Verifying source', progress: 0 });
        const actual = await fingerprint(snapshotMedia.storagePath).catch(() => null);
        if (actual !== snapshotMedia.fingerprint) {
          throw new JobError('SOURCE_MISMATCH', 'The stored source file is missing or changed since editing. Relink the original file, then export again.', 'Verifying source');
        }
        return renderExport({
          snapshot: { media: snapshotMedia, words, segments: timeline.segments },
          settings, outDir: path.join(config.exportDir, project.id, job.id), baseName, signal, update
        });
      });
    });
    res.status(202).json({ jobs: created, warnings });
  }));

  r.get('/projects/:id/jobs', (req, res) => {
    requireProject(repos, req.params.id);
    const kind = req.query.kind ? oneOf(req.query.kind, 'kind', ['transcription', 'export']) : undefined;
    res.json({ jobs: repos.jobs.listForProject(req.params.id, kind) });
  });

  const requireJob = id => {
    const job = repos.jobs.get(id);
    if (!job) throw notFound('Task');
    return job;
  };

  r.get('/jobs/:jobId', (req, res) => res.json({ job: requireJob(req.params.jobId) }));

  r.post('/jobs/:jobId/cancel', (req, res) => {
    const job = requireJob(req.params.jobId);
    if (!['queued', 'running'].includes(job.status)) throw new ApiError(409, 'NOT_CANCELLABLE', `This task has already ${job.status === 'completed' ? 'finished' : job.status}.`);
    jobs.cancel(job.id);
    res.status(202).json({ job: repos.jobs.get(job.id) });
  });

  // Downloads are only offered after the output was finalized and validated (SRS §4.8 step 6).
  r.get('/jobs/:jobId/download', asyncRoute(async (req, res) => {
    const job = requireJob(req.params.jobId);
    if (job.kind !== 'export' || job.status !== 'completed' || !job.result) throw new ApiError(409, 'NOT_READY', 'This export is not finished.');
    const which = oneOf(req.query.file ?? 'video', 'file', ['video', 'subtitles']);
    const name = which === 'video' ? job.result.fileName : job.result.subtitleFileName;
    if (!name) throw notFound('Subtitle file');
    const file = path.join(config.exportDir, job.projectId, job.id, name);
    await fs.access(file).catch(() => { throw new ApiError(410, 'EXPORT_GONE', 'This export file no longer exists. Render it again.'); });
    res.download(file, name);
  }));

  return r;
}
