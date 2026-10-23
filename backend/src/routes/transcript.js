import { Router } from 'express';
import { ApiError, badRequest, conflict, notFound } from '../errors.js';
import { requireProject, snapshot, timelineFor } from '../services/projectState.js';
import { transcribeFile, transcriptionInfo } from '../services/transcription.js';
import { validateWords, wordsFromText } from '../../../shared/transcript.js';
import { buildCaptions, toSRT, toVTT } from '../../../shared/captions.js';
import { number, oneOf, text } from '../validate.js';

export function transcriptRoutes({ repos, jobs }) {
  const r = Router();

  r.post('/projects/:id/transcribe', (req, res) => {
    const project = requireProject(repos, req.params.id);
    const media = repos.media.forProject(project.id);
    if (!media) throw new ApiError(409, 'NO_MEDIA', 'Add a video before transcribing.');
    if (!media.storagePath) throw new ApiError(409, 'MEDIA_MISSING', 'The source video is not on the server. Relink it first.');
    if (!media.hasAudio) throw new ApiError(409, 'NO_AUDIO', 'This video has no audio track, so it cannot be transcribed. Type or paste the transcript instead.');
    if (!transcriptionInfo().enabled) throw new ApiError(409, 'TRANSCRIPTION_DISABLED', 'Server transcription is turned off. Type or paste the transcript instead.');
    const running = repos.jobs.listForProject(project.id, 'transcription').find(j => j.status === 'queued' || j.status === 'running');
    if (running) throw conflict('JOB_RUNNING', 'A transcription is already running for this project.', { jobId: running.id });

    const job = jobs.start({ projectId: project.id, kind: 'transcription', settings: { model: transcriptionInfo().model } }, async ({ signal, update }) => {
      const { words, precision } = await transcribeFile(media.storagePath, { duration: media.duration, signal, update });
      // Pending suggestions point at old word ids; edit operations are source
      // ranges and stay valid.
      repos.words.replaceAll(project.id, words);
      repos.suggestions.replacePending(project.id, 'filler', []);
      return { words: words.length, precision };
    });
    res.status(202).json({ job });
  });

  // Manual entry or import (SRS §4.2 step 2: no audio → manual transcript).
  r.put('/projects/:id/transcript', (req, res) => {
    const project = requireProject(repos, req.params.id);
    const media = repos.media.forProject(project.id);
    if (!media) throw new ApiError(409, 'NO_MEDIA', 'Add a video before adding a transcript.');
    let words;
    if (typeof req.body?.text === 'string') {
      const body = text(req.body.text, 'text', { max: 500000 });
      words = wordsFromText(body, media.duration);
    } else {
      try { words = validateWords(req.body?.words, media.duration); } catch (err) { throw badRequest(`Transcript is invalid: ${err.message}`); }
    }
    if (!words.length) throw badRequest('The transcript is empty.');
    repos.words.replaceAll(project.id, words);
    repos.suggestions.replacePending(project.id, 'filler', []);
    res.json(snapshot(repos, project.id));
  });

  // Text correction only; timing is untouched (FR-06).
  r.patch('/projects/:id/words/:wordId', (req, res) => {
    requireProject(repos, req.params.id);
    const word = repos.words.get(req.params.id, req.params.wordId);
    if (!word) throw notFound('Word');
    const value = text(req.body?.text, 'text', { max: 200 });
    if (/\s/.test(value.trim()) && value.trim().split(/\s+/).length > 3) throw badRequest('Correct one word at a time (up to three words).');
    res.json({ word: repos.words.updateText(req.params.id, word.id, value) });
  });

  r.get('/projects/:id/captions', (req, res) => {
    const project = requireProject(repos, req.params.id);
    const format = oneOf(req.query.format, 'format', ['json', 'srt', 'vtt'], 'json');
    const maxChars = number(req.query.maxChars, 'maxChars', { min: 10, max: 120, fallback: 42 });
    const cues = buildCaptions(repos.words.list(project.id), timelineFor(repos, project.id).segments, { maxChars });
    if (format === 'json') return res.json({ captions: cues });
    const name = `${project.name.replace(/[^\w.-]+/g, '_') || 'captions'}.${format}`;
    res.attachment(name).type(format === 'srt' ? 'application/x-subrip' : 'text/vtt').send(format === 'srt' ? toSRT(cues) : toVTT(cues));
  });

  return r;
}
