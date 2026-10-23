# Voxcut — text-driven video editor

**Tagline:** Edit the text. Rewrite the video.

Voxcut is a browser-first MVP for transcript-driven video editing. It is built with React + Vite, uses Transformers.js/Whisper for local speech recognition, and uses FFmpeg WebAssembly for audio extraction and local MP4 export.

## Implemented

- Upload a local video and preview it in the browser.
- Generate an English transcript in-browser using `onnx-community/whisper-tiny.en`.
- Request word-level timestamps from the speech model.
- Select transcript items and delete their time ranges from the edit decision list.
- Non-destructive cuts: original source timestamps remain unchanged.
- Ripple-style preview playback that skips removed ranges.
- Undo/redo for transcript edits and cuts.
- Filler-word suggestions for common words such as “um”, “uh”, and “erm”.
- Timeline visualization with retained clips, cut markers, and audio track.
- Client-side MP4 export through FFmpeg WASM (H.264/AAC, where the FFmpeg build supports the source).
- Optional active-word caption overlay in the preview.
- Responsive dark interface and aspect-ratio preview controls.

## Requirements

- Node.js 20 or newer recommended.
- A modern desktop browser (Chrome/Edge are good initial targets).
- Internet access on first run to download npm packages, FFmpeg core assets, and the speech model. After the model is cached, transcription may be available offline depending on browser cache and deployment setup.
- Enough RAM for your chosen video and model. Start with short clips while developing.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. To make a production build:

```bash
npm run build
npm run preview
```

## How editing works

`src/lib/timeline.js` stores cuts as source-time ranges and computes the kept source segments and their positions on the edited timeline. The source video is never modified. When a transcript word is deleted, its `[start, end]` interval is added to the cut list. The preview skips these ranges, and export trims the retained intervals and concatenates them.

## Important limitations of this MVP

1. **Speech recognition model:** This project uses the English Whisper tiny model. Other languages and difficult audio may require a different model. Word timestamps depend on the selected model/runtime returning word chunks; if it returns text without alignment, the app reports that instead of inventing timestamps.
2. **Transcription performance:** The first model download can be large and inference may be slow. Keep the tab open and try a short clip first.
3. **Export compatibility:** The export filter expects a video with an audio stream. A production version should inspect streams and support silent video. Browser memory and FFmpeg WASM limits can constrain long/high-resolution clips.
4. **Codec/keyframe precision:** Re-encoding may be required for reliable cuts. Very short cuts can have frame/audio-boundary artifacts.
5. **Captions:** Captions currently display as a preview overlay; burned-in caption export and SRT/VTT download are not implemented yet.
6. **Multi-track editing:** The timeline visualizes the primary video/audio tracks. B-roll insertion, transitions, audio ducking, and true multi-track compositing are future features, not implemented functionality.
7. **Aspect ratio:** The selector changes the preview canvas only. Reframing/cropping the exported file is not implemented yet.
8. **Editing transcript text:** The MVP's primary editing action is selecting words and deleting them. Inline transcript correction is a natural next improvement.

## Suggested next steps

1. Add a media probe step to detect whether audio exists before export.
2. Add a manual transcript editor with forced alignment for corrections.
3. Add project persistence with IndexedDB and JSON export/import for the edit decision list.
4. Add SRT/VTT generation and burned-in captions.
5. Add B-roll clips and a multi-track composition model.
6. Add export progress, cancellation, and cleanup of temporary FFmpeg files.
7. Add tests for timeline mapping, overlapping cuts, undo/redo, and audio/video sync.

## Project structure

```text
voxcut/
├── index.html
├── package.json
├── README.md
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── styles.css
    └── lib/
        ├── ffmpeg.js
        ├── timeline.js
        └── transcribe.js
```

## Privacy

Source media is processed in the browser; it is not uploaded to a Voxcut application server. The browser does download JavaScript/model assets from external package/model hosts on first use. Do not use sensitive footage until you have reviewed the deployment, dependencies, and browser network behavior.
