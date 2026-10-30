import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  askBrowserAssistant,
  clearBrowserAiSession,
  EXTERNAL_AI_PROVIDERS_ENABLED,
  getBrowserAiConnections,
  generateBrowserPlanning,
  generateBrowserQuestion,
  setBrowserAiPreference,
  testAndSaveBrowserKey,
} from './browserAi.js';

const question = {
  pertanyaan: 'Berapakah hasil 2 + 2?',
  pilihan: ['1', '2', '3', '4'],
  jawaban: '4',
  pembahasan: 'Dua ditambah dua sama dengan empat.',
};

function providerList(provider) {
  if (provider === 'gemini') {
    return Response.json({
      models: [{
        name: 'models/gemini-2.5-flash',
        supportedGenerationMethods: ['generateContent'],
      }],
    });
  }
  const model = provider === 'deepseek' ? 'deepseek-chat' : 'openai/gpt-oss-20b';
  return Response.json({ data: [{ id: model }] });
}

function providerQuestion(provider, jenis = 'pilihan_ganda') {
  const generated = jenis === 'uraian'
    ? { ...question, pilihan: [] }
    : question;
  const content = JSON.stringify({ questions: [generated] });
  return provider === 'gemini'
    ? Response.json({ candidates: [{ content: { parts: [{ text: content }] } }] })
    : Response.json({ choices: [{ message: { content } }] });
}

describe('BYOK question generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearBrowserAiSession();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('enables supported external providers without activating keys by default', () => {
    expect(EXTERNAL_AI_PROVIDERS_ENABLED).toBe(true);
    expect(getBrowserAiConnections('teacher-1').personalKeysEnabled).toBe(true);
    expect(Object.values(getBrowserAiConnections('teacher-1').providers)
      .every((provider) => !provider.available)).toBe(true);
  });

  it('validates keys via provider model-list APIs and retains them only in the active session', async () => {
    fetch.mockImplementation(async (url) => providerList(
      String(url).includes('generativelanguage') ? 'gemini' :
        String(url).includes('deepseek') ? 'deepseek' : 'groq',
    ));
    await testAndSaveBrowserKey('teacher-1', 'gemini', 'gemini-test-key');
    await testAndSaveBrowserKey('teacher-1', 'deepseek', 'deepseek-test-key');
    await testAndSaveBrowserKey('teacher-1', 'groq', 'groq-test-key');
    const connections = getBrowserAiConnections('teacher-1');
    expect(Object.values(connections.providers).every((provider) => provider.personal && provider.available)).toBe(true);
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=100',
      'https://api.deepseek.com/models',
      'https://api.groq.com/openai/v1/models',
    ]);
    expect(fetch.mock.calls[0][1].headers['x-goog-api-key']).toBe('gemini-test-key');
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer deepseek-test-key');
    expect(fetch.mock.calls[2][1].headers.Authorization).toBe('Bearer groq-test-key');
    expect(fetch.mock.calls.some(([url]) => String(url).includes('test-key'))).toBe(false);
  });

  it('generates and validates a structured question using Gemini without sending the key in the URL', async () => {
    fetch
      .mockResolvedValueOnce(providerList('gemini'))
      .mockResolvedValueOnce(providerQuestion('gemini'));
    await testAndSaveBrowserKey('teacher-1', 'gemini', 'gemini-test-key');
    await expect(generateBrowserQuestion('teacher-1', {
      mapel: 'Matematika',
      kelas: 'X',
      topik: 'Persamaan',
      jenis: 'pilihan_ganda',
    })).resolves.toEqual({ penyedia: 'gemini', payload: { questions: [question] } });
    const [url, options] = fetch.mock.calls[1];
    expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(String(url)).not.toContain('gemini-test-key');
    expect(options.headers['x-goog-api-key']).toBe('gemini-test-key');
    expect(JSON.parse(options.body).generationConfig.responseMimeType).toBe('application/json');
  });

  it.each(['deepseek', 'groq'])('uses the %s chat-completion endpoint with JSON mode', async (provider) => {
    fetch
      .mockResolvedValueOnce(providerList(provider))
      .mockResolvedValueOnce(providerQuestion(provider, 'uraian'));
    await testAndSaveBrowserKey('teacher-1', provider, `${provider}-key`);
    const result = await generateBrowserQuestion('teacher-1', {
      mapel: 'Matematika',
      kelas: 'X',
      topik: 'Penjumlahan',
      jenis: 'uraian',
    });
    expect(result.penyedia).toBe(provider);
    expect(fetch.mock.calls[1][1].body).toContain('"response_format":{"type":"json_object"}');
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe(`Bearer ${provider}-key`);
  });

  it('does not retain an invalid key and refuses external requests without a configured key', async () => {
    fetch.mockResolvedValueOnce(new Response('{}', { status: 403 }));
    await expect(testAndSaveBrowserKey('teacher-1', 'gemini', 'invalid-key')).rejects.toThrow('HTTP 403');
    expect(getBrowserAiConnections('teacher-1').providers.gemini.available).toBe(false);
    await expect(generateBrowserQuestion('teacher-1', {
      mapel: 'Matematika', kelas: 'X', topik: 'Persamaan', jenis: 'uraian',
    })).rejects.toThrow('Tambahkan dan aktifkan kunci');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed or inconsistent AI output before it can be saved', async () => {
    fetch
      .mockResolvedValueOnce(providerList('gemini'))
      .mockResolvedValueOnce(Response.json({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          questions: [{ ...question, jawaban: '5' }],
        }) }] } }],
      }));
    await testAndSaveBrowserKey('teacher-1', 'gemini', 'valid-key');
    await expect(generateBrowserQuestion('teacher-1', {
      mapel: 'Matematika', kelas: 'X', topik: 'Penjumlahan', jenis: 'pilihan_ganda',
    })).rejects.toThrow('pilihan atau kunci jawaban');
  });

  it('keeps planning and assistant requests disabled and clears keys on logout', async () => {
    await expect(askBrowserAssistant('teacher-1', [])).rejects.toThrow('belum tersedia');
    await expect(generateBrowserPlanning({
      uid: 'teacher-1', paketId: 'package-1', jenis: 'atp',
      sinyal: new AbortController().signal,
    })).rejects.toThrow('belum tersedia');
    expect(fetch).not.toHaveBeenCalled();

    fetch.mockResolvedValueOnce(providerList('gemini'));
    await testAndSaveBrowserKey('teacher-1', 'gemini', 'valid-key');
    setBrowserAiPreference('teacher-1', 'questions', 'gemini');
    clearBrowserAiSession('teacher-1');
    expect(getBrowserAiConnections('teacher-1').providers.gemini.available).toBe(false);
    expect(() => setBrowserAiPreference('teacher-1', 'assistant', 'gemini')).toThrow('tidak valid');
  });
});
