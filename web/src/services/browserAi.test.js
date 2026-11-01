import { beforeEach, describe, expect, it, vi } from 'vitest';

const { routeAiRequest, bacaInputAi } = vi.hoisted(() => ({
  routeAiRequest: vi.fn(),
  bacaInputAi: vi.fn(),
}));

vi.mock('./aiProviders.js', () => ({ routeAiRequest }));
vi.mock('../pages/perencanaan/services/planningDriveRepository.js', () => ({ bacaInputAi }));

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

const atpPayload = {
  cp: [{ elemen: 'Bilangan', cp: 'Memahami bilangan.' }],
  unit: [
    {
      no: 1,
      nama: 'Bilangan dasar',
      elemen: 'Bilangan',
      semester: 1,
      tp: [{ kode: 'E.1', rumusan: 'Mengidentifikasi bilangan.', materi: 'Bilangan', jp: 4 }],
    },
    {
      no: 2,
      nama: 'Pola bilangan',
      elemen: 'Bilangan',
      semester: 2,
      tp: [{ kode: 'E.2', rumusan: 'Menerapkan bilangan.', materi: 'Pola', jp: 4 }],
    },
  ],
};

describe('local AI provider integrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearBrowserAiSession('teacher-1');
  });

  it('keeps API-key-based external providers disabled', async () => {
    expect(EXTERNAL_AI_PROVIDERS_ENABLED).toBe(false);
    await expect(testAndSaveBrowserKey('teacher-1', 'gemini', 'key'))
      .rejects.toThrow('dinonaktifkan untuk mencegah biaya atau billing');
    expect(() => setBrowserAiPreference('teacher-1', 'assistant', 'gemini'))
      .toThrow('dinonaktifkan untuk mencegah biaya atau billing');
  });

  it('generates and validates question drafts through local AI only', async () => {
    routeAiRequest.mockResolvedValue({
      provider: 'local',
      text: JSON.stringify({
        questions: [{
          pertanyaan: 'Berapakah 2 + 2?',
          pilihan: ['3', '4', '5', '6'],
          jawaban: '4',
          pembahasan: 'Dua ditambah dua sama dengan empat.',
        }],
      }),
    });
    const result = await generateBrowserQuestion('teacher-1', {
      mapel: 'Matematika',
      kelas: 'X',
      topik: 'Bilangan',
      jenis: 'pilihan ganda',
    });
    expect(result.payload.questions[0].jawaban).toBe('4');
    expect(routeAiRequest).toHaveBeenCalledWith(expect.objectContaining({
      workflow: 'questions',
      sensitivity: 'sensitive',
    }));
  });

  it('returns an assistant answer without routing personal context to cloud', async () => {
    routeAiRequest.mockResolvedValue({ provider: 'local', text: 'Berikut penjelasannya.' });
    const result = await askBrowserAssistant('teacher-1', [
      { role: 'user', text: 'Tolong bantu.' },
    ]);
    expect(result).toEqual({ answer: 'Berikut penjelasannya.', penyedia: 'local' });
    expect(routeAiRequest).toHaveBeenCalledWith(expect.objectContaining({
      workflow: 'assistant',
      sensitivity: 'sensitive',
    }));
  });

  it('sends an assistant prompt to cloud only when the caller provides explicit consent', async () => {
    routeAiRequest.mockResolvedValue({ provider: 'cloud', text: 'Jawaban.' });
    await askBrowserAssistant('teacher-1', [{ role: 'user', text: 'Pertanyaan umum.' }], {
      allowCloud: true,
    });
    expect(routeAiRequest).toHaveBeenCalledWith(expect.objectContaining({
      preference: 'cloud',
      sensitivity: 'non_sensitive',
      allowCloud: true,
    }));
  });

  it('uses the encrypted planning source and validates generated JSON against its schema', async () => {
    bacaInputAi.mockResolvedValue({
      mapel: 'Matematika',
      kelas: 'X',
      fase: 'E',
      tahunAjaran: '2026/2027',
      cp: atpPayload.cp,
      totalJP: 72,
      jpPerPekan: 4,
    });
    routeAiRequest.mockResolvedValue({ provider: 'local', text: JSON.stringify(atpPayload) });
    const result = await generateBrowserPlanning({
      uid: 'teacher-1',
      paketId: 'package-1',
      jenis: 'atp',
      sinyal: new AbortController().signal,
    });
    expect(bacaInputAi).toHaveBeenCalledWith({
      uid: 'teacher-1',
      paketId: 'package-1',
      jenis: 'atp',
      noUnit: undefined,
    });
    expect(result.payload).toEqual(atpPayload);
    expect(routeAiRequest).toHaveBeenCalledWith(expect.objectContaining({
      workflow: 'planning',
      sensitivity: 'sensitive',
    }));
  });

  it('rejects invalid planning output rather than saving a success-shaped fallback', async () => {
    bacaInputAi.mockResolvedValue({ cp: atpPayload.cp, kodeTp: [] });
    routeAiRequest.mockResolvedValue({ provider: 'local', text: '{"unit":[]}' });
    await expect(generateBrowserPlanning({
      uid: 'teacher-1',
      paketId: 'package-1',
      jenis: 'atp',
    })).rejects.toThrow('struktur memiliki kolom yang tidak dikenal atau belum lengkap');
  });

  it('keeps AI provider preferences local and does not expose personal keys', () => {
    const connections = getBrowserAiConnections('teacher-1');
    expect(connections.personalKeysEnabled).toBe(false);
    expect(connections.preferences.assistant).toBe('local');
    expect(Object.values(connections.providers).every((provider) => !provider.available)).toBe(true);
  });
});
