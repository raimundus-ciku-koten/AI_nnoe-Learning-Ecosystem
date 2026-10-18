import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase, googleDrive } = vi.hoisted(() => ({
  supabase: { from: vi.fn() },
  googleDrive: {
    daftarJadwalTerenkripsiDrive: vi.fn(),
    unggahBerkasTerenkripsiDrive: vi.fn(),
  },
}));
vi.mock('../lib/supabase.ts', () => ({ supabase }));
vi.mock('./googleWorkspace.js', () => googleDrive);

import {
  muatJadwalGuruDrive,
  ubahJadwalGuruDrive,
} from './teacherScheduleDrive.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const IDENTITY = { publicKey: 'public', fingerprint: 'a'.repeat(64), keyVersion: 1 };
const SESSION = {
  id: 'drive-schedule-id',
  entries: [{
    id: 'lesson-1',
    hari: 1,
    mulai: '07:00',
    selesai: '07:40',
    kelas: 'X-A',
    mapel: 'Matematika',
  }],
  updatedAt: '2026-10-18T00:00:00.000Z',
  ciphertextSha256: 'b'.repeat(64),
};

function queryResult(response) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve(response)),
  };
  return query;
}

describe('encrypted teacher schedule storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabase.from.mockImplementation(() => queryResult({
      data: { status: 'active', valid_until: null },
      error: null,
    }));
  });

  it('loads the encrypted schedule without storing schedule content in Supabase', async () => {
    googleDrive.daftarJadwalTerenkripsiDrive.mockResolvedValue(SESSION);
    await expect(muatJadwalGuruDrive('token', IDENTITY)).resolves.toEqual(SESSION);
    expect(googleDrive.daftarJadwalTerenkripsiDrive).toHaveBeenCalledWith('token', IDENTITY);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('applies domain validation and writes a new schedule only as encrypted Drive payload', async () => {
    googleDrive.daftarJadwalTerenkripsiDrive.mockResolvedValueOnce(null);
    googleDrive.unggahBerkasTerenkripsiDrive.mockImplementation(async (
      _token, _owner, _identity, file,
    ) => ({
      id: 'new-schedule-id',
      description: JSON.stringify({ ciphertextSha256: 'd'.repeat(64) }),
      clearPayload: JSON.parse(await file.text()),
    }));

    const result = await ubahJadwalGuruDrive(
      'token',
      'school-1',
      OWNER,
      'guru',
      IDENTITY,
      {
        jenis: 'tambah',
        sesi: {
          id: 'lesson-new',
          hari: 2,
          mulai: '08:00',
          selesai: '08:40',
          kelas: 'XI-A',
          mapel: 'Fisika',
        },
      },
      null,
    );
    const [token, owner, identity, file, options] =
      googleDrive.unggahBerkasTerenkripsiDrive.mock.calls[0];
    expect([token, owner, identity]).toEqual(['token', OWNER, IDENTITY]);
    expect(options).toEqual({
      category: 'teacher-schedule',
      fileId: null,
      expectedCiphertextSha256: '',
    });
    expect(file.name).toBe('teacher-schedule.json');
    expect(JSON.parse(await file.text()).entri).toHaveLength(1);
    expect(result).toMatchObject({
      id: 'new-schedule-id',
      entries: [{ id: 'lesson-new', mapel: 'Fisika' }],
      ciphertextSha256: 'd'.repeat(64),
    });
  });

  it('rejects a stale revision before overwriting a changed Drive schedule', async () => {
    googleDrive.daftarJadwalTerenkripsiDrive.mockResolvedValue(SESSION);
    await expect(ubahJadwalGuruDrive(
      'token',
      'school-1',
      OWNER,
      'guru',
      IDENTITY,
      { jenis: 'hapus', id: 'lesson-1' },
      'c'.repeat(64),
    )).rejects.toMatchObject({ code: 'drive/conflict' });
    expect(googleDrive.unggahBerkasTerenkripsiDrive).not.toHaveBeenCalled();
  });

  it('rejects conflicting sessions and requires active entitlement before writing', async () => {
    googleDrive.daftarJadwalTerenkripsiDrive.mockResolvedValue(SESSION);
    await expect(ubahJadwalGuruDrive(
      'token',
      'school-1',
      OWNER,
      'guru',
      IDENTITY,
      {
        jenis: 'tambah',
        sesi: {
          id: 'lesson-2',
          hari: 1,
          mulai: '07:20',
          selesai: '08:00',
          kelas: 'X-B',
          mapel: 'Kimia',
        },
      },
      SESSION.ciphertextSha256,
    )).rejects.toThrow('Bentrok');
    expect(googleDrive.unggahBerkasTerenkripsiDrive).not.toHaveBeenCalled();

    supabase.from.mockImplementation(() => queryResult({ data: null, error: null }));
    await expect(ubahJadwalGuruDrive(
      'token',
      'school-1',
      OWNER,
      'operator',
      IDENTITY,
      { jenis: 'hapus', id: 'lesson-1' },
      SESSION.ciphertextSha256,
    )).rejects.toThrow('Langganan sekolah');
  });
});
