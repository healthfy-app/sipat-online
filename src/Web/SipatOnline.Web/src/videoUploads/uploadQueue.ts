import { useSyncExternalStore } from 'react';
import {
  abortChunkedUpload,
  ApiError,
  completeUploadedVideo,
  finishChunkedUpload,
  listChunkedUploadParts,
  putUploadPart,
  signChunkedUploadParts,
  startChunkedVideoUpload,
  uploadPlatformVideo,
  type ChunkedVideoUpload,
  type PlatformCourseVideo,
} from '@/api';
import { getErrorMessage, maxVideoBytes } from '@/courseEditor/courseFormat';

/**
 * The library's upload queue: a file copy, the way a desktop does it.
 *
 * - It lives outside React: the uploads go on while the operator uses the rest of the portal.
 * - Each file goes to the bucket in parts (16 MB). A lost connection costs the part in flight, never the
 *   file: the part is sent again, and when the internet is gone the queue waits for it to come back.
 * - Each upload is remembered in this browser (local storage). After a reload or a crash, picking the same
 *   files again resumes them from the parts the bucket already has.
 * - Pause, resume and cancel per file or for all. Two files at a time, three parts each: enough to fill an
 *   office uplink without one stuck file holding the rest.
 * - While it runs: the tab title shows the progress, the screen is kept awake and closing the tab asks first.
 */

export type UploadStatus =
  | 'waiting' | 'preparing' | 'uploading' | 'finishing' | 'retrying' | 'offline'
  | 'paused' | 'done' | 'failed' | 'canceled';

export interface UploadItem {
  id: string;
  key: string;
  file: File;
  title: string;
  courseId?: string;
  status: UploadStatus;
  sentBytes: number;
  totalBytes: number;
  /** Bytes per second, smoothed; 0 when nothing is moving. */
  speed: number;
  error?: string;
  /** Continued from an upload that a reload or a lost connection had interrupted. */
  resumed: boolean;
  video?: PlatformCourseVideo;
}

/** An upload a previous visit left unfinished: the file has to be picked again to resume it. */
export interface InterruptedUpload {
  key: string;
  fileName: string;
  title: string;
  sizeBytes: number;
  savedAt: number;
}

export interface UploadQueueState {
  items: UploadItem[];
  interrupted: InterruptedUpload[];
  online: boolean;
}

const fileConcurrency = 2;
const partConcurrency = 3;
/** Links are signed for an hour; a new batch is asked for well before that. */
const linkLifetimeMs = 45 * 60 * 1000;
/** The bucket drops unfinished multipart uploads after a day (lifecycle rule on uploads/). */
const resumeWindowMs = 20 * 60 * 60 * 1000;
const backoffMs = [1000, 2000, 5000, 10000, 20000, 30000, 60000];
const storageKey = 'sipat.videoUploads.v1';
const acceptedTypes = new Set(['video/mp4', 'video/webm']);

interface SavedUpload {
  videoId: string;
  uploadId: string;
  partSizeBytes: number;
  partCount: number;
  maxPartsPerRequest: number;
  fileName: string;
  title: string;
  courseId?: string;
  sizeBytes: number;
  savedAt: number;
}

interface Job {
  controller: AbortController;
  stopReason?: 'pause' | 'cancel';
  durationMs?: number;
  chunk?: ChunkedVideoUpload | SavedUpload;
  done: Set<number>;
  inflight: Map<number, number>;
  links: Map<number, { url: string; at: number }>;
  signing?: Promise<void>;
  lastEmit: number;
  lastSample: { at: number; sent: number };
}

class UploadGoneError extends Error {}
class StoppedError extends Error {}

let state: UploadQueueState = { items: [], interrupted: [], online: typeof navigator === 'undefined' || navigator.onLine !== false };
const listeners = new Set<() => void>();
const completedListeners = new Set<(item: UploadItem) => void>();
const jobs = new Map<string, Job>();
let nextId = 1;

// ---------- store ----------

function emit() {
  for (const listener of listeners) listener();
  syncSideEffects();
}

function setState(next: Partial<UploadQueueState>) {
  state = { ...state, ...next };
  emit();
}

function update(id: string, change: Partial<UploadItem>) {
  state = { ...state, items: state.items.map((item) => (item.id === id ? { ...item, ...change } : item)) };
  emit();
}

function find(id: string) {
  return state.items.find((item) => item.id === id);
}

export function subscribeUploads(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getUploadsSnapshot() {
  return state;
}

export function useUploadQueue(): UploadQueueState {
  return useSyncExternalStore(subscribeUploads, getUploadsSnapshot, getUploadsSnapshot);
}

/** Called once per video that reached the catalog, wherever the operator is. */
export function onVideoUploaded(listener: (item: UploadItem) => void) {
  completedListeners.add(listener);
  return () => { completedListeners.delete(listener); };
}

/** Still has work to do (paused counts: it is not finished). */
export function isActive(status: UploadStatus) {
  return status !== 'done' && status !== 'failed' && status !== 'canceled';
}

export function isMoving(status: UploadStatus) {
  return status === 'preparing' || status === 'uploading' || status === 'finishing' || status === 'retrying' || status === 'offline';
}

// ---------- files ----------

export function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base ? base.charAt(0).toLocaleUpperCase('pt-BR') + base.slice(1) : '';
}

function videoType(file: File): string {
  if (acceptedTypes.has(file.type)) return file.type;
  // some systems give no type for .mp4/.webm picked or dropped from a folder
  if (/\.mp4$/i.test(file.name)) return 'video/mp4';
  if (/\.webm$/i.test(file.name)) return 'video/webm';
  return '';
}

/** Why a file cannot be sent, before anything goes out; null when it can. */
export function checkVideoFile(file: File): string | null {
  if (!videoType(file)) return 'Formato não aceito. Envie MP4 ou WebM.';
  if (file.size < 1) return 'O arquivo está vazio.';
  if (file.size > maxVideoBytes) return 'O arquivo passa do limite de 2 GB.';
  return null;
}

function typedFile(file: File): File {
  const type = videoType(file);
  return file.type === type ? file : new File([file], file.name, { type, lastModified: file.lastModified });
}

export function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof URL.createObjectURL !== 'function' || typeof document === 'undefined') { resolve(null); return; }
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;
    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      resolve(value);
    };
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null);
    video.onerror = () => done(null);
    window.setTimeout(() => done(null), 8000);
    video.src = url;
  });
}

// ---------- what this browser remembers ----------

function readSaved(): Record<string, SavedUpload> {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const all = raw ? (JSON.parse(raw) as Record<string, SavedUpload>) : {};
    const now = Date.now();
    return Object.fromEntries(Object.entries(all).filter(([, saved]) => now - saved.savedAt < resumeWindowMs));
  } catch {
    return {};
  }
}

function writeSaved(all: Record<string, SavedUpload>) {
  try {
    if (Object.keys(all).length === 0) window.localStorage.removeItem(storageKey);
    else window.localStorage.setItem(storageKey, JSON.stringify(all));
  } catch {
    // private window or full storage: the upload still works, it just cannot resume after a reload
  }
}

function saveUpload(key: string, saved: SavedUpload) {
  writeSaved({ ...readSaved(), [key]: saved });
}

function forgetUpload(key: string) {
  const all = readSaved();
  if (key in all) {
    delete all[key];
    writeSaved(all);
  }
  if (state.interrupted.some((entry) => entry.key === key)) {
    setState({ interrupted: state.interrupted.filter((entry) => entry.key !== key) });
  }
}

function loadInterrupted() {
  const all = readSaved();
  writeSaved(all); // drops the expired ones
  state = {
    ...state,
    interrupted: Object.entries(all).map(([key, saved]) => ({
      key, fileName: saved.fileName, title: saved.title, sizeBytes: saved.sizeBytes, savedAt: saved.savedAt,
    })),
  };
}

/** Gives up an interrupted upload: its parts are dropped from the bucket. */
export function discardInterrupted(key: string) {
  const saved = readSaved()[key];
  forgetUpload(key);
  if (saved) void abortChunkedUpload(saved.videoId, saved.uploadId).catch(() => undefined);
}

export function discardAllInterrupted() {
  for (const entry of state.interrupted) discardInterrupted(entry.key);
}

// ---------- commands ----------

export function enqueueUploads(entries: { file: File; title: string }[], courseId?: string) {
  const queued = new Set(state.items.filter((item) => isActive(item.status)).map((item) => item.key));
  const saved = readSaved();
  const added: UploadItem[] = [];
  for (const { file, title } of entries) {
    const key = fileKey(file);
    if (queued.has(key)) continue; // the same file twice: once is enough
    queued.add(key);
    const problem = checkVideoFile(file);
    const previous = saved[key];
    const item: UploadItem = {
      id: `upload-${nextId++}`,
      key,
      file: problem ? file : typedFile(file),
      title: title.trim() || previous?.title || titleFromFileName(file.name) || file.name,
      courseId: courseId ?? previous?.courseId,
      status: problem ? 'failed' : 'waiting',
      sentBytes: 0,
      totalBytes: file.size,
      speed: 0,
      error: problem ?? undefined,
      resumed: !!previous,
    };
    added.push(item);
  }
  if (added.length === 0) return 0;
  const resumedKeys = new Set(added.filter((item) => item.resumed).map((item) => item.key));
  state = {
    ...state,
    items: [...state.items, ...added],
    interrupted: state.interrupted.filter((entry) => !resumedKeys.has(entry.key)),
  };
  emit();
  pump();
  return added.length;
}

function stop(id: string, reason: 'pause' | 'cancel') {
  const job = jobs.get(id);
  if (job) {
    job.stopReason = reason;
    job.controller.abort();
  }
}

export function pauseUpload(id: string) {
  const item = find(id);
  if (!item || !isActive(item.status) || item.status === 'paused') return;
  stop(id, 'pause');
  update(id, { status: 'paused', speed: 0 });
  pump();
}

export function resumeUpload(id: string) {
  const item = find(id);
  if (!item || item.status !== 'paused') return;
  update(id, { status: 'waiting', error: undefined });
  pump();
}

export function pauseAllUploads() {
  for (const item of state.items) pauseUpload(item.id);
}

export function resumeAllUploads() {
  for (const item of state.items) resumeUpload(item.id);
}

export function cancelUpload(id: string) {
  const item = find(id);
  if (!item || !isActive(item.status)) return;
  stop(id, 'cancel');
  const job = jobs.get(id);
  const saved = readSaved()[item.key];
  const chunk = job?.chunk ?? saved;
  if (chunk) void abortChunkedUpload(chunk.videoId, chunk.uploadId).catch(() => undefined);
  forgetUpload(item.key);
  jobs.delete(id);
  update(id, { status: 'canceled', speed: 0, error: undefined });
  pump();
}

export function cancelAllUploads() {
  for (const item of state.items) {
    if (isActive(item.status)) cancelUpload(item.id);
  }
}

export function retryUpload(id: string) {
  const item = find(id);
  if (!item || (item.status !== 'failed' && item.status !== 'canceled') || checkVideoFile(item.file)) return;
  update(id, { status: 'waiting', speed: 0, error: undefined });
  pump();
}

export function retryFailedUploads() {
  for (const item of state.items) {
    if (item.status === 'failed') retryUpload(item.id);
  }
}

/** Takes the finished, failed and canceled ones off the list. */
export function clearFinishedUploads() {
  for (const item of state.items) {
    if (!isActive(item.status)) jobs.delete(item.id);
  }
  setState({ items: state.items.filter((item) => isActive(item.status)) });
}

// ---------- engine ----------

function pump() {
  let free = fileConcurrency - state.items.filter((item) => isMoving(item.status)).length;
  for (const item of state.items) {
    if (free <= 0) break;
    if (item.status === 'waiting') {
      free -= 1;
      update(item.id, { status: 'preparing' });
      void run(item.id);
    }
  }
}

function isRetryable(error: unknown) {
  // status 0: the connection dropped; 408, 429 and 5xx: the server or the bucket was busy
  if (error instanceof ApiError) return error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500;
  return error instanceof TypeError;
}

function isUploadGone(error: unknown) {
  return error instanceof UploadGoneError
    || (error instanceof ApiError && error.status === 404 && error.code === 'learning.platform_course.upload_not_found');
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new StoppedError()); return; }
    const onAbort = () => { window.clearTimeout(timer); reject(new StoppedError()); };
    const timer = window.setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function waitOnline(signal: AbortSignal) {
  if (state.online) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const unsubscribe = subscribeUploads(() => {
      if (state.online) { unsubscribe(); signal.removeEventListener('abort', onAbort); resolve(); }
    });
    const onAbort = () => { unsubscribe(); reject(new StoppedError()); };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Waits for the internet, showing it on the item meanwhile. */
async function whenOnline(id: string, signal: AbortSignal) {
  if (state.online) return;
  markTrouble(id);
  await waitOnline(signal);
}

/** Runs a call to the API again while the failure is the connection or a busy server. */
async function withRetry<T>(id: string, signal: AbortSignal, call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    if (signal.aborted) throw new StoppedError();
    try {
      await whenOnline(id, signal);
      const result = await call();
      const item = find(id);
      if (item && (item.status === 'retrying' || item.status === 'offline')) update(id, { status: 'uploading', error: undefined });
      return result;
    } catch (error) {
      if (signal.aborted) throw new StoppedError();
      if (!isRetryable(error) || attempt >= backoffMs.length) throw error;
      markTrouble(id);
      await sleep(backoffMs[attempt], signal);
    }
  }
}

function markTrouble(id: string) {
  update(id, state.online
    ? { status: 'retrying', speed: 0, error: 'Conexão instável. Tentando de novo…' }
    : { status: 'offline', speed: 0, error: 'Sem internet. Continua sozinho quando a conexão voltar.' });
}

function partSize(chunk: { partSizeBytes: number; partCount: number }, total: number, part: number) {
  return part < chunk.partCount ? chunk.partSizeBytes : total - chunk.partSizeBytes * (chunk.partCount - 1);
}

function report(id: string, job: Job, force = false) {
  const item = find(id);
  if (!item || !job.chunk || !isMoving(item.status)) return;
  const chunk = job.chunk;
  let sent = 0;
  for (const part of job.done) sent += partSize(chunk, item.totalBytes, part);
  for (const loaded of job.inflight.values()) sent += loaded;
  const now = performance.now();
  if (!force && now - job.lastEmit < 250) return;
  let speed = item.speed;
  const elapsed = (now - job.lastSample.at) / 1000;
  if (elapsed >= 0.75) {
    const sample = Math.max(0, (sent - job.lastSample.sent) / elapsed);
    speed = speed ? speed * 0.75 + sample * 0.25 : sample;
    job.lastSample = { at: now, sent };
  }
  job.lastEmit = now;
  const status = item.status === 'retrying' || item.status === 'offline' ? item.status : 'uploading';
  update(id, { sentBytes: Math.min(sent, item.totalBytes), speed, status });
}

async function ensureLinks(job: Job, wanted: number, pending: number[]) {
  const link = job.links.get(wanted);
  if (link && Date.now() - link.at < linkLifetimeMs) return;
  if (!job.signing) {
    const chunk = job.chunk!;
    const now = Date.now();
    const batch = [wanted, ...pending.filter((part) => part !== wanted && !job.done.has(part)
      && !(job.links.get(part) && now - job.links.get(part)!.at < linkLifetimeMs))]
      .slice(0, chunk.maxPartsPerRequest);
    job.signing = signChunkedUploadParts(chunk.videoId, chunk.uploadId, batch)
      .then((links) => {
        const at = Date.now();
        for (const entry of links) job.links.set(entry.partNumber, { url: entry.url, at });
      })
      .finally(() => { job.signing = undefined; });
  }
  await job.signing;
  if (!job.links.has(wanted)) await ensureLinks(job, wanted, pending);
}

async function sendPart(id: string, job: Job, part: number, pending: number[], signal: AbortSignal) {
  const chunk = job.chunk!;
  const item = find(id)!;
  const start = chunk.partSizeBytes * (part - 1);
  const blob = item.file.slice(start, start + partSize(chunk, item.totalBytes, part));
  for (let attempt = 0; ; attempt += 1) {
    if (signal.aborted) throw new StoppedError();
    await whenOnline(id, signal);
    let status: number;
    try {
      await ensureLinks(job, part, pending);
      status = await putUploadPart(job.links.get(part)!.url, blob, {
        signal,
        onProgress: (loaded) => { job.inflight.set(part, loaded); report(id, job); },
      });
    } catch (error) {
      job.inflight.delete(part);
      if (signal.aborted) throw new StoppedError();
      if (isUploadGone(error)) throw new UploadGoneError();
      if (!isRetryable(error) || attempt >= backoffMs.length + 4) throw error;
      markTrouble(id);
      await sleep(backoffMs[Math.min(attempt, backoffMs.length - 1)], signal);
      continue;
    }
    job.inflight.delete(part);
    if (status >= 200 && status < 300) {
      job.done.add(part);
      const current = find(id);
      if (current && (current.status === 'retrying' || current.status === 'offline')) update(id, { status: 'uploading', error: undefined });
      report(id, job, true);
      return;
    }
    if (status === 403) { job.links.delete(part); continue; } // the link expired: sign it again
    if (status === 404) throw new UploadGoneError();
    if ((status === 408 || status === 429 || status >= 500) && attempt < backoffMs.length + 4) {
      markTrouble(id);
      await sleep(backoffMs[Math.min(attempt, backoffMs.length - 1)], signal);
      continue;
    }
    throw new ApiError('O armazenamento recusou uma parte do vídeo. Tente de novo.', status);
  }
}

async function openChunked(id: string, job: Job, item: UploadItem, signal: AbortSignal): Promise<boolean> {
  const saved = job.chunk ?? readSaved()[item.key];
  if (saved && saved.partCount > 0) {
    try {
      const parts = await withRetry(id, signal, () => listChunkedUploadParts(saved.videoId, saved.uploadId));
      job.chunk = saved;
      job.done = new Set(parts
        .filter((part) => part.sizeBytes === partSize(saved, item.totalBytes, part.partNumber))
        .map((part) => part.partNumber));
      return true;
    } catch (error) {
      if (!isUploadGone(error)) throw error;
      forgetUpload(item.key); // expired in the bucket: start over
      job.chunk = undefined;
    }
  }

  const start = await withRetry(id, signal, () => startChunkedVideoUpload(item.file.type, item.totalBytes));
  if (!start) return false;
  job.chunk = start;
  job.done = new Set();
  saveUpload(item.key, {
    videoId: start.videoId,
    uploadId: start.uploadId,
    partSizeBytes: start.partSizeBytes,
    partCount: start.partCount,
    maxPartsPerRequest: start.maxPartsPerRequest,
    fileName: item.file.name,
    title: item.title,
    courseId: item.courseId,
    sizeBytes: item.totalBytes,
    savedAt: Date.now(),
  });
  return true;
}

function newJob(previous?: Job): Job {
  return {
    controller: new AbortController(),
    durationMs: previous?.durationMs,
    chunk: previous?.chunk,
    done: previous?.done ?? new Set(),
    inflight: new Map(),
    links: previous?.links ?? new Map(),
    lastEmit: 0,
    lastSample: { at: performance.now(), sent: 0 },
  };
}

async function run(id: string) {
  const job = newJob(jobs.get(id));
  jobs.set(id, job);
  const { signal } = job.controller;
  try {
    const item = find(id);
    if (!item) return;
    if (job.durationMs === undefined) {
      const seconds = await readVideoDuration(item.file);
      // A file the browser cannot measure still goes: the conversion measures it and fixes the value.
      job.durationMs = seconds ? Math.round(seconds * 1000) : 1000;
    }
    if (signal.aborted) throw new StoppedError();

    let video: PlatformCourseVideo | undefined;
    for (let restarts = 0; ; restarts += 1) {
      try {
        const chunked = await openChunked(id, job, item, signal);
        if (!chunked) {
          // no direct upload here (local file storage): one request through the API, with progress
          update(id, { status: 'uploading' });
          video = await withRetry(id, signal, () => uploadPlatformVideo(item.title, job.durationMs!, item.file, item.courseId, {
            signal,
            onProgress: (sent, total) => update(id, { sentBytes: sent, totalBytes: total }),
          }));
          break;
        }

        const chunk = job.chunk!;
        job.lastSample = { at: performance.now(), sent: 0 };
        report(id, job, true);
        job.lastSample = { at: performance.now(), sent: find(id)!.sentBytes };
        const pending = Array.from({ length: chunk.partCount }, (_, index) => index + 1).filter((part) => !job.done.has(part));
        const queue = [...pending];
        // one signal for this round of parts: a failed part stops its siblings without stopping the job
        const round = new AbortController();
        const stopRound = () => round.abort();
        signal.addEventListener('abort', stopRound, { once: true });
        const worker = async () => {
          for (let part = queue.shift(); part !== undefined; part = queue.shift()) {
            await sendPart(id, job, part, pending, round.signal);
          }
        };
        try {
          await Promise.all(Array.from({ length: Math.min(partConcurrency, queue.length) }, worker));
        } catch (error) {
          round.abort();
          throw signal.aborted ? new StoppedError() : error;
        } finally {
          signal.removeEventListener('abort', stopRound);
        }

        update(id, { status: 'finishing', sentBytes: item.totalBytes, speed: 0 });
        await withRetry(id, signal, () => finishChunkedUpload(chunk.videoId, chunk.uploadId));
        try {
          video = await withRetry(id, signal, () => completeUploadedVideo(chunk.videoId, item.title, job.durationMs!, item.courseId));
        } catch (error) {
          // the answer of a complete that worked was lost: the video is already in the catalog
          if (!(error instanceof ApiError && error.status === 409)) throw error;
        }
        break;
      } catch (error) {
        if (isUploadGone(error) && restarts < 1 && !signal.aborted) {
          forgetUpload(item.key);
          job.chunk = undefined;
          job.done = new Set();
          job.links = new Map();
          continue;
        }
        throw error;
      }
    }

    forgetUpload(item.key);
    jobs.delete(id);
    const done = { ...find(id)!, status: 'done' as const, sentBytes: item.totalBytes, speed: 0, error: undefined, video };
    update(id, done);
    for (const listener of completedListeners) listener(done);
  } catch (error) {
    const reason = job.stopReason;
    if (reason === 'pause' || reason === 'cancel' || error instanceof StoppedError) {
      // pause keeps the job (parts and links) for the resume; cancel already cleaned up
      return;
    }
    update(id, { status: 'failed', speed: 0, error: failureMessage(error) });
  } finally {
    pump();
  }
}

function failureMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 401) return 'Sua sessão expirou. Entre de novo e toque em tentar de novo.';
  if (isRetryable(error)) return 'A conexão falhou várias vezes. Toque em tentar de novo: o envio continua de onde parou.';
  return getErrorMessage(error);
}

// ---------- the browser around it ----------

let baseTitle: string | null = null;
let wakeLock: { release: () => Promise<void> } | null = null;
let wakeLockPending = false;

function syncSideEffects() {
  if (typeof document === 'undefined') return;
  const working = state.items.filter((item) => isActive(item.status) && item.status !== 'paused');
  if (working.length > 0) {
    const counted = state.items.filter((item) => item.status !== 'canceled' && item.status !== 'failed');
    const total = counted.reduce((sum, item) => sum + item.totalBytes, 0);
    const sent = counted.reduce((sum, item) => sum + (item.status === 'done' ? item.totalBytes : item.sentBytes), 0);
    const percent = total > 0 ? Math.floor((sent / total) * 100) : 0;
    if (baseTitle === null) baseTitle = document.title;
    const title = `(${percent}%) Enviando vídeos · ${baseTitle}`;
    if (document.title !== title) document.title = title;
    requestWakeLock();
  } else {
    if (baseTitle !== null) {
      document.title = baseTitle;
      baseTitle = null;
    }
    if (wakeLock) {
      void wakeLock.release().catch(() => undefined);
      wakeLock = null;
    }
  }
}

function requestWakeLock() {
  const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void>; addEventListener: (type: 'release', cb: () => void) => void }> } };
  if (wakeLock || wakeLockPending || !nav.wakeLock || document.visibilityState !== 'visible') return;
  wakeLockPending = true;
  nav.wakeLock.request('screen').then((lock) => {
    wakeLock = lock;
    lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
  }, () => undefined).finally(() => { wakeLockPending = false; });
}

if (typeof window !== 'undefined') {
  loadInterrupted();
  window.addEventListener('online', () => setState({ online: true }));
  window.addEventListener('offline', () => setState({ online: false }));
  // the screen lock is released when the tab is hidden; take it again when it comes back
  document.addEventListener('visibilitychange', () => syncSideEffects());
  window.addEventListener('beforeunload', (event) => {
    if (state.items.some((item) => isActive(item.status) && item.status !== 'paused')) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}

/** Only for tests. */
export function resetUploadQueue() {
  for (const job of jobs.values()) job.controller.abort();
  jobs.clear();
  try { window.localStorage.removeItem(storageKey); } catch { /* ignore */ }
  state = { items: [], interrupted: [], online: true };
  emit();
}
