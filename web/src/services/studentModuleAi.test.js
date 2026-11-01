import { beforeEach, describe, expect, it, vi } from 'vitest';

const { routeAiRequest } = vi.hoisted(() => ({ routeAiRequest: vi.fn() }));
vi.mock('./aiProviders.js', () => ({ routeAiRequest }));

import {
  generateStudentModule,
  validasiBagianModulSiswa,
  validasiInputModulSiswa,
} from './studentModuleAi.js';
import { MODUL_SISWA_BAGIAN } from './studentModuleAiPrompts.js';

const input = {
  mapel: 'Matematika',
  kelas: 'X',
  topik: 'Persamaan linear satu variabel',
  tp: 'Menyelesaikan persamaan linear satu variabel dengan tepat.',
  jumlahJP: 8,
  durasi: 45,
  level: 'Campuran',
};

const assessmentMarkdown = [
  '### Pilihan Ganda',
  '1. Berapakah 2 + 2?',
  'A. 3',
  'B. 4',
  'C. 5',
  'D. 6',
  '2. Berapakah 3 + 2?',
  'A. 4',
  'B. 5',
  'C. 6',
  'D. 7',
  '3. Berapakah 4 + 2?',
  'A. 5',
  'B. 6',
  'C. 7',
  'D. 8',
  '4. Berapakah 5 + 2?',
  'A. 6',
  'B. 7',
  'C. 8',
  'D. 9',
  '5. Berapakah 6 + 2?',
  'A. 7',
  'B. 8',
  'C. 9',
  'D. 10',
  '### Uraian',
  '1. Jelaskan cara menyelesaikan 2x = 8.',
  '2. Jelaskan cara memeriksa nilai x.',
  '3. Buat satu contoh persamaan linear.',
  '### Studi Kasus',
  '1. Rani membeli dua buku dengan harga yang sama dan membayar 8 ribu rupiah. Berapa harga satu buku?',
].join('\n');

const answerMarkdown = [
  '### Kunci Pilihan Ganda',
  '1. Kunci: B — Dua ditambah dua sama dengan empat.',
  '2. Kunci: B — Tiga ditambah dua sama dengan lima.',
  '3. Kunci: B — Empat ditambah dua sama dengan enam.',
  '4. Kunci: B — Lima ditambah dua sama dengan tujuh.',
  '5. Kunci: B — Enam ditambah dua sama dengan delapan.',
  '### Pedoman Jawaban Uraian',
  '1. Bagi kedua ruas dengan dua sehingga x sama dengan empat.',
  '2. Substitusikan nilai x ke persamaan awal.',
  '3. Contoh jawaban: x + 2 = 5.',
  '### Analisis Studi Kasus',
  '1. Misalkan harga satu buku adalah x. Persamaannya 2x = 8, sehingga x = 4 ribu rupiah.',
].join('\n');

const sectionFixtures = MODUL_SISWA_BAGIAN.map((section, index) => {
  if (index === 6) return assessmentMarkdown;
  if (index === 7) {
    return '### Rangkuman\n- Persamaan setara memiliki nilai yang sama.\n### Daftar Pustaka\nPERLU KONFIRMASI — cantumkan sumber resmi yang digunakan.\n### Profil Penulis\n### Cover Belakang\nModul ini mendampingi kalian memahami topik secara bertahap dengan contoh dan latihan yang dapat diperiksa kembali.';
  }
  if (index === 8) return answerMarkdown;
  return `### ${section.judul}\n\nBagian ini menjelaskan konsep persamaan linear secara runtut untuk kalian. Materi disusun dari tujuan pembelajaran dan konteks yang diberikan guru. Setiap langkah membantu kalian memahami topik dengan contoh yang dekat dengan kegiatan belajar.`;
});

const response = (markdown) => JSON.stringify({ markdown });

describe('generator Modul Siswa lokal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates required input, official data ranges, and optional identity fields', () => {
    expect(validasiInputModulSiswa(input)).toMatchObject({
      mapel: 'Matematika',
      jumlahJP: 8,
      durasi: 45,
      tahunAjaran: '',
      penulis: '',
      sekolah: '',
    });
    expect(() => validasiInputModulSiswa({ ...input, jumlahJP: 41 }))
      .toThrow('Alokasi waktu harus berupa bilangan bulat 1–40 JP.');
    expect(() => validasiInputModulSiswa({ ...input, durasi: 14 }))
      .toThrow('Durasi setiap JP harus berupa bilangan bulat 15–180 menit.');
    expect(() => validasiInputModulSiswa({ ...input, sekolah: 42 }))
      .toThrow('sekolah wajib berupa teks.');
    expect(routeAiRequest).not.toHaveBeenCalled();
  });

  it('generates and validates all nine sections using the Modul Siswa local fallback workflow', async () => {
    let index = 0;
    routeAiRequest.mockImplementation(async ({ validateResponse }) => {
      const current = index;
      index += 1;
      return {
        provider: 'local',
        model: current === 0 ? 'llama3.2:1b' : 'llama3.2:3b',
        fallbackUsed: current === 0,
        validated: validateResponse(response(sectionFixtures[current])),
      };
    });
    const received = [];
    const result = await generateStudentModule({
      uid: 'teacher-1',
      input,
      onSection: (section, sectionIndex) => received.push([section, sectionIndex]),
    });

    expect(result.sections).toHaveLength(9);
    expect(received.map(([, sectionIndex]) => sectionIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(result.sections[0]).toMatchObject({ fallbackUsed: true, model: 'llama3.2:1b' });
    expect(routeAiRequest).toHaveBeenCalledTimes(9);
    expect(routeAiRequest.mock.calls.every(([request]) => request.workflow === 'modul_siswa')).toBe(true);
    expect(routeAiRequest.mock.calls[8][0].prompt).toContain(assessmentMarkdown);
    expect(routeAiRequest.mock.calls[0][0].prompt).toContain('"tahunAjaran":""');
    expect(routeAiRequest.mock.calls[0][0].prompt).toContain('"sekolah":""');
  });

  it('preserves completed sections and resumes after a later section fails', async () => {
    const completed = [];
    routeAiRequest
      .mockImplementationOnce(async ({ validateResponse }) => ({
        provider: 'local',
        model: 'local-primary',
        validated: validateResponse(response(sectionFixtures[0])),
      }))
      .mockImplementationOnce(async ({ validateResponse }) => ({
        provider: 'local',
        model: 'local-primary',
        validated: validateResponse(response(sectionFixtures[1])),
      }))
      .mockRejectedValueOnce(new Error('local timeout'));
    await expect(generateStudentModule({
      uid: 'teacher-1',
      input,
      onSection: (section) => completed.push(section),
    })).rejects.toThrow('local timeout');
    expect(completed).toHaveLength(2);

    let resumedIndex = 2;
    routeAiRequest.mockImplementation(async ({ validateResponse }) => {
      const current = resumedIndex;
      resumedIndex += 1;
      return {
        provider: 'local',
        model: 'local-backup',
        validated: validateResponse(response(sectionFixtures[current])),
      };
    });
    const resumed = await generateStudentModule({
      uid: 'teacher-1',
      input,
      startIndex: completed.length,
      existingSections: completed,
    });
    expect(resumed.sections).toHaveLength(7);
    expect(routeAiRequest).toHaveBeenCalledTimes(10);
  });

  it('keeps completed sections and stops before requesting the next section after cancellation', async () => {
    const controller = new AbortController();
    const completed = [];
    routeAiRequest.mockImplementation(async ({ validateResponse }) => ({
      provider: 'local',
      model: 'local-primary',
      validated: validateResponse(response(sectionFixtures[completed.length])),
    }));

    await expect(generateStudentModule({
      uid: 'teacher-1',
      input,
      signal: controller.signal,
      onSection: (section) => {
        completed.push(section);
        controller.abort();
      },
    })).rejects.toMatchObject({ name: 'AbortError' });

    expect(completed).toHaveLength(1);
    expect(routeAiRequest).toHaveBeenCalledTimes(1);
  });

  it('rejects broken section output, unverified bibliography, wrong question counts, and invalid answer keys', () => {
    expect(() => validasiBagianModulSiswa('not JSON', 0))
      .toThrow('AI_nnoe lokal tidak mengembalikan JSON Modul Siswa yang valid.');
    expect(() => validasiBagianModulSiswa(response('<script>alert(1)</script>'.padEnd(90, ' ')), 0))
      .toThrow('memuat HTML yang tidak diizinkan.');
    expect(() => validasiBagianModulSiswa(
      response('### Rangkuman\nRingkasan lengkap tanpa sumber pustaka yang jelas. '.repeat(2)),
      7,
      '',
      { sumberPustaka: '' },
    )).toThrow('Daftar pustaka tidak terverifikasi');
    expect(() => validasiBagianModulSiswa(
      response(assessmentMarkdown.replace('5. Berapakah 6 + 2?\nA. 7\nB. 8\nC. 9\nD. 10\n', '')),
      6,
    )).toThrow('tepat 5 pilihan ganda');
    expect(() => validasiBagianModulSiswa(
      response(answerMarkdown.replace('1. Kunci: B', '1. Kunci: E')),
      8,
      assessmentMarkdown,
    )).toThrow('Setiap kunci pilihan ganda harus menyebutkan satu huruf A–D');
  });

  it('requires an authenticated user and contiguous prior sections to resume', async () => {
    await expect(generateStudentModule({ uid: '', input })).rejects.toThrow('Sesi login tidak tersedia');
    await expect(generateStudentModule({
      uid: 'teacher-1',
      input,
      startIndex: 1,
      existingSections: [],
    })).rejects.toThrow('Bagian Modul Siswa terdahulu tidak lengkap');
    expect(routeAiRequest).not.toHaveBeenCalled();
  });
});
