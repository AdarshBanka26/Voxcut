// Session state. The access token lives only in memory (never localStorage);
// the refresh token is an httpOnly cookie the browser sends to /api/auth.
// On load we try a silent refresh to restore the session, and we refresh
// again shortly before the access token expires.

import { useSyncExternalStore } from 'react';

let state = { status: 'loading', user: null, accessToken: null };
const listeners = new Set();
let refreshTimer = null;
let refreshing = null;

function set(next) {
  state = { ...state, ...next };
  listeners.forEach(l => l());
}

export const getAccessToken = () => state.accessToken;
export const getSession = () => state;

export function useSession() {
  return useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l); }, () => state);
}

function schedule(expiresIn) {
  clearTimeout(refreshTimer);
  // Refresh a minute early (or at 80% for very short lifetimes).
  const ms = Math.max(5, Math.min(expiresIn - 60, expiresIn * 0.8)) * 1000;
  refreshTimer = setTimeout(() => { refreshSession().catch(() => {}); }, ms);
}

function applyAuthResponse(data) {
  set({ status: 'authenticated', user: data.user, accessToken: data.accessToken });
  schedule(data.expiresIn);
  return data.user;
}

export function clearSession() {
  clearTimeout(refreshTimer);
  set({ status: 'anonymous', user: null, accessToken: null });
}

async function post(path, body) {
  let res;
  try {
    res = await fetch(`/api/auth/${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    const err = new Error('Cannot reach the Voxcut server. Check that the backend is running.');
    err.code = 'OFFLINE';
    throw err;
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error?.message ?? `Request failed (${res.status}).`);
    err.code = data?.error?.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Exchange the refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshSession() {
  refreshing ??= post('refresh')
    .then(applyAuthResponse)
    .catch(err => {
      if (err.code !== 'OFFLINE') clearSession();
      else if (state.status === 'loading') set({ status: 'anonymous' });
      throw err;
    })
    .finally(() => { refreshing = null; });
  return refreshing;
}

export const bootstrapSession = () => refreshSession().catch(() => null);
export const login = (email, password) => post('login', { email, password }).then(applyAuthResponse);
export const register = (name, email, password) => post('register', { name, email, password }).then(applyAuthResponse);

export async function logout({ all = false } = {}) {
  try { await post('logout', all ? { all: true } : undefined); } finally { clearSession(); }
}

// Remember where a signed-out user was going so login can send them back.
const NEXT_KEY = 'voxcut:next';
export function rememberNext(hash) { try { sessionStorage.setItem(NEXT_KEY, hash); } catch { /* storage blocked */ } }
export function takeNext() {
  try { const v = sessionStorage.getItem(NEXT_KEY); sessionStorage.removeItem(NEXT_KEY); return v; } catch { return null; }
}
