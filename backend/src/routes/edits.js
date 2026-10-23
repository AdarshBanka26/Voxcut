import { Router } from 'express';
import { ApiError, badRequest } from '../errors.js';
import { requireProject, timelineFor } from '../services/projectState.js';
import { normalizeRanges, rangesForWords, subtractRanges, totalLength, RangeValidationError } from '../../../shared/timeline.js';
import { idList, oneOf, rangeList, text } from '../validate.js';

export function editRoutes({ repos }) {
  const r = Router();

  r.get('/projects/:id/timeline', (req, res) => {
    requireProject(repos, req.params.id);
    res.json({ timeline: timelineFor(repos, req.params.id) });
  });

  /**
   * Record a cut (delete from video) or restore. Accepts word ids, which are
   * mapped to source ranges, or explicit source ranges for boundary-adjusted
   * cuts. The original media is never touched (FR-10).
   */
  r.post('/projects/:id/operations', (req, res) => {
    const project = requireProject(repos, req.params.id);
    const media = repos.media.forProject(project.id);
    if (!media) throw new ApiError(409, 'NO_MEDIA', 'Add a video before editing.');
    const type = oneOf(req.body?.type, 'type', ['cut', 'restore']);

    let raw;
    if (req.body?.wordIds !== undefined) {
      const ids = idList(req.body.wordIds, 'wordIds');
      const words = repos.words.list(project.id);
      const known = new Set(words.map(w => w.id));
      if (!ids.every(id => known.has(id))) throw badRequest('Some selected words no longer exist. Refresh and try again.');
      raw = rangesForWords(words, ids);
    } else {
      raw = rangeList(req.body?.ranges, 'ranges');
    }

    let ranges;
    try {
      ranges = normalizeRanges(raw, media.duration);
    } catch (err) {
      if (err instanceof RangeValidationError) throw badRequest(err.message, { range: err.range });
      throw err;
    }
    if (!ranges.length) throw badRequest('The selection has zero duration, so there is nothing to cut.');

    const before = timelineFor(repos, project.id);
    const changed = type === 'cut'
      ? totalLength(subtractRanges(ranges, before.cuts))
      : totalLength(ranges) - totalLength(subtractRanges(ranges, before.cuts));
    if (changed < 1e-4) throw new ApiError(409, 'NOTHING_CHANGED', type === 'cut' ? 'That part is already cut.' : 'That part is not cut, so there is nothing to restore.');

    const label = text(req.body?.label, 'label', { max: 120, required: false });
    const operation = repos.operations.append(project.id, {
      type, sourceRanges: ranges, parameters: { label, source: req.body?.wordIds ? 'transcript' : 'ranges', changedSeconds: changed }
    });
    res.status(201).json({ operation, timeline: timelineFor(repos, project.id) });
  });

  r.post('/projects/:id/undo', (req, res) => {
    requireProject(repos, req.params.id);
    const operation = repos.operations.undo(req.params.id);
    if (!operation) throw new ApiError(409, 'NOTHING_TO_UNDO', 'There is nothing to undo.');
    res.json({ operation, timeline: timelineFor(repos, req.params.id) });
  });

  r.post('/projects/:id/redo', (req, res) => {
    requireProject(repos, req.params.id);
    const operation = repos.operations.redo(req.params.id);
    if (!operation) throw new ApiError(409, 'NOTHING_TO_REDO', 'There is nothing to redo.');
    res.json({ operation, timeline: timelineFor(repos, req.params.id) });
  });

  return r;
}
