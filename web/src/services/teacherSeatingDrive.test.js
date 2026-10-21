import { beforeEach, describe, expect, it, vi } from 'vitest';

const { googleDrive } = vi.hoisted(() => ({
  googleDrive: {
    daftarDenahTerenkripsiDrive: vi.fn(),
    unggahBerkasTerenkripsiDrive: vi.fn(),
  },
}));
vi.mock('./googleWorkspace.js', () => googleDrive);

import {
  muatDenahGuruDrive,
  simpanDenahGuruDrive,
} from './teacherSeatingDrive.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const IDENTITY = { publicKey: 'public', fingerprint: 'a'.repeat(64), keyVersion: 1 };
const REVISION = 'b'.repeat(64);
const PLAN = {
  kelas: 'X-A',
  baris: 2,
  kolom: 2,
  kursi: { '0-0': 'student-1' },
  kelompok: { 'student-1': 1 },
  jumlahKelompok: 2,
  diperbarui: '2026-10-18T00:00:00.000Z',
};

describe('encrypted teacher seating storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the selected class and removes references to students no longer in the roster', async () => {
    googleDrive.daftarDenahTerenkripsiDrive.mockResolvedValue({
      plans: [PLAN],
      ciphertextSha256: REVISION,
    });

    await expect(muatDenahGuruDrive('token', IDENTITY, 'X-A', [])).resolves.toEqual({
      data: {
        baris: 2,
        kolom: 2,
        kursi: {},
        kelompok: {},
        jumlahKelompok: 2,
      },
      ciphertextSha256: REVISION,
    });
  });

  it('preserves other class plans and writes the merged vault only as encrypted Drive payload', async () => {
    const otherPlan = { ...PLAN, kelas: 'XI-B' };
    googleDrive.daftarDenahTerenkripsiDrive.mockResolvedValue({
      id: 'drive-seating',
      plans: [otherPlan, PLAN],
      ciphertextSha256: REVISION,
    });
    let uploadedPayload;
    googleDrive.unggahBerkasTerenkripsiDrive.mockImplementation(async (
      _token, _owner, _identity, file,
    ) => {
      uploadedPayload = JSON.parse(await file.text());
      return {
        id: 'drive-seating',
        description: JSON.stringify({ ciphertextSha256: 'c'.repeat(64) }),
      };
    });

    const saved = await simpanDenahGuruDrive(
      'token',
      OWNER,
      IDENTITY,
      { ...PLAN, kursi: { '1-1': 'student-2' } },
      REVISION,
    );
    const [token, owner, identity, file, options] =
      googleDrive.unggahBerkasTerenkripsiDrive.mock.calls[0];
    expect([token, owner, identity]).toEqual(['token', OWNER, IDENTITY]);
    expect(file.name).toBe('teacher-seating.json');
    expect(options).toEqual({
      category: 'teacher-seating',
      fileId: 'drive-seating',
      expectedCiphertextSha256: REVISION,
    });
    expect(uploadedPayload.denah).toEqual([
      otherPlan,
      { ...PLAN, kursi: { '1-1': 'student-2' } },
    ]);
    expect(saved.ciphertextSha256).toBe('c'.repeat(64));
  });

  it('rejects stale revisions and malformed or duplicate class data before writing', async () => {
    googleDrive.daftarDenahTerenkripsiDrive.mockResolvedValue({
      id: 'drive-seating',
      plans: [PLAN],
      ciphertextSha256: 'd'.repeat(64),
    });
    await expect(simpanDenahGuruDrive('token', OWNER, IDENTITY, PLAN, REVISION))
      .rejects.toMatchObject({ code: 'drive/conflict' });
    expect(googleDrive.unggahBerkasTerenkripsiDrive).not.toHaveBeenCalled();

    googleDrive.daftarDenahTerenkripsiDrive.mockResolvedValue({
      plans: [PLAN, PLAN],
      ciphertextSha256: REVISION,
    });
    await expect(muatDenahGuruDrive('token', IDENTITY, 'X-A', ['student-1']))
      .rejects.toThrow('kelas ganda');
  });
});
