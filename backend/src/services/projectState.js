// Builds the derived project state every client view needs from persisted
// entities. Timeline state is always recomputed from operations, never stored.

import { buildTimeline, isWordCut } from '../../../shared/timeline.js';
import { notFound } from '../errors.js';

export function publicMedia(m) {
  if (!m) return null;
  const { storagePath, ...rest } = m;
  return rest;
}

export function requireProject(repos, id) {
  const p = repos.projects.get(id);
  if (!p) throw notFound('Project');
  return p;
}

export function timelineFor(repos, projectId) {
  const media = repos.media.forProject(projectId);
  return buildTimeline(media?.duration ?? 0, repos.operations.list(projectId));
}

export function wordsWithStatus(words, cuts) {
  return words.map(w => ({ ...w, status: isWordCut(w, cuts) ? 'cut' : 'kept', corrected: w.text !== w.originalText }));
}

/** An accepted suggestion whose operation was undone is back under review. */
export function suggestionsWithStatus(repos, projectId) {
  const ops = new Map(repos.operations.list(projectId).map(o => [o.id, o]));
  return repos.suggestions.list(projectId).map(s => {
    if (s.status !== 'accepted') return s;
    const op = ops.get(s.operationId);
    return !op || op.undone ? { ...s, status: 'pending' } : s;
  });
}

export function snapshot(repos, projectId) {
  const project = requireProject(repos, projectId);
  const media = repos.media.forProject(projectId);
  const timeline = timelineFor(repos, projectId);
  const words = repos.words.list(projectId);
  return {
    project,
    media: publicMedia(media),
    transcript: {
      words: wordsWithStatus(words, timeline.cuts),
      precision: words.some(w => w.precision === 'approximate') ? 'approximate' : words.length ? 'word' : null
    },
    timeline,
    operations: repos.operations.list(projectId),
    suggestions: suggestionsWithStatus(repos, projectId),
    jobs: repos.jobs.listForProject(projectId).slice(0, 20)
  };
}
