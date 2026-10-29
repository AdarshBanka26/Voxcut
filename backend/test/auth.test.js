// Auth: register, login, logout, refresh rotation, reuse detection, expiry,
// route protection and per-user project isolation.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'voxcut-auth-'));
process.env.VOXCUT_DATA_DIR = tmp;
process.env.JWT_ACCESS_SECRET = 'a'.repeat(40);
process.env.JWT_REFRESH_SECRET = 'r'.repeat(40);

const { config } = await import('../src/config.js');
const { openDatabase } = await import('../src/db/database.js');
const { createRepositories } = await import('../src/db/repositories.js');
const { createJobManager } = await import('../src/services/jobs.js');
const { createApp } = await import('../src/app.js');

let server;
let base;
let repos;

/** Minimal client that keeps cookies like a browser would. */
function client() {
  const jar = new Map();
  let access = null;
  const call = async (method, url, body, { bearer = true } = {}) => {
    const headers = {};
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (bearer && access) headers.Authorization = `Bearer ${access}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';');
      const [k, v] = pair.split('=');
      if (!v || attrs.some(a => /expires=Thu, 01 Jan 1970/i.test(a))) jar.delete(k); else jar.set(k, v);
    }
    const data = (res.headers.get('content-type') ?? '').includes('json') ? await res.json() : null;
    if (data?.accessToken) access = data.accessToken;
    return { status: res.status, body: data, headers: res.headers };
  };
  return { call, jar, get access() { return access; }, set access(v) { access = v; } };
}

before(() => {
  repos = createRepositories(openDatabase(config.dbFile));
  // A project from before accounts existed (no owner).
  repos.projects.create({ userId: null, name: 'Legacy project' });
  server = createApp({ repos, jobs: createJobManager(repos), config, log: () => {} }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(r => server.close(r));
  repos.db.close();
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

test('register validates input and returns tokens + httpOnly cookies', async () => {
  const c = client();
  assert.equal((await c.call('POST', '/api/auth/register', { name: 'A', email: 'bad', password: 'longenough' })).status, 400);
  assert.equal((await c.call('POST', '/api/auth/register', { name: 'A', email: 'a@x.io', password: 'short' })).status, 400);

  const r = await c.call('POST', '/api/auth/register', { name: 'Asha', email: 'Asha@Example.com', password: 'super secret 1' });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.email, 'asha@example.com');
  assert.equal(r.body.user.passwordHash, undefined, 'hash never leaves the server');
  assert.equal(r.body.tokenType, 'Bearer');
  assert.equal(r.body.expiresIn, config.auth.accessTtlSeconds);
  const cookies = r.headers.getSetCookie().join('\n');
  assert.match(cookies, /vx_refresh=.*HttpOnly.*SameSite=Strict/i);
  assert.match(cookies, /vx_refresh=[^;]+; Max-Age=\d+; Path=\/api\/auth/);

  const payload = jwt.verify(r.body.accessToken, config.auth.accessSecret);
  assert.equal(payload.sub, r.body.user.id);
  assert.equal(payload.exp - payload.iat, config.auth.accessTtlSeconds);

  // First account claims projects made before accounts existed.
  const list = await c.call('GET', '/api/projects');
  assert.deepEqual(list.body.projects.map(p => p.name), ['Legacy project']);

  const dup = await client().call('POST', '/api/auth/register', { name: 'B', email: 'asha@example.com', password: 'another pass' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'EMAIL_TAKEN');
});

test('login rejects wrong credentials with one generic message', async () => {
  const wrongPass = await client().call('POST', '/api/auth/login', { email: 'asha@example.com', password: 'nope nope' });
  const noUser = await client().call('POST', '/api/auth/login', { email: 'ghost@example.com', password: 'nope nope' });
  assert.equal(wrongPass.status, 401);
  assert.equal(noUser.status, 401);
  assert.equal(wrongPass.body.error.message, noUser.body.error.message);
  const ok = await client().call('POST', '/api/auth/login', { email: 'ASHA@example.com', password: 'super secret 1' });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.accessToken);
});

test('protected routes need a valid, unexpired access token', async () => {
  assert.equal((await fetch(`${base}/api/projects`)).status, 401);
  assert.equal((await fetch(`${base}/api/health`)).status, 200, 'health stays public');
  const garbage = await fetch(`${base}/api/projects`, { headers: { Authorization: 'Bearer not.a.token' } });
  assert.equal((await garbage.json()).error.code, 'INVALID_TOKEN');

  const user = repos.users.findByEmailWithHash('asha@example.com');
  const expired = jwt.sign({ typ: 'access' }, config.auth.accessSecret, { subject: user.id, issuer: 'voxcut', audience: 'voxcut-api', expiresIn: -10 });
  const res = await fetch(`${base}/api/projects`, { headers: { Authorization: `Bearer ${expired}` } });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, 'TOKEN_EXPIRED');

  const forged = jwt.sign({ typ: 'access' }, 'x'.repeat(40), { subject: user.id, issuer: 'voxcut', audience: 'voxcut-api', expiresIn: 60 });
  assert.equal((await fetch(`${base}/api/projects`, { headers: { Authorization: `Bearer ${forged}` } })).status, 401);

  // A refresh token can't be used as an access token.
  const c = client();
  await c.call('POST', '/api/auth/login', { email: 'asha@example.com', password: 'super secret 1' });
  assert.equal((await fetch(`${base}/api/projects`, { headers: { Authorization: `Bearer ${c.jar.get('vx_refresh')}` } })).status, 401);
});

test('refresh rotates tokens; reusing an old refresh token ends the session family', async () => {
  const c = client();
  await c.call('POST', '/api/auth/login', { email: 'asha@example.com', password: 'super secret 1' });
  const firstRefresh = c.jar.get('vx_refresh');
  const firstAccess = c.access;

  const r1 = await c.call('POST', '/api/auth/refresh', undefined, { bearer: false });
  assert.equal(r1.status, 200);
  assert.notEqual(c.jar.get('vx_refresh'), firstRefresh, 'refresh token rotated');
  assert.notEqual(c.access, firstAccess);
  assert.equal((await c.call('GET', '/api/auth/me')).body.user.email, 'asha@example.com');

  // Attacker replays the old token → family revoked, including the new token.
  const replay = await fetch(`${base}/api/auth/refresh`, { method: 'POST', headers: { Cookie: `vx_refresh=${firstRefresh}` } });
  assert.equal(replay.status, 401);
  assert.equal((await replay.json()).error.code, 'REFRESH_TOKEN_REUSED');
  assert.equal((await c.call('POST', '/api/auth/refresh', undefined, { bearer: false })).status, 401);

  // Non-browser clients can send the refresh token in the body.
  const d = client();
  await d.call('POST', '/api/auth/login', { email: 'asha@example.com', password: 'super secret 1' });
  const bodyRefresh = await fetch(`${base}/api/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: d.jar.get('vx_refresh') }) });
  assert.equal(bodyRefresh.status, 200);
});

test('logout revokes the refresh token and clears cookies', async () => {
  const c = client();
  await c.call('POST', '/api/auth/login', { email: 'asha@example.com', password: 'super secret 1' });
  const refresh = c.jar.get('vx_refresh');
  const out = await c.call('POST', '/api/auth/logout', undefined, { bearer: false });
  assert.equal(out.status, 204);
  assert.equal(c.jar.has('vx_refresh'), false);
  const again = await fetch(`${base}/api/auth/refresh`, { method: 'POST', headers: { Cookie: `vx_refresh=${refresh}` } });
  assert.equal(again.status, 401);

  // logout { all: true } ends every session for the user.
  const a = client();
  const b = client();
  await a.call('POST', '/api/auth/login', { email: 'asha@example.com', password: 'super secret 1' });
  await b.call('POST', '/api/auth/login', { email: 'asha@example.com', password: 'super secret 1' });
  await a.call('POST', '/api/auth/logout', { all: true }, { bearer: false });
  assert.equal((await b.call('POST', '/api/auth/refresh', undefined, { bearer: false })).status, 401);
});

test('users only see their own projects and jobs', async () => {
  const owner = client();
  await owner.call('POST', '/api/auth/login', { email: 'asha@example.com', password: 'super secret 1' });
  const { body } = await owner.call('POST', '/api/projects', { name: 'Private cut' });
  const id = body.project.id;
  const jobId = repos.jobs.create({ projectId: id, kind: 'export', settings: {} }).id;

  const other = client();
  await other.call('POST', '/api/auth/register', { name: 'Ravi', email: 'ravi@example.com', password: 'password 22' });
  assert.equal((await other.call('GET', '/api/projects')).body.projects.length, 0);
  assert.equal((await other.call('GET', `/api/projects/${id}`)).status, 404);
  assert.equal((await other.call('PATCH', `/api/projects/${id}`, { name: 'hacked' })).status, 404);
  assert.equal((await other.call('DELETE', `/api/projects/${id}`)).status, 404);
  assert.equal((await other.call('GET', `/api/jobs/${jobId}`)).status, 404);
  assert.equal((await owner.call('GET', `/api/projects/${id}`)).body.project.name, 'Private cut');

  // GET media URLs work with the httpOnly cookie; writes still need the header.
  const cookieGet = await fetch(`${base}/api/projects/${id}`, { headers: { Cookie: `vx_access=${owner.jar.get('vx_access')}` } });
  assert.equal(cookieGet.status, 200);
  const cookieWrite = await fetch(`${base}/api/projects/${id}`, { method: 'PATCH', headers: { Cookie: `vx_access=${owner.jar.get('vx_access')}`, 'Content-Type': 'application/json' }, body: '{"name":"x"}' });
  assert.equal(cookieWrite.status, 401);
});
