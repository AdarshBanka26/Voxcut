import fs from 'node:fs';
import { config } from './config.js';
import { openDatabase } from './db/database.js';
import { createRepositories } from './db/repositories.js';
import { createJobManager } from './services/jobs.js';
import { createApp } from './app.js';

for (const dir of [config.dataDir, config.mediaDir, config.exportDir, config.cacheDir, config.modelCacheDir]) fs.mkdirSync(dir, { recursive: true });

const log = msg => console.log(`[voxcut] ${new Date().toISOString()} ${msg}`);
const repos = createRepositories(openDatabase(config.dbFile));
repos.jobs.failInterrupted();
const jobs = createJobManager(repos, { log });
const app = createApp({ repos, jobs, config, log });

const server = app.listen(config.port, config.host, () => log(`API listening on http://${config.host}:${config.port}`));

const shutdown = () => {
  log('shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
