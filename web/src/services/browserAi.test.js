import { beforeEach, describe, expect, it, vi } from 'vitest';

const { routeAiRequest, bacaInputAi } = vi.hoisted(() => ({
  routeAiRequest: vi.fn(),
  bacaInputAi: vi.fn(),
}));

vi.mock('./aiProviders.js', () => ({ routeAiRequest }));
vi.mock('./planningDriveRepository.js', () => ({ bacaInputAi }));

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
  rasionalisasi: 'Urutan pembelajaran bergerak dari pengenalan menuju penerapan.',
  cp: [{ elemen: 'Bilangan', cp: 'Memahami bilangan.' }],
  unit: [
    {
      no: 1,
      nama: 'Bilangan dasar',
      elemen: 'Bilangan',
      semester: 1,
      tujuanUnit: 'Peserta didik mengidentifikasi konsep bilangan.',
      kataKunci: ['bilangan'],
      isiProsesPembelajaran: 'Mengamati dan membandingkan bilangan.',
      dimensiProfil: ['Bernalar kritis'],
      glosarium: [{ istilah: 'Bilangan', makna: 'Konsep untuk menyatakan kuantitas.' }],
      tp: [
        {
          kode: 'E.1',
          rumusan: 'Mengidentifikasi bilangan.',
          materi: 'Bilangan',
          strategiAsesmen: 'Observasi dan tanya jawab.',
          jp: 4,
        },
        {
          kode: 'E.2',
          rumusan: 'Menerapkan bilangan.',
          materi: 'Pola',
          strategiAsesmen: 'Tugas pemecahan masalah.',
          jp: 4,
        },
      ],
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
      uid: 'teacher-1',
      workflow: 'questions',
    }));
  });

  it('returns an assistant answer without routing personal context to cloud', async () => {
    routeAiRequest.mockResolvedValue({ provider: 'local', text: 'Berikut penjelasannya.' });
    const result = await askBrowserAssistant('teacher-1', [
      { role: 'user', text: 'Tolong bantu.' },
    ]);
    expect(result).toEqual({ answer: 'Berikut penjelasannya.', penyedia: 'local' });
    expect(routeAiRequest).toHaveBeenCalledWith(expect.objectContaining({
      uid: 'teacher-1',
      workflow: 'assistant',
    }));
  });

  it('ignores legacy cloud options and still calls the local-only route', async () => {
    routeAiRequest.mockResolvedValue({ provider: 'local', text: 'Jawaban.' });
    await askBrowserAssistant('teacher-1', [{ role: 'user', text: 'Pertanyaan umum.' }], {
      allowCloud: true,
    });
    expect(routeAiRequest).toHaveBeenCalledWith(expect.objectContaining({
      uid: 'teacher-1',
      workflow: 'assistant',
    }));
    expect(routeAiRequest.mock.calls[0][0]).not.toHaveProperty('allowCloud');
    expect(routeAiRequest.mock.calls[0][0]).not.toHaveProperty('preference');
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
      kodePerElemen: [{ elemen: 'Bilangan', kode: ['E.1', 'E.2'] }],
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
      uid: 'teacher-1',
      workflow: 'planning',
      prompt: expect.stringContaining('Salin seluruh elemen dan rumusan CP PERSIS'),
    }));
    expect(routeAiRequest.mock.calls[0][0].prompt).toContain('E.1, E.2');
  });

  it('generates and validates KKTP and Modul Ajar drafts using only the local planning workflow', async () => {
    const kktp = {
      ambang: 75,
      items: ['E.1'].map((kode) => ({
        kode,
        indikator: ['Mengidentifikasi konsep.'],
        rubrik: {
          perluBimbingan: 'Perlu bimbingan.',
          cukup: 'Mulai memahami.',
          baik: 'Memahami dengan baik.',
          sangatBaik: 'Menerapkan secara mandiri.',
        },
      })),
    };
    const modul = {
      tujuanKode: ['E.1'],
      model: 'Pembelajaran berbasis masalah',
      pemahamanBermakna: ['Konsep membantu menyelesaikan masalah.'],
      pertanyaanPemantik: ['Bagaimana konsep ini digunakan?'],
      dimensiProfil: ['Bernalar kritis'],
      sarpras: ['Papan tulis'],
      pertemuan: [{
        ke: 1,
        judul: 'Eksplorasi konsep',
        tujuan: 'Menerapkan konsep pada contoh.',
        menit: 80,
        pendahuluan: ['Menyampaikan tujuan.'],
        inti: ['Menganalisis contoh.'],
        penutup: ['Merefleksikan pembelajaran.'],
      }],
      asesmen: {
        diagnostik: 'Tanya jawab awal.',
        formatif: 'Observasi diskusi.',
        sumatif: 'Tugas penerapan.',
      },
      remedial: 'Latihan dengan bimbingan.',
      pengayaan: 'Menganalisis masalah lanjutan.',
      refleksiGuru: ['Apakah tujuan tercapai?'],
      refleksiSiswa: ['Apa yang sudah dipahami?'],
    };
    bacaInputAi.mockResolvedValue({
      mapel: 'Matematika',
      kelas: 'X',
      fase: 'E',
      tahunAjaran: '2026/2027',
      kodeTp: ['E1'],
      unit: { no: 1, nama: 'Bilangan', tp: [{ kode: 'E.1', rumusan: 'Memahami bilangan.' }] },
    });

    routeAiRequest.mockResolvedValueOnce({ provider: 'local', text: JSON.stringify(kktp) });
    const kktpResult = await generateBrowserPlanning({
      uid: 'teacher-1', paketId: 'package-1', jenis: 'kktp',
    });
    expect(kktpResult.payload).toEqual(kktp);
    expect(routeAiRequest).toHaveBeenLastCalledWith(expect.objectContaining({
      uid: 'teacher-1',
      workflow: 'planning',
    }));

    routeAiRequest.mockResolvedValueOnce({ provider: 'local', text: JSON.stringify(modul) });
    const moduleResult = await generateBrowserPlanning({
      uid: 'teacher-1', paketId: 'package-1', jenis: 'modul', noUnit: 1,
    });
    expect(moduleResult.payload).toEqual(modul);
    expect(bacaInputAi).toHaveBeenLastCalledWith({
      uid: 'teacher-1', paketId: 'package-1', jenis: 'modul', noUnit: 1,
    });
    expect(routeAiRequest).toHaveBeenLastCalledWith(expect.objectContaining({
      uid: 'teacher-1',
      workflow: 'planning',
    }));
  });

  it('rejects invalid planning output rather than saving a success-shaped fallback', async () => {
    bacaInputAi.mockResolvedValue({ cp: atpPayload.cp, totalJP: 72, jpPerPekan: 4 });
    routeAiRequest.mockResolvedValue({ provider: 'local', text: '{"unit":[]}' });
    await expect(generateBrowserPlanning({
      uid: 'teacher-1',
      paketId: 'package-1',
      jenis: 'atp',
    })).rejects.toThrow('struktur memiliki kolom yang tidak dikenal atau belum lengkap');
  });

  it('rejects ATP output that changes its legacy TP-code contract', async () => {
    bacaInputAi.mockResolvedValue({
      cp: atpPayload.cp,
      totalJP: 72,
      jpPerPekan: 4,
      kodePerElemen: [{ elemen: 'Bilangan', kode: ['E.1', 'E.2'] }],
    });
    routeAiRequest.mockResolvedValue({
      provider: 'local',
      text: JSON.stringify({
        ...atpPayload,
        unit: [{ ...atpPayload.unit[0], tp: atpPayload.unit[0].tp.map((tp) => ({ ...tp, kode: `X${tp.kode}` })) }],
      }),
    });
    await expect(generateBrowserPlanning({
      uid: 'teacher-1',
      paketId: 'package-1',
      jenis: 'atp',
    })).rejects.toThrow('kode TP harus mengikuti kontrak sumber dan urutannya');
  });

  it('rejects ATP output with missing unit metadata or incomplete assessment strategy', async () => {
    bacaInputAi.mockResolvedValue({
      cp: atpPayload.cp,
      totalJP: 72,
      jpPerPekan: 4,
      kodePerElemen: [{ elemen: 'Bilangan', kode: ['E.1', 'E.2'] }],
    });
    const incomplete = structuredClone(atpPayload);
    incomplete.unit[0].tp[0].strategiAsesmen = '';
    routeAiRequest.mockResolvedValue({ provider: 'local', text: JSON.stringify(incomplete) });
    await expect(generateBrowserPlanning({
      uid: 'teacher-1',
      paketId: 'package-1',
      jenis: 'atp',
    })).rejects.toThrow('strategiAsesmen: wajib berupa teks');
  });

  it('keeps AI provider preferences local and does not expose personal keys', () => {
    const connections = getBrowserAiConnections('teacher-1');
    expect(connections.personalKeysEnabled).toBe(false);
    expect(connections.preferences.assistant).toBe('local');
    expect(Object.values(connections.providers).every((provider) => !provider.available)).toBe(true);
  });
});
