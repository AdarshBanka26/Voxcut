// Project state for the editor. The server is the source of truth; every
// change is saved immediately and the save state is shown as Saving / Saved /
// Save failed (SRS §9.2).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, isActiveJob, watchJob } from '../api.js';
import { isWordCut } from '@shared/timeline.js';

export function useProject(projectId) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [save, setSave] = useState({ state: 'saved', at: Date.now() });
  const [notice, setNotice] = useState(null);
  const [transcription, setTranscription] = useState(null);
  const pending = useRef(0);
  const stopWatch = useRef(null);

  const load = useCallback(async () => {
    try {
      const snap = await api.getProject(projectId);
      setData(snap);
      setLoadError(null);
      return snap;
    } catch (err) {
      setLoadError(err);
      return null;
    }
  }, [projectId]);

  const follow = useCallback(job => {
    stopWatch.current?.();
    setTranscription(job);
    stopWatch.current = watchJob(job.id, j => {
      setTranscription(j);
      if (j.status === 'completed') load();
      if (j.status === 'failed') setNotice({ tone: 'error', title: `Transcription failed at “${j.stage}”`, message: j.errorMessage });
    });
  }, [load]);

  useEffect(() => {
    setData(null);
    setTranscription(null);
    load().then(snap => {
      const running = snap?.jobs.find(j => j.kind === 'transcription' && isActiveJob(j));
      if (running) follow(running);
    });
    return () => stopWatch.current?.();
  }, [load, follow]);

  /** Run a server mutation with save-state tracking and an actionable error. */
  const mutate = useCallback(async (fn, apply, { quiet = [] } = {}) => {
    pending.current += 1;
    setSave(s => ({ ...s, state: 'saving' }));
    try {
      const result = await fn();
      if (apply) setData(d => (d ? apply(d, result) : d));
      pending.current -= 1;
      if (!pending.current) setSave({ state: 'saved', at: Date.now() });
      return result;
    } catch (err) {
      pending.current -= 1;
      const benign = quiet.includes(err.code);
      setSave(s => ({ state: benign ? 'saved' : 'error', at: s.at }));
      if (!benign) setNotice({ tone: 'error', title: 'Change not saved', message: err.message });
      else setNotice({ tone: 'info', message: err.message });
      return null;
    }
  }, []);

  const applyTimeline = (d, r) => ({
    ...d,
    timeline: r.timeline,
    operations: r.operation
      ? (r.operation.undone !== undefined && d.operations.some(o => o.id === r.operation.id)
        ? d.operations.map(o => (o.id === r.operation.id ? r.operation : o))
        : [...d.operations.filter(o => !o.undone), r.operation])
      : d.operations,
    suggestions: r.suggestions ?? d.suggestions
  });

  const actions = useMemo(() => ({
    reload: load,
    dismissNotice: () => setNotice(null),
    notify: n => setNotice(n),
    rename: name => mutate(() => api.updateProject(projectId, { name }), (d, r) => ({ ...d, project: r.project })),
    setSettings: settings => mutate(() => api.updateProject(projectId, { settings }), (d, r) => ({ ...d, project: r.project })),
    cutWords: (wordIds, label) => mutate(() => api.operation(projectId, { type: 'cut', wordIds, label }), applyTimeline, { quiet: ['NOTHING_CHANGED'] }),
    restoreWords: (wordIds, label) => mutate(() => api.operation(projectId, { type: 'restore', wordIds, label }), applyTimeline, { quiet: ['NOTHING_CHANGED'] }),
    cutRange: (range, label) => mutate(() => api.operation(projectId, { type: 'cut', ranges: [range], label }), applyTimeline, { quiet: ['NOTHING_CHANGED'] }),
    restoreRange: (range, label) => mutate(() => api.operation(projectId, { type: 'restore', ranges: [range], label }), applyTimeline, { quiet: ['NOTHING_CHANGED'] }),
    undo: () => mutate(() => api.undo(projectId), (d, r) => ({ ...applyTimeline(d, r), suggestions: d.suggestions }), { quiet: ['NOTHING_TO_UNDO'] }).then(r => r && load()),
    redo: () => mutate(() => api.redo(projectId), (d, r) => ({ ...applyTimeline(d, r), suggestions: d.suggestions }), { quiet: ['NOTHING_TO_REDO'] }).then(r => r && load()),
    correctWord: (wordId, text) => mutate(() => api.correctWord(projectId, wordId, text), (d, r) => ({
      ...d, transcript: { ...d.transcript, words: d.transcript.words.map(w => (w.id === wordId ? { ...w, ...r.word } : w)) }
    })),
    setTranscriptText: text => mutate(() => api.putTranscript(projectId, { text }), (d, r) => r),
    transcribe: async () => {
      try {
        const { job } = await api.transcribe(projectId);
        follow(job);
      } catch (err) {
        setNotice({ tone: 'error', title: 'Transcription could not start', message: err.message });
      }
    },
    cancelTranscription: async () => {
      if (transcription) await api.cancelJob(transcription.id).catch(err => setNotice({ tone: 'error', message: err.message }));
    },
    detect: (type, opts = {}) => mutate(() => api.detectSuggestions(projectId, { type, ...opts }), (d, r) => ({
      ...d, suggestions: [...d.suggestions.filter(s => !(s.type === type && s.status === 'pending')), ...r.suggestions]
    })),
    review: (sid, body) => mutate(() => api.reviewSuggestion(projectId, sid, body), applyTimeline, { quiet: ['ALREADY_ACCEPTED'] }),
    acceptAll: type => mutate(() => api.acceptSuggestions(projectId, { type }), applyTimeline, { quiet: ['NOTHING_TO_ACCEPT'] }),
    uploadMedia: async (file, { confirm = false, onProgress } = {}) => {
      setSave(s => ({ ...s, state: 'saving' }));
      try {
        const snap = await api.uploadMedia(projectId, file, { confirm, onProgress });
        setData(snap);
        setSave({ state: 'saved', at: Date.now() });
        return { ok: true };
      } catch (err) {
        setSave(s => ({ ...s, state: 'saved' }));
        return { ok: false, error: err };
      }
    },
    removeStoredMedia: () => mutate(() => api.removeStoredMedia(projectId), (d, r) => r)
  }), [projectId, mutate, load, follow, transcription]);

  const words = useMemo(() => {
    if (!data) return [];
    const cuts = data.timeline.cuts;
    return data.transcript.words.map(w => ({ ...w, status: isWordCut(w, cuts) ? 'cut' : 'kept' }));
  }, [data]);

  const busy = save.state === 'saving' || isActiveJob(transcription);
  return { data, words, loadError, save, notice, transcription, busy, actions };
}
