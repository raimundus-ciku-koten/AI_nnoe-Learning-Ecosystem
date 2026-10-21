#!/usr/bin/env node
/**
 * scripts/set-role.mjs — Beri peran & sekolah pada akun (custom claims + profil).
 *
 * Pemakaian:
 *   node scripts/set-role.mjs --proyek ID --email guru@sekolah.sch.id --peran guru --tenant sman1-kupang
 *   node scripts/set-role.mjs --proyek ID --email saya@gmail.com --peran superadmin
 *   node scripts/set-role.mjs ... --tenant-nama "SMAN 1 Kupang" --sampai 2027-06-30   (buat sekolah baru + langganan aktif)
 *
 * Emulator (tanpa kredensial):
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     node scripts/set-role.mjs --proyek demo-ainnoe --email guru@contoh.id --peran guru --tenant sekolah-a
 *
 * Produksi: `gcloud auth application-default login` atau set GOOGLE_APPLICATION_CREDENTIALS.
 * Pengguna tidak perlu keluar-masuk: klaimVersi berubah → sesi di browser menyegarkan token sendiri.
 */
import { parseArgs } from 'node:util';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

const PERAN = ['superadmin', 'admin_sekolah', 'operator', 'guru', 'siswa', 'ortu', 'demo'];

const { values: a } = parseArgs({
  options: {
    proyek:       { type: 'string' },
    email:        { type: 'string' },
    peran:        { type: 'string' },
    tenant:       { type: 'string' },
    'tenant-nama': { type: 'string' },
    sampai:       { type: 'string' },
    nama:         { type: 'string' },
  },
});

function gagal(pesan) { console.error('✗ ' + pesan); process.exit(1); }

const proyek = a.proyek || process.env.GCLOUD_PROJECT;
if (!proyek)              gagal('Isi --proyek <project-id> (atau GCLOUD_PROJECT).');
if (!a.email)             gagal('Isi --email.');
if (!PERAN.includes(a.peran)) gagal(`--peran harus salah satu: ${PERAN.join(', ')}.`);
if (a.peran !== 'superadmin' && !a.tenant) gagal('--tenant wajib untuk semua peran selain superadmin.');
if (a.tenant && !/^[a-z0-9][a-z0-9-]{1,62}$/.test(a.tenant)) gagal('--tenant: huruf kecil, angka, tanda hubung (2–63 karakter).');

const pakaiEmulator = !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
initializeApp(pakaiEmulator ? { projectId: proyek } : { projectId: proyek, credential: applicationDefault() });

const auth = getAuth();
const db = getFirestore();

const pengguna = await auth.getUserByEmail(a.email).catch(() => null);
if (!pengguna) gagal(`Akun ${a.email} belum terdaftar. Minta pengguna masuk sekali dulu.`);

// 1) Sekolah (opsional dibuat sekali; tidak menimpa yang sudah ada)
if (a['tenant-nama']) {
  const ref = db.doc(`tenants/${a.tenant}`);
  if ((await ref.get()).exists) {
    console.log(`• Sekolah ${a.tenant} sudah ada — tidak diubah.`);
  } else {
    const sampai = a.sampai ? Timestamp.fromDate(new Date(`${a.sampai}T23:59:59+08:00`)) : null;
    if (a.sampai && Number.isNaN(sampai.toMillis())) gagal('--sampai harus berformat YYYY-MM-DD.');
    await ref.set({
      nama: a['tenant-nama'],
      langganan: { aktif: true, paket: 'trial', ...(sampai ? { sampai } : {}) },
      dibuat: FieldValue.serverTimestamp(),
    });
    console.log(`✓ Sekolah ${a.tenant} dibuat.`);
  }
} else if (a.tenant && !(await db.doc(`tenants/${a.tenant}`).get()).exists) {
  console.warn(`! Dokumen tenants/${a.tenant} belum ada — tambahkan --tenant-nama agar dibuat.`);
}

// 2) Claims + penanda versi (kv) agar sesi terbuka menyadari perubahannya
const kv = Date.now();
const klaim = { role: a.peran, kv, ...(a.tenant ? { tenantId: a.tenant } : {}) };
await auth.setCustomUserClaims(pengguna.uid, klaim);

// 3) Profil. set(..., { merge: true }) → data lain tetap utuh.
await db.doc(`users/${pengguna.uid}`).set({
  email: a.email,
  nama: a.nama || pengguna.displayName || a.email.split('@')[0],
  role: a.peran,
  tenantId: a.tenant ?? FieldValue.delete(),
  klaimVersi: kv,
}, { merge: true });

console.log(`✓ ${a.email} → peran "${a.peran}"${a.tenant ? `, sekolah "${a.tenant}"` : ''}.`);
