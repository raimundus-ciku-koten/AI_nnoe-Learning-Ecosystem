import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const webLlm = vi.hoisted(() => ({
  createEngine: vi.fn(),
  chatCreate: vi.fn(),
}));

vi.mock('@mlc-ai/web-llm', () => ({
  CreateMLCEngine: webLlm.createEngine,
}));

import {
  completeLocalAi,
  getLocalAiStatus,
  prepareLocalAiModel,
  subscribeLocalAiProgress,
  unloadLocalAiModel,
} from './localAi.js';

async function* tokenStream(tokens) {
  for (const content of tokens) {
    yield { choices: [{ delta: { content } }] };
  }
}

const engine = {
  reload: vi.fn(),
  unload: vi.fn(),
  chat: { completions: { create: webLlm.chatCreate } },
};

describe('local WebLLM service', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await unloadLocalAiModel();
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      gpu: { requestAdapter: vi.fn().mockResolvedValue({}) },
    });
    webLlm.createEngine.mockImplementation(async (_model, options) => {
      options.initProgressCallback({ text: 'Unduh model', progress: 0.5 });
      return engine;
    });
    engine.reload.mockResolvedValue(undefined);
    engine.unload.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await unloadLocalAiModel();
    vi.unstubAllGlobals();
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
  });

  it('reports loading progress and shares concurrent requests for one model', async () => {
    const events = [];
    const unsubscribe = subscribeLocalAiProgress((event) => events.push(event));
    const [first, second] = await Promise.all([
      prepareLocalAiModel('local-qwen'),
      prepareLocalAiModel('local-qwen'),
    ]);
    unsubscribe();

    expect(first).toMatchObject({ model: 'local-qwen' });
    expect(second).toMatchObject({ model: 'local-qwen' });
    expect(webLlm.createEngine).toHaveBeenCalledTimes(1);
    expect(events.some((event) => event.progress === 0.5)).toBe(true);
    expect(events.at(-1)).toMatchObject({ progress: 1, model: 'local-qwen' });
    expect(getLocalAiStatus()).toMatchObject({ ready: true, loading: false, model: 'local-qwen' });
  });

  it('does not start a model download during generation without explicit preparation', async () => {
    await expect(completeLocalAi('local-qwen', [
      { role: 'user', content: 'Buat draf.' },
    ])).rejects.toThrow('Pengunduhan tidak dimulai otomatis');
    expect(webLlm.createEngine).not.toHaveBeenCalled();
  });

  it('switches the loaded model and streams a local completion', async () => {
    await prepareLocalAiModel('local-qwen');
    await prepareLocalAiModel('local-llama');
    webLlm.chatCreate.mockResolvedValueOnce(tokenStream(['Draf', ' lokal']));
    const tokens = [];

    await expect(completeLocalAi('local-llama', [
      { role: 'user', content: 'Buat draf.' },
    ], { onToken: (token) => tokens.push(token) })).resolves.toMatchObject({
      answer: 'Draf lokal',
      model: 'local-llama',
    });
    expect(engine.reload).toHaveBeenCalledWith(
      'Llama-3.2-3B-Instruct-q4f16_1-MLC',
      expect.any(Object),
    );
    expect(tokens).toEqual(['Draf', ' lokal']);
  });

  it('honors cancellation before invoking model generation', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(completeLocalAi('local-qwen', [
      { role: 'user', content: 'Batal.' },
    ], { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(webLlm.chatCreate).not.toHaveBeenCalled();
  });

  it('stops streaming when a request is cancelled', async () => {
    await prepareLocalAiModel('local-qwen');
    const controller = new AbortController();
    webLlm.chatCreate.mockResolvedValueOnce(tokenStream(['Bagian satu', 'Bagian dua']));

    await expect(completeLocalAi('local-qwen', [
      { role: 'user', content: 'Buat jawaban.' },
    ], {
      signal: controller.signal,
      onToken: () => controller.abort(),
    })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
