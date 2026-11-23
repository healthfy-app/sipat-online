import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/api';
import {
  enqueueUploads,
  fileKey,
  getUploadsSnapshot,
  onVideoUploaded,
  pauseUpload,
  resetUploadQueue,
  resumeUpload,
} from './uploadQueue';

vi.mock('@/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/api')>();
  return {
    ...original,
    startChunkedVideoUpload: vi.fn(),
    signChunkedUploadParts: vi.fn(),
    listChunkedUploadParts: vi.fn(),
    finishChunkedUpload: vi.fn(),
    abortChunkedUpload: vi.fn(),
    completeUploadedVideo: vi.fn(),
    putUploadPart: vi.fn(),
    uploadPlatformVideo: vi.fn(),
  };
});

const ten = () => new File(['0123456789'], 'epi.mp4', { type: 'video/mp4', lastModified: 1 });
const video = { id: 'vid-1', title: 'Epi' } as api.PlatformCourseVideo;
const chunk: api.ChunkedVideoUpload = {
  mode: 'chunked', videoId: 'vid-1', uploadId: 'up-1', partSizeBytes: 4, partCount: 3, maxPartsPerRequest: 32, maxSizeBytes: 1e9,
};

function item() {
  return getUploadsSnapshot().items[0];
}

async function until(status: string) {
  await vi.waitFor(() => expect(item()?.status).toBe(status), { timeout: 5000 });
}

beforeEach(() => {
  // jsdom never loads video metadata: without createObjectURL the duration is left to the conversion
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: undefined });
  resetUploadQueue();
  vi.mocked(api.startChunkedVideoUpload).mockReset().mockResolvedValue(chunk);
  vi.mocked(api.signChunkedUploadParts).mockReset().mockImplementation(async (_v, _u, parts) =>
    parts.map((partNumber) => ({ partNumber, url: `https://bucket/part-${partNumber}` })));
  vi.mocked(api.listChunkedUploadParts).mockReset().mockResolvedValue([]);
  vi.mocked(api.finishChunkedUpload).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.abortChunkedUpload).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.completeUploadedVideo).mockReset().mockResolvedValue(video);
  vi.mocked(api.putUploadPart).mockReset().mockResolvedValue(200);
  vi.mocked(api.uploadPlatformVideo).mockReset().mockResolvedValue(video);
});

afterEach(() => {
  vi.useRealTimers();
  resetUploadQueue();
});

describe('upload queue', () => {
  it('sends the file in parts, joins them and registers the video', async () => {
    const done = vi.fn();
    const stop = onVideoUploaded(done);
    enqueueUploads([{ file: ten(), title: 'Uso de EPI' }], 'course-1');

    await until('done');
    stop();
    const sent = vi.mocked(api.putUploadPart).mock.calls.map(([url, blob]) => [url, (blob as Blob).size]);
    expect(sent).toEqual(expect.arrayContaining([['https://bucket/part-1', 4], ['https://bucket/part-2', 4], ['https://bucket/part-3', 2]]));
    expect(api.finishChunkedUpload).toHaveBeenCalledWith('vid-1', 'up-1');
    expect(api.completeUploadedVideo).toHaveBeenCalledWith('vid-1', 'Uso de EPI', expect.any(Number), 'course-1');
    expect(item().sentBytes).toBe(10);
    expect(done).toHaveBeenCalledTimes(1);
    // nothing left to resume
    expect(localStorage.getItem('sipat.videoUploads.v1')).toBeNull();
  });

  it('sends a part again when the connection drops, without starting the file over', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.putUploadPart)
      .mockResolvedValueOnce(200)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(200);
    enqueueUploads([{ file: ten(), title: 'Epi' }]);

    await vi.waitFor(() => expect(vi.mocked(api.putUploadPart).mock.calls.length).toBeGreaterThanOrEqual(2));
    await vi.advanceTimersByTimeAsync(3000);
    await until('done');
    expect(api.startChunkedVideoUpload).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.putUploadPart).mock.calls).toHaveLength(4);
  });

  it('resumes an upload a reload interrupted from the parts already in the bucket', async () => {
    const file = ten();
    localStorage.setItem('sipat.videoUploads.v1', JSON.stringify({
      [fileKey(file)]: { ...chunk, fileName: file.name, title: 'Epi', sizeBytes: 10, savedAt: Date.now() },
    }));
    vi.mocked(api.listChunkedUploadParts).mockResolvedValue([{ partNumber: 1, sizeBytes: 4 }, { partNumber: 2, sizeBytes: 4 }]);

    enqueueUploads([{ file, title: '' }]);

    await until('done');
    expect(item().resumed).toBe(true);
    expect(api.startChunkedVideoUpload).not.toHaveBeenCalled();
    expect(vi.mocked(api.putUploadPart).mock.calls.map(([url]) => url)).toEqual(['https://bucket/part-3']);
  });

  it('starts over when the bucket already dropped the interrupted upload', async () => {
    const file = ten();
    localStorage.setItem('sipat.videoUploads.v1', JSON.stringify({
      [fileKey(file)]: { ...chunk, uploadId: 'old', fileName: file.name, title: 'Epi', sizeBytes: 10, savedAt: Date.now() },
    }));
    vi.mocked(api.listChunkedUploadParts).mockRejectedValue(new api.ApiError('O envio não foi encontrado.', 404, 'learning.platform_course.upload_not_found'));

    enqueueUploads([{ file, title: 'Epi' }]);

    await until('done');
    expect(api.startChunkedVideoUpload).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.putUploadPart).mock.calls).toHaveLength(3);
  });

  it('waits without internet and goes on by itself when the connection comes back', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let fail = true;
    vi.mocked(api.putUploadPart).mockImplementation(async () => {
      if (fail) throw new TypeError('Failed to fetch');
      return 200;
    });
    enqueueUploads([{ file: ten(), title: 'Epi' }]);
    window.dispatchEvent(new Event('offline'));

    await until('offline');
    fail = false;
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(3000);
    await until('done');
  });

  it('pauses and resumes keeping what was sent', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.mocked(api.putUploadPart).mockImplementationOnce(async () => 200).mockImplementation(async (_url, _blob, options) => {
      await new Promise<void>((resolve, reject) => {
        void gate.then(resolve);
        options.signal?.addEventListener('abort', () => reject(new DOMException('stop', 'AbortError')));
      });
      return 200;
    });
    enqueueUploads([{ file: ten(), title: 'Epi' }]);
    await vi.waitFor(() => expect(vi.mocked(api.putUploadPart).mock.calls.length).toBeGreaterThanOrEqual(2));

    pauseUpload(item().id);
    expect(item().status).toBe('paused');
    vi.mocked(api.listChunkedUploadParts).mockResolvedValue([{ partNumber: 1, sizeBytes: 4 }]);
    release();
    resumeUpload(item().id);

    await until('done');
    expect(api.startChunkedVideoUpload).toHaveBeenCalledTimes(1);
  });

  it('fails with the reason the server gives for the file and does not retry it', async () => {
    vi.mocked(api.completeUploadedVideo).mockRejectedValue(new api.ApiError('O arquivo não corresponde ao formato de vídeo informado.', 400));
    enqueueUploads([{ file: ten(), title: 'Epi' }]);
    await until('failed');
    expect(item().error).toBe('O arquivo não corresponde ao formato de vídeo informado.');
    expect(api.completeUploadedVideo).toHaveBeenCalledTimes(1);
  });

  it('sends in one request where there is no direct upload', async () => {
    vi.mocked(api.startChunkedVideoUpload).mockResolvedValue(null);
    enqueueUploads([{ file: ten(), title: 'Epi' }]);
    await until('done');
    expect(api.uploadPlatformVideo).toHaveBeenCalledWith('Epi', expect.any(Number), expect.any(File), undefined, expect.anything());
  });

  it('does not queue the same file twice nor a file that is not a video', () => {
    const file = ten();
    expect(enqueueUploads([{ file, title: 'Epi' }, { file, title: 'Epi' }])).toBe(1);
    enqueueUploads([{ file: new File(['x'], 'notas.pdf', { type: 'application/pdf' }), title: '' }]);
    expect(getUploadsSnapshot().items.at(-1)?.status).toBe('failed');
  });
});
