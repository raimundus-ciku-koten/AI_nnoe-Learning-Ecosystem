// tests/firestore.rules.test.mjs
// Jalankan:  firebase emulators:exec --only firestore "node --test tests/firestore.rules.test.mjs"
// Prasyarat: npm i -D @firebase/rules-unit-testing firebase   (Java 11+ untuk emulator)
import { before, after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getCountFromServer, getDoc, getDocs, query, setDoc, updateDoc,
  serverTimestamp, where, writeBatch,
} from 'firebase/firestore';

let env;
const guru = () => env.authenticatedContext('gru1', { role: 'guru', tenantId: 'sekolah-a' }).firestore();
const siswaBiasa = () => env.authenticatedContext('sis1', { role: 'siswa' }).firestore();
const tamu = () => env.unauthenticatedContext().firestore();
const adminSekolah = () => env.authenticatedContext('adm-sekolah', {
  role: 'admin_sekolah', tenantId: 'sekolah-a',
}).firestore();
const guruSekolahB = () => env.authenticatedContext('gru-b', {
  role: 'guru', tenantId: 'sekolah-b',
}).firestore();
const guruLain = () => env.authenticatedContext('gru2', {
  role: 'guru', tenantId: 'sekolah-a',
}).firestore();
const siswaSekolahA = () => env.authenticatedContext('sis-sekolah-a', {
  role: 'siswa', tenantId: 'sekolah-a',
}).firestore();
const superadmin = () => env.authenticatedContext('super-1', {
  role: 'superadmin',
}).firestore();

const TGL = '2026-10-15';
const absensiScan = (extra = {}) => ({
  siswaId: 's1',
  tanggal: TGL,
  status: 'hadir',
  metode: 'scan',
  kodeUnik: 'ALE-X1-AAAAAA-0002',
  nama: 'Ani',
  kelas: 'X-1',
  waktu: serverTimestamp(),
  ...extra,
});
const paketPerencanaanBaru = (extra = {}) => ({
  mapel: 'Matematika',
  kelas: 'X',
  fase: 'E',
  tahunAjaran: '2026/2027',
  jpPerPekan: 4,
  totalJP: null,
  hariPembelajaran: [1, 2, 3, 4, 5],
  ganjil: { mulai: '2026-07-13', selesai: '2026-12-19' },
  genap: { mulai: '2027-01-05', selesai: '2027-06-19' },
  kalender: [],
  identitas: { sekolah: 'Sekolah A', guru: 'Guru' },
  ownerUid: 'gru1',
  tenantId: 'sekolah-a',
  schemaVersion: 1,
  rev: 1,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...extra,
});
const hasilPerencanaanBaru = (extra = {}) => ({
  ownerUid: 'gru1',
  tenantId: 'sekolah-a',
  paketId: 'p1',
  jenis: 'rpe',
  schemaVersion: 1,
  rev: 1,
  sumber: 'mesin',
  sumberRev: { paket: 1 },
  payload: { totalJPHitung: 120 },
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...extra,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-absensi',
    firestore: {
      rules: readFileSync(fileURLToPath(new URL('../../firestore.rules', import.meta.url)), 'utf8'),
    },
  });
});
after(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
});

describe('direktori pengguna tenant', () => {
  it('admin sekolah hanya dapat meng-query profil pengguna dalam tenant sendiri', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users/guru-a'), {
        tenantId: 'sekolah-a', role: 'guru', nama: 'Guru A', email: 'guru-a@example.test',
      });
      await setDoc(doc(db, 'users/siswa-a'), {
        tenantId: 'sekolah-a', role: 'siswa', nama: 'Siswa A', email: 'siswa-a@example.test',
      });
      await setDoc(doc(db, 'users/guru-b'), {
        tenantId: 'sekolah-b', role: 'guru', nama: 'Guru B', email: 'guru-b@example.test',
      });
      await setDoc(doc(db, 'users/admin-a'), {
        tenantId: 'sekolah-a', role: 'admin_sekolah', nama: 'Admin A', email: 'admin-a@example.test',
      });
      await setDoc(doc(db, 'users/admin-b'), {
        tenantId: 'sekolah-b', role: 'admin_sekolah', nama: 'Admin B', email: 'admin-b@example.test',
      });
    });

    const db = adminSekolah();
    const hasil = await getDocs(query(
      collection(db, 'users'),
      where('tenantId', '==', 'sekolah-a'),
    ));
    assert.deepEqual(hasil.docs.map((akun) => akun.id).sort(), ['admin-a', 'guru-a', 'siswa-a']);
    await assertFails(getDocs(collection(db, 'users')));
    await assertFails(getDocs(query(
      collection(db, 'users'),
      where('tenantId', '==', 'sekolah-b'),
    )));
    await assertFails(getDocs(query(
      collection(guru(), 'users'),
      where('tenantId', '==', 'sekolah-a'),
    )));

    const seluruhAdmin = await assertSucceeds(getDocs(query(
      collection(superadmin(), 'users'),
      where('role', '==', 'admin_sekolah'),
    )));
    assert.deepEqual(seluruhAdmin.docs.map((akun) => akun.id).sort(), ['admin-a', 'admin-b']);

    const hitunganSemuaPengguna = await assertSucceeds(
      getCountFromServer(collection(superadmin(), 'users')),
    );
    const hitunganAdmin = await assertSucceeds(getCountFromServer(query(
      collection(superadmin(), 'users'),
      where('role', '==', 'admin_sekolah'),
    )));
    assert.equal(hitunganSemuaPengguna.data().count, 5);
    assert.equal(hitunganAdmin.data().count, 2);
    await assertFails(getCountFromServer(collection(adminSekolah(), 'users')));
  });

  it('pengguna hanya dapat membaca langganannya sendiri dan tidak dapat menulis', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'userSubscriptions/gru1'), {
        subscription: { aktif: true, paketId: 'guru-sd-basic' },
      });
    });
    await assertSucceeds(getDoc(doc(guru(), 'userSubscriptions/gru1')));
    await assertFails(getDoc(doc(guruLain(), 'userSubscriptions/gru1')));
    await assertFails(setDoc(doc(guru(), 'userSubscriptions/gru1'), {
      subscription: { aktif: true, paketId: 'guru-sd-premium' },
    }));
  });
});

describe('direktori chat dan testimoni', () => {
  it('membatasi direktori guru ke tenant sendiri dan mengizinkan superadmin lintas tenant serta peran', async () => {
    await assertSucceeds(setDoc(doc(guru(), 'directory/gru1'), {
      uid: 'gru1', nama: 'Guru Satu', role: 'guru', tenantId: 'sekolah-a',
      updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(getDocs(query(
      collection(guru(), 'directory'),
      where('tenantId', '==', 'sekolah-a'),
    )));
    await assertFails(getDoc(doc(guruSekolahB(), 'directory/gru1')));
    await assertFails(setDoc(doc(guru(), 'directory/palsu'), {
      uid: 'palsu', nama: 'Palsu', role: 'admin_sekolah', tenantId: 'sekolah-a',
      updatedAt: serverTimestamp(),
    }));

    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'directory/sis1'), {
        uid: 'sis1', nama: 'Siswa Satu', role: 'siswa', tenantId: 'sekolah-a',
        updatedAt: new Date(),
      });
      await setDoc(doc(db, 'directory/admin-b'), {
        uid: 'admin-b', nama: 'Admin B', role: 'admin_sekolah', tenantId: 'sekolah-b',
        updatedAt: new Date(),
      });
    });
    const seluruhTenant = await getDocs(query(
      collection(siswaSekolahA(), 'directory'),
      where('tenantId', '==', 'sekolah-a'),
    ));
    assert.deepEqual(
      seluruhTenant.docs.map((akun) => akun.id).sort(),
      ['gru1', 'sis1'],
    );
    const seluruhPlatform = await getDocs(collection(superadmin(), 'directory'));
    assert.deepEqual(
      seluruhPlatform.docs.map((akun) => akun.id).sort(),
      ['admin-b', 'gru1', 'sis1'],
    );
  });

  it('memerlukan persetujuan admin sebelum testimoni dapat dibaca publik', async () => {
    const sumber = doc(guru(), 'tenants/sekolah-a/testimonials/gru1');
    await assertSucceeds(setDoc(sumber, {
      ownerUid: 'gru1',
      tenantId: 'sekolah-a',
      displayName: 'Guru Satu',
      role: 'guru',
      quote: 'Aplikasi ini membantu saya menyusun perencanaan dengan lebih mudah.',
      rating: 5,
      consent: true,
      status: 'pending',
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    await assertFails(getDoc(doc(tamu(), 'testimonials/gru1')));

    const adminDb = adminSekolah();
    const batch = writeBatch(adminDb);
    batch.update(doc(adminDb, 'tenants/sekolah-a/testimonials/gru1'), {
      status: 'published',
      quoteFinal: 'Aplikasi ini membantu saya menyusun perencanaan dengan lebih mudah.',
      reviewedAt: serverTimestamp(),
    });
    batch.set(doc(adminDb, 'testimonials/gru1'), {
      tenantId: 'sekolah-a',
      sourceId: 'gru1',
      status: 'published',
      consent: true,
      displayName: 'Guru Satu',
      role: 'guru',
      quote: 'Aplikasi ini membantu saya menyusun perencanaan dengan lebih mudah.',
    });
    await assertSucceeds(batch.commit());
    await assertSucceeds(getDoc(doc(tamu(), 'testimonials/gru1')));
  });
});

describe('rahasia integrasi AI', () => {
  it('menolak akses Firestore langsung ke kredensial AI dan state OAuth, termasuk bagi superadmin', async () => {
    for (const database of [guru(), superadmin()]) {
      await assertFails(getDoc(doc(database, 'privateAiSettings/gru1')));
      await assertFails(setDoc(doc(database, 'privateAiSettings/gru1'), {
        credentials: { gemini: 'plaintext-is-forbidden' },
      }));
      await assertFails(getDoc(doc(database, 'privateCanvaOAuthStates/state-1')));
      await assertFails(setDoc(doc(database, 'privateCanvaOAuthStates/state-1'), {
        uid: 'gru1',
        codeVerifier: 'must-stay-server-side',
      }));
    }
  });
});

describe('kontrol platform dan audit', () => {
  it('membaca status runtime tanpa rahasia dan menjaga audit hanya-baca superadmin', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'publicConfig/platform'), {
        maintenance: false,
        features: { aiAssistant: true, aiGeneration: false },
      });
      await setDoc(doc(db, 'platformAudit/audit-1'), {
        actorUid: 'super-1',
        action: 'platform.control.updated',
        target: 'maintenance',
        before: false,
        after: true,
        createdAt: new Date(),
      });
      await setDoc(doc(db, 'platform/controlState'), {
        maintenance: false,
        features: { aiAssistant: true, aiGeneration: true },
      });
    });

    const publicConfig = await assertSucceeds(getDoc(doc(tamu(), 'publicConfig/platform')));
    assert.deepEqual(publicConfig.data(), {
      maintenance: false,
      features: { aiAssistant: true, aiGeneration: false },
    });
    await assertFails(getDocs(collection(tamu(), 'publicConfig')));
    await assertFails(setDoc(doc(tamu(), 'publicConfig/platform'), { maintenance: true }));
    await assertSucceeds(getDoc(doc(superadmin(), 'platform/controlState')));
    await assertFails(getDoc(doc(guru(), 'platform/controlState')));
    await assertFails(updateDoc(doc(superadmin(), 'platform/controlState'), { maintenance: true }));

    const audit = await assertSucceeds(getDocs(collection(superadmin(), 'platformAudit')));
    assert.equal(audit.size, 1);
    await assertFails(getDocs(collection(guru(), 'platformAudit')));
    await assertFails(setDoc(doc(superadmin(), 'platformAudit/fake'), {
      action: 'platform.control.updated',
    }));
    await assertFails(deleteDoc(doc(superadmin(), 'platformAudit/audit-1')));
  });
});

describe('perencanaan', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'directory/gru1'), { uid: 'gru1', nama: 'Guru Satu', role: 'guru', tenantId: 'sekolah-a' });
      await setDoc(doc(db, 'directory/gru2'), { uid: 'gru2', nama: 'Guru Dua', role: 'guru', tenantId: 'sekolah-a' });
      await setDoc(doc(db, 'directory/gru-b'), { uid: 'gru-b', nama: 'Guru B', role: 'guru', tenantId: 'sekolah-b' });
      await setDoc(doc(db, 'directory/sis-a'), { uid: 'sis-a', nama: 'Siswa A', role: 'siswa', tenantId: 'sekolah-a' });
    });
  });

  it('paket hanya dapat dibuat dan diperbarui pengelola; guru hanya membacanya', async () => {
    const ref = doc(guru(), 'perencanaan/gru1/paket/p1');
    await assertFails(setDoc(ref, paketPerencanaanBaru()));
    const refAdmin = doc(adminSekolah(), 'perencanaan/gru1/paket/p1');
    await assertSucceeds(setDoc(refAdmin, paketPerencanaanBaru()));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(getDocs(query(
      collection(adminSekolah(), 'perencanaan/gru1/paket'),
      where('tenantId', '==', 'sekolah-a'),
    )));
    await assertSucceeds(updateDoc(refAdmin, {
      mapel: 'Matematika Lanjutan',
      rev: 2,
      updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(ref, { mapel: 'Guru mengubah paket', rev: 3, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(ref));
  });

  it('membatasi pengelolaan paket pada guru terdaftar di tenant admin', async () => {
    await assertSucceeds(setDoc(
      doc(adminSekolah(), 'perencanaan/gru2/paket/p1'),
      paketPerencanaanBaru({ ownerUid: 'gru2' })
    ));
    await assertFails(setDoc(
      doc(adminSekolah(), 'perencanaan/sis-a/paket/p2'),
      paketPerencanaanBaru({ ownerUid: 'sis-a' })
    ));
    await assertFails(setDoc(
      doc(adminSekolah(), 'perencanaan/gru-b/paket/p3'),
      paketPerencanaanBaru({ ownerUid: 'gru-b', tenantId: 'sekolah-b' })
    ));
    const superDb = superadmin();
    await assertSucceeds(setDoc(
      doc(superDb, 'perencanaan/gru-b/paket/p4'),
      paketPerencanaanBaru({ ownerUid: 'gru-b', tenantId: 'sekolah-b' })
    ));
  });

  it('guru membuat dokumen perencanaan; admin dapat membaca tetapi tidak mengubah hasil', async () => {
    await setDoc(doc(adminSekolah(), 'perencanaan/gru1/paket/p1'), paketPerencanaanBaru());
    const hasil = doc(guru(), 'perencanaan/gru1/paket/p1/dokumen/rpe');
    await assertSucceeds(setDoc(hasil, hasilPerencanaanBaru()));
    await assertSucceeds(getDoc(hasil));
    await assertSucceeds(getDoc(doc(adminSekolah(), 'perencanaan/gru1/paket/p1/dokumen/rpe')));
    await assertFails(setDoc(
      doc(adminSekolah(), 'perencanaan/gru1/paket/p1/dokumen/atp'),
      hasilPerencanaanBaru({ jenis: 'atp' })
    ));
    await assertFails(getDoc(doc(siswaBiasa(), 'perencanaan/gru1/paket/p1/dokumen/rpe')));

    const modul = doc(guru(), 'perencanaan/gru1/paket/p1/modul/1');
    await assertSucceeds(setDoc(modul, hasilPerencanaanBaru({ jenis: 'modul', noUnit: 1 })));
    await assertSucceeds(deleteDoc(doc(adminSekolah(), 'perencanaan/gru1/paket/p1/dokumen/rpe')));
  });
});

describe('data dasar tenant', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'tenants/sekolah-a'), {
        nama: 'Sekolah A',
        langganan: { aktif: true, sampai: new Date('2030-01-01T00:00:00Z') },
      });
      await setDoc(doc(ctx.firestore(), 'penugasan/gru1'), {
        tenantId: 'sekolah-a',
        mapelKelas: [{ mapel: 'Matematika', kelas: 'X-1' }],
      });
    });
  });

  it('hanya mengizinkan superadmin mendaftar tenant lintas sekolah', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'tenants/sekolah-b'), { nama: 'Sekolah B' });
    });

    const daftar = await assertSucceeds(getDocs(collection(superadmin(), 'tenants')));
    assert.deepEqual(daftar.docs.map((tenant) => tenant.id).sort(), ['sekolah-a', 'sekolah-b']);
    await assertFails(getDocs(collection(guru(), 'tenants')));
  });

  it('menolak perubahan tenant, langganan, dan konfigurasi platform dari SDK klien superadmin', async () => {
    await assertFails(setDoc(doc(superadmin(), 'tenants/sekolah-baru'), { nama: 'Tenant Baru' }));
    await assertFails(updateDoc(doc(superadmin(), 'tenants/sekolah-a'), {
      langganan: { aktif: true, sampai: new Date('2040-01-01T00:00:00Z') },
    }));
    await assertFails(deleteDoc(doc(superadmin(), 'tenants/sekolah-a')));
    await assertFails(setDoc(doc(superadmin(), 'platform/featureFlags'), { maintenance: true }));
  });

  it('profil dan siklus akademik tersimpan di tenant, sementara langganan tetap server-only', async () => {
    const ref = doc(adminSekolah(), 'tenants/sekolah-a');
    await assertSucceeds(getDoc(doc(guru(), 'tenants/sekolah-a')));
    await assertSucceeds(updateDoc(ref, {
      tahunAjaran: '2026/2027',
      semester: 'Ganjil',
      diperbaruiOleh: 'adm-sekolah',
      waktuUbah: serverTimestamp(),
    }));
    await assertFails(updateDoc(ref, {
      langganan: { aktif: true, sampai: new Date('2040-01-01T00:00:00Z') },
    }));
    await assertFails(updateDoc(doc(guru(), 'tenants/sekolah-a'), { nama: 'Sekolah Diubah' }));
  });

  it('penugasan hanya terbaca oleh pemilik dan admin tenant yang sama', async () => {
    await assertSucceeds(getDoc(doc(guru(), 'penugasan/gru1')));
    await assertSucceeds(getDoc(doc(adminSekolah(), 'penugasan/gru1')));
    await assertFails(getDoc(doc(guruSekolahB(), 'penugasan/gru1')));
    await assertFails(setDoc(doc(guru(), 'penugasan/gru1'), { mapelKelas: [] }));
  });

  it('catatan kerja pribadi guru hanya dapat dibaca dan dikelola oleh pemilik', async () => {
    const path = 'tenants/sekolah-a/guruWorkspace/gru1/entries/catatan-1';
    const catatan = {
      ownerUid: 'gru1',
      modulePath: '/refleksi/pembelajaran',
      moduleLabel: 'Refleksi Pembelajaran',
      judul: 'Refleksi pekan pertama',
      tanggal: TGL,
      kelas: 'X-1',
      mapel: 'Matematika',
      isi: 'Tujuan pembelajaran tercapai.',
      status: 'draf',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'tenants/sekolah-a'), {
        langganan: { aktif: true, sampai: new Date('2030-01-01T00:00:00Z') },
      });
    });
    const milikGuru = doc(guru(), path);

    await assertSucceeds(setDoc(milikGuru, catatan));
    await assertSucceeds(getDoc(milikGuru));
    await assertSucceeds(getDocs(collection(guru(), 'tenants/sekolah-a/guruWorkspace/gru1/entries')));
    await assertFails(getDoc(doc(guruLain(), path)));
    await assertFails(getDoc(doc(guruSekolahB(), path)));
    await assertFails(getDoc(doc(adminSekolah(), path)));
    await assertFails(getDoc(doc(siswaSekolahA(), path)));
    await assertFails(updateDoc(doc(guruLain(), path), {
      isi: 'Catatan diubah oleh akun lain.',
      updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(milikGuru, {
      status: 'dipublikasikan',
      updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(milikGuru, {
      ownerUid: 'gru2',
      updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(milikGuru, {
      isi: 'Catatan pribadi diperbarui.',
      status: 'selesai',
      updatedAt: serverTimestamp(),
    }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'tenants/sekolah-a'), {
        langganan: { aktif: false, sampai: new Date('2030-01-01T00:00:00Z') },
      });
    });
    await assertFails(updateDoc(milikGuru, {
      isi: 'Paket tenant sudah tidak aktif.',
      updatedAt: serverTimestamp(),
    }));
    await assertFails(deleteDoc(milikGuru));
    await assertFails(setDoc(doc(siswaSekolahA(), path), catatan));
  });

  it('bank soal hanya dapat dikelola pemilik guru dan tidak membuka kunci jawaban ke siswa', async () => {
    const path = 'tenants/sekolah-a/questionBank/soal-1';
    const soal = {
      ownerUid: 'gru1',
      mapel: 'Matematika',
      kelas: 'X-1',
      jenis: 'pilihan_ganda',
      pertanyaan: 'Berapakah 2 + 2?',
      pilihan: ['3', '4', '5', '6'],
      jawaban: '4',
      pembahasan: 'Penjumlahan dua dan dua menghasilkan empat.',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const soalGuru = doc(guru(), path);

    await assertSucceeds(setDoc(soalGuru, soal));
    await assertSucceeds(getDoc(soalGuru));
    await assertSucceeds(getDoc(doc(adminSekolah(), path)));
    await assertFails(getDoc(doc(siswaSekolahA(), path)));
    await assertFails(getDocs(collection(siswaSekolahA(), 'tenants/sekolah-a/questionBank')));
    await assertFails(getDoc(doc(guruSekolahB(), path)));
    await assertFails(updateDoc(doc(guruLain(), path), {
      jawaban: '3',
      updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(soalGuru, {
      jawaban: '4',
      updatedAt: serverTimestamp(),
    }));

    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'tenants/sekolah-a'), {
        langganan: { aktif: false, sampai: new Date('2030-01-01T00:00:00Z') },
      });
    });
    await assertFails(setDoc(doc(guru(), 'tenants/sekolah-a/questionBank/soal-2'), soal));
  });

  it('pemilik dengan paket aktif dapat mengelola data siswa, jadwal, dan denah miliknya', async () => {
    const siswaId = 'siswa-1';
    const kodeUnik = 'ALE-X1-ABC123-0001';
    await assertSucceeds(setDoc(doc(guru(), `guru/gru1/siswa/${siswaId}`), {
      nama: 'Ani',
      nisn: '0123456789',
      jk: 'P',
      kelas: 'X-1',
      kodeUnik,
      urlScan: `https://ainnoe.app/#/scan/${kodeUnik}`,
      dibuat: serverTimestamp(),
      diperbarui: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(doc(guru(), `guru/gru1/siswa/${siswaId}`), {
      nama: 'Ani Baru',
      diperbarui: serverTimestamp(),
    }));
    await assertFails(getDoc(doc(guruLain(), `guru/gru1/siswa/${siswaId}`)));

    await assertSucceeds(setDoc(doc(guru(), 'guru/gru1/pengaturan/jadwal'), {
      entri: [{ id: 'sesi-1', hari: 1, mulai: '07:00', selesai: '07:40', kelas: 'X-1', mapel: 'Matematika' }],
      diperbarui: serverTimestamp(),
    }));
    await assertSucceeds(setDoc(doc(guru(), 'guru/gru1/denah/x1'), {
      kelas: 'X-1',
      baris: 2,
      kolom: 3,
      kursi: { '0-0': siswaId },
      kelompok: { [siswaId]: 1 },
      jumlahKelompok: 2,
      diperbarui: serverTimestamp(),
    }));
  });

  it('menolak penulisan data dasar lintas tenant atau tanpa langganan aktif', async () => {
    await assertFails(setDoc(doc(guruSekolahB(), 'guru/gru1/pengaturan/jadwal'), {
      entri: [],
      diperbarui: serverTimestamp(),
    }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'tenants/sekolah-a'), {
        langganan: { aktif: false, sampai: new Date('2030-01-01T00:00:00Z') },
      });
    });
    await assertFails(setDoc(doc(guru(), 'guru/gru1/pengaturan/jadwal'), {
      entri: [],
      diperbarui: serverTimestamp(),
    }));
  });
});

describe('absensi', () => {
  describe('presensi per pemilik', () => {
    beforeEach(async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'tenants/sekolah-a'), {
          langganan: { aktif: true, sampai: new Date('2030-01-01T00:00:00Z') },
        });
        await setDoc(doc(db, 'guru/gru1/siswa/s1'), {
          nama: 'Ani',
          kelas: 'X-1',
          kodeUnik: 'ALE-X1-AAAAAA-0002',
        });
      });
    });

    it('pemilik pendidik dapat membaca data siswa dan riwayatnya sendiri saja', async () => {
      await assertSucceeds(getDoc(doc(guru(), 'guru/gru1/siswa/s1')));
      await assertSucceeds(setDoc(
        doc(guru(), `guru/gru1/absensi/${TGL}_s1`),
        absensiScan(),
      ));
      await assertSucceeds(getDocs(collection(guru(), 'guru/gru1/absensi')));
      await assertFails(getDoc(doc(guruSekolahB(), 'guru/gru1/siswa/s1')));
      await assertFails(getDocs(collection(siswaBiasa(), 'guru/gru1/absensi')));
    });

    it('pencatatan mensyaratkan subscription aktif dan data siswa cocok', async () => {
      await assertSucceeds(setDoc(
        doc(guru(), `guru/gru1/absensi/${TGL}_s1`),
        absensiScan(),
      ));
      await assertFails(setDoc(
        doc(guru(), `guru/gru1/absensi/${TGL}_s1`),
        absensiScan(),
      ));
      await assertFails(setDoc(
        doc(guru(), `guru/gru1/absensi/${TGL}_s2`),
        absensiScan({ siswaId: 's2' }),
      ));
      await assertFails(updateDoc(
        doc(guru(), `guru/gru1/absensi/${TGL}_s1`),
        { status: 'alpa' },
      ));
      await env.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), 'tenants/sekolah-a'), {
          langganan: { aktif: false, sampai: new Date('2030-01-01T00:00:00Z') },
        });
      });
      await assertFails(setDoc(
        doc(guru(), `guru/gru1/absensi/2026-10-16_s1`),
        absensiScan({ tanggal: '2026-10-16' }),
      ));
    });
  });
});
