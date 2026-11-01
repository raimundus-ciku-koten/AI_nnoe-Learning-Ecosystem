import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  aturUlangPengaturanLokalAI,
  muatPengaturanLokalAI,
  routeAiRequest,
  simpanPengaturanLokalAI,
  streamAiRequest,
} from './aiProviders.js';

function streamedResponse(lines, status = 200) {
  const body = new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(new TextEncoder().encode(line));
      controller.close();
    },
  });
  return new Response(body, { status });
}

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
    const settings = muatPengaturanLokalAI('user-1');
    expect(settings.fallbackModel).not.toBe(settings.model);
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
    expect(aturUlangPengaturanLokalAI('user-1').fallbackModel).toBe('llama3.2:1b');
  });

  it('adds the default local fallback when loading an older saved configuration', () => {
    const storage = new Map([[
      'ainnoe.ai.local.settings.v2:user-1',
      JSON.stringify({
        endpoint: 'http://127.0.0.1:11434',
        model: 'legacy-model',
        timeoutSeconds: 120,
        outputTokens: -1,
      }),
    ]]);
    vi.stubGlobal('localStorage', {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    });

    expect(muatPengaturanLokalAI('user-1')).toMatchObject({
      model: 'legacy-model',
      fallbackModel: 'llama3.2:1b',
    });
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
    expect(() => simpanPengaturanLokalAI('user-1', { ...defaults, fallbackModel: defaults.model }))
      .toThrow('harus berbeda');
    expect(() => simpanPengaturanLokalAI('user-1', { ...defaults, fallbackModel: '../other-model' }))
      .toThrow('Nama model cadangan');
    expect(() => simpanPengaturanLokalAI('user-1', { ...defaults, timeoutSeconds: 0 }))
      .toThrow('15–600 detik');
    expect(() => simpanPengaturanLokalAI('user-1', { ...defaults, outputTokens: 32 }))
      .toThrow('minimal 128 token');
  });

  it('validates AI prompts and stream callbacks before making local requests', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(routeAiRequest({
      uid: 'user-1',
      workflow: 'unknown',
      prompt: 'Pertanyaan.',
    })).rejects.toThrow('Workflow AI tidak dikenal');
    await expect(streamAiRequest({
      uid: 'user-1',
      workflow: 'assistant',
      prompt: ' '.repeat(2),
    })).rejects.toThrow('Prompt AI wajib diisi');
    await expect(streamAiRequest({
      uid: 'user-1',
      workflow: 'assistant',
      prompt: 'x'.repeat(300_001),
    })).rejects.toThrow('melebihi batas 300.000 karakter');
    await expect(streamAiRequest({
      uid: 'user-1',
      workflow: 'assistant',
      prompt: 'Pertanyaan.',
      onChunk: 'bukan fungsi',
    })).rejects.toThrow('Penerima aliran AI tidak valid');
    expect(fetch).not.toHaveBeenCalled();
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
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[0][0])).toContain('127.0.0.1');
    expect(String(fetch.mock.calls[1][0])).toContain('127.0.0.1');
  });

  it('retries failed or invalid Bank Soal output with the configured local backup model', async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce(Response.json({
        model: 'llama3.2:1b',
        message: { content: '{"questions":[{"pertanyaan":"Soal valid"}]}' },
      }));
    vi.stubGlobal('fetch', fetch);
    const result = await routeAiRequest({
      uid: 'user-1',
      workflow: 'questions',
      prompt: 'Susun satu soal.',
      validateResponse: (text) => {
        const parsed = JSON.parse(text);
        if (parsed.questions?.length !== 1 || !parsed.questions[0].pertanyaan) {
          throw new Error('Bentuk soal tidak valid.');
        }
        return parsed.questions[0];
      },
    });

    expect(result).toMatchObject({
      model: 'llama3.2:1b',
      fallbackUsed: true,
      validated: { pertanyaan: 'Soal valid' },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[0][1].body).model).toBe('llama3.2:3b');
    expect(JSON.parse(fetch.mock.calls[1][1].body).model).toBe('llama3.2:1b');
  });

  it('uses the local backup when the primary model returns invalid content', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({
        model: 'llama3.2:3b',
        message: { content: 'not json' },
      }))
      .mockResolvedValueOnce(Response.json({
        model: 'llama3.2:1b',
        message: { content: '{"ok":true}' },
      }));
    vi.stubGlobal('fetch', fetch);
    const result = await routeAiRequest({
      uid: 'user-1',
      workflow: 'questions',
      prompt: 'Susun satu soal.',
      validateResponse: (text) => {
        const parsed = JSON.parse(text);
        if (parsed.ok !== true) throw new Error('Bentuk tidak valid.');
        return parsed;
      },
    });

    expect(result).toMatchObject({ fallbackUsed: true, validated: { ok: true } });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('uses the configured local backup for Modul Siswa and validates its response', async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new Error('primary unavailable'))
      .mockResolvedValueOnce(Response.json({
        model: 'llama3.2:1b',
        message: { content: '{"markdown":"Bagian modul yang lengkap dan terverifikasi."}' },
      }));
    vi.stubGlobal('fetch', fetch);
    const result = await routeAiRequest({
      uid: 'user-1',
      workflow: 'modul_siswa',
      prompt: 'Susun bagian Modul Siswa.',
      validateResponse: (text) => {
        const parsed = JSON.parse(text);
        if (!parsed.markdown) throw new Error('Bagian kosong.');
        return parsed;
      },
    });

    expect(result).toMatchObject({
      provider: 'local',
      model: 'llama3.2:1b',
      fallbackUsed: true,
      validated: { markdown: 'Bagian modul yang lengkap dan terverifikasi.' },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[0][1].body).model).toBe('llama3.2:3b');
    expect(JSON.parse(fetch.mock.calls[1][1].body).model).toBe('llama3.2:1b');
  });

  it('reports both local model failures for every AI workflow', async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new Error('primary unavailable'))
      .mockRejectedValueOnce(new Error('backup unavailable'));
    vi.stubGlobal('fetch', fetch);
    await expect(routeAiRequest({
      uid: 'user-1',
      workflow: 'questions',
      prompt: 'Susun satu soal.',
    })).rejects.toThrow(/Model utama gagal:.*Model cadangan Bank Soal juga gagal/);
    expect(fetch).toHaveBeenCalledTimes(2);

    fetch.mockClear();
    fetch.mockRejectedValueOnce(new Error('primary unavailable'));
    await expect(routeAiRequest({
      uid: 'user-1',
      workflow: 'assistant',
      prompt: 'Balas.',
    })).rejects.toThrow(/Model utama gagal:.*Model cadangan Asisten AI juga gagal/);
    expect(fetch).toHaveBeenCalledTimes(2);

    fetch.mockClear();
    fetch.mockRejectedValueOnce(new Error('primary unavailable'))
      .mockRejectedValueOnce(new Error('backup unavailable'));
    await expect(routeAiRequest({
      uid: 'user-1',
      workflow: 'planning',
      prompt: 'Susun draf.',
    })).rejects.toThrow(/Model utama gagal:.*Model cadangan Perencanaan pembelajaran juga gagal/);
    expect(fetch).toHaveBeenCalledTimes(2);

    fetch.mockClear();
    fetch.mockRejectedValueOnce(new Error('primary unavailable'))
      .mockRejectedValueOnce(new Error('backup unavailable'));
    await expect(routeAiRequest({
      uid: 'user-1',
      workflow: 'modul_siswa',
      prompt: 'Susun bagian modul.',
    })).rejects.toThrow(/Model utama gagal:.*Model cadangan Modul Siswa juga gagal/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not start a fallback request after the user cancels generation', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn(async () => { throw new DOMException('Aborted.', 'AbortError'); });
    vi.stubGlobal('fetch', fetch);

    await expect(routeAiRequest({
      uid: 'user-1',
      workflow: 'questions',
      prompt: 'Susun satu soal.',
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reports a local generation timeout in user-facing language', async () => {
    const fetch = vi.fn(async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });
    vi.stubGlobal('fetch', fetch);
    await expect(routeAiRequest({
      uid: 'user-1',
      workflow: 'planning',
      prompt: 'Susun draf.',
    })).rejects.toThrow('tidak merespons dalam 120 detik');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('streams NDJSON chunks and retries a failed assistant stream with the local fallback', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(streamedResponse([
        '{"model":"llama3.2:3b","message":{"content":"Jawaban parsial"}}\n',
        '{"error":"model berhenti"}\n',
      ]))
      .mockResolvedValueOnce(streamedResponse([
        '{"model":"llama3.2:1b","message":{"content":"Petunjuk"}}\n',
        '{"model":"llama3.2:1b","message":{"content":" lanjutan"}}\n',
      ]));
    const chunks = [];
    const onFallback = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const result = await streamAiRequest({
      uid: 'user-1',
      workflow: 'assistant',
      prompt: 'Bantu saya memahami soal.',
      onChunk: (chunk) => chunks.push(chunk),
      onFallback,
      validateResponse: (text) => {
        if (!text.trim()) throw new Error('Jawaban kosong.');
        return text;
      },
    });

    expect(result).toMatchObject({
      text: 'Petunjuk lanjutan',
      provider: 'local',
      model: 'llama3.2:1b',
      fallbackUsed: true,
      validated: 'Petunjuk lanjutan',
    });
    expect(chunks).toEqual(['Jawaban parsial', 'Petunjuk', ' lanjutan']);
    expect(onFallback).toHaveBeenCalledWith({
      primaryModel: 'llama3.2:3b',
      fallbackModel: 'llama3.2:1b',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[0][1].body).stream).toBe(true);
    expect(String(fetch.mock.calls[0][0])).toBe('http://127.0.0.1:11434/api/chat');
  });

  it('assembles NDJSON split across byte chunks and does not fall back after cancellation', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(streamedResponse([
      '{"model":"local","message":{"content":"Halo',
      ' dunia"}}\n',
    ]));
    vi.stubGlobal('fetch', fetch);
    await expect(streamAiRequest({
      uid: 'user-1',
      workflow: 'assistant',
      prompt: 'Beri sapaan.',
      onChunk: vi.fn(),
    })).resolves.toMatchObject({ text: 'Halo dunia', model: 'local' });

    const controller = new AbortController();
    controller.abort();
    fetch.mockClear();
    fetch.mockRejectedValueOnce(controller.signal.reason);
    const onFallback = vi.fn();
    await expect(streamAiRequest({
      uid: 'user-1',
      workflow: 'assistant',
      prompt: 'Beri sapaan.',
      signal: controller.signal,
      onFallback,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).toHaveBeenCalledOnce();
    expect(onFallback).not.toHaveBeenCalled();
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
