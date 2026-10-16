/**
 * tests/firestore.rules.test.mjs — Uji Security Rules dengan Emulator Suite.
 *
 * Jalankan:
 *   npm i -D @firebase/rules-unit-testing firebase
 *   firebase emulators:exec --only firestore "node --test tests/"
 */
import { before, after, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

let env;

const klaim = {
  guruA:  { role: 'guru',          tenantId: 'sekolah-a', email: 'guru@a.id' },
  guruA2: { role: 'guru',          tenantId: 'sekolah-a', email: 'guru2@a.id' },
  admA:   { role: 'admin_sekolah', tenantId: 'sekolah-a', email: 'adm@a.id' },
  admB:   { role: 'admin_sekolah', tenantId: 'sekolah-b', email: 'adm@b.id' },
  guruB:  { role: 'guru',          tenantId: 'sekolah-b', email: 'guru@b.id' },
  super:  { role: 'superadmin',                            email: 'su@x.id' },
  baru:   { email: 'baru@x.id' },    // login tapi belum diberi peran
};
const db = (uid) => env.authenticatedContext(uid, klaim[uid]).firestore();
const dbAnon = () => env.unauthenticatedContext().firestore();

const perangkatBaru = (uid, ekstra = {}) => ({
  ownerUid: uid, jenis: 'atp', judul: 'ATP Matematika X', status: 'draf',
  dibuat: serverTimestamp(), diubah: serverTimestamp(), ...ekstra,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ainnoe-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
after(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    const depan = Timestamp.fromMillis(Date.now() + 86_400_000);
    await setDoc(doc(d, 'tenants/sekolah-a'), { nama: 'Sekolah A', langganan: { aktif: true, sampai: depan } });
    await setDoc(doc(d, 'tenants/sekolah-b'), { nama: 'Sekolah B', langganan: { aktif: false } });
    await setDoc(doc(d, 'users/guruA'), { nama: 'Guru A', email: 'guru@a.id', role: 'guru', tenantId: 'sekolah-a' });
    await setDoc(doc(d, 'tenants/sekolah-a/perangkat/p1'), {
      ownerUid: 'guruA', jenis: 'atp', judul: 'ATP', status: 'draf',
      dibuat: Timestamp.now(), diubah: Timestamp.now(),
    });
    await setDoc(doc(d, 'tenants/sekolah-a/perangkat/kunci'), {
      ownerUid: 'guruA', jenis: 'atp', judul: 'ATP final', status: 'terkunci',
      dibuat: Timestamp.now(), diubah: Timestamp.now(),
    });
    await setDoc(doc(d, 'tenants/sekolah-a/chats/c1'), { peserta: ['guruA', 'guruA2'], baca: {} });
  });
});

describe('tanpa login', () => {
  it('ditolak membaca apa pun', async () => {
    await assertFails(getDoc(doc(dbAnon(), 'tenants/sekolah-a')));
    await assertFails(getDoc(doc(dbAnon(), 'users/guruA')));
  });
});

describe('/users', () => {
  it('akun baru boleh membuat dokumen dasarnya sendiri', async () => {
    await assertSucceeds(setDoc(doc(db('baru'), 'users/baru'), { nama: 'Baru', email: 'baru@x.id', dibuat: serverTimestamp() }));
  });
  it('tidak boleh menyisipkan peran saat membuat', async () => {
    await assertFails(setDoc(doc(db('baru'), 'users/baru'), { nama: 'Baru', email: 'baru@x.id', dibuat: serverTimestamp(), role: 'superadmin' }));
  });
  it('tidak boleh menaikkan peran sendiri', async () => {
    await assertFails(updateDoc(doc(db('guruA'), 'users/guruA'), { role: 'superadmin' }));
    await assertFails(updateDoc(doc(db('guruA'), 'users/guruA'), { tenantId: 'sekolah-b' }));
  });
  it('boleh mengubah nama dan tema sendiri', async () => {
    await assertSucceeds(updateDoc(doc(db('guruA'), 'users/guruA'), { nama: 'Guru A, S.Pd.', tema: 'gelap' }));
  });
  it('guru lain tidak bisa membaca; admin sekolah yang sama bisa', async () => {
    await assertFails(getDoc(doc(db('guruA2'), 'users/guruA')));
    await assertSucceeds(getDoc(doc(db('admA'), 'users/guruA')));
    await assertFails(getDoc(doc(db('admB'), 'users/guruA')));
  });
});

describe('/tenants', () => {
  it('anggota membaca sekolahnya, bukan sekolah lain', async () => {
    await assertSucceeds(getDoc(doc(db('guruA'), 'tenants/sekolah-a')));
    await assertFails(getDoc(doc(db('guruA'), 'tenants/sekolah-b')));
  });
  it('admin sekolah tidak bisa mengubah langganan', async () => {
    await assertFails(updateDoc(doc(db('admA'), 'tenants/sekolah-a'), { langganan: { aktif: true } }));
    await assertSucceeds(updateDoc(doc(db('admA'), 'tenants/sekolah-a'), { nama: 'Sekolah A Baru' }));
  });
  it('akun tanpa peran tidak bisa membaca sekolah mana pun', async () => {
    await assertFails(getDoc(doc(db('baru'), 'tenants/sekolah-a')));
  });
});

describe('/perangkat', () => {
  it('guru membuat draf miliknya saat langganan aktif', async () => {
    await assertSucceeds(setDoc(doc(db('guruA'), 'tenants/sekolah-a/perangkat/baru'), perangkatBaru('guruA')));
  });
  it('tidak boleh membuat atas nama orang lain', async () => {
    await assertFails(setDoc(doc(db('guruA'), 'tenants/sekolah-a/perangkat/x'), perangkatBaru('guruA2')));
  });
  it('langganan tidak aktif → tidak bisa menulis', async () => {
    await assertFails(setDoc(doc(db('guruB'), 'tenants/sekolah-b/perangkat/x'), perangkatBaru('guruB')));
  });
  it('guru lain tidak bisa membaca; admin sekolah bisa', async () => {
    await assertFails(getDoc(doc(db('guruA2'), 'tenants/sekolah-a/perangkat/p1')));
    await assertSucceeds(getDoc(doc(db('admA'), 'tenants/sekolah-a/perangkat/p1')));
    await assertFails(getDoc(doc(db('admB'), 'tenants/sekolah-a/perangkat/p1')));
  });
  it('dokumen terkunci tidak bisa diubah atau dihapus', async () => {
    await assertFails(updateDoc(doc(db('guruA'), 'tenants/sekolah-a/perangkat/kunci'), { judul: 'Ubah', diubah: serverTimestamp() }));
    await assertFails(deleteDoc(doc(db('guruA'), 'tenants/sekolah-a/perangkat/kunci')));
  });
  it('draf bisa diubah pemiliknya dan dihapus', async () => {
    await assertSucceeds(updateDoc(doc(db('guruA'), 'tenants/sekolah-a/perangkat/p1'), { judul: 'ATP revisi', diubah: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(db('guruA'), 'tenants/sekolah-a/perangkat/p1')));
  });
});

describe('/chats', () => {
  it('hanya peserta yang bisa membaca chat dan mengirim pesan', async () => {
    await assertSucceeds(getDoc(doc(db('guruA'), 'tenants/sekolah-a/chats/c1')));
    await assertFails(getDoc(doc(db('admA'), 'tenants/sekolah-a/chats/c1')));
    await assertSucceeds(setDoc(doc(db('guruA'), 'tenants/sekolah-a/chats/c1/pesan/m1'),
      { pengirim: 'guruA', teks: 'Halo', dibuat: serverTimestamp() }));
  });
  it('tidak bisa memalsukan pengirim; pesan tidak bisa diubah', async () => {
    await assertFails(setDoc(doc(db('guruA'), 'tenants/sekolah-a/chats/c1/pesan/m2'),
      { pengirim: 'guruA2', teks: 'Palsu', dibuat: serverTimestamp() }));
  });
});

describe('/platform', () => {
  it('hanya superadmin', async () => {
    await assertSucceeds(setDoc(doc(db('super'), 'platform/paket'), { a: 1 }));
    await assertFails(getDoc(doc(db('admA'), 'platform/paket')));
  });
});
