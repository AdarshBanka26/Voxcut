// Persistence adapter (SRS §7.1). Maps rows to the camelCase entities of the
// data model in SRS §8. Routes never touch SQL directly.

import { randomUUID } from 'node:crypto';
import { SCHEMA_VERSION, transaction } from './database.js';

const now = () => new Date().toISOString();
export const newId = prefix => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
const json = (text, fallback) => { try { return text == null ? fallback : JSON.parse(text); } catch { return fallback; } };

const mapUser = r => r && ({
  id: r.id, email: r.email, name: r.name, createdAt: r.created_at, updatedAt: r.updated_at, lastLoginAt: r.last_login_at
});
const mapRefresh = r => r && ({
  id: r.id, userId: r.user_id, familyId: r.family_id, tokenHash: r.token_hash, userAgent: r.user_agent,
  createdAt: r.created_at, expiresAt: r.expires_at, revokedAt: r.revoked_at, replacedBy: r.replaced_by
});
const mapProject = r => r && ({
  id: r.id, userId: r.user_id, name: r.name, schemaVersion: r.schema_version, sourceMediaId: r.source_media_id,
  settings: json(r.settings, {}), createdAt: r.created_at, updatedAt: r.updated_at
});
const mapMedia = r => r && ({
  id: r.id, projectId: r.project_id, fileName: r.file_name, sizeBytes: r.size_bytes, mimeType: r.mime_type,
  container: r.container, duration: r.duration, width: r.width, height: r.height, frameRate: r.frame_rate,
  videoCodec: r.video_codec, audioCodec: r.audio_codec, audioTracks: r.audio_tracks, hasAudio: r.audio_tracks > 0,
  fingerprint: r.fingerprint, stored: Boolean(r.storage_path), storagePath: r.storage_path, createdAt: r.created_at
});
const mapWord = r => ({
  id: r.id, text: r.text, originalText: r.original_text, sourceStart: r.source_start, sourceEnd: r.source_end,
  confidence: r.confidence, speakerId: r.speaker_id, precision: r.precision
});
const mapOp = r => ({
  id: r.id, seq: r.seq, type: r.type, sourceRanges: json(r.source_ranges, []), parameters: json(r.parameters, {}),
  undone: Boolean(r.undone), createdAt: r.created_at
});
const mapSuggestion = r => ({
  id: r.id, type: r.type, sourceStart: r.source_start, sourceEnd: r.source_end, label: r.label, confidence: r.confidence,
  status: r.status, wordIds: json(r.word_ids, []), operationId: r.operation_id, createdAt: r.created_at
});
const mapJob = r => r && ({
  id: r.id, projectId: r.project_id, kind: r.kind, status: r.status, stage: r.stage, progress: r.progress,
  settings: json(r.settings, {}), metrics: json(r.metrics, {}), result: json(r.result, null),
  errorCode: r.error_code, errorMessage: r.error_message, createdAt: r.created_at, startedAt: r.started_at, finishedAt: r.finished_at
});

export function createRepositories(db) {
  const touch = projectId => db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), projectId);

  const users = {
    get: id => mapUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)),
    /** Includes the password hash; only for credential checks. */
    findByEmailWithHash(email) {
      const r = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      return r ? { ...mapUser(r), passwordHash: r.password_hash } : null;
    },
    count: () => db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
    create({ email, name, passwordHash }) {
      const id = newId('usr');
      const t = now();
      db.prepare('INSERT INTO users (id, email, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, email, name, passwordHash, t, t);
      return users.get(id);
    },
    touchLogin: id => db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now(), id)
  };

  const refreshTokens = {
    get: id => mapRefresh(db.prepare('SELECT * FROM refresh_tokens WHERE id = ?').get(id)),
    create({ id, userId, familyId, tokenHash, userAgent, expiresAt }) {
      db.prepare('INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, user_agent, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, userId, familyId, tokenHash, userAgent ?? null, now(), expiresAt);
    },
    /** Atomically revoke one token; returns false if it was already revoked. */
    revoke(id, replacedBy = null) {
      return db.prepare('UPDATE refresh_tokens SET revoked_at = ?, replaced_by = ? WHERE id = ? AND revoked_at IS NULL').run(now(), replacedBy, id).changes > 0;
    },
    revokeFamily: familyId => db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL').run(now(), familyId),
    revokeAllForUser: userId => db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now(), userId),
    deleteExpired: () => db.prepare('DELETE FROM refresh_tokens WHERE expires_at < ?').run(now())
  };

  const projects = {
    list(userId) {
      return db.prepare(`
        SELECT p.*, m.file_name, m.duration, m.width, m.height,
          (SELECT COUNT(*) FROM transcript_words w WHERE w.project_id = p.id) AS word_count
        FROM projects p LEFT JOIN source_media m ON m.id = p.source_media_id
        WHERE p.user_id = ?
        ORDER BY p.updated_at DESC`).all(userId).map(r => ({
        ...mapProject(r),
        media: r.file_name ? { fileName: r.file_name, duration: r.duration, width: r.width, height: r.height } : null,
        wordCount: r.word_count
      }));
    },
    get: id => mapProject(db.prepare('SELECT * FROM projects WHERE id = ?').get(id)),
    create({ userId, name, settings = {} }) {
      const id = newId('prj');
      const t = now();
      db.prepare('INSERT INTO projects (id, user_id, name, schema_version, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, userId, name, SCHEMA_VERSION, JSON.stringify(settings), t, t);
      return projects.get(id);
    },
    /** Give projects created before accounts existed to the given user. */
    claimOrphans: userId => db.prepare('UPDATE projects SET user_id = ? WHERE user_id IS NULL').run(userId).changes,
    update(id, { name, settings }) {
      const p = projects.get(id);
      db.prepare('UPDATE projects SET name = ?, settings = ?, updated_at = ? WHERE id = ?')
        .run(name ?? p.name, JSON.stringify(settings ?? p.settings), now(), id);
      return projects.get(id);
    },
    setSourceMedia(id, mediaId) {
      db.prepare('UPDATE projects SET source_media_id = ?, updated_at = ? WHERE id = ?').run(mediaId, now(), id);
    },
    remove: id => db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  };

  const media = {
    get: id => mapMedia(db.prepare('SELECT * FROM source_media WHERE id = ?').get(id)),
    forProject(projectId) {
      const p = projects.get(projectId);
      return p?.sourceMediaId ? media.get(p.sourceMediaId) : null;
    },
    allForProject: projectId => db.prepare('SELECT * FROM source_media WHERE project_id = ?').all(projectId).map(mapMedia),
    create(projectId, m) {
      const id = m.id ?? newId('med');
      db.prepare(`INSERT INTO source_media (id, project_id, file_name, size_bytes, mime_type, container, duration, width, height,
        frame_rate, video_codec, audio_codec, audio_tracks, fingerprint, storage_path, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, projectId, m.fileName, m.sizeBytes, m.mimeType ?? null, m.container ?? null, m.duration, m.width ?? null, m.height ?? null,
          m.frameRate ?? null, m.videoCodec ?? null, m.audioCodec ?? null, m.audioTracks ?? 0, m.fingerprint, m.storagePath ?? null, now());
      return media.get(id);
    },
    clearStoragePath: id => db.prepare('UPDATE source_media SET storage_path = NULL WHERE id = ?').run(id),
    remove: id => db.prepare('DELETE FROM source_media WHERE id = ?').run(id)
  };

  const words = {
    list: projectId => db.prepare('SELECT * FROM transcript_words WHERE project_id = ? ORDER BY idx').all(projectId).map(mapWord),
    count: projectId => db.prepare('SELECT COUNT(*) AS n FROM transcript_words WHERE project_id = ?').get(projectId).n,
    replaceAll(projectId, list) {
      transaction(db, () => {
        db.prepare('DELETE FROM transcript_words WHERE project_id = ?').run(projectId);
        const insert = db.prepare(`INSERT INTO transcript_words (id, project_id, idx, text, original_text, source_start, source_end, confidence, speaker_id, precision)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        list.forEach((w, i) => insert.run(w.id, projectId, i, w.text, w.originalText ?? w.text, w.sourceStart, w.sourceEnd, w.confidence ?? null, w.speakerId ?? null, w.precision ?? 'word'));
        touch(projectId);
      });
    },
    get: (projectId, id) => {
      const r = db.prepare('SELECT * FROM transcript_words WHERE project_id = ? AND id = ?').get(projectId, id);
      return r ? mapWord(r) : null;
    },
    /** Text correction never changes timing (SRS §3.1, §8.1). */
    updateText(projectId, id, text) {
      db.prepare('UPDATE transcript_words SET text = ? WHERE project_id = ? AND id = ?').run(text, projectId, id);
      touch(projectId);
      return words.get(projectId, id);
    }
  };

  const operations = {
    list: projectId => db.prepare('SELECT * FROM edit_operations WHERE project_id = ? ORDER BY seq').all(projectId).map(mapOp),
    /** Recording a new operation discards the redo branch, like any editor. */
    append(projectId, { type, sourceRanges, parameters = {} }) {
      return transaction(db, () => {
        db.prepare('DELETE FROM edit_operations WHERE project_id = ? AND undone = 1').run(projectId);
        const seq = (db.prepare('SELECT MAX(seq) AS s FROM edit_operations WHERE project_id = ?').get(projectId).s ?? 0) + 1;
        const id = newId('op');
        db.prepare('INSERT INTO edit_operations (id, project_id, seq, type, source_ranges, parameters, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(id, projectId, seq, type, JSON.stringify(sourceRanges), JSON.stringify(parameters), now());
        touch(projectId);
        return mapOp(db.prepare('SELECT * FROM edit_operations WHERE id = ?').get(id));
      });
    },
    undo(projectId) {
      const r = db.prepare('SELECT * FROM edit_operations WHERE project_id = ? AND undone = 0 ORDER BY seq DESC LIMIT 1').get(projectId);
      if (!r) return null;
      db.prepare('UPDATE edit_operations SET undone = 1 WHERE id = ?').run(r.id);
      touch(projectId);
      return mapOp({ ...r, undone: 1 });
    },
    redo(projectId) {
      const r = db.prepare('SELECT * FROM edit_operations WHERE project_id = ? AND undone = 1 ORDER BY seq ASC LIMIT 1').get(projectId);
      if (!r) return null;
      db.prepare('UPDATE edit_operations SET undone = 0 WHERE id = ?').run(r.id);
      touch(projectId);
      return mapOp({ ...r, undone: 0 });
    },
    clear: projectId => db.prepare('DELETE FROM edit_operations WHERE project_id = ?').run(projectId)
  };

  const suggestions = {
    list: projectId => db.prepare('SELECT * FROM suggestions WHERE project_id = ? ORDER BY source_start').all(projectId).map(mapSuggestion),
    get: (projectId, id) => {
      const r = db.prepare('SELECT * FROM suggestions WHERE project_id = ? AND id = ?').get(projectId, id);
      return r ? mapSuggestion(r) : null;
    },
    /** Replace pending suggestions of one type; reviewed ones are kept as history. */
    replacePending(projectId, type, list) {
      return transaction(db, () => {
        db.prepare("DELETE FROM suggestions WHERE project_id = ? AND type = ? AND status = 'pending'").run(projectId, type);
        const insert = db.prepare(`INSERT INTO suggestions (id, project_id, type, source_start, source_end, label, confidence, word_ids, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const s of list) insert.run(newId('sug'), projectId, type, s.sourceStart, s.sourceEnd, s.label, s.confidence ?? null, JSON.stringify(s.wordIds ?? []), now());
        return suggestions.list(projectId).filter(s => s.type === type && s.status === 'pending');
      });
    },
    update(projectId, id, { status, sourceStart, sourceEnd, operationId }) {
      const s = suggestions.get(projectId, id);
      db.prepare('UPDATE suggestions SET status = ?, source_start = ?, source_end = ?, operation_id = ? WHERE id = ?')
        .run(status ?? s.status, sourceStart ?? s.sourceStart, sourceEnd ?? s.sourceEnd, operationId ?? s.operationId, id);
      return suggestions.get(projectId, id);
    },
    clear: projectId => db.prepare('DELETE FROM suggestions WHERE project_id = ?').run(projectId)
  };

  const jobs = {
    get: id => mapJob(db.prepare('SELECT * FROM jobs WHERE id = ?').get(id)),
    listForProject: (projectId, kind) => (kind
      ? db.prepare('SELECT * FROM jobs WHERE project_id = ? AND kind = ? ORDER BY created_at DESC').all(projectId, kind)
      : db.prepare('SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC').all(projectId)).map(mapJob),
    create({ projectId, kind, settings }) {
      const id = newId('job');
      db.prepare("INSERT INTO jobs (id, project_id, kind, status, stage, settings, created_at) VALUES (?, ?, ?, 'queued', 'Queued', ?, ?)")
        .run(id, projectId, kind, JSON.stringify(settings ?? {}), now());
      return jobs.get(id);
    },
    update(id, patch) {
      const cols = { status: 'status', stage: 'stage', progress: 'progress', errorCode: 'error_code', errorMessage: 'error_message', startedAt: 'started_at', finishedAt: 'finished_at' };
      const sets = [];
      const vals = [];
      for (const [k, col] of Object.entries(cols)) if (k in patch) { sets.push(`${col} = ?`); vals.push(patch[k]); }
      if ('metrics' in patch) { sets.push('metrics = ?'); vals.push(JSON.stringify(patch.metrics)); }
      if ('result' in patch) { sets.push('result = ?'); vals.push(JSON.stringify(patch.result)); }
      if (!sets.length) return jobs.get(id);
      db.prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
      return jobs.get(id);
    },
    /** Jobs cannot survive a restart; mark them failed so nothing spins forever. */
    failInterrupted() {
      db.prepare(`UPDATE jobs SET status = 'failed', error_code = 'SERVER_RESTARTED',
        error_message = 'The server restarted while this task was running. Start it again.', finished_at = ?
        WHERE status IN ('queued', 'running')`).run(now());
    }
  };

  return { db, users, refreshTokens, projects, media, words, operations, suggestions, jobs };
}
