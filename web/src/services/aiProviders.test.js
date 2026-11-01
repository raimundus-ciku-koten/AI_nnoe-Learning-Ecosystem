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
      workflow: 'assistant',
      prompt: 'Balas dengan satu kata.',
    });
    expect(result).toMatchObject({ provider: 'local', model: 'local-test', text: 'Siap.' });
    expect(String(fetch.mock.calls[0][0])).toBe('http://127.0.0.1:11434/api/chat');
  });

  it('uses locally saved model, output-token and timeout settings without cloud fallback', async () => {
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
    const saved = simpanPengaturanLokalAI({
      endpoint: 'http://localhost:11434',
      model: 'ainnoe-qwen',
      timeoutSeconds: 240,
      outputTokens: -1,
    });

    await expect(routeAiRequest({
      workflow: 'planning',
      prompt: 'Draf lokal.',
      sensitivity: 'sensitive',
    })).resolves.toMatchObject({ provider: 'local', model: 'ainnoe-qwen', text: 'Siap.' });
    expect(saved.timeoutSeconds).toBe(240);
    expect(muatPengaturanLokalAI()).toEqual(saved);
    expect(String(fetch.mock.calls[0][0])).toBe('http://localhost:11434/api/chat');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(aturUlangPengaturanLokalAI().model).toBe('llama3.2');
  });

  it('rejects non-local endpoints, unsafe model names, and unbounded timeouts', () => {
    const storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    });
    const defaults = muatPengaturanLokalAI();
    expect(() => simpanPengaturanLokalAI({ ...defaults, endpoint: 'https://example.com' }))
      .toThrow('localhost');
    expect(() => simpanPengaturanLokalAI({ ...defaults, model: '../other-model' }))
      .toThrow('Nama model');
    expect(() => simpanPengaturanLokalAI({ ...defaults, timeoutSeconds: 0 }))
      .toThrow('15–600 detik');
    expect(() => simpanPengaturanLokalAI({ ...defaults, outputTokens: 32 }))
      .toThrow('minimal 128 token');
  });

  it('never falls back to cloud for sensitive content', async () => {
    const fetch = vi.fn(async () => { throw new Error('local runtime unavailable'); });
    vi.stubGlobal('fetch', fetch);
    await expect(routeAiRequest({
      workflow: 'assistant',
      prompt: 'Data internal',
      sensitivity: 'sensitive',
      allowCloud: true,
    })).rejects.toThrow('local runtime unavailable');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toContain('127.0.0.1');
  });

  it('requires explicit consent before selecting cloud', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(routeAiRequest({
      workflow: 'assistant',
      prompt: 'General prompt',
      preference: 'cloud',
      sensitivity: 'non_sensitive',
      allowCloud: false,
    })).rejects.toThrow('persetujuan cloud');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects cloud use for sensitive content even with user consent', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(routeAiRequest({
      workflow: 'assistant',
      prompt: 'Student data',
      preference: 'cloud',
      sensitivity: 'sensitive',
      allowCloud: true,
    })).rejects.toThrow('Data sensitif');
    expect(fetch).not.toHaveBeenCalled();
  });
});
