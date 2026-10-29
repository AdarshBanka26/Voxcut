import { Router } from 'express';
import { ApiError, asyncRoute, badRequest, conflict } from '../errors.js';
import { text } from '../validate.js';
import { hashPassword, verifyPassword, burnPasswordCheck } from '../services/auth.js';
import { ACCESS_COOKIE, REFRESH_COOKIE, parseCookies, rateLimit, requireAuth } from '../middleware/auth.js';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

function email(value) {
  const v = text(value, 'Email', { max: 254 }).toLowerCase();
  if (!EMAIL.test(v)) throw badRequest('Enter a valid email address.');
  return v;
}

function password(value, min) {
  if (typeof value !== 'string' || value.length < min) throw badRequest(`Password must be at least ${min} characters.`);
  if (value.length > 128) throw badRequest('Password must be at most 128 characters.');
  return value;
}

export function authRoutes({ repos, auth, config }) {
  const r = Router();
  const { cookieSecure, accessTtlSeconds, passwordMinLength } = config.auth;
  const credentialLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, key: req => `${req.ip}|${req.path}` });
  const refreshLimit = rateLimit({ windowMs: 60 * 1000, max: 60 });

  const cookieBase = { httpOnly: true, secure: cookieSecure, sameSite: 'strict' };

  function sendSession(res, status, user, session) {
    // Refresh cookie is only sent to the auth endpoints that need it.
    res.cookie(REFRESH_COOKIE, session.refreshToken, { ...cookieBase, path: '/api/auth', maxAge: session.refreshExpiresIn * 1000 });
    // Cookie copy of the access token, honoured for GET media/download only.
    res.cookie(ACCESS_COOKIE, session.accessToken, { ...cookieBase, path: '/api', maxAge: accessTtlSeconds * 1000 });
    res.set('Cache-Control', 'no-store');
    res.status(status).json({ user, accessToken: session.accessToken, tokenType: 'Bearer', expiresIn: session.accessExpiresIn });
  }

  function clearCookies(res) {
    res.clearCookie(REFRESH_COOKIE, { ...cookieBase, path: '/api/auth' });
    res.clearCookie(ACCESS_COOKIE, { ...cookieBase, path: '/api' });
  }

  // Browsers use the cookie; other clients may send { refreshToken } in the body.
  const presentedRefresh = req => parseCookies(req.headers.cookie)[REFRESH_COOKIE] || (typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : null);

  r.post('/auth/register', credentialLimit, asyncRoute(async (req, res) => {
    const name = text(req.body?.name, 'Name', { max: 80 });
    const mail = email(req.body?.email);
    const pass = password(req.body?.password, passwordMinLength);
    if (repos.users.findByEmailWithHash(mail)) throw conflict('EMAIL_TAKEN', 'An account with this email already exists. Sign in instead.');
    const firstUser = repos.users.count() === 0;
    let user;
    try {
      user = repos.users.create({ email: mail, name, passwordHash: await hashPassword(pass) });
    } catch (err) {
      if (/UNIQUE/.test(err.message)) throw conflict('EMAIL_TAKEN', 'An account with this email already exists. Sign in instead.');
      throw err;
    }
    // Projects made before accounts existed belong to the first account.
    if (firstUser) repos.projects.claimOrphans(user.id);
    repos.users.touchLogin(user.id);
    sendSession(res, 201, user, auth.issueSession(user, req.headers['user-agent']));
  }));

  r.post('/auth/login', credentialLimit, asyncRoute(async (req, res) => {
    const mail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const pass = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!mail || !pass) throw badRequest('Enter your email and password.');
    const found = repos.users.findByEmailWithHash(mail);
    const ok = found ? await verifyPassword(pass, found.passwordHash) : (await burnPasswordCheck(pass), false);
    if (!ok) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    const { passwordHash, ...user } = found;
    repos.users.touchLogin(user.id);
    repos.refreshTokens.deleteExpired();
    sendSession(res, 200, user, auth.issueSession(user, req.headers['user-agent']));
  }));

  r.post('/auth/refresh', refreshLimit, (req, res) => {
    const token = presentedRefresh(req);
    if (!token) throw new ApiError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
    try {
      const session = auth.refreshSession(token, req.headers['user-agent']);
      sendSession(res, 200, session.user, session);
    } catch (err) {
      clearCookies(res);
      throw err;
    }
  });

  // Logout always succeeds and clears cookies; { all: true } ends every session.
  r.post('/auth/logout', (req, res) => {
    auth.revokeSession(presentedRefresh(req), { all: req.body?.all === true });
    clearCookies(res);
    res.status(204).end();
  });

  r.get('/auth/me', requireAuth(repos, auth), (req, res) => res.json({ user: req.user }));

  return r;
}
