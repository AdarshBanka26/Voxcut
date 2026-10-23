// End-to-end API test with real ffmpeg: upload → transcript → cut → undo/redo →
// suggestions → export → validate output. Uses generated media, no model download.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'voxcut-test-'));
process.env.VOXCUT_DATA_DIR = tmp;

const { config } = await import('../src/config.js');
const { openDatabase } = await import('../src/db/database.js');
const { createRepositories } = await import('../src/db/repositories.js');
const { createJobManager } = await import('../src/services/jobs.js');
const { createApp } = await import('../src/app.js');
const { FFMPEG, run, probe } = await import('../src/services/ffmpeg.js');

let server;
let base;
let repos;
const media = {};

async function api(method, url, body) {
  const init = { method, headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
  const res = await fetch(base + url, init);
  const type = res.headers.get('content-type') ?? '';
  return { status: res.status, body: type.includes('json') ? await res.json() : await res.arrayBuffer() };
}

function uploadForm(file, name = path.basename(file)) {
  const fd = new FormData();
  fd.append('file', new Blob([fs.readFileSync(file)]), name);
  return fd;
}

async function waitForJob(id, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const { body } = await api('GET', `/api/jobs/${id}`);
    if (['completed', 'failed', 'cancelled'].includes(body.job.status)) return body.job;
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('job timed out');
}

before(async () => {
  for (const d of [config.mediaDir, config.exportDir, config.cacheDir, config.modelCacheDir]) fs.mkdirSync(d, { recursive: true });
  // 6 s, 640x360 @ 25 fps; tone everywhere except a silent gap at 2–3 s.
  media.speech = path.join(tmp, 'speech.mp4');
  await run(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=6', '-f', 'lavfi', '-i',
    "aevalsrc='if(between(t,2,3),0,0.5*sin(2*PI*440*t))':s=44100:d=6", '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', media.speech]);
  media.other = path.join(tmp, 'other.mp4');
  await run(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25:duration=7', '-f', 'lavfi', '-i', 'sine=d=7',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', media.other]);
  media.silent = path.join(tmp, 'silent.mp4');
  await run(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', media.silent]);
  media.bogus = path.join(tmp, 'bogus.mp4');
  fs.writeFileSync(media.bogus, 'this is not a video');

  repos = createRepositories(openDatabase(config.dbFile));
  const app = createApp({ repos, jobs: createJobManager(repos), config, log: () => {} });
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(r => (server ? server.close(r) : r()));
  repos?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

test('full edit and export workflow', async () => {
  const created = await api('POST', '/api/projects', { name: 'Test Reel' });
  assert.equal(created.status, 201);
  const id = created.body.project.id;

  // TC-02: invalid media is rejected with a clear message; project stays usable.
  const bad = await api('POST', `/api/projects/${id}/media`, uploadForm(media.bogus));
  assert.equal(bad.status, 422);
  assert.equal(bad.body.error.code, 'CORRUPT_MEDIA');
  const badExt = await api('POST', `/api/projects/${id}/media`, uploadForm(media.bogus, 'notes.txt'));
  assert.equal(badExt.body.error.code, 'UNSUPPORTED_MEDIA');

  // TC-01: valid file loads with metadata.
  const up = await api('POST', `/api/projects/${id}/media`, uploadForm(media.speech));
  assert.equal(up.status, 201, JSON.stringify(up.body));
  assert.ok(Math.abs(up.body.media.duration - 6) < 0.1);
  assert.equal(up.body.media.width, 640);
  assert.equal(up.body.media.hasAudio, true);
  assert.equal(up.body.media.storagePath, undefined, 'server paths are not exposed');

  // Manual transcript (approximate timings), then a text correction that must not move timing.
  const tr = await api('PUT', `/api/projects/${id}/transcript`, { text: 'one two um three four five' });
  assert.equal(tr.status, 200);
  const words = tr.body.transcript.words;
  assert.equal(words.length, 6);
  const fixed = await api('PATCH', `/api/projects/${id}/words/${words[0].id}`, { text: 'One' });
  assert.equal(fixed.body.word.text, 'One');
  assert.equal(fixed.body.word.sourceStart, words[0].sourceStart);

  // TC-03: cut a middle word → timeline ripples.
  const cut = await api('POST', `/api/projects/${id}/operations`, { type: 'cut', wordIds: [words[1].id] });
  assert.equal(cut.status, 201);
  const removed = words[1].sourceEnd - words[1].sourceStart;
  assert.ok(Math.abs(cut.body.timeline.duration - (up.body.media.duration - removed)) < 1e-6);

  // TC-04: an overlapping cut is merged, never duplicated.
  const overlap = await api('POST', `/api/projects/${id}/operations`, { type: 'cut', ranges: [{ start: words[1].sourceStart + 0.05, end: words[2].sourceEnd }] });
  assert.equal(overlap.status, 201);
  assert.equal(overlap.body.timeline.cuts.length, 1);
  const same = await api('POST', `/api/projects/${id}/operations`, { type: 'cut', wordIds: [words[1].id] });
  assert.equal(same.body.error.code, 'NOTHING_CHANGED');
  const invalid = await api('POST', `/api/projects/${id}/operations`, { type: 'cut', ranges: [{ start: 4, end: 3 }] });
  assert.equal(invalid.status, 400);

  // TC-05: undo/redo restore exact states.
  const undo = await api('POST', `/api/projects/${id}/undo`);
  assert.deepEqual(undo.body.timeline.cuts, cut.body.timeline.cuts);
  const redo = await api('POST', `/api/projects/${id}/redo`);
  assert.deepEqual(redo.body.timeline.cuts, overlap.body.timeline.cuts);

  // Pause detection uses audio energy and finds the 2–3 s silence; review-first.
  const det = await api('POST', `/api/projects/${id}/suggestions/detect`, { type: 'pause', minPause: 0.5, padding: 0.1 });
  assert.equal(det.status, 200, JSON.stringify(det.body));
  assert.equal(det.body.method, 'audio-energy');
  const gap = det.body.suggestions.find(s => s.sourceStart > 1.9 && s.sourceEnd < 3.1);
  assert.ok(gap, JSON.stringify(det.body.suggestions));
  const rejected = await api('PATCH', `/api/projects/${id}/suggestions/${gap.id}`, { status: 'rejected' });
  assert.equal(rejected.body.suggestions.find(s => s.id === gap.id).status, 'rejected');
  const accepted = await api('PATCH', `/api/projects/${id}/suggestions/${gap.id}`, { status: 'accepted' });
  assert.ok(accepted.body.operation);
  // Undoing the accepted suggestion puts it back under review.
  const undone = await api('POST', `/api/projects/${id}/undo`);
  assert.equal(undone.status, 200);
  assert.equal((await api('GET', `/api/projects/${id}/suggestions`)).body.suggestions.find(s => s.id === gap.id).status, 'pending');
  await api('POST', `/api/projects/${id}/redo`);

  const srt = await api('GET', `/api/projects/${id}/captions?format=srt`);
  assert.equal(srt.status, 200);
  assert.match(Buffer.from(srt.body).toString(), /-->/);

  // Export 16:9 and 9:16 with an SRT sidecar; output must match the timeline.
  const { body: snap } = await api('GET', `/api/projects/${id}`);
  const exp = await api('POST', `/api/projects/${id}/exports`, { resolution: 720, aspects: ['16:9', '9:16'], codec: 'h264', captions: { mode: 'srt' } });
  assert.equal(exp.status, 202, JSON.stringify(exp.body));
  for (const j of exp.body.jobs) {
    const done = await waitForJob(j.id);
    assert.equal(done.status, 'completed', `${done.errorCode}: ${done.errorMessage}`);
    assert.ok(Math.abs(done.result.duration - snap.timeline.duration) < 1 / 25 + 0.25, `duration ${done.result.duration} vs ${snap.timeline.duration}`);
    const dl = await api('GET', `/api/jobs/${j.id}/download`);
    assert.equal(dl.status, 200);
    const out = path.join(tmp, `out-${j.id}.mp4`);
    fs.writeFileSync(out, Buffer.from(dl.body));
    const info = await probe(out);
    // TC-08: vertical export is 720×1280, cropped not stretched.
    if (j.settings.aspect === '9:16') assert.deepEqual([info.width, info.height], [720, 1280]);
    else assert.deepEqual([info.width, info.height], [1280, 720]);
    assert.equal((await api('GET', `/api/jobs/${j.id}/download?file=subtitles`)).status, 200);
  }

  // TC-09: cancelling an export leaves the project usable.
  const slow = await api('POST', `/api/projects/${id}/exports`, { resolution: 2160, aspects: ['16:9'], codec: 'prores' });
  const cancelled = await api('POST', `/api/jobs/${slow.body.jobs[0].id}/cancel`);
  assert.equal(cancelled.status, 202);
  assert.equal((await waitForJob(slow.body.jobs[0].id)).status, 'cancelled');
  assert.equal((await api('GET', `/api/projects/${id}`)).status, 200);

  // TC-10: a different file is never silently substituted.
  const mismatch = await api('POST', `/api/projects/${id}/media`, uploadForm(media.other));
  assert.equal(mismatch.status, 409);
  assert.equal(mismatch.body.error.code, 'MEDIA_MISMATCH');
  const relink = await api('POST', `/api/projects/${id}/media`, uploadForm(media.speech, 'renamed.mp4'));
  assert.equal(relink.status, 201, 'same content under a new name relinks');

  // Project file round-trip requires relinking media.
  const file = await api('GET', `/api/projects/${id}/project.json`);
  const imported = await api('POST', '/api/projects/import', file.body);
  assert.equal(imported.status, 201, JSON.stringify(imported.body));
  assert.equal(imported.body.media.stored, false);
  assert.deepEqual(imported.body.timeline.cuts, redo.body.timeline.cuts.length ? (await api('GET', `/api/projects/${id}/timeline`)).body.timeline.cuts : []);
});

test('TC-07: video without audio offers manual transcript instead', async () => {
  const { body } = await api('POST', '/api/projects', { name: 'Silent' });
  const up = await api('POST', `/api/projects/${body.project.id}/media`, uploadForm(media.silent));
  assert.equal(up.body.media.hasAudio, false);
  const tr = await api('POST', `/api/projects/${body.project.id}/transcribe`);
  assert.equal(tr.status, 409);
  assert.equal(tr.body.error.code, 'NO_AUDIO');
});
