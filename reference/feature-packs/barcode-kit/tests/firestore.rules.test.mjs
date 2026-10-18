// tests/firestore.rules.test.mjs
// Jalankan:  firebase emulators:exec --only firestore "node --test tests/firestore.rules.test.mjs"
// Prasyarat: npm i -D @firebase/rules-unit-testing firebase   (Java 11+ untuk emulator)
import { before, after, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

let env;
const admin = () => env.authenticatedContext('adm1', { role: 'admin' }).firestore();
const guru = () => env.authenticatedContext('gru1', { role: 'guru' }).firestore();
const siswaBiasa = () => env.authenticatedContext('sis1', { role: 'siswa' }).firestore();
const tamu = () => env.unauthenticatedContext().firestore();

const TGL = '2026-10-15';
const absensiBaru = (extra = {}) => ({
  siswaId: 's1', kelas: 'X-1', tanggal: TGL, status: 'hadir',
  waktu: serverTimestamp(), dicatatOleh: 'gru1', sumber: 'barcode', ...extra,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-absensi',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
after(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'siswa/s1'), { nama: 'Ani', kelas: 'X-1', nisn: '0051234567' });
    await setDoc(doc(db, 'siswa/s2'), { nama: 'Budi', kelas: 'X-1', kodeUnik: 'ALE-X1-AAAAAA-0002' });
  });
});

describe('siswa', () => {
  it('guru & admin boleh membaca; tamu dan peran lain tidak', async () => {
    await assertSucceeds(getDoc(doc(guru(), 'siswa/s1')));
    await assertSucceeds(getDoc(doc(admin(), 'siswa/s1')));
    await assertFails(getDoc(doc(tamu(), 'siswa/s1')));
    await assertFails(getDoc(doc(siswaBiasa(), 'siswa/s1')));
  });

  it('guru tidak boleh menulis siswa', async () => {
    await assertFails(updateDoc(doc(guru(), 'siswa/s1'), { nama: 'Ani B' }));
  });

  it('admin boleh mengisi kodeUnik SEKALI dengan format valid', async () => {
    await assertSucceeds(updateDoc(doc(admin(), 'siswa/s1'), { kodeUnik: 'ALE-X1-BBBBBB-4567' }));
  });

  it('kodeUnik yang sudah terisi tidak boleh diubah, bahkan oleh admin', async () => {
    await assertFails(updateDoc(doc(admin(), 'siswa/s2'), { kodeUnik: 'ALE-X1-CCCCCC-0002' }));
  });

  it('admin tetap boleh mengedit field lain tanpa menyentuh kode', async () => {
    await assertSucceeds(updateDoc(doc(admin(), 'siswa/s2'), { nama: 'Budi S.' }));
  });

  it('format kode tidak valid ditolak', async () => {
    await assertFails(updateDoc(doc(admin(), 'siswa/s1'), { kodeUnik: 'a b/c' }));
    await assertFails(updateDoc(doc(admin(), 'siswa/s1'), { kodeUnik: 123456 }));
  });
});

describe('absensi', () => {
  it('guru boleh membuat absensi valid sekali', async () => {
    await assertSucceeds(setDoc(doc(guru(), `absensi/${TGL}_s1`), absensiBaru()));
  });

  it('pemindaian kedua di hari sama ditolak (tidak bisa menimpa)', async () => {
    await assertSucceeds(setDoc(doc(guru(), `absensi/${TGL}_s1`), absensiBaru()));
    await assertFails(setDoc(doc(guru(), `absensi/${TGL}_s1`), absensiBaru()));
  });

  it('menolak: uid pencatat palsu, id dokumen tak sesuai, status lain, siswa tak ada, field ekstra', async () => {
    await assertFails(setDoc(doc(guru(), `absensi/${TGL}_s1`), absensiBaru({ dicatatOleh: 'orang-lain' })));
    await assertFails(setDoc(doc(guru(), 'absensi/acak'), absensiBaru()));
    await assertFails(setDoc(doc(guru(), `absensi/${TGL}_s1`), absensiBaru({ status: 'alpa' })));
    await assertFails(setDoc(doc(guru(), `absensi/${TGL}_zzz`), absensiBaru({ siswaId: 'zzz' })));
    await assertFails(setDoc(doc(guru(), `absensi/${TGL}_s1`), absensiBaru({ catatan: 'x' })));
  });

  it('menolak waktu dari klien (harus server timestamp)', async () => {
    await assertFails(setDoc(doc(guru(), `absensi/${TGL}_s1`), absensiBaru({ waktu: new Date('2020-01-01') })));
  });

  it('guru tidak boleh mengubah/menghapus; admin boleh', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `absensi/${TGL}_s1`), { ...absensiBaru(), waktu: new Date() });
    });
    await assertFails(updateDoc(doc(guru(), `absensi/${TGL}_s1`), { status: 'hadir' }));
    await assertFails(deleteDoc(doc(guru(), `absensi/${TGL}_s1`)));
    await assertSucceeds(deleteDoc(doc(admin(), `absensi/${TGL}_s1`)));
  });

  it('tamu tidak boleh membaca maupun menulis', async () => {
    await assertFails(getDoc(doc(tamu(), `absensi/${TGL}_s1`)));
    await assertFails(setDoc(doc(tamu(), `absensi/${TGL}_s1`), absensiBaru()));
  });
});
