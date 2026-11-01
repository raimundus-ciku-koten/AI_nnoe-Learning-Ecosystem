import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  aturUlangPengaturanLokalAI,
  muatPengaturanLokalAI,
  routeAiRequest,
  simpanPengaturanLokalAI,
} from './aiProviders.js';

describe('privacy-aware AI providers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the localhost provider by default and labels it AI_nnoe', async () => {
    const fetch = vi.fn(async () => Response.json({
      model: 'local-test',
      message: { content: 'Siap.' },
    }));
    vi.stubGlobal('fetch', fetch);
    const result = await routeAiRequest({
      uid: 'user-1',
      workflow: 'assistant',
      prompt: 'Balas dengan satu kata.',
    });
    expect(result).toMatchObject({ provider: 'local', model: 'local-test', text: 'Siap.' });
    expect(String(fetch.mock.calls[0][0])).toBe('http://127.0.0.1:11434/api/chat');
    expect(JSON.parse(fetch.mock.calls[0][1].body).model).toBe('llama3.2:3b');
  });

  it('uses account-scoped model, output-token and timeout settings', async () => {
    const storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    });
    const fetch = vi.fn(async (_url, options) => {
      expect(JSON.parse(options.body)).toMatchObject({
        model: 'ainnoe-qwen',
        options: { num_predict: -1 },
        metadata: { product: 'AI_nnoe' },
      });
      return Response.json({ model: 'ainnoe-qwen', message: { content: 'Siap.' } });
    });
    vi.stubGlobal('fetch', fetch);
    const saved = simpanPengaturanLokalAI('user-1', {
      endpoint: 'http://localhost:11434',
      model: 'ainnoe-qwen',
      timeoutSeconds: 240,
      outputTokens: -1,
    });

    await expect(routeAiRequest({
      uid: 'user-1',
      workflow: 'planning',
      prompt: 'Draf lokal.',
    })).resolves.toMatchObject({ provider: 'local', model: 'ainnoe-qwen', text: 'Siap.' });
    expect(saved.timeoutSeconds).toBe(240);
    expect(muatPengaturanLokalAI('user-1')).toEqual(saved);
    expect(String(fetch.mock.calls[0][0])).toBe('http://localhost:11434/api/chat');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(aturUlangPengaturanLokalAI('user-1').model).toBe('llama3.2:3b');
  });

  it('rejects non-local endpoints, unsafe model names, and unbounded timeouts', () => {
    const storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    });
    const defaults = muatPengaturanLokalAI('user-1');
    expect(() => simpanPengaturanLokalAI('user-1', { ...defaults, endpoint: 'https://example.com' }))
      .toThrow('localhost');
    expect(() => simpanPengaturanLokalAI('user-1', { ...defaults, model: '../other-model' }))
      .toThrow('Nama model');
    expect(() => simpanPengaturanLokalAI('user-1', { ...defaults, timeoutSeconds: 0 }))
      .toThrow('15–600 detik');
    expect(() => simpanPengaturanLokalAI('user-1', { ...defaults, outputTokens: 32 }))
      .toThrow('minimal 128 token');
  });

  it('routes only to the local model even if a legacy caller requests cloud', async () => {
    const storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    });
    const fetch = vi.fn(async () => { throw new Error('connection refused'); });
    vi.stubGlobal('fetch', fetch);
    await expect(routeAiRequest({
      uid: 'user-1',
      workflow: 'assistant',
      prompt: 'Pertanyaan umum',
      preference: 'cloud',
      allowCloud: true,
    })).rejects.toThrow('Pastikan Ollama berjalan');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toContain('127.0.0.1');
  });

  it('reports a local generation timeout in user-facing language', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    }));
    await expect(routeAiRequest({
      uid: 'user-1',
      workflow: 'planning',
      prompt: 'Susun draf.',
    })).rejects.toThrow('tidak merespons dalam 120 detik');
  });

  it('keeps local settings isolated between signed-in accounts', () => {
    const storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    });
    const first = muatPengaturanLokalAI('user-1');
    const second = muatPengaturanLokalAI('user-2');
    simpanPengaturanLokalAI('user-1', { ...first, model: 'user-one-model' });
    expect(muatPengaturanLokalAI('user-1').model).toBe('user-one-model');
    expect(muatPengaturanLokalAI('user-2')).toEqual(second);
    expect(() => muatPengaturanLokalAI('')).toThrow('Sesi login tidak tersedia');
  });
});
