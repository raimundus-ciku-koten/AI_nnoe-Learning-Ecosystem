import {
  daftarCatatanKerjaTerenkripsiDrive,
  hapusCatatanKerjaTerenkripsiDrive,
  unggahBerkasTerenkripsiDrive,
} from './googleWorkspace.js';
import { siapkanCatatanGuru } from './teacherWorkspace.js';

const DRIVE_ID = /^[A-Za-z0-9_-]{1,256}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pastikanHakTulis(tenantId, ownerId) {
  if (typeof tenantId !== 'string' || !tenantId.trim() || !UUID.test(ownerId || '')) {
    throw new Error('Identitas sekolah atau akun guru tidak valid.');
  }
}

function buatFile(entry) {
  if (typeof File !== 'function') {
    throw new Error('Browser ini tidak mendukung berkas terenkripsi. Gunakan browser modern.');
  }
  return new File([JSON.stringify(entry)], 'workspace-note.json', {
    type: 'application/json',
    lastModified: Date.now(),
  });
}

function payloadEnkripsi(entry, createdAt, updatedAt) {
  return {
    ...entry,
    createdAt,
    updatedAt,
  };
}

export async function muatCatatanGuruDrive(
  accessToken,
  identity,
  pageToken = '',
  pageSize = 50,
) {
  const result = await daftarCatatanKerjaTerenkripsiDrive(
    accessToken,
    identity,
    pageToken,
    pageSize,
  );
  return {
    entries: result.entries,
    hasMore: Boolean(result.nextPageToken),
    nextCursor: result.nextPageToken,
  };
}

export async function tambahCatatanGuruDrive(
  accessToken,
  tenantId,
  ownerId,
  identity,
  input,
) {
  pastikanHakTulis(tenantId, ownerId);
  const entry = siapkanCatatanGuru(input);
  const now = new Date().toISOString();
  const uploaded = await unggahBerkasTerenkripsiDrive(
    accessToken,
    ownerId,
    identity,
    buatFile(payloadEnkripsi(entry, now, now)),
    { category: 'teacher-workspace' },
  );
  const manifest = JSON.parse(uploaded.description || '{}');
  if (!/^[a-f0-9]{64}$/.test(manifest.ciphertextSha256 || '')) {
    throw new Error('Drive tidak mengembalikan revisi catatan terenkripsi yang valid.');
  }
  return {
    id: uploaded.id,
    ...entry,
    createdAt: now,
    updatedAt: now,
    ciphertextSha256: manifest.ciphertextSha256,
  };
}

export async function ubahCatatanGuruDrive(
  accessToken,
  tenantId,
  ownerId,
  identity,
  entryId,
  input,
  createdAt,
  expectedCiphertextSha256,
) {
  if (!DRIVE_ID.test(entryId || '') || !Number.isFinite(Date.parse(createdAt || ''))) {
    throw new TypeError('Identitas catatan kerja tidak valid.');
  }
  if (!/^[a-f0-9]{64}$/.test(expectedCiphertextSha256 || '')) {
    throw new TypeError('Revisi catatan terenkripsi tidak tersedia. Muat ulang sebelum menyimpan.');
  }
  pastikanHakTulis(tenantId, ownerId);
  const entry = siapkanCatatanGuru(input);
  const updatedAt = new Date(Math.max(Date.now(), Date.parse(createdAt))).toISOString();
  const uploaded = await unggahBerkasTerenkripsiDrive(
    accessToken,
    ownerId,
    identity,
    buatFile(payloadEnkripsi(entry, createdAt, updatedAt)),
    {
      category: 'teacher-workspace',
      fileId: entryId,
      expectedCiphertextSha256,
    },
  );
  const manifest = JSON.parse(uploaded.description || '{}');
  if (!/^[a-f0-9]{64}$/.test(manifest.ciphertextSha256 || '')) {
    throw new Error('Drive tidak mengembalikan revisi catatan terenkripsi yang valid.');
  }
  return {
    id: uploaded.id,
    ...entry,
    createdAt,
    updatedAt,
    ciphertextSha256: manifest.ciphertextSha256,
  };
}

export async function hapusCatatanGuruDrive(
  accessToken,
  tenantId,
  ownerId,
  identity,
  entryId,
) {
  if (!DRIVE_ID.test(entryId || '')) throw new TypeError('ID catatan kerja tidak valid.');
  pastikanHakTulis(tenantId, ownerId);
  await hapusCatatanKerjaTerenkripsiDrive(accessToken, entryId, identity);
}
