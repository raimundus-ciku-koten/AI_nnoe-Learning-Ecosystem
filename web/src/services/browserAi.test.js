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

describe('browser AI no-billing boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearBrowserAiSession();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('keeps external AI providers disabled', () => {
    expect(EXTERNAL_AI_PROVIDERS_ENABLED).toBe(false);
  });

  it('rejects provider key activation before validation or network access', async () => {
    await expect(testAndSaveBrowserKey('teacher-1', 'gemini', 'gemini-test-key'))
      .rejects.toThrow('dinonaktifkan untuk mencegah biaya atau billing');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('blocks question generation and assistant prompts before network access', async () => {
    await expect(generateBrowserQuestion('teacher-1', {
      mapel: 'Matematika',
      kelas: 'X',
      topik: 'Persamaan',
      jenis: 'uraian',
    })).rejects.toThrow('dinonaktifkan untuk mencegah biaya atau billing');
    await expect(askBrowserAssistant('teacher-1', [
      { role: 'user', text: 'Tolong bantu.' },
    ])).rejects.toThrow('dinonaktifkan untuk mencegah biaya atau billing');

    expect(fetch).not.toHaveBeenCalled();
  });

  it('blocks planning before reading Drive context or contacting an AI provider', async () => {
    await expect(generateBrowserPlanning({
      uid: 'teacher-1',
      paketId: 'package-1',
      jenis: 'atp',
      sinyal: new AbortController().signal,
    })).rejects.toThrow('dinonaktifkan untuk mencegah biaya atau billing');

    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not enable, retain, or accept provider keys or preferences', async () => {
    const connections = getBrowserAiConnections('teacher-1');
    expect(connections.personalKeysEnabled).toBe(false);
    expect(Object.values(connections.providers).every((provider) => !provider.available)).toBe(true);
    await expect(testAndSaveBrowserKey('teacher-1', 'gemini', 'new-api-key'))
      .rejects.toThrow('dinonaktifkan untuk mencegah biaya atau billing');
    expect(() => setBrowserAiPreference('teacher-1', 'assistant', 'gemini'))
      .toThrow('dinonaktifkan untuk mencegah biaya atau billing');
  });

  it('contains no provider endpoint or fetch implementation', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('./browserAi.js', import.meta.url), 'utf8');
    expect(source).not.toMatch(/https?:\/\/|fetch\s*\(/i);
  });
});
