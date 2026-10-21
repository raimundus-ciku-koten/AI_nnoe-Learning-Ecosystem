import { supabase } from '../lib/supabase.ts';
import {
  daftarCatatanKerjaTerenkripsiDrive,
  hapusCatatanKerjaTerenkripsiDrive,
  unggahBerkasTerenkripsiDrive,
} from './googleWorkspace.js';
import { siapkanCatatanGuru } from './teacherWorkspace.js';

const DRIVE_ID = /^[A-Za-z0-9_-]{1,256}$/;

function entitlementActive(entitlement) {
  return ['trial', 'active'].includes(entitlement?.status) &&
    (!entitlement.valid_until || Date.parse(entitlement.valid_until) > Date.now());
}

async function pastikanHakTulis(tenantId, ownerId) {
  const [tenantEntitlement, personalEntitlement] = await Promise.all([
    supabase.from('tenant_entitlements')
      .select('status,valid_until')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    supabase.from('personal_entitlements')
      .select('plan_id,status,valid_until')
      .eq('user_id', ownerId)
      .maybeSingle(),
  ]);
  if (tenantEntitlement.error) throw tenantEntitlement.error;
  if (personalEntitlement.error) throw personalEntitlement.error;
  if (entitlementActive(tenantEntitlement.data)) return;
  if (entitlementActive(personalEntitlement.data)) {
    const { data: plan, error } = await supabase.from('billing_plans')
      .select('allowed_role,active')
      .eq('id', personalEntitlement.data.plan_id)
      .maybeSingle();
    if (error) throw error;
    if (plan?.active === true && plan.allowed_role === 'guru') return;
  }
  throw new Error('Langganan sekolah atau langganan pribadi guru yang aktif diperlukan untuk mengubah catatan.');
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

export async function muatCatatanGuruDrive(accessToken, identity, pageToken = '') {
  const result = await daftarCatatanKerjaTerenkripsiDrive(accessToken, identity, pageToken);
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
  await pastikanHakTulis(tenantId, ownerId);
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
  await pastikanHakTulis(tenantId, ownerId);
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
  await pastikanHakTulis(tenantId, ownerId);
  await hapusCatatanKerjaTerenkripsiDrive(accessToken, entryId, identity);
}
