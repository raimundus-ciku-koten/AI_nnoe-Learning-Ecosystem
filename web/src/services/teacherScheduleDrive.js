import {
  daftarJadwalTerenkripsiDrive,
  unggahBerkasTerenkripsiDrive,
} from './googleWorkspace.js';
import { terapkanOperasi } from '../pages/dataDasar/jadwalUtil.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLES = new Set(['admin_sekolah', 'operator', 'guru']);

function pastikanAksesTulis(tenantId, ownerId, role) {
  if (!tenantId || !UUID.test(ownerId || '') || !ROLES.has(role)) {
    throw new Error('Akses jadwal tidak tersedia untuk akun ini.');
  }
}

function buatFile(schedule) {
  if (typeof File !== 'function') {
    throw new Error('Browser ini tidak mendukung berkas terenkripsi. Gunakan browser modern.');
  }
  return new File([JSON.stringify(schedule)], 'teacher-schedule.json', {
    type: 'application/json',
    lastModified: Date.now(),
  });
}

export async function muatJadwalGuruDrive(accessToken, identity) {
  const schedule = await daftarJadwalTerenkripsiDrive(accessToken, identity);
  return schedule || { id: null, entries: [], updatedAt: null, ciphertextSha256: null };
}

export async function ubahJadwalGuruDrive(
  accessToken,
  tenantId,
  ownerId,
  role,
  identity,
  operation,
  expectedCiphertextSha256,
) {
  pastikanAksesTulis(tenantId, ownerId, role);
  const current = await muatJadwalGuruDrive(accessToken, identity);
  if (current.ciphertextSha256 !== expectedCiphertextSha256) {
    const error = new Error('Jadwal berubah di perangkat lain. Muat ulang sebelum menyimpan agar perubahan tidak tertimpa.');
    error.code = 'drive/conflict';
    throw error;
  }
  const entries = terapkanOperasi(current.entries, operation);
  const updatedAt = new Date().toISOString();
  const file = buatFile({ entri: entries, diperbarui: updatedAt });
  const saved = await unggahBerkasTerenkripsiDrive(
    accessToken,
    ownerId,
    identity,
    file,
    {
      category: 'teacher-schedule',
      fileId: current.id,
      expectedCiphertextSha256: current.ciphertextSha256 || '',
    },
  );
  const manifest = JSON.parse(saved.description || '{}');
  if (!/^[a-f0-9]{64}$/.test(manifest.ciphertextSha256 || '')) {
    throw new Error('Drive tidak mengembalikan revisi jadwal terenkripsi yang valid.');
  }
  return {
    id: saved.id,
    entries,
    updatedAt,
    ciphertextSha256: manifest.ciphertextSha256,
  };
}
