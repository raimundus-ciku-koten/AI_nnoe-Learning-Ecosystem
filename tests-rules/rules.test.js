// Uji Security Rules memakai Emulator Suite. Jalankan: cd tests-rules && npm i && npm test
// (butuh Java + firebase-tools; emulator Firestore dijalankan oleh `firebase emulators:exec`).
import test, { before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

let env;
const PID = 'A1b2C3d4E5f6G7h8I9j0';
const guruA = { role: 'guru', tenantId: 'sekolah-a' };

const dbGuru = (uid, klaim = guruA) => env.authenticatedContext(uid, klaim).firestore();
const paketBaik = (uid, tenantId = 'sekolah-a') => ({
  ownerUid: uid, tenantId, schemaVersion: 1, rev: 1,
  mapel: 'Matematika', kelas: 'X', fase: 'E', tahunAjaran: '2026/2027', jpPerPekan: 4, totalJP: null,
  hariPembelajaran: [1, 4], ganjil: { mulai: '2026-07-13', selesai: '2026-12-19' }, genap: { mulai: '2027-01-05', selesai: '2027-06-19' },
  kalender: [], identitas: { guru: 'Maria' }, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
});
const dokBaik = (uid, jenis, tenantId = 'sekolah-a', ekstra = {}) => ({
  ownerUid: uid, tenantId, paketId: PID, jenis, schemaVersion: 1, rev: 1, sumber: 'mesin',
  sumberRev: { paket: 1 }, payload: { x: 1 }, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...ekstra
});

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-ainnoe', firestore: { rules: readFileSync('../firestore.rules', 'utf8') } });
});
after(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const buatPaket = (uid = 'g1', tenant = 'sekolah-a') =>
  env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), `perencanaan/${uid}/paket/${PID}`),
    { ...paketBaik(uid, tenant), createdAt: new Date(), updatedAt: new Date() }));

test('guru membuat paket sendiri: boleh; milik orang lain / tenant palsu / rev≠1: ditolak', async () => {
  await assertSucceeds(setDoc(doc(dbGuru('g1'), `perencanaan/g1/paket/${PID}`), paketBaik('g1')));
  await assertFails(setDoc(doc(dbGuru('g2'), `perencanaan/g1/paket/${PID}`), paketBaik('g1')));
  await assertFails(setDoc(doc(dbGuru('g1'), `perencanaan/g1/paket/${PID}`), paketBaik('g1', 'sekolah-lain')));
  await assertFails(setDoc(doc(dbGuru('g1'), `perencanaan/g1/paket/${PID}`), { ...paketBaik('g1'), rev: 5 }));
});

test('bentuk paket tidak valid ditolak (JP, fase, bidang liar, tanggal)', async () => {
  const ref = (db) => doc(db, `perencanaan/g1/paket/${PID}`);
  await assertFails(setDoc(ref(dbGuru('g1')), { ...paketBaik('g1'), jpPerPekan: 99 }));
  await assertFails(setDoc(ref(dbGuru('g1')), { ...paketBaik('g1'), fase: 'Z' }));
  await assertFails(setDoc(ref(dbGuru('g1')), { ...paketBaik('g1'), admin: true }));
  await assertFails(setDoc(ref(dbGuru('g1')), { ...paketBaik('g1'), ganjil: { mulai: 'kemarin', selesai: '2026-12-19' } }));
});

test('peran selain guru, atau tanpa tenant, tidak bisa menulis', async () => {
  await assertFails(setDoc(doc(dbGuru('g1', { role: 'siswa', tenantId: 'sekolah-a' }), `perencanaan/g1/paket/${PID}`), paketBaik('g1')));
  await assertFails(setDoc(doc(dbGuru('g1', { role: 'guru' }), `perencanaan/g1/paket/${PID}`), paketBaik('g1')));
  await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), `perencanaan/g1/paket/${PID}`), paketBaik('g1')));
});

test('pembaruan paket wajib rev+1 dan tidak boleh mengganti pemilik/tenant', async () => {
  await buatPaket();
  const ref = doc(dbGuru('g1'), `perencanaan/g1/paket/${PID}`);
  await assertFails(updateDoc(ref, { mapel: 'IPA', rev: 1, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { mapel: 'IPA', rev: 3, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { tenantId: 'sekolah-lain', rev: 2, updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { mapel: 'IPA', rev: 2, updatedAt: serverTimestamp() }));
});

test('isolasi: guru lain tidak bisa membaca; admin sekolah SAMA bisa baca; admin sekolah lain tidak', async () => {
  await buatPaket('g1', 'sekolah-a');
  await assertFails(getDoc(doc(dbGuru('g2'), `perencanaan/g1/paket/${PID}`)));
  await assertSucceeds(getDoc(doc(dbGuru('adm', { role: 'admin_sekolah', tenantId: 'sekolah-a' }), `perencanaan/g1/paket/${PID}`)));
  await assertFails(getDoc(doc(dbGuru('adm2', { role: 'admin_sekolah', tenantId: 'sekolah-b' }), `perencanaan/g1/paket/${PID}`)));
  await assertFails(setDoc(doc(dbGuru('adm', { role: 'admin_sekolah', tenantId: 'sekolah-a' }), `perencanaan/g1/paket/${PID}`), { mapel: 'x' }));
});

test('dokumen: dibuat pemilik pada paket yang ada; jenis liar, pemilik palsu, dan tanpa paket ditolak', async () => {
  const db = dbGuru('g1');
  await assertFails(setDoc(doc(db, `perencanaan/g1/paket/${PID}/dokumen/rpe`), dokBaik('g1', 'rpe'))); // paket belum ada
  await buatPaket();
  await assertSucceeds(setDoc(doc(db, `perencanaan/g1/paket/${PID}/dokumen/rpe`), dokBaik('g1', 'rpe')));
  await assertFails(setDoc(doc(db, `perencanaan/g1/paket/${PID}/dokumen/rahasia`), dokBaik('g1', 'rahasia')));
  await assertFails(setDoc(doc(db, `perencanaan/g1/paket/${PID}/dokumen/atp`), dokBaik('g2', 'atp')));
  await assertFails(setDoc(doc(db, `perencanaan/g1/paket/${PID}/dokumen/atp`), dokBaik('g1', 'atp', 'sekolah-a', { sumber: 'hacker' })));
});

test('dokumen: kontrol versi — update harus rev+1; createdAt tidak boleh diubah', async () => {
  await buatPaket();
  const ref = doc(dbGuru('g1'), `perencanaan/g1/paket/${PID}/dokumen/rpe`);
  await assertSucceeds(setDoc(ref, dokBaik('g1', 'rpe')));
  await assertFails(setDoc(ref, { ...dokBaik('g1', 'rpe'), rev: 1 }));
  await assertFails(setDoc(ref, { ...dokBaik('g1', 'rpe'), rev: 3 }));
  await assertSucceeds(setDoc(ref, { ...dokBaik('g1', 'rpe'), rev: 2, createdAt: (await getDoc(ref)).data().createdAt }));
});

test('modul: nomor unit harus cocok dengan id dokumen', async () => {
  await buatPaket();
  const db = dbGuru('g1');
  await assertSucceeds(setDoc(doc(db, `perencanaan/g1/paket/${PID}/modul/2`), dokBaik('g1', 'modul', 'sekolah-a', { noUnit: 2 })));
  await assertFails(setDoc(doc(db, `perencanaan/g1/paket/${PID}/modul/3`), dokBaik('g1', 'modul', 'sekolah-a', { noUnit: 2 })));
  await assertFails(setDoc(doc(db, `perencanaan/g1/paket/${PID}/modul/abc`), dokBaik('g1', 'modul', 'sekolah-a', { noUnit: 1 })));
});

test('rateLimits dan koleksi tak dikenal tertutup; hapus oleh pemilik boleh', async () => {
  await assertFails(getDoc(doc(dbGuru('g1'), 'rateLimits/g1')));
  await assertFails(setDoc(doc(dbGuru('g1'), 'rateLimits/g1'), { jamN: 0 }));
  await assertFails(setDoc(doc(dbGuru('g1'), 'sembarang/x'), { a: 1 }));
  await buatPaket();
  await assertFails(deleteDoc(doc(dbGuru('g2'), `perencanaan/g1/paket/${PID}`)));
  await assertSucceeds(deleteDoc(doc(dbGuru('g1'), `perencanaan/g1/paket/${PID}`)));
});
