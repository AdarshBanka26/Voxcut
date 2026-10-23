import { Router } from 'express';
import { ApiError, asyncRoute, badRequest, notFound } from '../errors.js';
import { requireProject, timelineFor, suggestionsWithStatus as withEffectiveStatus } from '../services/projectState.js';
import { findFillers, findPausesFromWords, pausesFromSilences, DEFAULT_FILLERS } from '../../../shared/transcript.js';
import { normalizeRanges, RangeValidationError } from '../../../shared/timeline.js';
import { detectSilences, capabilities } from '../services/ffmpeg.js';
import { idList, number, oneOf, text } from '../validate.js';

export function suggestionRoutes({ repos }) {
  const r = Router();

  r.get('/projects/:id/suggestions', (req, res) => {
    requireProject(repos, req.params.id);
    res.json({ suggestions: withEffectiveStatus(repos, req.params.id) });
  });

  /** Scan for fillers (transcript tokens) or pauses (audio energy, else word gaps). Review-first: nothing is cut here. */
  r.post('/projects/:id/suggestions/detect', asyncRoute(async (req, res) => {
    const project = requireProject(repos, req.params.id);
    const media = repos.media.forProject(project.id);
    if (!media) throw new ApiError(409, 'NO_MEDIA', 'Add a video first.');
    const type = oneOf(req.body?.type, 'type', ['filler', 'pause']);
    const words = repos.words.list(project.id);
    const { cuts } = timelineFor(repos, project.id);
    let found;
    let method;

    if (type === 'filler') {
      if (!words.length) throw new ApiError(409, 'NO_TRANSCRIPT', 'Transcribe the video before looking for filler words.');
      const vocabulary = Array.isArray(req.body?.vocabulary) && req.body.vocabulary.length
        ? req.body.vocabulary.slice(0, 100).map((w, i) => text(w, `vocabulary[${i}]`, { max: 40 }))
        : project.settings.fillerVocabulary ?? DEFAULT_FILLERS;
      found = findFillers(words, { vocabulary, cuts });
      method = 'transcript';
    } else {
      const minPause = number(req.body?.minPause, 'minPause', { min: 0.1, max: 10, fallback: project.settings.pauseThreshold ?? 0.5 });
      const padding = number(req.body?.padding, 'padding', { min: 0, max: 1, fallback: 0.1 });
      const noiseDb = number(req.body?.noiseDb, 'noiseDb', { min: -80, max: -10, fallback: -35 });
      const wantAudio = (req.body?.method ?? 'audio') === 'audio';
      const caps = await capabilities();
      if (wantAudio && media.storagePath && media.hasAudio && caps.filters.silencedetect) {
        const silences = await detectSilences(media.storagePath, { noiseDb, minDuration: minPause, duration: media.duration });
        found = pausesFromSilences(silences, { minPause, padding, duration: media.duration, cuts });
        method = 'audio-energy';
      } else {
        if (!words.length) throw new ApiError(409, 'NO_TRANSCRIPT', 'Pause detection needs either the source audio on the server or a transcript.');
        found = findPausesFromWords(words, { minPause, padding, duration: media.duration, cuts });
        method = 'word-gaps';
      }
    }
    const suggestions = repos.suggestions.replacePending(project.id, type, found);
    res.json({ suggestions, method });
  }));

  function accept(project, media, list) {
    let ranges;
    try {
      ranges = normalizeRanges(list.map(s => ({ start: s.sourceStart, end: s.sourceEnd })), media.duration);
    } catch (err) {
      if (err instanceof RangeValidationError) throw badRequest(err.message);
      throw err;
    }
    const label = list.length === 1 ? `Remove ${list[0].type}: ${list[0].label}` : `Remove ${list.length} suggestions`;
    // Accepted suggestions become ordinary undoable operations (SRS §3.2).
    const operation = repos.operations.append(project.id, { type: 'cut', sourceRanges: ranges, parameters: { label, source: 'suggestions', suggestionIds: list.map(s => s.id) } });
    for (const s of list) repos.suggestions.update(project.id, s.id, { status: 'accepted', operationId: operation.id });
    return operation;
  }

  /** Accept (optionally with adjusted boundaries) or reject one suggestion. */
  r.patch('/projects/:id/suggestions/:sid', (req, res) => {
    const project = requireProject(repos, req.params.id);
    const media = repos.media.forProject(project.id);
    const current = withEffectiveStatus(repos, project.id).find(s => s.id === req.params.sid);
    if (!current) throw notFound('Suggestion');
    const status = oneOf(req.body?.status, 'status', ['accepted', 'rejected', 'pending']);
    let s = current;
    if (req.body?.sourceStart !== undefined || req.body?.sourceEnd !== undefined) {
      const start = number(req.body.sourceStart ?? s.sourceStart, 'sourceStart', { min: 0, max: media.duration });
      const end = number(req.body.sourceEnd ?? s.sourceEnd, 'sourceEnd', { min: 0, max: media.duration });
      if (end <= start) throw badRequest('The adjusted end must be after the start.');
      s = repos.suggestions.update(project.id, s.id, { sourceStart: start, sourceEnd: end });
    }
    let operation = null;
    if (status === 'accepted') {
      if (current.status === 'accepted') throw new ApiError(409, 'ALREADY_ACCEPTED', 'This suggestion is already applied. Use undo to reverse it.');
      operation = accept(project, media, [s]);
    } else {
      if (current.status === 'accepted') throw new ApiError(409, 'ALREADY_ACCEPTED', 'This suggestion is already applied. Use undo to reverse it.');
      repos.suggestions.update(project.id, s.id, { status });
    }
    res.json({ operation, suggestions: withEffectiveStatus(repos, project.id), timeline: timelineFor(repos, project.id) });
  });

  /** Accept several pending suggestions as one undoable operation. */
  r.post('/projects/:id/suggestions/accept', (req, res) => {
    const project = requireProject(repos, req.params.id);
    const media = repos.media.forProject(project.id);
    const all = withEffectiveStatus(repos, project.id).filter(s => s.status === 'pending');
    const ids = req.body?.ids !== undefined ? new Set(idList(req.body.ids, 'ids')) : null;
    const type = req.body?.type !== undefined ? oneOf(req.body.type, 'type', ['filler', 'pause']) : null;
    const list = all.filter(s => (!ids || ids.has(s.id)) && (!type || s.type === type));
    if (!list.length) throw new ApiError(409, 'NOTHING_TO_ACCEPT', 'There are no pending suggestions to apply.');
    const operation = accept(project, media, list);
    res.status(201).json({ operation, suggestions: withEffectiveStatus(repos, project.id), timeline: timelineFor(repos, project.id) });
  });

  return r;
}
