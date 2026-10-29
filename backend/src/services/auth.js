// Authentication: password hashing and JWT access/refresh tokens.
//
// - Access token: short-lived JWT (default 15 min) signed with
//   JWT_ACCESS_SECRET, sent as `Authorization: Bearer <token>`.
// - Refresh token: longer-lived JWT (default 7 days) signed with a separate
//   JWT_REFRESH_SECRET, kept in an httpOnly cookie. Only its SHA-256 hash is
//   stored. Every refresh rotates it; presenting an already-rotated token
//   revokes the whole token family (stolen-token detection).

import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';
import { ApiError } from '../errors.js';
import { newId } from '../db/repositories.js';

const scryptAsync = promisify(scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const ACCESS_AUDIENCE = 'voxcut-api';
const REFRESH_AUDIENCE = 'voxcut-refresh';

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, N, r, p, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return timingSafeEqual(key, expected);
}

// Used when the email is unknown so login takes the same time either way.
let dummyHash = null;
export async function burnPasswordCheck(password) {
  dummyHash ??= await hashPassword('voxcut-timing-equalizer');
  await verifyPassword(password, dummyHash);
}

const sha256 = value => createHash('sha256').update(value).digest('hex');

export function createAuthService(repos, authConfig) {
  const { accessSecret, refreshSecret, accessTtlSeconds, refreshTtlSeconds, issuer } = authConfig;

  function signAccessToken(user) {
    return jwt.sign({ email: user.email, name: user.name, typ: 'access' }, accessSecret, {
      algorithm: 'HS256', subject: user.id, issuer, audience: ACCESS_AUDIENCE, expiresIn: accessTtlSeconds, jwtid: newId('at')
    });
  }

  function issueRefreshToken(user, { familyId = newId('fam'), userAgent } = {}) {
    const jti = newId('rt');
    const token = jwt.sign({ typ: 'refresh', fam: familyId }, refreshSecret, {
      algorithm: 'HS256', subject: user.id, issuer, audience: REFRESH_AUDIENCE, expiresIn: refreshTtlSeconds, jwtid: jti
    });
    repos.refreshTokens.create({
      id: jti, userId: user.id, familyId, tokenHash: sha256(token), userAgent: userAgent?.slice(0, 200),
      expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000).toISOString()
    });
    return { token, jti };
  }

  /** Access + refresh pair for a freshly authenticated user. */
  function issueSession(user, userAgent) {
    const refresh = issueRefreshToken(user, { userAgent });
    return { accessToken: signAccessToken(user), accessExpiresIn: accessTtlSeconds, refreshToken: refresh.token, refreshExpiresIn: refreshTtlSeconds };
  }

  function verifyAccessToken(token) {
    try {
      const payload = jwt.verify(token, accessSecret, { algorithms: ['HS256'], issuer, audience: ACCESS_AUDIENCE });
      if (payload.typ !== 'access') throw new Error('wrong token type');
      return payload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) throw new ApiError(401, 'TOKEN_EXPIRED', 'Your session expired. Refreshing…');
      throw new ApiError(401, 'INVALID_TOKEN', 'You are not signed in.');
    }
  }

  function decodeRefresh(token, { ignoreExpiration = false } = {}) {
    try {
      const payload = jwt.verify(token, refreshSecret, { algorithms: ['HS256'], issuer, audience: REFRESH_AUDIENCE, ignoreExpiration });
      if (payload.typ !== 'refresh' || !payload.jti) throw new Error('wrong token type');
      return payload;
    } catch {
      throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Your session has ended. Please sign in again.');
    }
  }

  /**
   * Exchange a refresh token for a new access token and a rotated refresh
   * token. Reusing an old token signs out every device in that family.
   */
  function refreshSession(token, userAgent) {
    const payload = decodeRefresh(token);
    const row = repos.refreshTokens.get(payload.jti);
    if (!row || row.tokenHash !== sha256(token) || row.userId !== payload.sub) {
      throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Your session has ended. Please sign in again.');
    }
    if (row.revokedAt || !repos.refreshTokens.revoke(row.id)) {
      repos.refreshTokens.revokeFamily(row.familyId);
      throw new ApiError(401, 'REFRESH_TOKEN_REUSED', 'This session was used somewhere else, so it was closed for safety. Please sign in again.');
    }
    const user = repos.users.get(row.userId);
    if (!user) throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'This account no longer exists.');
    const next = issueRefreshToken(user, { familyId: row.familyId, userAgent });
    repos.db.prepare('UPDATE refresh_tokens SET replaced_by = ? WHERE id = ?').run(next.jti, row.id);
    return { user, accessToken: signAccessToken(user), accessExpiresIn: accessTtlSeconds, refreshToken: next.token, refreshExpiresIn: refreshTtlSeconds };
  }

  /** Logout: revoke the presented refresh token (or every session for the user). */
  function revokeSession(token, { all = false } = {}) {
    if (!token) return null;
    let payload;
    try { payload = decodeRefresh(token, { ignoreExpiration: true }); } catch { return null; }
    const row = repos.refreshTokens.get(payload.jti);
    if (!row || row.tokenHash !== sha256(token)) return null;
    if (all) repos.refreshTokens.revokeAllForUser(row.userId);
    else repos.refreshTokens.revoke(row.id);
    return row.userId;
  }

  return { signAccessToken, issueSession, verifyAccessToken, refreshSession, revokeSession };
}
