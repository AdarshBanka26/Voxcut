import { ApiError, notFound } from '../errors.js';

export const ACCESS_COOKIE = 'vx_access';
export const REFRESH_COOKIE = 'vx_refresh';

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* skip malformed */ }
  }
  return out;
}

/**
 * Require a valid access token. API calls send it as a Bearer header. For
 * GET/HEAD only, an httpOnly SameSite=Strict cookie copy is also accepted so
 * <video>, <img> and download links work. State-changing requests always
 * need the header, which a cross-site page cannot set.
 */
export function requireAuth(repos, auth) {
  return (req, res, next) => {
    const header = req.headers.authorization ?? '';
    let token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token && (req.method === 'GET' || req.method === 'HEAD')) token = parseCookies(req.headers.cookie)[ACCESS_COOKIE] ?? null;
    if (!token) return next(new ApiError(401, 'AUTH_REQUIRED', 'Sign in to continue.'));
    try {
      const payload = auth.verifyAccessToken(token);
      const user = repos.users.get(payload.sub);
      if (!user) throw new ApiError(401, 'INVALID_TOKEN', 'This account no longer exists.');
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Only the owner can see or change a project or its jobs; others get 404. */
export function requireProjectOwner(repos) {
  return (req, res, next) => {
    if (req.params.id === 'import') return next();
    const project = repos.projects.get(req.params.id);
    if (!project || project.userId !== req.user.id) return next(notFound('Project'));
    next();
  };
}

export function requireJobOwner(repos) {
  return (req, res, next) => {
    const job = repos.jobs.get(req.params.jobId);
    const project = job && repos.projects.get(job.projectId);
    if (!project || project.userId !== req.user.id) return next(notFound('Task'));
    next();
  };
}

/** Fixed-window limiter for credential endpoints (in memory, per process). */
export function rateLimit({ windowMs, max, key = req => req.ip }) {
  const hits = new Map();
  setInterval(() => { const t = Date.now(); for (const [k, v] of hits) if (v.reset < t) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const k = key(req);
    const t = Date.now();
    let entry = hits.get(k);
    if (!entry || entry.reset < t) { entry = { count: 0, reset: t + windowMs }; hits.set(k, entry); }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.reset - t) / 1000)));
      return next(new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Too many attempts. Wait a few minutes and try again.'));
    }
    next();
  };
}
