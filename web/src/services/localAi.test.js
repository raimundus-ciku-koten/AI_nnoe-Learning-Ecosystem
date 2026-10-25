import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const workerState = vi.hoisted(() => ({
  instance: null,
  requests: [],
  tokens: ['Draf', ' lokal'],
  terminate: vi.fn(),
  failType: '',
  hangType: '',
}));

import {
  cancelLocalAiPreparation,
  completeLocalAi,
  getLocalAiStatus,
  getRecommendedLocalAiModel,
  LOCAL_AI_MODELS,
  prepareLocalAiModel,
  subscribeLocalAiProgress,
  unloadLocalAiModel,
} from './localAi.js';

describe('local WebLLM worker service', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    workerState.instance = null;
    workerState.requests = [];
    workerState.tokens = ['Draf', ' lokal'];
    workerState.failType = '';
    workerState.hangType = '';
    await unloadLocalAiModel();
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      gpu: { requestAdapter: vi.fn().mockResolvedValue({}) },
    });
    vi.stubGlobal('Worker', class {
      constructor(url, options) {
        this.url = url;
        this.options = options;
        workerState.instance = this;
      }

      postMessage(message) {
        workerState.requests.push(message);
        if (message.type === 'interrupt') return;
        if (workerState.hangType === message.type) return;
        queueMicrotask(() => {
          if (workerState.failType === message.type) {
            workerState.instance.onmessage({
              data: { id: message.id, type: 'error', message: 'Worker test gagal.' },
            });
            workerState.failType = '';
            return;
          }
          if (message.type === 'initialize') {
            workerState.instance.onmessage({
              data: {
                id: message.id,
                type: 'progress',
                progress: { status: 'Unduh model', progress: 0.5, model: message.payload.model },
              },
            });
          }
          if (message.type === 'generate') {
            for (const token of workerState.tokens) {
              workerState.instance.onmessage({
                data: { id: message.id, type: 'token', token },
              });
            }
          }
          workerState.instance.onmessage({ data: { id: message.id, type: 'complete' } });
        });
      }

      terminate() {
        workerState.terminate();
      }
    });
  });

  afterEach(async () => {
    await unloadLocalAiModel();
    vi.unstubAllGlobals();
  });

  it('uses the supported Qwen 2.5 7B model by default and retains a smaller option', () => {
    expect(LOCAL_AI_MODELS['local-qwen']).toMatchObject({
      id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',
      name: 'Qwen 2.5 7B Instruct · 4-bit',
      downloadSize: 'sekitar 4,5 GB',
      estimateVramMb: 5107,
    });
    expect(LOCAL_AI_MODELS['local-qwen-small']).toMatchObject({
      id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    });
  });

  it('recommends the smaller model only when the browser reports low system memory', () => {
    expect(getRecommendedLocalAiModel(4)).toBe('local-qwen-small');
    expect(getRecommendedLocalAiModel(2)).toBe('local-qwen-small');
    expect(getRecommendedLocalAiModel(8)).toBe('local-qwen');
    expect(getRecommendedLocalAiModel(undefined)).toBe('local-qwen');
  });

  it('requires a secure browser context and WebGPU', async () => {
    vi.stubGlobal('isSecureContext', false);
    await expect(prepareLocalAiModel('local-qwen'))
      .rejects.toThrow('memerlukan koneksi aman');
    expect(getLocalAiStatus()).toMatchObject({ ready: false, loading: false });

    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {});
    await expect(prepareLocalAiModel('local-qwen'))
      .rejects.toThrow('belum menyediakan WebGPU');
    expect(getLocalAiStatus()).toMatchObject({ ready: false, loading: false });
    expect(workerState.instance).toBeNull();
  });

  it('reports progress, shares concurrent preparation, and creates one module worker', async () => {
    const events = [];
    const unsubscribe = subscribeLocalAiProgress((event) => events.push(event));
    const [first, second] = await Promise.all([
      prepareLocalAiModel(),
      prepareLocalAiModel('local-qwen'),
    ]);
    unsubscribe();

    expect(first).toMatchObject({ model: 'local-qwen' });
    expect(second).toMatchObject({ model: 'local-qwen' });
    expect(workerState.instance.options).toEqual({ type: 'module' });
    expect(workerState.requests.filter((request) => request.type === 'initialize')).toHaveLength(1);
    expect(workerState.requests[0].payload.id).toBe('Qwen2.5-7B-Instruct-q4f16_1-MLC');
    expect(events.some((event) => event.progress === 0.5)).toBe(true);
    expect(events.at(-1)).toMatchObject({ progress: 1, model: 'local-qwen' });
    expect(getLocalAiStatus()).toMatchObject({ ready: true, loading: false, model: 'local-qwen' });
  });

  it('does not start a model download during generation without explicit preparation', async () => {
    await expect(completeLocalAi('local-qwen', [
      { role: 'user', content: 'Buat draf.' },
    ])).rejects.toThrow('Pengunduhan tidak dimulai otomatis');
    expect(workerState.instance).toBeNull();
  });

  it('switches the worker model and streams local completion tokens', async () => {
    await prepareLocalAiModel('local-qwen');
    await prepareLocalAiModel('local-qwen-small');
    const tokens = [];

    await expect(completeLocalAi('local-qwen-small', [
      { role: 'user', content: 'Buat draf.' },
    ], { onToken: (token) => tokens.push(token) })).resolves.toMatchObject({
      answer: 'Draf lokal',
      model: 'local-qwen-small',
    });
    const initializeRequests = workerState.requests.filter((request) => request.type === 'initialize');
    expect(initializeRequests).toHaveLength(2);
    expect(initializeRequests[1].payload.id).toBe('Qwen2.5-1.5B-Instruct-q4f16_1-MLC');
    const generation = workerState.requests.find((request) => request.type === 'generate');
    expect(generation.payload.messages[0].content).toContain('catatan rilis');
    expect(tokens).toEqual(['Draf', ' lokal']);
  });

  it('does not create a worker for a request cancelled before generation', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(completeLocalAi('local-qwen', [
      { role: 'user', content: 'Batal.' },
    ], { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(workerState.instance).toBeNull();
  });

  it('interrupts worker generation when a request is cancelled while streaming', async () => {
    await prepareLocalAiModel('local-qwen');
    const controller = new AbortController();

    await expect(completeLocalAi('local-qwen', [
      { role: 'user', content: 'Buat jawaban.' },
    ], {
      signal: controller.signal,
      onToken: () => controller.abort(),
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(workerState.requests.some((request) => request.type === 'interrupt')).toBe(true);
  });

  it('surfaces worker errors and terminates the worker on unload', async () => {
    workerState.failType = 'initialize';
    await expect(prepareLocalAiModel('local-qwen')).rejects.toThrow('Worker test gagal.');
    expect(getLocalAiStatus()).toMatchObject({ ready: false, loading: false });

    await prepareLocalAiModel('local-qwen');
    await unloadLocalAiModel();
    expect(workerState.terminate).toHaveBeenCalledTimes(1);
    expect(getLocalAiStatus()).toMatchObject({ ready: false, model: '', loading: false });
  });

  it('cancels model preparation, rejects the pending request, and terminates the worker', async () => {
    workerState.hangType = 'initialize';
    const pending = prepareLocalAiModel('local-qwen');
    await Promise.resolve();
    await Promise.resolve();

    expect(cancelLocalAiPreparation()).toBe(true);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(workerState.terminate).toHaveBeenCalledTimes(1);
    expect(getLocalAiStatus()).toMatchObject({ ready: false, model: '', loading: false });
    expect(cancelLocalAiPreparation()).toBe(false);
  });

  it('does not create a worker or begin downloading if cancelled during GPU preflight', async () => {
    let resolveAdapter;
    vi.stubGlobal('navigator', {
      gpu: {
        requestAdapter: vi.fn(() => new Promise((resolve) => { resolveAdapter = resolve; })),
      },
    });
    const pending = prepareLocalAiModel('local-qwen');
    await Promise.resolve();
    await Promise.resolve();

    expect(cancelLocalAiPreparation()).toBe(true);
    resolveAdapter({});
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(workerState.instance).toBeNull();
    expect(workerState.requests).toHaveLength(0);
    expect(getLocalAiStatus()).toMatchObject({ ready: false, loading: false });
  });

  it('rejects pending work and resets model state when the worker crashes', async () => {
    workerState.hangType = 'initialize';
    const pending = prepareLocalAiModel('local-qwen');
    await Promise.resolve();
    await Promise.resolve();

    workerState.instance.onerror({
      message: 'WebGPU worker error.',
      preventDefault: vi.fn(),
    });

    await expect(pending).rejects.toThrow('WebGPU worker error.');
    expect(getLocalAiStatus()).toMatchObject({ ready: false, model: '', loading: false });
    expect(workerState.terminate).toHaveBeenCalledTimes(1);
  });
});
