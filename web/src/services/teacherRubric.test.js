import { describe, expect, it } from 'vitest';
import {
  BATAS_KRITERIA_RUBRIK,
  bacaRubrikJson,
  buatRubrikAwal,
  deskripsiTingkatTerpilih,
  hasilRubrikKeCsv,
  hitungSkorRubrik,
  hapusRubrikLokal,
  muatRubrikLokal,
  rubrikKeCsv,
  rubrikKeJson,
  simpanRubrikLokal,
  TINGKAT_RUBRIK,
} from './teacherRubric.js';

function penyimpananPalsu() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    values,
  };
}

describe('penyimpanan rubrik lokal guru', () => {
  it('menyimpan dan membaca draf terpisah per akun', () => {
    const storage = penyimpananPalsu();
    const rubric = buatRubrikAwal();
    rubric.judul = 'Rubrik presentasi';
    const savedAt = new Date('2026-10-23T12:00:00.000Z');

    simpanRubrikLokal(storage, 'guru_1', rubric, savedAt);

    expect(muatRubrikLokal(storage, 'guru_1')).toEqual({ rubrik: rubric, savedAt: savedAt.toISOString() });
    expect(muatRubrikLokal(storage, 'guru_2')).toBeNull();
  });

  it('menghapus hanya draf milik akun yang dipilih', () => {
    const storage = penyimpananPalsu();
    const rubric = buatRubrikAwal();
    simpanRubrikLokal(storage, 'guru_1', rubric);
    simpanRubrikLokal(storage, 'guru_2', rubric);

    hapusRubrikLokal(storage, 'guru_1');

    expect(muatRubrikLokal(storage, 'guru_1')).toBeNull();
    expect(muatRubrikLokal(storage, 'guru_2')).not.toBeNull();
  });

  it('menolak rubrik yang tidak valid atau terlalu besar', () => {
    const storage = penyimpananPalsu();
    const rubric = buatRubrikAwal();
    rubric.kriteria = Array.from({ length: BATAS_KRITERIA_RUBRIK + 1 }, (_, index) => ({
      id: `kriteria-${index}`,
      nama: `Kriteria ${index}`,
      deskripsi: ['', '', '', ''],
    }));

    expect(() => simpanRubrikLokal(storage, 'guru_1', rubric)).toThrow('1–10 kriteria');
    expect(() => simpanRubrikLokal(storage, 'uid/invalid', buatRubrikAwal())).toThrow('ID akun tidak valid');
  });

  it('melaporkan data rubrik browser yang rusak alih-alih mengabaikannya', () => {
    const storage = penyimpananPalsu();
    storage.setItem('ainnoe:teacher-rubric:v1:guru_1', '{');

    expect(() => muatRubrikLokal(storage, 'guru_1')).toThrow('tidak dapat dibaca');
  });

  it('meneruskan kegagalan kuota penyimpanan agar halaman dapat memberi tahu pengguna', () => {
    const storage = {
      getItem: () => null,
      setItem: () => { throw new DOMException('Storage quota exceeded', 'QuotaExceededError'); },
      removeItem: () => {},
    };

    expect(() => simpanRubrikLokal(storage, 'guru_1', buatRubrikAwal()))
      .toThrow('Storage quota exceeded');
  });

  it('mendefinisikan empat tingkat penilaian dengan skor yang menurun', () => {
    expect(TINGKAT_RUBRIK.map(({ score }) => score)).toEqual([4, 3, 2, 1]);
  });

  it('menyediakan contoh indikator terukur pada rubrik awal untuk semua tingkat', () => {
    const rubric = buatRubrikAwal();

    expect(rubric.kriteria).toHaveLength(3);
    for (const criterion of rubric.kriteria) {
      expect(criterion.deskripsi).toHaveLength(4);
      expect(criterion.deskripsi.every((description) => description.length > 0)).toBe(true);
    }
    expect(deskripsiTingkatTerpilih(rubric.kriteria[0], 4))
      .toContain('secara mandiri');
    expect(deskripsiTingkatTerpilih(rubric.kriteria[0], 1))
      .toContain('pendampingan bertahap');
  });

  it('menghasilkan CSV dan menetralkan nilai yang dapat dieksekusi sebagai formula', () => {
    const rubric = buatRubrikAwal();
    rubric.judul = '=HYPERLINK("https://example.invalid","buka")';
    rubric.kriteria[0].deskripsi[0] = '@SUM(1,1)';

    const csv = rubrikKeCsv(rubric);

    expect(csv).toContain(`"'=HYPERLINK(""https://example.invalid"",""buka"")"`);
    expect(csv).toContain(`"'@SUM(1,1)"`);
    expect(csv).toContain('"Kriteria","4 - Sangat baik"');
  });

  it('mengekspor dan memvalidasi impor JSON untuk pemindahan manual draf', () => {
    const rubric = buatRubrikAwal();
    rubric.judul = 'Rubrik presentasi';

    expect(bacaRubrikJson(rubrikKeJson(rubric))).toEqual(rubric);
    expect(() => bacaRubrikJson('{')).toThrow('JSON yang valid');
    expect(() => bacaRubrikJson(JSON.stringify({ version: 2, rubrik: rubric }))).toThrow('tidak didukung');
    expect(() => bacaRubrikJson('x'.repeat(100 * 1024 + 1))).toThrow('melebihi batas 100 KB');
  });

  it('menolak ekspor CSV dan JSON saat kriteria belum lengkap', () => {
    const rubric = buatRubrikAwal();
    rubric.kriteria[0].nama = '';

    expect(() => rubrikKeCsv(rubric)).toThrow('Nama kriteria 1 wajib diisi');
    expect(() => rubrikKeJson(rubric)).toThrow('Nama kriteria 1 wajib diisi');
  });

  it('menghitung persentase hanya dari kriteria yang sudah diberi skor', () => {
    const rubric = buatRubrikAwal();
    const result = hitungSkorRubrik(rubric, {
      'kriteria-1': 4,
      'kriteria-2': 2,
      'kriteria-3': '',
    });

    expect(result).toEqual({
      scoredCount: 2,
      earned: 6,
      possible: 8,
      percentage: 75,
    });
    expect(hitungSkorRubrik(rubric, {}).percentage).toBeNull();
  });

  it('menolak skor tidak sah dan pilihan untuk kriteria rubrik lain', () => {
    const rubric = buatRubrikAwal();

    expect(() => hitungSkorRubrik(rubric, { 'kriteria-1': 5 })).toThrow('tidak valid');
    expect(() => hitungSkorRubrik(rubric, { asing: 3 })).toThrow('tidak cocok');
  });

  it('mengambil deskripsi yang sesuai dengan tingkat skor yang dipilih', () => {
    const criterion = buatRubrikAwal().kriteria[0];
    criterion.deskripsi = ['Indikator unggul', 'Indikator baik', 'Indikator cukup', 'Perlu dukungan'];

    expect(deskripsiTingkatTerpilih(criterion, 4)).toBe('Indikator unggul');
    expect(deskripsiTingkatTerpilih(criterion, 1)).toBe('Perlu dukungan');
    expect(deskripsiTingkatTerpilih(criterion, '')).toBe('');
    expect(deskripsiTingkatTerpilih(criterion, 5)).toBe('');
    expect(deskripsiTingkatTerpilih({ deskripsi: ['', '', '', ''] }, 2))
      .toBe('Deskripsi untuk tingkat ini belum diisi.');
  });

  it('mengekspor pratinjau skor anonim dan melindungi formula CSV', () => {
    const rubric = buatRubrikAwal();
    rubric.judul = '=HYPERLINK("https://example.invalid","rubrik")';
    const csv = hasilRubrikKeCsv(rubric, {
      'kriteria-1': 4,
      'kriteria-2': 2,
    });

    expect(csv).toContain('Pratinjau skor rubrik anonim');
    expect(csv).toContain(`"'=HYPERLINK(""https://example.invalid"",""rubrik"")"`);
    expect(csv).toContain('"75%"');
    expect(csv).toContain('identitas siswa');
    expect(csv).not.toContain('Nama siswa');
    expect(() => hasilRubrikKeCsv(rubric, {})).toThrow('minimal satu kriteria');
  });
});
