// Transcription adapter (SRS §7.1). Runs Whisper through Transformers.js on the
// Voxcut server, so audio never leaves the machine running this backend. The
// adapter shape ({ info, transcribe }) lets a different engine be plugged in.

import { config } from '../config.js';
import { decodePcm, CancelledError } from './ffmpeg.js';
import { JobError } from './jobs.js';
import { normalizeChunks, distributeSegments } from '../../../shared/transcript.js';

const SAMPLE_RATE = 16000;
let pipelinePromise = null;

export const transcriptionInfo = () => ({
  enabled: config.transcription.enabled,
  engine: 'whisper (transformers.js, onnxruntime)',
  model: config.transcription.model,
  runsOn: 'voxcut-server',
  disclosure: 'Audio is decoded and transcribed by the Voxcut server you are connected to. It is not sent to any third-party service. ' +
    'The speech model is downloaded once from the Hugging Face hub and cached on the server.',
  retention: 'The uploaded source file is kept in the server data folder until you remove the media or delete the project.'
});

async function loadPipeline(onProgress) {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = config.modelCacheDir;
      const files = new Map();
      return pipeline('automatic-speech-recognition', config.transcription.model, {
        dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' },
        progress_callback: p => {
          if (p.status !== 'progress' || !p.total) return;
          files.set(p.file, { loaded: p.loaded, total: p.total });
          let loaded = 0;
          let total = 0;
          for (const f of files.values()) { loaded += f.loaded; total += f.total; }
          onProgress?.(total ? loaded / total : 0);
        }
      });
    })();
    pipelinePromise.catch(() => { pipelinePromise = null; });
  }
  return pipelinePromise;
}

/** Pick the quietest 20 ms frame in [from, to) so chunks split between words. */
function quietestSample(pcm, from, to) {
  const frame = SAMPLE_RATE / 50;
  let best = to;
  let bestEnergy = Infinity;
  for (let i = from; i + frame <= to; i += frame) {
    let e = 0;
    for (let j = i; j < i + frame; j++) e += pcm[j] * pcm[j];
    if (e < bestEnergy) { bestEnergy = e; best = i; }
  }
  return best;
}

function chunkBounds(pcm, chunkSeconds) {
  const max = chunkSeconds * SAMPLE_RATE;
  const bounds = [];
  let start = 0;
  while (start < pcm.length) {
    if (pcm.length - start <= max) { bounds.push([start, pcm.length]); break; }
    const end = quietestSample(pcm, start + Math.floor(max * 0.66), start + max);
    bounds.push([start, end]);
    start = end;
  }
  return bounds;
}

/**
 * Transcribe the first audio track of `file`. Reports the SRS stages
 * (preparing audio → loading model → transcribing → aligning → finalizing).
 */
export async function transcribeFile(file, { duration, signal, update }) {
  if (!config.transcription.enabled) throw new JobError('TRANSCRIPTION_DISABLED', 'Server transcription is turned off. Enter or import a transcript instead.', 'Preparing audio');

  update({ stage: 'Preparing audio', progress: 0.02 });
  let pcm;
  try {
    pcm = await decodePcm(file, { signal });
  } catch (err) {
    if (err instanceof CancelledError) throw err;
    throw new JobError('AUDIO_DECODE_FAILED', 'The audio track could not be decoded. Try converting the file to MP4 (H.264/AAC).', 'Preparing audio');
  }
  if (!pcm.length) throw new JobError('NO_AUDIO', 'This file has no decodable audio. Enter or import a transcript instead.', 'Preparing audio');

  update({ stage: 'Loading model', progress: 0.05 });
  let asr;
  try {
    asr = await loadPipeline(p => update({ progress: 0.05 + p * 0.15 }));
  } catch {
    throw new JobError('MODEL_LOAD_FAILED', `The speech model (${config.transcription.model}) could not be downloaded or started. Check the server's internet connection and retry, or enter the transcript manually.`, 'Loading model');
  }
  if (signal.aborted) throw new CancelledError();

  const english = /\.en(\b|_)/.test(config.transcription.model);
  const baseOptions = english ? {} : { language: config.transcription.language, task: 'transcribe' };
  const bounds = chunkBounds(pcm, config.transcription.chunkSeconds);
  const words = [];
  let approximate = false;
  update({ stage: 'Transcribing', progress: 0.2 });

  for (let i = 0; i < bounds.length; i++) {
    if (signal.aborted) throw new CancelledError();
    const [a, b] = bounds[i];
    const audio = pcm.subarray(a, b);
    const offset = a / SAMPLE_RATE;
    let out;
    try {
      out = await asr(audio, { ...baseOptions, return_timestamps: 'word' });
      words.push(...normalizeChunks(out.chunks ?? [], duration, { offset }));
    } catch {
      // Model without word-level alignment: fall back to segments and mark approximate.
      try {
        out = await asr(audio, { ...baseOptions, return_timestamps: true });
        words.push(...distributeSegments(out.chunks ?? [{ text: out.text, timestamp: [0, audio.length / SAMPLE_RATE] }], duration, { offset }));
        approximate = true;
      } catch {
        throw new JobError('TRANSCRIPTION_FAILED', 'Speech recognition failed on part of the audio. Try a shorter clip or retry.', 'Transcribing');
      }
    }
    update({ progress: 0.2 + ((i + 1) / bounds.length) * 0.7, metrics: { chunk: i + 1, chunks: bounds.length, words: words.length } });
  }

  update({ stage: 'Aligning words', progress: 0.92 });
  // Enforce monotonic, non-overlapping timings across chunk seams.
  for (let i = 1; i < words.length; i++) {
    if (words[i].sourceStart < words[i - 1].sourceEnd) words[i].sourceStart = words[i - 1].sourceEnd;
    if (words[i].sourceEnd < words[i].sourceStart) words[i].sourceEnd = words[i].sourceStart;
  }

  update({ stage: 'Finalizing', progress: 0.97 });
  if (!words.length) throw new JobError('NO_SPEECH', 'No speech was recognized in this file. You can type the transcript manually instead.', 'Transcribing');
  return { words, precision: approximate ? 'approximate' : 'word' };
}
