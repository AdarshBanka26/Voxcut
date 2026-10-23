import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function num(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

const dataDir = path.resolve(process.env.VOXCUT_DATA_DIR || path.join(root, 'data'));

export const config = {
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
  allowedOrigins: (process.env.VOXCUT_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
};
