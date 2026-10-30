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

function providerPlanning(provider, payload) {
  const content = JSON.stringify(payload);
  return provider === 'gemini'
    ? Response.json({ candidates: [{ content: { parts: [{ text: content }] } }] })
    : Response.json({ choices: [{ message: { content } }] });
}

const unit = {
  no: 1,
  nama: 'Persamaan Linear',
  semester: 1,
  tp: [{ kode: 'TP1.1', rumusan: 'Menyelesaikan persamaan linear.', materi: 'Persamaan linear' }],
};

const konteksPerencanaan = {
  mapel: 'Matematika',
  kelas: 'X',
  fase: 'E',
  tahunAjaran: '2026/2027',
};

const capaian = [{ elemen: 'Bilangan', cp: 'Peserta didik memahami bilangan dan operasi hitung.' }];

const atp = {
  cp: capaian,
  unit: [
    {
      no: 1,
      nama: 'Bilangan dan operasi',
      elemen: 'Bilangan',
      semester: 1,
      tp: [{ kode: 'TP1.1', rumusan: 'Menyelesaikan operasi bilangan.', materi: 'Operasi hitung', jp: 12 }],
    },
    {
      no: 2,
      nama: 'Penerapan bilangan',
      elemen: 'Bilangan',
      semester: 2,
      tp: [{ kode: 'TP2.1', rumusan: 'Menerapkan operasi bilangan.', materi: 'Masalah kontekstual', jp: 12 }],
    },
  ],
};

const kktp = {
  ambang: 75,
  items: [{
    kode: 'TP1.1',
    indikator: ['Menyelesaikan persamaan linear dengan langkah yang benar.'],
    rubrik: {
      perluBimbingan: 'Belum dapat menentukan langkah penyelesaian.',
      cukup: 'Dapat menyelesaikan dengan beberapa arahan.',
      baik: 'Menyelesaikan secara mandiri dengan benar.',
      sangatBaik: 'Menjelaskan strategi dan memeriksa hasil secara mandiri.',
    },
  }],
};

const modul = {
  tujuanKode: ['TP1.1'],
  model: 'Pembelajaran kontekstual',
  pemahamanBermakna: ['Persamaan membantu memodelkan situasi sehari-hari.'],
  pertanyaanPemantik: ['Bagaimana menentukan nilai yang belum diketahui?'],
  dimensiProfil: ['Bernalar kritis'],
  sarpras: ['Papan tulis'],
  pertemuan: [{
    ke: 1,
    judul: 'Menemukan nilai yang belum diketahui',
    tujuan: 'Menyelesaikan persamaan linear satu variabel.',
    menit: 90,
    pendahuluan: ['Mengaitkan materi dengan situasi nyata.'],
    inti: ['Menganalisis contoh dan menyelesaikan latihan bertahap.'],
    penutup: ['Menyimpulkan strategi dan melakukan refleksi.'],
  }],
  asesmen: {
    diagnostik: 'Mengidentifikasi pemahaman operasi bilangan.',
    formatif: 'Memeriksa langkah penyelesaian latihan.',
    sumatif: 'Menyelesaikan masalah persamaan linear.',
  },
  remedial: 'Latihan bertahap dengan contoh terpandu.',
  pengayaan: 'Membuat model persamaan dari masalah kontekstual.',
  refleksiGuru: ['Apakah dukungan bertahap sudah memadai?'],
  refleksiSiswa: ['Strategi apa yang paling membantu?'],
};

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
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                questions: [{ ...question, jawaban: '5' }],
              })
            }]
          }
        }],
      }));
    await testAndSaveBrowserKey('teacher-1', 'gemini', 'valid-key');
    await expect(generateBrowserQuestion('teacher-1', {
      mapel: 'Matematika', kelas: 'X', topik: 'Penjumlahan', jenis: 'pilihan_ganda',
    })).rejects.toThrow('pilihan atau kunci jawaban');
  });

  it('generates a validated KKTP from the selected provider', async () => {
    fetch
      .mockResolvedValueOnce(providerList('gemini'))
      .mockResolvedValueOnce(providerPlanning('gemini', kktp));
    await testAndSaveBrowserKey('teacher-1', 'gemini', 'planning-key');
    setBrowserAiPreference('teacher-1', 'planning', 'gemini');
    await expect(generateBrowserPlanning({
      uid: 'teacher-1',
      jenis: 'kktp',
      input: { ...konteksPerencanaan, unit: [unit] },
    })).resolves.toEqual({ penyedia: 'gemini', payload: kktp });
    const [url, options] = fetch.mock.calls[1];
    expect(String(url)).not.toContain('planning-key');
    expect(options.headers['x-goog-api-key']).toBe('planning-key');
    expect(JSON.parse(options.body).contents[0].parts[0].text).toContain('DATA_JSON');
    expect(JSON.parse(options.body).generationConfig.maxOutputTokens).toBe(3000);
  });

  it('generates ATP while preserving the selected CP verbatim', async () => {
    fetch
      .mockResolvedValueOnce(providerList('gemini'))
      .mockResolvedValueOnce(providerPlanning('gemini', atp));
    await testAndSaveBrowserKey('teacher-1', 'gemini', 'planning-key');
    await expect(generateBrowserPlanning({
      uid: 'teacher-1',
      jenis: 'atp',
      input: { ...konteksPerencanaan, cp: capaian, totalJP: 72, jpPerPekan: 4 },
    })).resolves.toEqual({ penyedia: 'gemini', payload: atp });
    const request = JSON.parse(fetch.mock.calls[1][1].body);
    const prompt = request.contents[0].parts[0].text;
    expect(prompt).toContain(capaian[0].cp);
    expect(request.generationConfig.maxOutputTokens).toBe(8000);
  });

  it('rejects planning output with unknown ATP codes before persistence', async () => {
    fetch
      .mockResolvedValueOnce(providerList('gemini'))
      .mockResolvedValueOnce(providerPlanning('gemini', {
        ...kktp,
        items: [{ ...kktp.items[0], kode: 'TP9.9' }],
      }));
    await testAndSaveBrowserKey('teacher-1', 'gemini', 'planning-key');
    await expect(generateBrowserPlanning({
      uid: 'teacher-1',
      jenis: 'kktp',
      input: { ...konteksPerencanaan, unit: [unit] },
    })).rejects.toThrow('kode TP tidak sesuai');
  });

  it('generates a structured Modul Ajar and keeps assistant disabled', async () => {
    fetch
      .mockResolvedValueOnce(providerList('groq'))
      .mockResolvedValueOnce(providerPlanning('groq', modul));
    await testAndSaveBrowserKey('teacher-1', 'groq', 'planning-key');
    await expect(generateBrowserPlanning({
      uid: 'teacher-1',
      jenis: 'modul',
      input: { ...konteksPerencanaan, unit },
    })).resolves.toEqual({ penyedia: 'groq', payload: modul });
    await expect(askBrowserAssistant('teacher-1', [])).rejects.toThrow('belum tersedia');
    setBrowserAiPreference('teacher-1', 'questions', 'gemini');
    clearBrowserAiSession('teacher-1');
    expect(getBrowserAiConnections('teacher-1').providers.gemini.available).toBe(false);
    expect(getBrowserAiConnections('teacher-1').preferences.planning).toBe('auto');
    expect(() => setBrowserAiPreference('teacher-1', 'assistant', 'gemini')).toThrow('tidak valid');
  });
});
