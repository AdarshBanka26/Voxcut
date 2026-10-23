import { DatabaseSync } from 'node:sqlite';

// Bump when the schema changes and add a step to MIGRATIONS (SRS §8.1:
// version the schema and migrate deliberately).
export const SCHEMA_VERSION = 1;

const MIGRATIONS = {
  1: `
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      source_media_id TEXT,
      settings TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE source_media (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      mime_type TEXT,
      container TEXT,
      duration REAL NOT NULL,
      width INTEGER,
      height INTEGER,
      frame_rate REAL,
      video_codec TEXT,
      audio_codec TEXT,
      audio_tracks INTEGER NOT NULL DEFAULT 0,
      fingerprint TEXT NOT NULL,
      storage_path TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX idx_media_project ON source_media(project_id);

    CREATE TABLE transcript_words (
      id TEXT NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      idx INTEGER NOT NULL,
      text TEXT NOT NULL,
      original_text TEXT NOT NULL,
      source_start REAL NOT NULL,
      source_end REAL NOT NULL,
      confidence REAL,
      speaker_id TEXT,
      precision TEXT NOT NULL DEFAULT 'word',
      PRIMARY KEY (project_id, id)
    );
    CREATE INDEX idx_words_order ON transcript_words(project_id, idx);

    CREATE TABLE edit_operations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('cut', 'restore')),
      source_ranges TEXT NOT NULL,
      parameters TEXT NOT NULL DEFAULT '{}',
      undone INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX idx_ops_order ON edit_operations(project_id, seq);

    CREATE TABLE suggestions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('filler', 'pause')),
      source_start REAL NOT NULL,
      source_end REAL NOT NULL,
      label TEXT NOT NULL,
      confidence REAL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
      word_ids TEXT NOT NULL DEFAULT '[]',
      operation_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX idx_suggestions_project ON suggestions(project_id, type);

    CREATE TABLE jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('transcription', 'export')),
      status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'cancelled', 'failed')),
      stage TEXT,
      progress REAL NOT NULL DEFAULT 0,
      settings TEXT NOT NULL DEFAULT '{}',
      metrics TEXT NOT NULL DEFAULT '{}',
      result TEXT,
      error_code TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT
    );
    CREATE INDEX idx_jobs_project ON jobs(project_id, created_at);
  `
};

export function openDatabase(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

function migrate(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  if (current > SCHEMA_VERSION) throw new Error(`Database schema v${current} is newer than this server (v${SCHEMA_VERSION}).`);
  for (let v = current + 1; v <= SCHEMA_VERSION; v++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v}`);
    });
  }
}

export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
