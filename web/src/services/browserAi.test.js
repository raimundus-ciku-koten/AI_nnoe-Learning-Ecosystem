import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { completeLocalAi } = vi.hoisted(() => ({
  completeLocalAi: vi.fn(),
}));

vi.mock('./localAi.js', () => ({
  completeLocalAi,
  getRecommendedLocalAiModel: (deviceMemory = globalThis.navigator?.deviceMemory) => (
    Number.isFinite(deviceMemory) && deviceMemory <= 4 ? 'local-qwen-small' : 'local-qwen'
  ),
  LOCAL_AI_MODELS: {
    'local-qwen': { name: 'Qwen lokal' },
    'local-qwen-small': { name: 'Qwen ringan lokal' },
  },
}));

import {
  askBrowserAssistant,
  clearBrowserAiSession,
  EXTERNAL_AI_PROVIDERS_ENABLED,
  generateBrowserPlanning,
  generateBrowserQuestion,
  getBrowserAiConnections,
  setBrowserAiPreference,
  testAndSaveBrowserKey,
} from './browserAi.js';

describe('browser AI routing and key handling', () => {
  let storage;

  beforeEach(() => {
    vi.clearAllMocks();
    clearBrowserAiSession();
    storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key) => storage.get(key) || null),
      setItem: vi.fn((key, value) => storage.set(key, value)),
      removeItem: vi.fn((key) => storage.delete(key)),
    });
    vi.stubGlobal('fetch', vi.fn());
    completeLocalAi.mockResolvedValue({
      answer: 'Jawaban lokal',
      modelName: 'Qwen lokal',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses local Qwen by default for every workflow', () => {
    expect(EXTERNAL_AI_PROVIDERS_ENABLED).toBe(true);
    expect(getBrowserAiConnections('teacher-1')).toMatchObject({
      preferences: {
        planning: 'local-qwen',
        assistant: 'local-qwen',
        questions: 'local-qwen',
      },
      personalKeysEnabled: true,
    });
    expect(Object.values(getBrowserAiConnections('teacher-1').providers)
      .every((provider) => !provider.available)).toBe(true);
  });

  it('recommends Qwen 1.5B for low-memory devices without overriding explicit preferences', () => {
    vi.stubGlobal('navigator', { deviceMemory: 4 });
    expect(getBrowserAiConnections('teacher-low-memory').preferences).toEqual({
      planning: 'local-qwen-small',
      assistant: 'local-qwen-small',
      questions: 'local-qwen-small',
    });
    setBrowserAiPreference('teacher-low-memory', 'assistant', 'local-qwen');
    expect(getBrowserAiConnections('teacher-low-memory').preferences.assistant).toBe('local-qwen');
  });

  it('routes assistant prompts to the selected local model without network access', async () => {
    await expect(askBrowserAssistant('teacher-1', [
      { role: 'user', text: 'Bantu saya merancang pembelajaran.' },
    ])).resolves.toMatchObject({
      answer: 'Jawaban lokal',
      penyedia: 'local-qwen',
      modelName: 'Qwen lokal',
    });
    expect(completeLocalAi).toHaveBeenCalledWith('local-qwen', [
      { role: 'user', content: 'Bantu saya merancang pembelajaran.' },
    ], expect.objectContaining({ maxTokens: 700 }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns generated question JSON in the shape used by the question bank', async () => {
    completeLocalAi.mockResolvedValueOnce({
      answer: JSON.stringify({
        pertanyaan: 'Berapakah 2 + 2?',
        pilihan: ['3', '4'],
        jawaban: '4',
        pembahasan: 'Penjumlahan dasar.',
      }),
      modelName: 'Qwen lokal',
    });
    await expect(generateBrowserQuestion('teacher-1', {
      mapel: 'Matematika',
      kelas: 'IV',
      topik: 'Penjumlahan',
      jenis: 'pilihan_ganda',
    })).resolves.toMatchObject({
      payload: {
        questions: [{
          pertanyaan: 'Berapakah 2 + 2?',
          pilihan: ['3', '4'],
          jawaban: '4',
          pembahasan: 'Penjumlahan dasar.',
        }],
      },
      penyedia: 'local-qwen',
    });
  });

  it('rejects malformed generated question output', async () => {
    completeLocalAi.mockResolvedValueOnce({ answer: 'bukan JSON', modelName: 'Qwen lokal' });
    await expect(generateBrowserQuestion('teacher-1', {
      mapel: 'Matematika',
      kelas: 'IV',
      topik: 'Penjumlahan',
      jenis: 'uraian',
    })).rejects.toThrow('Draf AI tidak mengikuti format soal');
  });

  it('routes explicit AI_eksternal question generation to the configured API provider', async () => {
    const key = 'gsk_test_key_1234567890';
    await expect(testAndSaveBrowserKey('teacher-1', 'groq', key))
      .resolves.toMatchObject({ provider: 'groq', storage: 'memory-only' });
    expect(fetch).not.toHaveBeenCalled();
    expect(setBrowserAiPreference('teacher-1', 'questions', 'groq').questions).toBe('groq');
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              pertanyaan: 'Berapakah 2 + 2?',
              pilihan: ['3', '4'],
              jawaban: '4',
              pembahasan: 'Penjumlahan dasar.',
            }),
          },
        }],
      }),
    });

    await expect(generateBrowserQuestion('teacher-1', {
      mapel: 'Matematika',
      kelas: 'IV',
      topik: 'Penjumlahan',
      jenis: 'pilihan_ganda',
    }, { mode: 'ai-eksternal', externalAcknowledged: true })).resolves.toMatchObject({
      penyedia: 'groq',
      payload: { questions: [{ jawaban: '4' }] },
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: `Bearer ${key}` }),
      }),
    );
    expect([...storage.values()].join(' ')).not.toContain(key);
  });

  it('requires an acknowledgement before sending question prompts externally', async () => {
    await testAndSaveBrowserKey('teacher-1', 'groq', 'gsk_test_key_1234567890');
    setBrowserAiPreference('teacher-1', 'questions', 'groq');

    await expect(generateBrowserQuestion('teacher-1', {
      mapel: 'Matematika',
      kelas: 'IV',
      topik: 'Penjumlahan',
      jenis: 'uraian',
    }, { mode: 'ai-eksternal' })).rejects.toThrow('Konfirmasi penggunaan AI eksternal');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps chat on local AI even if an external mode is requested', async () => {
    await testAndSaveBrowserKey('teacher-1', 'groq', 'gsk_test_key_1234567890');
    expect(() => setBrowserAiPreference('teacher-1', 'assistant', 'groq'))
      .toThrow('Chat hanya menggunakan model AI_nnoe lokal');

    await expect(askBrowserAssistant('teacher-1', [
      { role: 'user', text: 'Tolong jelaskan.' },
    ], { mode: 'ai-eksternal', externalAcknowledged: true })).resolves.toMatchObject({
      penyedia: 'local-qwen',
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(completeLocalAi).toHaveBeenCalledWith('local-qwen', expect.any(Array), expect.any(Object));
  });

  it('rejects selecting an API provider without a session key', () => {
    expect(() => setBrowserAiPreference('teacher-1', 'questions', 'gemini'))
      .toThrow('Tambahkan API key provider terlebih dahulu');
  });

  it('clears session keys and restores local preferences when the user logs out', async () => {
    await testAndSaveBrowserKey('teacher-1', 'gemini', 'AIza_test_key_123456789');
    setBrowserAiPreference('teacher-1', 'questions', 'gemini');
    clearBrowserAiSession('teacher-1');

    expect(getBrowserAiConnections('teacher-1').preferences.questions).toBe('local-qwen');
    expect(getBrowserAiConnections('teacher-1').providers.gemini.available).toBe(false);
    await expect(askBrowserAssistant('teacher-1', [
      { role: 'user', text: 'Masih ada key?' },
    ])).resolves.toMatchObject({ penyedia: 'local-qwen' });
  });

  it('routes planning requests according to the account preference', async () => {
    await expect(generateBrowserPlanning({
      uid: 'teacher-1',
      paketId: 'package-1',
      jenis: 'atp',
      noUnit: 2,
    })).resolves.toMatchObject({
      jenis: 'atp',
      paketId: 'package-1',
      penyedia: 'local-qwen',
    });
    expect(completeLocalAi).toHaveBeenCalledWith(
      'local-qwen',
      expect.arrayContaining([expect.objectContaining({ role: 'user' })]),
      expect.objectContaining({ maxTokens: 900 }),
    );
  });

  it('passes a grade-specific planning prompt to the selected local AI with a safe token limit', async () => {
    const prompt = 'Susun draf ATP khusus kelas III berdasarkan CP yang diimpor.';
    await expect(generateBrowserPlanning({
      uid: 'teacher-1',
      paketId: 'package-1',
      jenis: 'atp',
      prompt,
      maxTokens: 2400,
    })).resolves.toMatchObject({
      jenis: 'atp',
      penyedia: 'local-qwen',
    });
    expect(completeLocalAi).toHaveBeenCalledWith(
      'local-qwen',
      [{ role: 'user', content: prompt }],
      expect.objectContaining({ maxTokens: 2400 }),
    );
  });

  it('requires explicit transfer consent for external planning generation', async () => {
    const key = 'gsk_planning_test_key_1234567890';
    await testAndSaveBrowserKey('teacher-1', 'groq', key);
    setBrowserAiPreference('teacher-1', 'planning', 'groq');
    await expect(generateBrowserPlanning({
      uid: 'teacher-1',
      paketId: 'package-1',
      jenis: 'atp',
      prompt: 'Susun usulan ATP untuk kelas III.',
      mode: 'ai-eksternal',
    })).rejects.toThrow('Konfirmasi penggunaan AI eksternal');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects an invalid planning prompt before invoking AI', async () => {
    await expect(generateBrowserPlanning({
      uid: 'teacher-1',
      paketId: 'package-1',
      jenis: 'atp',
      prompt: ' ',
    })).rejects.toThrow('Prompt perencanaan kosong');
    expect(completeLocalAi).not.toHaveBeenCalled();
  });
});
