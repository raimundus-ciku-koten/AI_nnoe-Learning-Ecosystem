import {
  daftarDenahTerenkripsiDrive,
  unggahBerkasTerenkripsiDrive,
} from './googleWorkspace.js';
import { bersihkanDenah } from '../pages/dataDasar/denahLogika.js';

const PLAN_FIELDS = ['baris', 'diperbarui', 'jumlahKelompok', 'kelas', 'kolom', 'kelompok', 'kursi'];
const MAX_PLANS = 300;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validatePlan(plan) {
  if (!isPlainObject(plan) ||
      Object.keys(plan).sort().join(',') !== [...PLAN_FIELDS].sort().join(',') ||
      typeof plan.kelas !== 'string' || !plan.kelas.trim() || plan.kelas.length > 30 ||
      !Number.isInteger(plan.baris) || plan.baris < 1 || plan.baris > 10 ||
      !Number.isInteger(plan.kolom) || plan.kolom < 1 || plan.kolom > 10 ||
      !Number.isInteger(plan.jumlahKelompok) || plan.jumlahKelompok < 2 || plan.jumlahKelompok > 10 ||
      typeof plan.diperbarui !== 'string' || !Number.isFinite(Date.parse(plan.diperbarui)) ||
      !isPlainObject(plan.kursi) || Object.keys(plan.kursi).length > 100 ||
      !isPlainObject(plan.kelompok) || Object.keys(plan.kelompok).length > 100) {
    throw new Error('Denah terenkripsi berisi data atau struktur yang tidak valid.');
  }

  const seated = new Set();
  for (const [key, studentId] of Object.entries(plan.kursi)) {
    const match = /^(\d{1,2})-(\d{1,2})$/.exec(key);
    if (!match || Number(match[1]) >= plan.baris || Number(match[2]) >= plan.kolom ||
        typeof studentId !== 'string' || !studentId || seated.has(studentId)) {
      throw new Error('Denah terenkripsi berisi posisi kursi yang tidak valid.');
    }
    seated.add(studentId);
  }
  for (const [studentId, group] of Object.entries(plan.kelompok)) {
    if (!studentId || !Number.isInteger(group) || group < 1 || group > plan.jumlahKelompok) {
      throw new Error('Denah terenkripsi berisi pembagian kelompok yang tidak valid.');
    }
  }
  return plan;
}

function validatePlans(plans) {
  if (!Array.isArray(plans) || plans.length > MAX_PLANS) {
    throw new Error('Daftar denah terenkripsi tidak valid atau terlalu besar.');
  }
  const classes = new Set();
  for (const plan of plans) {
    validatePlan(plan);
    if (classes.has(plan.kelas)) throw new Error('Denah terenkripsi memiliki kelas ganda.');
    classes.add(plan.kelas);
  }
  return plans;
}

function buatFile(payload) {
  if (typeof File !== 'function') {
    throw new Error('Browser ini tidak mendukung berkas terenkripsi. Gunakan browser modern.');
  }
  return new File([JSON.stringify(payload)], 'teacher-seating.json', {
    type: 'application/json',
    lastModified: Date.now(),
  });
}

export async function muatDenahGuruDrive(accessToken, identity, kelas, studentIds) {
  const vault = await daftarDenahTerenkripsiDrive(accessToken, identity);
  const plans = validatePlans(vault?.plans ?? []);
  const plan = plans.find((entry) => entry.kelas === kelas);
  return {
    data: bersihkanDenah(plan ?? {}, studentIds),
    ciphertextSha256: vault?.ciphertextSha256 ?? null,
  };
}

export async function simpanDenahGuruDrive(
  accessToken,
  ownerId,
  identity,
  plan,
  expectedCiphertextSha256,
) {
  validatePlan(plan);
  const current = await daftarDenahTerenkripsiDrive(accessToken, identity);
  if ((current?.ciphertextSha256 ?? null) !== expectedCiphertextSha256) {
    const error = new Error('Denah berubah di perangkat lain. Muat ulang sebelum menyimpan agar perubahan tidak tertimpa.');
    error.code = 'drive/conflict';
    throw error;
  }
  const plans = validatePlans(current?.plans ?? []);
  const updatedPlan = { ...plan };
  const index = plans.findIndex((entry) => entry.kelas === plan.kelas);
  if (index === -1) plans.push(updatedPlan);
  else plans[index] = updatedPlan;
  if (plans.length > MAX_PLANS) throw new Error('Batas jumlah denah kelas pada vault tercapai.');

  const file = buatFile({ denah: plans, diperbarui: new Date().toISOString() });
  const saved = await unggahBerkasTerenkripsiDrive(
    accessToken,
    ownerId,
    identity,
    file,
    {
      category: 'teacher-seating',
      fileId: current?.id ?? null,
      expectedCiphertextSha256: current?.ciphertextSha256 ?? '',
    },
  );
  const manifest = JSON.parse(saved.description || '{}');
  if (!/^[a-f0-9]{64}$/.test(manifest.ciphertextSha256 || '')) {
    throw new Error('Drive tidak mengembalikan revisi denah terenkripsi yang valid.');
  }
  return { ciphertextSha256: manifest.ciphertextSha256 };
}
