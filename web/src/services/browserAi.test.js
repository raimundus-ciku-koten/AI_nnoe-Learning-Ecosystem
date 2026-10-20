import { beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMock = vi.hoisted(() => ({ jalankanAiUserService: vi.fn() }));
vi.mock('./aiUserServices.js', () => serviceMock);

import {
  askBrowserAssistant,
  clearBrowserAiSession,
  getBrowserAiConnections,
  generateBrowserPlanning,
  generateBrowserQuestion,
  removeBrowserKey,
  setBrowserAiPreference,
  startCanvaOAuth,
  testAndSaveBrowserKey,
} from './browserAi.js';

describe('browser AI uses the authenticated backend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearBrowserAiSession();
    vi.stubGlobal('fetch', vi.fn());
    const values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    });
  });

  it('loads account connection status through the Edge Function', async () => {
    const status = { configured: true, providers: { gemini: { available: true } } };
    serviceMock.jalankanAiUserService.mockResolvedValue(status);

    await expect(getBrowserAiConnections('teacher-1')).resolves.toBe(status);
    expect(serviceMock.jalankanAiUserService).toHaveBeenCalledWith('status');
  });

  it('sends a provider key only to the authenticated backend and supports removal', async () => {
    serviceMock.jalankanAiUserService.mockResolvedValue({ saved: true });

    await testAndSaveBrowserKey('teacher-1', 'gemini', 'gemini-test-key');
    await removeBrowserKey('teacher-1', 'gemini');

    expect(serviceMock.jalankanAiUserService).toHaveBeenNthCalledWith(1, 'save-key', {
      provider: 'gemini',
      apiKey: 'gemini-test-key',
    });
    expect(serviceMock.jalankanAiUserService).toHaveBeenNthCalledWith(2, 'remove-key', {
      provider: 'gemini',
    });
    expect(localStorage.getItem('ai-preferences:teacher-1')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('passes assistant and question requests to the backend with account preferences', async () => {
    serviceMock.jalankanAiUserService.mockResolvedValue({ answer: 'Siap', provider: 'gemini' });
    setBrowserAiPreference('teacher-1', 'assistant', 'gemini');
    await askBrowserAssistant('teacher-1', [{ role: 'user', text: 'Tolong bantu.' }]);
    await generateBrowserQuestion('teacher-1', {
      mapel: 'Matematika',
      kelas: 'X',
      topik: 'Persamaan',
      jenis: 'uraian',
    });

    expect(serviceMock.jalankanAiUserService).toHaveBeenNthCalledWith(1, 'assistant', {
      messages: [{ role: 'user', text: 'Tolong bantu.' }],
      providerPreference: 'gemini',
    });
    expect(serviceMock.jalankanAiUserService).toHaveBeenNthCalledWith(2, 'question', {
      mapel: 'Matematika',
      kelas: 'X',
      topik: 'Persamaan',
      jenis: 'uraian',
      providerPreference: 'auto',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('starts Canva OAuth on the backend and keeps planning generation explicitly unavailable', async () => {
    serviceMock.jalankanAiUserService.mockResolvedValue({ authorizationUrl: 'https://www.canva.com/authorize' });

    await expect(startCanvaOAuth('teacher-1')).resolves.toEqual({
      authorizationUrl: 'https://www.canva.com/authorize',
    });
    await expect(generateBrowserPlanning({
      uid: 'teacher-1',
      paketId: 'package-1',
      jenis: 'atp',
      sinyal: new AbortController().signal,
    })).rejects.toThrow('Generator perangkat AI belum terhubung ke backend aktif.');
    expect(serviceMock.jalankanAiUserService).toHaveBeenCalledWith('canva-oauth-start', {});
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not accept missing accounts or unsupported preference workflows', async () => {
    await expect(getBrowserAiConnections('')).rejects.toThrow('Sesi login tidak tersedia');
    expect(() => setBrowserAiPreference('teacher-1', 'planning', 'gemini'))
      .toThrow('Preferensi provider AI tidak valid.');
    expect(serviceMock.jalankanAiUserService).not.toHaveBeenCalled();
  });

  it('contains no AI provider endpoint or direct fetch implementation', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('./browserAi.js', import.meta.url), 'utf8');
    expect(source).not.toMatch(/https?:\/\/|fetch\s*\(/i);
  });
});
