import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { asyncRoute, badRequest } from '../errors.js';
import { text, oneOf } from '../validate.js';
import { snapshot, requireProject, publicMedia } from '../services/projectState.js';
import { validateWords } from '../../../shared/transcript.js';
import { normalizeRanges } from '../../../shared/timeline.js';
import { CAPTION_STYLES } from '../../../shared/captions.js';
import { SCHEMA_VERSION } from '../db/database.js';

const ASPECTS = ['16:9', '9:16', '1:1'];

function cleanSettings(input = {}, current = {}) {
  if (typeof input !== 'object' || Array.isArray(input)) throw badRequest('settings must be an object.');
  const out = { ...current };
  if ('aspect' in input) out.aspect = oneOf(input.aspect, 'settings.aspect', ASPECTS);
  if ('captionStyle' in input) out.captionStyle = oneOf(input.captionStyle, 'settings.captionStyle', Object.keys(CAPTION_STYLES));
  if ('captionsVisible' in input) out.captionsVisible = Boolean(input.captionsVisible);
  if ('fillerVocabulary' in input) {
    if (!Array.isArray(input.fillerVocabulary) || input.fillerVocabulary.length > 100) throw badRequest('fillerVocabulary must be a list of up to 100 words.');
    out.fillerVocabulary = input.fillerVocabulary.map((w, i) => text(w, `fillerVocabulary[${i}]`, { max: 40 }));
  }
  if ('pauseThreshold' in input) {
    const n = Number(input.pauseThreshold);
    if (!Number.isFinite(n) || n < 0.1 || n > 10) throw badRequest('pauseThreshold must be between 0.1 and 10 seconds.');
    out.pauseThreshold = n;
  }
  return out;
}

export function projectRoutes({ repos, jobs, config }) {
  const r = Router();

  r.get('/projects', (req, res) => res.json({ projects: repos.projects.list() }));

  r.post('/projects', (req, res) => {
    const name = text(req.body?.name, 'name', { max: 120, fallback: 'Untitled project', required: false }) ?? 'Untitled project';
    const project = repos.projects.create({ name, settings: cleanSettings(req.body?.settings, { aspect: '16:9', captionStyle: 'minimal-clean', captionsVisible: true }) });
    res.status(201).json(snapshot(repos, project.id));
  });

  r.get('/projects/:id', (req, res) => res.json(snapshot(repos, req.params.id)));

  r.patch('/projects/:id', (req, res) => {
    const p = requireProject(repos, req.params.id);
    const name = req.body?.name !== undefined ? text(req.body.name, 'name', { max: 120 }) : p.name;
    const settings = req.body?.settings !== undefined ? cleanSettings(req.body.settings, p.settings) : p.settings;
    res.json({ project: repos.projects.update(p.id, { name, settings }) });
  });

  r.delete('/projects/:id', asyncRoute(async (req, res) => {
    const p = requireProject(repos, req.params.id);
    for (const job of repos.jobs.listForProject(p.id)) jobs.cancel(job.id);
    for (const m of repos.media.allForProject(p.id)) if (m.storagePath) await fs.rm(m.storagePath, { force: true });
    await fs.rm(path.join(config.exportDir, p.id), { recursive: true, force: true });
    repos.projects.remove(p.id);
    res.status(204).end();
  }));

  // Portable project file: edit decisions + transcript + media identity, no media bytes.
  r.get('/projects/:id/project.json', (req, res) => {
    const p = requireProject(repos, req.params.id);
    const media = publicMedia(repos.media.forProject(p.id));
    res.attachment(`${p.name.replace(/[^\w.-]+/g, '_') || 'project'}.voxcut.json`);
    res.json({
      format: 'voxcut-project',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      project: { name: p.name, settings: p.settings },
      media: media && { fileName: media.fileName, sizeBytes: media.sizeBytes, duration: media.duration, width: media.width, height: media.height, frameRate: media.frameRate, audioTracks: media.audioTracks, fingerprint: media.fingerprint },
      words: repos.words.list(p.id),
      operations: repos.operations.list(p.id).map(({ type, sourceRanges, parameters, undone }) => ({ type, sourceRanges, parameters, undone }))
    });
  });

  // Import a project file. Media must then be relinked (SRS UC-04).
  r.post('/projects/import', (req, res) => {
    const body = req.body;
    if (body?.format !== 'voxcut-project') throw badRequest('This is not a Voxcut project file.');
    if (!Number.isInteger(body.schemaVersion) || body.schemaVersion > SCHEMA_VERSION) throw badRequest('This project file was made by a newer version of Voxcut.');
    const m = body.media;
    const duration = Number(m?.duration);
    if (!m || !Number.isFinite(duration) || duration <= 0 || typeof m.fingerprint !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(m.fingerprint)) {
      throw badRequest('The project file has no valid media identity.');
    }
    let words;
    try { words = validateWords(body.words ?? [], duration); } catch (err) { throw badRequest(`Transcript is invalid: ${err.message}`); }
    const ops = Array.isArray(body.operations) ? body.operations : [];
    const cleanOps = ops.map((op, i) => {
      if (!['cut', 'restore'].includes(op?.type)) throw badRequest(`Operation ${i} has an unknown type.`);
      try { return { type: op.type, sourceRanges: normalizeRanges(op.sourceRanges ?? [], duration), undone: Boolean(op.undone) }; }
      catch (err) { throw badRequest(`Operation ${i} is invalid: ${err.message}`); }
    });

    const project = repos.projects.create({
      name: text(body.project?.name, 'name', { max: 120, required: false, fallback: 'Imported project' }) ?? 'Imported project',
      settings: cleanSettings(body.project?.settings ?? {}, { aspect: '16:9', captionStyle: 'minimal-clean', captionsVisible: true })
    });
    const media = repos.media.create(project.id, {
      fileName: text(m.fileName, 'media.fileName', { max: 255, required: false, fallback: 'source' }) ?? 'source',
      sizeBytes: Number(m.sizeBytes) || 0, duration, width: Number(m.width) || null, height: Number(m.height) || null,
      frameRate: Number(m.frameRate) || null, audioTracks: Number(m.audioTracks) || 0, fingerprint: m.fingerprint, storagePath: null
    });
    repos.projects.setSourceMedia(project.id, media.id);
    repos.words.replaceAll(project.id, words);
    for (const op of cleanOps) repos.operations.append(project.id, { type: op.type, sourceRanges: op.sourceRanges });
    // Re-apply undone flags (append clears the redo branch, so set them afterwards).
    const stored = repos.operations.list(project.id);
    cleanOps.forEach((op, i) => { if (op.undone) repos.db.prepare('UPDATE edit_operations SET undone = 1 WHERE id = ?').run(stored[i].id); });
    res.status(201).json(snapshot(repos, project.id));
  });

  return r;
}
