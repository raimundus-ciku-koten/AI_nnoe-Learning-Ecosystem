import { beforeEach, describe, expect, it, vi } from 'vitest';

const { googleDrive } = vi.hoisted(() => ({
  googleDrive: {
    daftarCatatanKerjaTerenkripsiDrive: vi.fn(),
    hapusCatatanKerjaTerenkripsiDrive: vi.fn(),
    unggahBerkasTerenkripsiDrive: vi.fn(),
  },
}));
vi.mock('./googleWorkspace.js', () => googleDrive);

import {
  hapusCatatanGuruDrive,
  muatCatatanGuruDrive,
  tambahCatatanGuruDrive,
  ubahCatatanGuruDrive,
} from './teacherWorkspaceDrive.js';

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

describe('encrypted Google Drive teacher workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    const [token, owner, identity, file, options] =
      googleDrive.unggahBerkasTerenkripsiDrive.mock.calls[0];
    expect([token, owner, identity]).toEqual(['token', OWNER_ID, IDENTITY]);
    expect(options).toEqual({ category: 'teacher-workspace' });
    expect(file.name).toBe('workspace-note.json');
    expect(JSON.parse(await file.text()).isi).toBe(NOTE.isi);
  });

  it('supports keyset paging, update, and deletion without entitlement checks', async () => {
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
  });
});
