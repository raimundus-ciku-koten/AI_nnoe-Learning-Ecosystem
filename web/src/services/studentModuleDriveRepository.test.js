import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  daftarModulSiswaTerenkripsiDrive,
  hapusBerkasVaultDrive,
  unduhBerkasTerenkripsiDrive,
  unggahBerkasTerenkripsiDrive,
} = vi.hoisted(() => ({
  daftarModulSiswaTerenkripsiDrive: vi.fn(),
  hapusBerkasVaultDrive: vi.fn(),
  unduhBerkasTerenkripsiDrive: vi.fn(),
  unggahBerkasTerenkripsiDrive: vi.fn(),
}));
vi.mock('./googleWorkspace.js', () => ({
  daftarModulSiswaTerenkripsiDrive,
  hapusBerkasVaultDrive,
  unduhBerkasTerenkripsiDrive,
  unggahBerkasTerenkripsiDrive,
}));

import {
  hapusModulSiswaDrive,
  muatModulSiswaDrive,
  simpanModulSiswaDrive,
} from './studentModuleDriveRepository.js';

const ownerUid = '11111111-1111-4111-8111-111111111111';
const recordId = '22222222-2222-4222-8222-222222222222';
const hash = 'a'.repeat(64);
const identity = { fingerprint: 'fingerprint', keyVersion: 1 };
const input = {
  mapel: 'Matematika',
  kelas: 'X',
  topik: 'Persamaan Linear',
  tp: 'Menyelesaikan persamaan linear dengan tepat.',
  jumlahJP: 8,
  durasi: 45,
  level: 'Campuran',
};
const section = {
  id: 'pengantar-daftar-isi',
  judul: 'Kata Pengantar dan Daftar Isi',
  markdown: 'Bagian ini menjelaskan tujuan dan alur belajar secara runtut untuk kalian. Materi disusun dari tujuan pembelajaran serta konteks yang diberikan guru dan dapat ditinjau sebelum digunakan.',
  provider: 'local',
  model: 'llama3.2:3b',
  fallbackUsed: false,
};

describe('repository Drive Modul Siswa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('menyimpan draf baru sebagai berkas vault terenkripsi dengan identitas pemilik', async () => {
    unggahBerkasTerenkripsiDrive.mockResolvedValue({
      id: 'drive-module-1',
      manifest: { ciphertextSha256: hash },
    });

    const saved = await simpanModulSiswaDrive({
      accessToken: 'google-token',
      ownerUid,
      identity,
      input,
      sections: [section],
    });
    const [token, owner, key, file, options] = unggahBerkasTerenkripsiDrive.mock.calls[0];
    const payload = JSON.parse(await file.text());

    expect([token, owner, key]).toEqual(['google-token', ownerUid, identity]);
    expect(options).toMatchObject({ category: 'student-module', recordId: saved.recordId });
    expect(payload).toMatchObject({
      schemaVersion: 1,
      ownerUid,
      recordId: saved.recordId,
      input,
      sections: [section],
    });
    expect(saved).toMatchObject({
      driveFileId: 'drive-module-1',
      ciphertextSha256: hash,
      judul: 'Matematika · X · Persamaan Linear',
    });
  });

  it('menggunakan revisi ciphertext untuk pembaruan dan mempertahankan konflik', async () => {
    const existingRecord = {
      recordId,
      driveFileId: 'drive-existing-1',
      ownerUid,
      createdAt: '2026-10-18T01:00:00.000Z',
      ciphertextSha256: hash,
    };
    unggahBerkasTerenkripsiDrive.mockRejectedValue(new Error('Berkas diubah di tempat lain.'));

    await expect(simpanModulSiswaDrive({
      accessToken: 'google-token',
      ownerUid,
      identity,
      input,
      sections: [section],
      existingRecord,
    })).rejects.toThrow('Berkas diubah di tempat lain.');

    expect(unggahBerkasTerenkripsiDrive).toHaveBeenCalledWith(
      'google-token',
      ownerUid,
      identity,
      expect.any(File),
      {
        category: 'student-module',
        fileId: existingRecord.driveFileId,
        expectedCiphertextSha256: hash,
      },
    );
  });

  it('memulihkan draf terenkripsi dan menolak payload milik akun lain', async () => {
    const payload = {
      schemaVersion: 1,
      recordId,
      ownerUid,
      createdAt: '2026-10-18T01:00:00.000Z',
      updatedAt: '2026-10-18T01:00:00.000Z',
      input,
      sections: [section],
    };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const file = {
      id: 'drive-module-1',
      appProperties: { aleCategory: 'student-module', aleRecord: recordId },
      manifest: { ciphertextSha256: hash },
    };
    daftarModulSiswaTerenkripsiDrive.mockResolvedValue({
      files: [file],
      nextPageToken: 'next-page',
    });
    unduhBerkasTerenkripsiDrive.mockResolvedValue({ bytes });

    const result = await muatModulSiswaDrive('google-token', ownerUid, identity);

    expect(daftarModulSiswaTerenkripsiDrive).toHaveBeenCalledWith('google-token', '');
    expect(result).toMatchObject({
      nextPageToken: 'next-page',
      entries: [{
        driveFileId: 'drive-module-1',
        recordId,
        judul: 'Matematika · X · Persamaan Linear',
        sections: [section],
      }],
    });
    expect(bytes.every((byte) => byte === 0)).toBe(true);

    const foreignBytes = new TextEncoder().encode(JSON.stringify({ ...payload, ownerUid: 'foreign-user' }));
    unduhBerkasTerenkripsiDrive.mockResolvedValue({ bytes: foreignBytes });
    await expect(muatModulSiswaDrive('google-token', ownerUid, identity))
      .rejects.toThrow('bukan milik akun ini');
    expect(foreignBytes.every((byte) => byte === 0)).toBe(true);
  });

  it('menolak bagian tidak valid sebelum mengunggah dan hanya menghapus draf milik pemiliknya', async () => {
    await expect(simpanModulSiswaDrive({
      ownerUid,
      identity,
      input,
      sections: [{ ...section, fallbackUsed: 'false' }],
    })).rejects.toThrow('Metadata penyedia AI');
    expect(unggahBerkasTerenkripsiDrive).not.toHaveBeenCalled();

    const record = {
      ownerUid,
      recordId,
      driveFileId: 'drive-module-1',
      ciphertextSha256: hash,
    };
    await hapusModulSiswaDrive({ accessToken: 'google-token', ownerUid, identity, record });
    expect(hapusBerkasVaultDrive).toHaveBeenCalledWith(
      'google-token',
      'drive-module-1',
      'student-module',
      identity,
    );
    await expect(hapusModulSiswaDrive({
      accessToken: 'google-token',
      ownerUid,
      identity,
      record: { ...record, ownerUid: 'foreign-user' },
    })).rejects.toThrow('Identitas draf Modul Siswa');
  });
});
