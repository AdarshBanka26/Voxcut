import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { ApiError } from './errors.js';
import { RangeValidationError } from '../../shared/timeline.js';
import { projectRoutes } from './routes/projects.js';
import { mediaRoutes } from './routes/media.js';
import { transcriptRoutes } from './routes/transcript.js';
import { editRoutes } from './routes/edits.js';
import { suggestionRoutes } from './routes/suggestions.js';
import { exportRoutes } from './routes/exports.js';

export function createApp(ctx) {
  const { config, log = console.log } = ctx;
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN' });
    const origin = req.headers.origin;
    if (origin && config.allowedOrigins.includes(origin)) {
      res.set({ 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE', 'Access-Control-Allow-Headers': 'Content-Type' });
      if (req.method === 'OPTIONS') return res.status(204).end();
    }
    // Request log without bodies, file names or transcript text (NFR-12).
    const t = Date.now();
    res.on('finish', () => { if (req.path.startsWith('/api')) log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - t}ms`); });
    next();
  });

  app.use('/api', express.json({ limit: '25mb' }));
  app.get('/api/health', (req, res) => res.json({ ok: true, version: '1.0.0' }));
  for (const routes of [projectRoutes, mediaRoutes, transcriptRoutes, editRoutes, suggestionRoutes, exportRoutes]) app.use('/api', routes(ctx));
  app.use('/api', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown API endpoint.' } }));

  // Serve the built frontend when present (production / single-port mode).
  if (fs.existsSync(path.join(config.staticDir, 'index.html'))) {
    app.use(express.static(config.staticDir, { index: false, maxAge: '1h' }));
    app.get('*', (req, res) => res.sendFile(path.join(config.staticDir, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let status = 500;
    let body = { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server. Your project was not changed.' };
    if (err instanceof ApiError) {
      status = err.status;
      body = { code: err.code, message: err.message, details: err.details };
    } else if (err instanceof RangeValidationError) {
      status = 400;
      body = { code: 'INVALID_RANGE', message: err.message };
    } else if (err instanceof multer.MulterError) {
      status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      body = err.code === 'LIMIT_FILE_SIZE'
        ? { code: 'FILE_TOO_LARGE', message: `The file is larger than the ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB limit. Try a shorter or lower-resolution clip.` }
        : { code: 'UPLOAD_FAILED', message: 'The upload could not be read. Try again.' };
    } else if (err.type === 'entity.parse.failed') {
      status = 400;
      body = { code: 'INVALID_JSON', message: 'The request body is not valid JSON.' };
    } else if (err.type === 'entity.too.large') {
      status = 413;
      body = { code: 'BODY_TOO_LARGE', message: 'The request is too large.' };
    } else if (err.code === 'ENOSPC') {
      status = 507;
      body = { code: 'NO_SPACE', message: 'The server is out of disk space. Delete old projects or exports and try again.' };
    } else {
      log(`unhandled error on ${req.method} ${req.path}: ${err.stack ?? err.message}`);
    }
    if (res.headersSent) return res.end();
    res.status(status).json({ error: body });
  });

  return app;
}
