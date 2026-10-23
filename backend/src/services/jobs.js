// Long-running task runner (transcription, rendering). Every job ends in
// completed, cancelled or failed; there is no indefinite progress (SRS §6.1).
// Jobs of the same kind run one at a time to bound memory use.

import { CancelledError } from './ffmpeg.js';

export class JobError extends Error {
  constructor(code, message, stage) {
    super(message);
    this.code = code;
    this.stage = stage;
  }
}

export function createJobManager(repos, { log = () => {} } = {}) {
  const controllers = new Map();
  const queues = new Map();

  function enqueue(kind, task) {
    const tail = queues.get(kind) ?? Promise.resolve();
    const next = tail.then(task, task);
    queues.set(kind, next.catch(() => {}));
    return next;
  }

  /**
   * Start a job. `work(ctx)` gets { job, signal, update } and returns the result
   * object stored on completion. Throw JobError for user-facing failures.
   */
  function start({ projectId, kind, settings }, work) {
    const job = repos.jobs.create({ projectId, kind, settings });
    const controller = new AbortController();
    controllers.set(job.id, controller);
    let stage = 'Queued';
    let lastWrite = 0;

    const update = ({ stage: s, progress, metrics, force } = {}) => {
      if (s) stage = s;
      const t = Date.now();
      // Throttle DB writes; stage changes are always written.
      if (!force && !s && t - lastWrite < 250) return;
      lastWrite = t;
      const patch = { stage };
      if (progress !== undefined) patch.progress = Math.max(0, Math.min(1, progress));
      if (metrics) patch.metrics = metrics;
      repos.jobs.update(job.id, patch);
    };

    enqueue(kind, async () => {
      if (controller.signal.aborted) {
        repos.jobs.update(job.id, { status: 'cancelled', stage: 'Cancelled', finishedAt: new Date().toISOString() });
        controllers.delete(job.id);
        return;
      }
      repos.jobs.update(job.id, { status: 'running', startedAt: new Date().toISOString() });
      try {
        const result = await work({ job, signal: controller.signal, update });
        repos.jobs.update(job.id, { status: 'completed', stage: 'Completed', progress: 1, result, finishedAt: new Date().toISOString() });
      } catch (err) {
        if (err instanceof CancelledError || controller.signal.aborted) {
          repos.jobs.update(job.id, { status: 'cancelled', stage: 'Cancelled', finishedAt: new Date().toISOString() });
        } else {
          const code = err instanceof JobError ? err.code : 'INTERNAL_ERROR';
          const message = err instanceof JobError ? err.message : 'Something went wrong while processing. Your project is unchanged; try again.';
          log(`job ${job.id} (${kind}) failed at "${err.stage ?? stage}": ${err.message}`);
          repos.jobs.update(job.id, { status: 'failed', stage: err.stage ?? stage, errorCode: code, errorMessage: message, finishedAt: new Date().toISOString() });
        }
      } finally {
        controllers.delete(job.id);
      }
    });
    return job;
  }

  function cancel(jobId) {
    const c = controllers.get(jobId);
    if (!c) return false;
    c.abort();
    return true;
  }

  const isActive = jobId => controllers.has(jobId);

  return { start, cancel, isActive };
}
