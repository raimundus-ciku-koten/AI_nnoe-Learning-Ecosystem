import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import {
  daftarRiwayatCover,
  hapusRiwayatCover,
  simpanRiwayatCover,
  validasiDataCover,
} from './coverHistory.js';

const COVER = {
  mapel: 'Matematika',
  kelas: 'X',
  tahunAjaran: '',
  penyusun: '',
  sekolah: '',
  tingkat: '',
  logoDataUrl: '',
};

describe('cover history', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    globalThis.IDBKeyRange = IDBKeyRange;
  });

  it('requires subject and class and leaves optional metadata blank', () => {
    expect(validasiDataCover(COVER)).toEqual(COVER);
    expect(() => validasiDataCover({ ...COVER, mapel: ' ' }))
      .toThrow('Mata pelajaran wajib diisi.');
    expect(() => validasiDataCover({ ...COVER, kelas: '' }))
      .toThrow('Kelas/fase wajib diisi.');
  });

  it('rejects unsafe and unsupported logo payloads', () => {
    expect(() => validasiDataCover({ ...COVER, logoDataUrl: 'data:image/svg+xml,<svg/>' }))
      .toThrow(/PNG, JPEG, atau WebP/);
    expect(() => validasiDataCover({ ...COVER, mapel: 'x'.repeat(101) }))
      .toThrow(/maksimal 100 karakter/);
  });

  it('persists history per account and deletes only an owned record', async () => {
    const first = await simpanRiwayatCover('teacher-1', COVER);
    const second = await simpanRiwayatCover('teacher-2', { ...COVER, kelas: 'XI' });

    expect(await daftarRiwayatCover('teacher-1')).toEqual([first]);
    expect(await daftarRiwayatCover('teacher-2')).toEqual([second]);
    await expect(hapusRiwayatCover('teacher-2', first.id)).resolves.toBe(false);
    await expect(daftarRiwayatCover('teacher-1')).resolves.toEqual([first]);
    await expect(hapusRiwayatCover('teacher-1', first.id)).resolves.toBe(true);
    await expect(daftarRiwayatCover('teacher-1')).resolves.toEqual([]);
  });

  it('reports unsupported local storage instead of silently losing history', async () => {
    globalThis.indexedDB = undefined;
    await expect(daftarRiwayatCover('teacher-1'))
      .rejects.toThrow(/tidak mendukung penyimpanan riwayat cover lokal/);
  });
});
