import { beforeEach, describe, expect, it, vi } from 'vitest';

const { googleDrive, keyDirectory, authState, workspaceAuth, driveIdentity } = vi.hoisted(() => ({
  googleDrive: {
    bagikanBerkasDrive: vi.fn(),
    cabutBagikanBerkasDrive: vi.fn(),
    daftarIzinBerkasDrive: vi.fn(),
    daftarPaketPerencanaanTerenkripsiDrive: vi.fn(),
    hapusBerkasVaultDrive: vi.fn(),
    bukaPemilihPaketDrive: vi.fn(),
    unggahBerkasTerenkripsiDrive: vi.fn(),
    unduhBerkasTerenkripsiDrive: vi.fn(),
  },
  keyDirectory: {
    ambilKunciPublikPengguna: vi.fn(),
  },
  authState: {
    getState: vi.fn(),
  },
  workspaceAuth: {
    sesiGoogleWorkspacePerPengguna: vi.fn(),
  },
  driveIdentity: {
    identitasEnkripsiDriveDalamSesi: vi.fn(),
  },
}));

vi.mock('../../../state.js', () => authState);
vi.mock('../../../services/driveEncryption.js', () => driveIdentity);
vi.mock('../../../services/encryptionKeyDirectory.js', () => keyDirectory);
vi.mock('../../../services/googleWorkspace.js', () => googleDrive);
vi.mock('../../../services/googleWorkspaceAuth.js', () => workspaceAuth);

import {
  bacaInputAi,
  berikanAksesPaket,
  cabutAksesPaket,
  KonflikVersiError,
  dengarDaftarPaket,
  perbaruiPaket,
  pilihPaketAdminDrive,
  simpanDokumen,
} from './planningDriveRepository.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const TENANT = 'school-1';
const HASH = 'a'.repeat(64);
const IDENTITY = {
  publicKey: 'owner-public-key',
  fingerprint: 'b'.repeat(64),
  keyVersion: 1,
};
const BUNDLE = {
  schemaVersion: 1,
  id: '22222222-2222-4222-8222-222222222222',
  ownerUid: OWNER,
  tenantId: TENANT,
  rev: 1,
  konteks: { mapel: 'Matematika', kelas: 'X-A', fase: 'E', tahunAjaran: '2026/2027' },
  grants: [],
  documents: {},
  modules: {},
  createdAt: '2020-10-18T00:00:00.000Z',
  updatedAt: '2020-10-18T00:00:00.000Z',
};
const FILE = {
  id: 'drive-package-id',
  appProperties: { aleRecord: BUNDLE.id, aleCategory: 'planning-package' },
  manifest: {
    ciphertextSha256: HASH,
    keyEnvelopes: [{
      recipientKeyFingerprint: IDENTITY.fingerprint,
      keyVersion: IDENTITY.keyVersion,
    }],
  },
};
const ADMIN = {
  userId: '33333333-3333-4333-8333-333333333333',
  email: 'admin@example.test',
  publicKey: 'admin-public-key',
  fingerprint: 'c'.repeat(64),
  keyVersion: 1,
};

function setSession() {
  authState.getState.mockReturnValue({
    user: { uid: OWNER },
    tenantId: TENANT,
  });
  workspaceAuth.sesiGoogleWorkspacePerPengguna.mockReturnValue({
    accessToken: 'google-token',
    expiresAt: Date.now() + 60000,
  });
  driveIdentity.identitasEnkripsiDriveDalamSesi.mockReturnValue(IDENTITY);
}

function mockPackage(bundle = BUNDLE, hash = HASH) {
  googleDrive.daftarPaketPerencanaanTerenkripsiDrive.mockResolvedValue([{
    ...FILE,
    manifest: { ...FILE.manifest, ciphertextSha256: hash },
  }]);
  googleDrive.unduhBerkasTerenkripsiDrive.mockImplementation(async () => ({
    bytes: new TextEncoder().encode(JSON.stringify(bundle)),
  }));
}

describe('encrypted planning package repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    setSession();
    googleDrive.daftarPaketPerencanaanTerenkripsiDrive.mockResolvedValue([]);
  });

  it('lists only packages the signed-in owner can decrypt', async () => {
    mockPackage();
    const onData = vi.fn();
    const onError = vi.fn();
    const unsubscribe = dengarDaftarPaket(OWNER, TENANT, onData, onError);
    await vi.waitFor(() => expect(onData).toHaveBeenCalledOnce());
    expect(onData.mock.calls[0][0]).toMatchObject([{
      id: BUNDLE.id,
      mapel: 'Matematika',
      tenantId: TENANT,
      ciphertextSha256: HASH,
    }]);
    expect(onError).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('checks document revision and Drive ciphertext revision before updating encrypted package', async () => {
    const existingDocument = {
      ownerUid: OWNER,
      tenantId: TENANT,
      paketId: BUNDLE.id,
      jenis: 'rpe',
      schemaVersion: 1,
      rev: 2,
      sumber: 'mesin',
      sumberRev: { paket: 1 },
      payload: { totalJP: 100 },
      createdAt: '2026-10-18T00:00:00.000Z',
      updatedAt: '2026-10-18T00:00:00.000Z',
    };
    mockPackage({ ...BUNDLE, documents: { rpe: existingDocument } });
    googleDrive.unggahBerkasTerenkripsiDrive.mockResolvedValue({ id: FILE.id });

    await expect(simpanDokumen({
      uid: OWNER,
      tenantId: TENANT,
      paketId: BUNDLE.id,
      jenis: 'rpe',
      payload: { totalJP: 110 },
      sumber: 'mesin',
      sumberRev: { paket: 1 },
      revDasar: 1,
    })).rejects.toBeInstanceOf(KonflikVersiError);
    expect(googleDrive.unggahBerkasTerenkripsiDrive).not.toHaveBeenCalled();

    await expect(simpanDokumen({
      uid: OWNER,
      tenantId: TENANT,
      paketId: BUNDLE.id,
      jenis: 'rpe',
      payload: { totalJP: 110 },
      sumber: 'mesin',
      sumberRev: { paket: 1 },
      revDasar: 2,
    })).resolves.toBe(3);

    const [token, owner, identity, file, options] =
      googleDrive.unggahBerkasTerenkripsiDrive.mock.calls[0];
    expect([token, owner, identity]).toEqual(['google-token', OWNER, IDENTITY]);
    expect(options).toMatchObject({
      category: 'planning-package',
      fileId: FILE.id,
      expectedCiphertextSha256: HASH,
      recordId: BUNDLE.id,
    });
    const updated = JSON.parse(await file.text());
    expect(updated.rev).toBe(1);
    expect(updated.documents.rpe.rev).toBe(3);
    expect(updated.documents.rpe.payload.totalJP).toBe(110);
  });

  it('rejects a tenant mismatch and malformed encrypted document structure', async () => {
    mockPackage({ ...BUNDLE, tenantId: 'other-school' });
    const onError = vi.fn();
    const unsubscribe = dengarDaftarPaket(OWNER, TENANT, vi.fn(), onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(onError.mock.calls[0][0].message).toMatch(/tenant/i);
    unsubscribe();

    const malformed = { ...BUNDLE, documents: { secret: {} } };
    mockPackage(malformed);
    const nextError = vi.fn();
    const stop = dengarDaftarPaket(OWNER, TENANT, vi.fn(), nextError);
    await vi.waitFor(() => expect(nextError).toHaveBeenCalledOnce());
    expect(nextError.mock.calls[0][0].message).toMatch(/Dokumen perencanaan/i);
    stop();
  });

  it('loads only the minimum validated package context for the external AI generator', async () => {
    const rpe = {
      rev: 1,
      jenis: 'rpe',
      sumber: 'mesin',
      sumberRev: {},
      payload: { totalJP: 100, jpPerPekan: 5 },
    };
    const atp = {
      rev: 2,
      jenis: 'atp',
      sumber: 'ai',
      sumberRev: { rpe: 1 },
      payload: {
        unit: [{
          no: 1,
          nama: 'Bilangan',
          semester: 1,
          tp: [{ kode: 'E.1', rumusan: 'Mengenali bilangan.', materi: 'Bilangan' }],
        }],
      },
    };
    mockPackage({ ...BUNDLE, documents: { rpe, atp } });

    await expect(bacaInputAi({
      uid: OWNER,
      paketId: BUNDLE.id,
      jenis: 'modul',
      noUnit: 1,
    })).resolves.toEqual({
      mapel: 'Matematika',
      kelas: 'X-A',
      fase: 'E',
      tahunAjaran: '2026/2027',
      unit: {
        no: 1,
        nama: 'Bilangan',
        semester: 1,
        tp: [{ kode: 'E.1', rumusan: 'Mengenali bilangan.', materi: 'Bilangan' }],
      },
      kodeTp: ['E1'],
    });
  });

  it('bumps package revisions for context edits and shares only explicit recipient key envelopes', async () => {
    mockPackage();
    keyDirectory.ambilKunciPublikPengguna.mockResolvedValue(ADMIN);
    googleDrive.daftarIzinBerkasDrive.mockResolvedValue([]);
    googleDrive.bagikanBerkasDrive.mockResolvedValue({ id: 'reader-permission' });
    googleDrive.unggahBerkasTerenkripsiDrive.mockResolvedValue({ id: FILE.id });

    await berikanAksesPaket({
      uid: OWNER,
      tenantId: TENANT,
      paketId: BUNDLE.id,
      adminId: ADMIN.userId,
    });
    const [, , , sharedFile, shareOptions] =
      googleDrive.unggahBerkasTerenkripsiDrive.mock.calls[0];
    const sharedBundle = JSON.parse(await sharedFile.text());
    expect(sharedBundle.grants).toEqual([{
      userId: ADMIN.userId,
      email: ADMIN.email,
      fingerprint: ADMIN.fingerprint,
      keyVersion: ADMIN.keyVersion,
    }]);
    expect(shareOptions.recipients).toEqual([
      {
        userId: OWNER,
        publicKey: IDENTITY.publicKey,
        fingerprint: IDENTITY.fingerprint,
        keyVersion: IDENTITY.keyVersion,
      },
      {
        userId: ADMIN.userId,
        publicKey: ADMIN.publicKey,
        fingerprint: ADMIN.fingerprint,
        keyVersion: ADMIN.keyVersion,
      },
    ]);

    mockPackage({ ...BUNDLE, grants: sharedBundle.grants });
    await perbaruiPaket({
      uid: OWNER,
      paketId: BUNDLE.id,
      konteks: { ...BUNDLE.konteks, kelas: 'X-B' },
      revDasar: 1,
    });
    const [, , , updatedFile] =
      googleDrive.unggahBerkasTerenkripsiDrive.mock.calls[1];
    const updatedBundle = JSON.parse(await updatedFile.text());
    expect(updatedBundle.rev).toBe(2);
    expect(updatedBundle.grants).toEqual(sharedBundle.grants);
  });

  it('removes the recipient envelope before revoking the Google Drive reader permission', async () => {
    const grant = {
      userId: ADMIN.userId,
      email: ADMIN.email,
      fingerprint: ADMIN.fingerprint,
      keyVersion: ADMIN.keyVersion,
    };
    mockPackage({ ...BUNDLE, grants: [grant] });
    keyDirectory.ambilKunciPublikPengguna.mockResolvedValue(ADMIN);
    googleDrive.unggahBerkasTerenkripsiDrive.mockResolvedValue({ id: FILE.id });
    googleDrive.daftarIzinBerkasDrive.mockResolvedValue([{
      id: 'reader-permission',
      type: 'user',
      role: 'reader',
      emailAddress: ADMIN.email,
    }]);

    await cabutAksesPaket({
      uid: OWNER,
      tenantId: TENANT,
      paketId: BUNDLE.id,
      adminId: ADMIN.userId,
    });

    const [, , , file] = googleDrive.unggahBerkasTerenkripsiDrive.mock.calls[0];
    expect(JSON.parse(await file.text()).grants).toEqual([]);
    expect(googleDrive.cabutBagikanBerkasDrive).toHaveBeenCalledWith(
      'google-token',
      FILE.id,
      'reader-permission',
    );
  });

  it('makes an admin open only explicitly shared packages selected in Google Picker', async () => {
    authState.getState.mockReturnValue({
      user: { uid: ADMIN.userId },
      tenantId: TENANT,
      role: 'admin_sekolah',
    });
    driveIdentity.identitasEnkripsiDriveDalamSesi.mockReturnValue({
      ...IDENTITY,
      fingerprint: ADMIN.fingerprint,
    });
    const sharedBundle = {
      ...BUNDLE,
      grants: [{
        userId: ADMIN.userId,
        email: ADMIN.email,
        fingerprint: ADMIN.fingerprint,
        keyVersion: ADMIN.keyVersion,
      }],
    };
    const sharedFile = {
      ...FILE,
      manifest: {
        ...FILE.manifest,
        keyEnvelopes: [
          ...FILE.manifest.keyEnvelopes,
          {
            recipientKeyFingerprint: ADMIN.fingerprint,
            keyVersion: ADMIN.keyVersion,
          },
        ],
      },
    };
    googleDrive.bukaPemilihPaketDrive.mockResolvedValue([FILE.id]);
    googleDrive.daftarPaketPerencanaanTerenkripsiDrive.mockResolvedValue([sharedFile]);
    googleDrive.unduhBerkasTerenkripsiDrive.mockResolvedValue({
      bytes: new TextEncoder().encode(JSON.stringify(sharedBundle)),
    });

    await expect(pilihPaketAdminDrive(OWNER)).resolves.toBe(1);
    expect(googleDrive.bukaPemilihPaketDrive).toHaveBeenCalledWith('google-token');
    expect(googleDrive.daftarPaketPerencanaanTerenkripsiDrive)
      .toHaveBeenCalledWith('google-token', [FILE.id], { includeCreatedFiles: false });
  });
});
