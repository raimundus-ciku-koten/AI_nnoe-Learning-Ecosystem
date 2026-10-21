// web/tests/rules/siswa.rules.test.js
/**
 * Uji Security Rules dengan Firebase Emulator.
 *   npm i -D @firebase/rules-unit-testing firebase firebase-tools
 *   npx firebase emulators:exec --only firestore --project demo-siswa \
 *     "node --test web/tests/rules/"
 * (jalankan dari akar repositori yang berisi firestore.rules)
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc, doc, getDoc, setDoc, serverTimestamp, updateDoc, Timestamp,
} from 'firebase/firestore';

const berkasRules = resolve(dirname(fileURLToPath(import.meta.url)), '../../../firestore.rules');
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');

let env;
const PEMILIK = 'guru1';
const LAIN = 'guru2';
const path = (uid = PEMILIK, id = 's1') => `guru/${uid}/siswa/${id}`;
const dbPemilik = () => env.authenticatedContext(PEMILIK).firestore();
const dbLain = () => env.authenticatedContext(LAIN).firestore();
const dbTamu = () => env.unauthenticatedContext().firestore();

const siswaBaru = (tambah = {}) => ({
  nama: 'Ahmad Fauzi',
  nisn: '0123456789',
  jk: 'L',
  kelas: 'X-1',
  kodeUnik: 'ALE-X1-AB12-s1',
  urlScan: 'https://app.contoh.id/#/scan/ALE-X1-AB12-s1',
  dibuat: serverTimestamp(),
  diperbarui: serverTimestamp(),
  ...tambah,
});

async function seed(data = {}, id = 's1') {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path(PEMILIK, id)), {
      nama: 'Ahmad Fauzi', nisn: '0123456789', jk: 'L', kelas: 'X-1',
      kodeUnik: 'ALE-X1-AB12-s1',
      urlScan: 'https://app.contoh.id/#/scan/ALE-X1-AB12-s1',
      dibuat: Timestamp.now(), diperbarui: Timestamp.now(),
      ...data,
    });
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-siswa',
    firestore: { rules: readFileSync(berkasRules, 'utf8'), host, port: Number(port) },
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe('akses', () => {
  test('tamu ditolak membaca & menulis', async () => {
    await seed();
    await assertFails(getDoc(doc(dbTamu(), path())));
    await assertFails(setDoc(doc(dbTamu(), path(PEMILIK, 'x')), siswaBaru()));
  });
  test('guru lain ditolak', async () => {
    await seed();
    await assertFails(getDoc(doc(dbLain(), path())));
    await assertFails(deleteDoc(doc(dbLain(), path())));
    await assertFails(setDoc(doc(dbLain(), path(PEMILIK, 'x')), siswaBaru()));
  });
  test('pemilik boleh membaca & menghapus', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(dbPemilik(), path())));
    await assertSucceeds(deleteDoc(doc(dbPemilik(), path())));
  });
});

describe('create', () => {
  test('data valid diterima', async () => {
    await assertSucceeds(setDoc(doc(dbPemilik(), path()), siswaBaru()));
  });
  test('NISN kosong & jk kosong diterima', async () => {
    await assertSucceeds(setDoc(doc(dbPemilik(), path()), siswaBaru({ nisn: '', jk: '' })));
  });

  const tolak = {
    'kolom asing': { admin: true },
    'nama kosong': { nama: '' },
    'nama > 100 karakter': { nama: 'a'.repeat(101) },
    'kelas kosong': { kelas: '' },
    'kelas > 30 karakter': { kelas: 'k'.repeat(31) },
    'nisn bukan angka': { nisn: '12ab' },
    'nisn > 20 digit': { nisn: '1'.repeat(21) },
    'jk tidak valid': { jk: 'X' },
    'kodeUnik format salah': { kodeUnik: 'XYZ-1' },
    'urlScan format salah': { urlScan: 'javascript:alert(1)' },
    'dibuat dari jam klien': { dibuat: Timestamp.now() },
    'diperbarui dari jam klien': { diperbarui: Timestamp.now() },
    'nama bukan string': { nama: 123 },
  };
  for (const [nama, tambah] of Object.entries(tolak)) {
    test(`ditolak: ${nama}`, async () => {
      await assertFails(setDoc(doc(dbPemilik(), path()), siswaBaru(tambah)));
    });
  }

  test('ditolak: kolom wajib hilang (tanpa urlScan)', async () => {
    const d = siswaBaru();
    delete d.urlScan;
    await assertFails(setDoc(doc(dbPemilik(), path()), d));
  });
});

describe('update', () => {
  test('ubah nama/kelas/nisn/jk diterima', async () => {
    await seed();
    await assertSucceeds(updateDoc(doc(dbPemilik(), path()), {
      nama: 'Ahmad F.', nisn: '9876543210', jk: 'P', kelas: 'X-2', diperbarui: serverTimestamp(),
    }));
  });
  test('kodeUnik tidak boleh berubah', async () => {
    await seed();
    await assertFails(updateDoc(doc(dbPemilik(), path()), {
      kodeUnik: 'ALE-X1-ZZZZ-s1', diperbarui: serverTimestamp(),
    }));
  });
  test('dibuat tidak boleh berubah', async () => {
    await seed();
    await assertFails(updateDoc(doc(dbPemilik(), path()), {
      dibuat: serverTimestamp(), diperbarui: serverTimestamp(),
    }));
  });
  test('kolom asing ditolak', async () => {
    await seed();
    await assertFails(updateDoc(doc(dbPemilik(), path()), { admin: true, diperbarui: serverTimestamp() }));
  });
  test('diperbarui wajib waktu server', async () => {
    await seed();
    await assertFails(updateDoc(doc(dbPemilik(), path()), { nama: 'B', diperbarui: Timestamp.now() }));
  });
  test('nisn bukan angka ditolak', async () => {
    await seed();
    await assertFails(updateDoc(doc(dbPemilik(), path()), { nisn: 'abc', diperbarui: serverTimestamp() }));
  });
  test('dokumen lama tanpa kodeUnik boleh dilengkapi', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path(PEMILIK, 'lama')), {
        nama: 'Siti', kelas: 'X-1', dibuat: Timestamp.now(), diperbarui: Timestamp.now(),
      });
    });
    await assertSucceeds(updateDoc(doc(dbPemilik(), path(PEMILIK, 'lama')), {
      kodeUnik: 'ALE-X1-CD34-lama',
      urlScan: 'https://app.contoh.id/#/scan/ALE-X1-CD34-lama',
      diperbarui: serverTimestamp(),
    }));
  });
  test('dokumen lama dengan kolom ekstra tetap bisa diedit', async () => {
    await seed({ catatanLama: 'x' });
    await assertSucceeds(updateDoc(doc(dbPemilik(), path()), { nama: 'Baru', diperbarui: serverTimestamp() }));
  });
});
