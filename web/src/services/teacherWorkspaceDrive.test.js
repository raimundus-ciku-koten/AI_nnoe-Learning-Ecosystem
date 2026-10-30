import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase, googleDrive } = vi.hoisted(() => ({
  supabase: { from: vi.fn() },
  googleDrive: {
    daftarCatatanKerjaTerenkripsiDrive: vi.fn(),
    hapusCatatanKerjaTerenkripsiDrive: vi.fn(),
    unggahBerkasTerenkripsiDrive: vi.fn(),
  },
}));
vi.mock('../lib/supabase.ts', () => ({ supabase }));
vi.mock('./googleWorkspace.js', () => googleDrive);

import {
  hapusCatatanGuruDrive,
  muatCatatanGuruDrive,
  tambahCatatanGuruDrive,
  ubahCatatanGuruDrive,
} from './teacherWorkspaceDrive.js';
import {
  susunIsiJurnalMengajar,
  susunIsiRencanaPerbaikan,
  susunIsiRencanaKompetensi,
  susunIsiRefleksi,
  siapkanCatatanGuru,
  tampilkanIsiJurnalMengajar,
  tampilkanIsiRencanaPerbaikan,
  tampilkanIsiRencanaKompetensi,
  tampilkanIsiRefleksi,
  uraikanIsiJurnalMengajar,
  uraikanIsiRencanaPerbaikan,
  uraikanIsiRencanaKompetensi,
  uraikanIsiRefleksi,
} from './teacherWorkspace.js';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const ENTRY_ID = 'drive-record_1';
const IDENTITY = { publicKey: 'public', fingerprint: 'a'.repeat(64), keyVersion: 1 };
const CIPHERTEXT_SHA256 = 'c'.repeat(64);
const UPLOADED = {
  id: ENTRY_ID,
  description: JSON.stringify({ ciphertextSha256: CIPHERTEXT_SHA256 }),
};
const NOTE = {
  modulePath: '/refleksi/pembelajaran',
  moduleLabel: 'Refleksi Pembelajaran',
  judul: 'Refleksi minggu pertama',
  tanggal: '2026-10-15',
  kelas: 'X-1',
  mapel: 'Matematika',
  isi: 'Catatan pribadi yang wajib dienkripsi.',
  status: 'draf',
};

describe('refleksi pembelajaran terstruktur', () => {
  it('menyimpan empat bagian sebagai payload berversi dan menyajikannya dengan label', () => {
    const reflection = {
      berhasil: 'Diskusi kelompok berjalan aktif.',
      bukti: 'Sebagian besar siswa menjelaskan strategi.',
      tantangan: 'Waktu presentasi belum cukup.',
      langkahBerikutnya: 'Siapkan giliran bicara yang lebih singkat.',
    };
    const isi = susunIsiRefleksi(reflection);

    expect(uraikanIsiRefleksi(isi)).toEqual({ ...reflection, legacy: false });
    expect(tampilkanIsiRefleksi(isi)).toContain('Bukti belajar:\nSebagian besar siswa menjelaskan strategi.');
    expect(isi).toMatch(/^ale-reflection-v1:/);
  });

  it('mempertahankan catatan lama dan menolak refleksi kosong atau bagian terlalu panjang', () => {
    expect(uraikanIsiRefleksi('Catatan naratif sebelumnya')).toMatchObject({
      berhasil: 'Catatan naratif sebelumnya',
      legacy: true,
    });
    expect(tampilkanIsiRefleksi('Catatan naratif sebelumnya')).toBe('Catatan naratif sebelumnya');
    expect(() => susunIsiRefleksi({})).toThrow('Isi refleksi wajib diisi.');
    expect(() => susunIsiRefleksi({ berhasil: 'x'.repeat(1401) }))
      .toThrow('Bagian refleksi maksimal 1400 karakter.');
  });

  it('menjaga isi berversi yang rusak sebagai teks lama agar tidak hilang saat edit', () => {
    const invalid = 'ale-reflection-v1:{broken';
    expect(uraikanIsiRefleksi(invalid)).toMatchObject({ berhasil: invalid, legacy: true });
  });
});

describe('rencana perbaikan pembelajaran', () => {
  it('menyimpan fokus, perubahan, indikator, dan waktu tinjau dalam payload berversi', () => {
    const plan = {
      fokus: 'Meningkatkan pemerataan diskusi.',
      perubahan: 'Gunakan giliran bicara berpasangan.',
      indikator: 'Lebih banyak kelompok menyampaikan alasan.',
      tinjauUlang: 'Tinjau setelah dua pertemuan.',
    };
    const isi = susunIsiRencanaPerbaikan(plan);

    expect(uraikanIsiRencanaPerbaikan(isi)).toEqual({ ...plan, legacy: false });
    expect(tampilkanIsiRencanaPerbaikan(isi)).toContain('Indikator keberhasilan:\nLebih banyak kelompok menyampaikan alasan.');
    expect(isi).toMatch(/^ale-improvement-plan-v1:/);
  });

  it('mempertahankan teks lama dan menolak rencana kosong atau bagian terlalu panjang', () => {
    expect(uraikanIsiRencanaPerbaikan('Rencana naratif sebelumnya')).toMatchObject({
      fokus: 'Rencana naratif sebelumnya',
      legacy: true,
    });
    expect(tampilkanIsiRencanaPerbaikan('Rencana naratif sebelumnya')).toBe('Rencana naratif sebelumnya');
    expect(() => susunIsiRencanaPerbaikan({})).toThrow('Isi rencana perbaikan wajib diisi.');
    expect(() => susunIsiRencanaPerbaikan({ fokus: 'x'.repeat(1401) }))
      .toThrow('Bagian rencana perbaikan maksimal 1400 karakter.');
  });
});

describe('jurnal mengajar harian', () => {
  it('mewajibkan kelas dan mata pelajaran pada service jurnal', () => {
    const journal = {
      modulePath: '/pelaksanaan/jurnal',
      moduleLabel: 'Jurnal Mengajar Harian',
      judul: 'Persamaan linear',
      tanggal: '2026-10-15',
      kelas: 'X-1',
      mapel: 'Matematika',
      isi: 'Catatan sesi belajar.',
      status: 'draf',
    };

    expect(siapkanCatatanGuru(journal)).toMatchObject({ kelas: 'X-1', mapel: 'Matematika' });
    expect(() => siapkanCatatanGuru({ ...journal, kelas: '' })).toThrow('Kelas wajib diisi.');
    expect(() => siapkanCatatanGuru({ ...journal, mapel: '' })).toThrow('Mata pelajaran wajib diisi.');
  });

  it('menyimpan tujuan, kegiatan, capaian, dan tindak lanjut dalam payload berversi', () => {
    const journal = {
      tujuan: 'Menjelaskan hubungan pecahan dan desimal.',
      kegiatan: 'Menggunakan garis bilangan dan latihan berpasangan.',
      capaian: 'Sebagian besar kelas dapat memberi contoh yang benar.',
      tindakLanjut: 'Siapkan latihan bertahap pada pertemuan berikutnya.',
    };
    const isi = susunIsiJurnalMengajar(journal);

    expect(uraikanIsiJurnalMengajar(isi)).toEqual({ ...journal, legacy: false });
    expect(tampilkanIsiJurnalMengajar(isi)).toContain('Tujuan pembelajaran:\nMenjelaskan hubungan pecahan dan desimal.');
    expect(isi).toMatch(/^ale-teaching-journal-v1:/);
  });

  it('mempertahankan teks jurnal lama dan menolak jurnal kosong atau bagian terlalu panjang', () => {
    expect(uraikanIsiJurnalMengajar('Catatan mengajar sebelumnya')).toMatchObject({
      kegiatan: 'Catatan mengajar sebelumnya',
      legacy: true,
    });
    expect(tampilkanIsiJurnalMengajar('Catatan mengajar sebelumnya')).toBe('Catatan mengajar sebelumnya');
    expect(() => susunIsiJurnalMengajar({})).toThrow('Isi jurnal wajib diisi.');
    expect(() => susunIsiJurnalMengajar({ tujuan: 'x'.repeat(1401) }))
      .toThrow('Bagian jurnal maksimal 1400 karakter.');
  });
});

describe('rencana pengembangan kompetensi', () => {
  it('menyimpan kompetensi, aktivitas, target, dan bukti dalam payload berversi', () => {
    const plan = {
      kompetensi: 'Asesmen formatif berbasis umpan balik.',
      aktivitas: 'Ikuti lokakarya dan uji satu strategi di kelas.',
      target: 'Satu strategi dalam empat minggu.',
      bukti: 'Catatan refleksi dan contoh instrumen tanpa data siswa.',
    };
    const isi = susunIsiRencanaKompetensi(plan);

    expect(uraikanIsiRencanaKompetensi(isi)).toEqual({ ...plan, legacy: false });
    expect(tampilkanIsiRencanaKompetensi(isi)).toContain('Aktivitas belajar:\nIkuti lokakarya dan uji satu strategi di kelas.');
    expect(isi).toMatch(/^ale-development-plan-v1:/);
  });

  it('mempertahankan catatan lama dan menolak rencana kosong atau bagian terlalu panjang', () => {
    expect(uraikanIsiRencanaKompetensi('Catatan kompetensi sebelumnya')).toMatchObject({
      kompetensi: 'Catatan kompetensi sebelumnya',
      legacy: true,
    });
    expect(tampilkanIsiRencanaKompetensi('Catatan kompetensi sebelumnya')).toBe('Catatan kompetensi sebelumnya');
    expect(() => susunIsiRencanaKompetensi({})).toThrow('Isi rencana pengembangan kompetensi wajib diisi.');
    expect(() => susunIsiRencanaKompetensi({ kompetensi: 'x'.repeat(1401) }))
      .toThrow('Bagian pengembangan kompetensi maksimal 1400 karakter.');
  });
});

function queryResult(response) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve(response)),
  };
  return query;
}

describe('encrypted Google Drive teacher workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabase.from.mockImplementation((table) => {
      if (table === 'tenant_entitlements') {
        return queryResult({ data: { status: 'active', valid_until: null }, error: null });
      }
      if (table === 'personal_entitlements') {
        return queryResult({ data: null, error: null });
      }
      throw new Error(`Unexpected Supabase table: ${table}`);
    });
  });

  it('keeps note contents out of Supabase and uploads a new encrypted-category file', async () => {
    googleDrive.unggahBerkasTerenkripsiDrive.mockResolvedValue(UPLOADED);
    const entry = await tambahCatatanGuruDrive(
      'token',
      'school-1',
      OWNER_ID,
      IDENTITY,
      NOTE,
    );

    expect(entry).toMatchObject({
      id: ENTRY_ID,
      ...NOTE,
      ciphertextSha256: CIPHERTEXT_SHA256,
    });
    expect(supabase.from.mock.calls.map(([table]) => table).sort())
      .toEqual(['personal_entitlements', 'tenant_entitlements']);
    const [token, owner, identity, file, options] =
      googleDrive.unggahBerkasTerenkripsiDrive.mock.calls[0];
    expect([token, owner, identity]).toEqual(['token', OWNER_ID, IDENTITY]);
    expect(options).toEqual({ category: 'teacher-workspace' });
    expect(file.name).toBe('workspace-note.json');
    expect(JSON.parse(await file.text()).isi).toBe(NOTE.isi);
  });

  it('supports individual teacher entitlements, keyset paging, update, and deletion', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'tenant_entitlements') return queryResult({ data: null, error: null });
      if (table === 'personal_entitlements') {
        return queryResult({
          data: { plan_id: 'teacher-plan', status: 'active', valid_until: null },
          error: null,
        });
      }
      if (table === 'billing_plans') {
        return queryResult({ data: { allowed_role: 'guru', active: true }, error: null });
      }
      throw new Error(`Unexpected Supabase table: ${table}`);
    });
    googleDrive.daftarCatatanKerjaTerenkripsiDrive.mockResolvedValue({
      entries: [{ id: ENTRY_ID, ...NOTE }],
      nextPageToken: 'next-page',
    });
    googleDrive.unggahBerkasTerenkripsiDrive.mockResolvedValue(UPLOADED);
    googleDrive.hapusCatatanKerjaTerenkripsiDrive.mockResolvedValue(undefined);

    await expect(muatCatatanGuruDrive('token', IDENTITY, 'previous')).resolves.toEqual({
      entries: [{ id: ENTRY_ID, ...NOTE }],
      hasMore: true,
      nextCursor: 'next-page',
    });
    await ubahCatatanGuruDrive(
      'token',
      'school-1',
      OWNER_ID,
      IDENTITY,
      ENTRY_ID,
      NOTE,
      '2026-10-15T10:00:00Z',
      CIPHERTEXT_SHA256,
    );
    await hapusCatatanGuruDrive('token', 'school-1', OWNER_ID, IDENTITY, ENTRY_ID);

    expect(googleDrive.daftarCatatanKerjaTerenkripsiDrive)
      .toHaveBeenCalledWith('token', IDENTITY, 'previous');
    expect(googleDrive.unggahBerkasTerenkripsiDrive.mock.calls[0][4])
      .toEqual({
        category: 'teacher-workspace',
        fileId: ENTRY_ID,
        expectedCiphertextSha256: CIPHERTEXT_SHA256,
      });
    expect(googleDrive.hapusCatatanKerjaTerenkripsiDrive)
      .toHaveBeenCalledWith('token', ENTRY_ID, IDENTITY);
    expect(supabase.from.mock.calls.some(([table]) =>
      !['tenant_entitlements', 'personal_entitlements', 'billing_plans'].includes(table)))
      .toBe(false);
  });

  it('blocks writes without an active school or teacher entitlement', async () => {
    supabase.from.mockImplementation(() => queryResult({ data: null, error: null }));
    await expect(tambahCatatanGuruDrive(
      'token',
      'school-1',
      OWNER_ID,
      IDENTITY,
      NOTE,
    )).rejects.toThrow('Langganan sekolah');
    expect(googleDrive.unggahBerkasTerenkripsiDrive).not.toHaveBeenCalled();
  });
});
