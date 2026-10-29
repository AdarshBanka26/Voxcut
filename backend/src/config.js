import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function num(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

const dataDir = path.resolve(process.env.VOXCUT_DATA_DIR || path.join(root, 'data'));
const production = process.env.NODE_ENV === 'production';

/** "15m", "7d", "12h", "900" → seconds. */
export function parseDuration(value, fallback) {
  const m = String(value ?? '').trim().match(/^(\d+)\s*([smhd]?)$/i);
  if (!m) return fallback;
  return Number(m[1]) * { '': 1, s: 1, m: 60, h: 3600, d: 86400 }[m[2].toLowerCase()];
}

/**
 * JWT secrets come from the environment. In production they are required.
 * In development a random pair is generated once and kept in the data folder
 * so restarts don't sign everyone out.
 */
function loadSecrets() {
  const fromEnv = { access: process.env.JWT_ACCESS_SECRET, refresh: process.env.JWT_REFRESH_SECRET };
  if (fromEnv.access && fromEnv.refresh) {
    if (fromEnv.access.length < 32 || fromEnv.refresh.length < 32) throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be at least 32 characters.');
    if (fromEnv.access === fromEnv.refresh) throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different.');
    return fromEnv;
  }
  if (production) throw new Error('Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET (32+ random characters each) before starting in production.');
  const file = path.join(dataDir, 'dev-secrets.json');
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (saved.access && saved.refresh) return saved;
  } catch { /* create below */ }
  const generated = { access: randomBytes(48).toString('base64url'), refresh: randomBytes(48).toString('base64url') };
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(generated), { mode: 0o600 });
  console.warn(`[voxcut] JWT secrets not set; generated development secrets in ${file}. Set JWT_ACCESS_SECRET / JWT_REFRESH_SECRET for production.`);
  return generated;
}

const secrets = loadSecrets();

export const config = {
  production,
  port: num('PORT', 4000),
  host: process.env.HOST || '127.0.0.1',
  dataDir,
  dbFile: path.join(dataDir, 'voxcut.db'),
  mediaDir: path.join(dataDir, 'media'),
  exportDir: path.join(dataDir, 'exports'),
  cacheDir: path.join(dataDir, 'cache'),
  modelCacheDir: path.join(dataDir, 'models'),
  maxUploadBytes: num('VOXCUT_MAX_UPLOAD_MB', 2048) * 1024 * 1024,
  maxDurationSeconds: num('VOXCUT_MAX_DURATION_S', 2 * 60 * 60),
  transcription: {
    enabled: process.env.VOXCUT_TRANSCRIPTION !== 'off',
    model: process.env.VOXCUT_WHISPER_MODEL || 'onnx-community/whisper-base_timestamped',
    language: process.env.VOXCUT_WHISPER_LANGUAGE || 'english',
    chunkSeconds: 30
  },
  /** Serve the built frontend from this folder when it exists. */
  staticDir: path.resolve(root, '..', 'frontend', 'dist'),
  allowedOrigins: (process.env.VOXCUT_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  auth: {
    accessSecret: secrets.access,
    refreshSecret: secrets.refresh,
    accessTtlSeconds: parseDuration(process.env.JWT_ACCESS_EXPIRES_IN, 15 * 60),
    refreshTtlSeconds: parseDuration(process.env.JWT_REFRESH_EXPIRES_IN, 7 * 86400),
    issuer: 'voxcut',
    // Secure cookies need HTTPS; on by default in production.
    cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : production,
    passwordMinLength: 8
  }
};
