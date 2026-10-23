# Voxcut — Edit the text. Rewrite the video.

Transcript-driven video editor built to `Voxcut_SRS_and_Workflow.pdf`. Upload a video, transcribe it, delete words to cut the video, review filler/pause suggestions, and export multi-aspect renders with captions. The original file is never modified; every edit is a replayable operation.

```
voxcut/
├── shared/      Pure domain logic used by both sides (no I/O, no React)
│   ├── timeline.js     ranges, ripple cuts, time mapping, undo replay (SRS §7.3)
│   ├── transcript.js   word normalization, fillers, pauses (SRS §3.2, §4.2)
│   ├── captions.js     caption grouping, SRT/VTT (SRS §4.7)
│   └── timecode.js
├── backend/     Node + Express API, SQLite (node:sqlite), ffmpeg, Whisper
│   ├── src/db/          schema + migrations, repositories (SRS §8 data model)
│   ├── src/services/    media probe, transcription, render, job runner
│   ├── src/routes/      projects, media, transcript, edits, suggestions, exports
│   └── test/            unit tests (SRS §11) + end-to-end API test with real ffmpeg
└── frontend/    React + Vite + Tailwind; pages follow page1–page4 designs
    ├── src/pages/       Landing (page1), Templates (page3), ExportStudio (page4)
    └── src/studio/      Editor (page2): transcript, preview, inspector, timeline
```

## Run it

Requires **Node.js 22.13+** (uses the built-in `node:sqlite`). ffmpeg/ffprobe are installed from npm; no system install is needed.

```bash
npm run install:all
npm run dev:backend     # API on http://127.0.0.1:4000
npm run dev:frontend    # UI on http://localhost:5173 (proxies /api)
```

Single-port mode: `npm run build && npm start`, then open http://127.0.0.1:4000.

Tests: `npm test` runs the timeline unit tests plus a full upload → cut → undo/redo → suggestions → export → validate cycle against real ffmpeg.

The first transcription downloads the Whisper model (`onnx-community/whisper-base_timestamped`, about 200 MB) into `backend/data/models`.

## Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` / `HOST` | `4000` / `127.0.0.1` | API address |
| `VOXCUT_DATA_DIR` | `backend/data` | Database, media, exports, model cache |
| `VOXCUT_MAX_UPLOAD_MB` | `2048` | Upload size limit |
| `VOXCUT_MAX_DURATION_S` | `7200` | Longest accepted video |
| `VOXCUT_WHISPER_MODEL` | `onnx-community/whisper-base_timestamped` | Any Transformers.js Whisper model |
| `VOXCUT_WHISPER_LANGUAGE` | `english` | Ignored for `.en` models |
| `VOXCUT_TRANSCRIPTION` | on | Set `off` to allow manual transcripts only |
| `VOXCUT_ALLOWED_ORIGINS` | none | CORS origins if the UI is hosted elsewhere |
| `FFMPEG_PATH` / `FFPROBE_PATH` | npm binaries | Use a different ffmpeg build |

## API overview

| Method & path | Purpose |
|---|---|
| `GET /api/capabilities` | Codecs/filters this ffmpeg supports, transcription disclosure, upload limits |
| `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id` | Project lifecycle; `GET` returns the full snapshot (media, words, timeline, operations, suggestions, jobs) |
| `GET /api/projects/:id/project.json`, `POST /api/projects/import` | Portable project file (edits + transcript + media identity) |
| `POST /api/projects/:id/media` | Upload or relink; a different file is refused (`409 MEDIA_MISMATCH`) unless `?confirm=true` |
| `GET .../media/file` · `/waveform` · `/thumbnail` · `DELETE .../media/file` | Range streaming, peaks, frames, remove the server copy |
| `POST /api/projects/:id/transcribe` | Whisper job: preparing audio → loading model → transcribing → aligning → finalizing |
| `PUT /api/projects/:id/transcript`, `PATCH .../words/:wordId` | Manual/imported transcript; text correction without timing change |
| `POST /api/projects/:id/operations`, `/undo`, `/redo`, `GET /timeline` | Cut/restore by word ids or source ranges |
| `POST .../suggestions/detect`, `PATCH .../suggestions/:sid`, `POST .../suggestions/accept` | Filler and pause review; accepted suggestions become undoable cuts |
| `GET /api/projects/:id/captions?format=json\|srt\|vtt` | Captions in edited-timeline time |
| `POST /api/projects/:id/exports` | One render job per aspect (resolution, codec, crop/pad, captions) |
| `GET /api/jobs/:id`, `POST /api/jobs/:id/cancel`, `GET /api/jobs/:id/download` | Progress, cancellation, validated download |

Errors are `{ "error": { "code", "message", "details" } }`, and `message` is written to be shown to the user.

## Design decisions (SRS §15 open questions)

- **Processing mode:** backend-assisted. Video is uploaded to the Voxcut server for transcription and rendering, and the UI says so before upload. No third-party service receives media.
- **Persistence:** the server keeps the source file until the user removes it. If it is removed, or a project is imported, the editor asks for a relink and checks the file's fingerprint and duration.
- **Edits** are stored as ordered operations and replayed deterministically. Undo/redo is a flag on each operation, so history survives restarts.
- **Exports** are frame-quantized, never stretched (crop or letterbox), and checked with ffprobe against the expected duration before a download is offered.

## Not implemented yet (SRS P2)

B-roll/overlay tracks, transitions, audio ducking, speaker diarization and color grading. The landing/templates pages show these as marketing content; the editor does not claim them.
