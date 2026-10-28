import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GRUP_MENU, MENU_ADMIN_SEKOLAH, MENU_SUPERADMIN, adalahPeranGuru, cariMenu, menuUntukPeran,
} from '../src/navigasi.js';

const grup = (id) => GRUP_MENU.find((item) => item.id === id);

test('submenu perencanaan lama tersedia dengan rute sesuai dokumen', () => {
  const item = grup('perencanaan').item;
  const rute = new Map(item.filter((entry) => entry.search)
    .map((entry) => [entry.label, entry.search]));

  for (const [label, jenis] of [
    ['RPE (Rincian Pekan Efektif)', 'rpe'],
    ['ATP (Alur Tujuan Pembelajaran)', 'atp'],
    ['Program Tahunan', 'prota'],
    ['Program Semester', 'prosem'],
    ['KKTP', 'kktp'],
    ['Modul Ajar', 'modul'],
  ]) {
    assert.equal(rute.get(label), `?jenis=${jenis}`);
  }
  assert.equal(rute.get('Peta Sebaran TP'), '?jenis=atp&tampilan=peta');
  assert.ok(item.some((entry) => entry.label === 'Hasil Perencanaan' && entry.path === '/hasil/perencanaan'));
  assert.ok(item.some((entry) => entry.label === 'Cover Perangkat' && entry.path === '/perangkat/cover'));
});

test('menu aktif mengikuti dokumen yang dipilih pada hub dan detail paket', () => {
  for (const [jenis, label] of [
    ['rpe', 'RPE (Rincian Pekan Efektif)'],
    ['atp', 'ATP (Alur Tujuan Pembelajaran)'],
    ['prota', 'Program Tahunan'],
    ['prosem', 'Program Semester'],
    ['kktp', 'KKTP'],
    ['modul', 'Modul Ajar'],
  ]) {
    assert.equal(cariMenu('/perencanaan', `?jenis=${jenis}`)?.item.label, label);
    assert.equal(cariMenu(`/perencanaan/paket-uji/${jenis}`)?.item.label, label);
  }
  assert.equal(
    cariMenu('/perencanaan', '?jenis=atp&tampilan=peta')?.item.label,
    'Peta Sebaran TP',
  );
});

test('hasil perencanaan membuka arsip dari kedua kelompok menu', () => {
  assert.equal(cariMenu('/hasil/perencanaan')?.item.label, 'Hasil Perencanaan');
  assert.equal(cariMenu('/laporan/arsip-perencanaan')?.item.label, 'Hasil Perencanaan (Arsip)');
});

test('menu memilih rute terdalam untuk chat dan data dasar', () => {
  assert.equal(cariMenu('/chat')?.item.label, 'Semua Percakapan');
  assert.equal(cariMenu('/chat/grup')?.item.label, 'Grup');
  assert.equal(cariMenu('/chat/kontak')?.item.label, 'Kontak');
  assert.equal(cariMenu('/datadasar/siswa')?.item.label, 'Data Siswa');
});

test('semua submenu memiliki rute aktif dan dapat ditemukan kembali', () => {
  const items = GRUP_MENU.flatMap((menu) => menu.item);
  const keyRute = (item) => `${item.path}${item.search || ''}`;
  const rute = items.map(keyRute);

  assert.ok(items.every((item) => item.path));
  assert.equal(new Set(rute).size, items.length, 'setiap submenu memiliki URL unik');
  for (const item of items) {
    assert.equal(cariMenu(item.path, item.search || '')?.item, item, item.label);
  }
});

test('semua tautan untuk guru, siswa, orang tua, sekolah, dan platform cocok dengan halamannya', () => {
  for (const role of [
    'guru', 'operator', 'demo', 'siswa', 'ortu', 'orang_tua',
    'admin_sekolah', 'admin', 'superadmin', 'kepala_sekolah', 'wali_kelas',
    'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler',
  ]) {
    const menu = menuUntukPeran(role);
    for (const item of menu.flatMap((bagian) => bagian.item)) {
      assert.equal(cariMenu(item.path, item.search || '', role)?.item, item, `${role}: ${item.label}`);
    }
  }
});

test('spesialis guru memakai menu guru; kepala sekolah dan wali kelas tidak menjadi admin', () => {
  for (const role of ['guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']) {
    assert.equal(adalahPeranGuru(role), true);
    assert.equal(menuUntukPeran(role), menuUntukPeran('guru'));
    assert.ok(menuUntukPeran(role).flatMap((group) => group.item)
      .some((item) => item.path === '/program-kegiatan'));
  }
  assert.equal(adalahPeranGuru('guru'), true);
  assert.equal(adalahPeranGuru(' admin_sekolah '), false);
  for (const role of ['kepala_sekolah', 'wali_kelas']) {
    const paths = menuUntukPeran(role).flatMap((group) => group.item.map((item) => item.path));
    assert.deepEqual(paths, ['/dashboard']);
    assert.equal(cariMenu('/platform/tenant/sekolah', '', role), null);
    assert.equal(cariMenu('/admin/pengguna/guru', '', role), null);
  }
});

test('menu siswa dan orang tua mengikuti perannya tanpa menampilkan modul guru atau admin', () => {
  const semua = (role) => menuUntukPeran(role).flatMap((bagian) => bagian.item);
  const siswa = semua('siswa');
  const ortu = semua('orang_tua');

  assert.ok(siswa.some((item) => item.path === '/siswa/jadwal'));
  assert.ok(siswa.some((item) => item.path === '/siswa/ujian'));
  assert.ok(siswa.some((item) => item.path === '/purchase'));
  assert.ok(!siswa.some((item) => item.path.startsWith('/datadasar/')));
  assert.ok(!siswa.some((item) => item.path.startsWith('/platform/')));
  assert.ok(ortu.some((item) => item.path === '/orang-tua/anak'));
  assert.ok(ortu.some((item) => item.path === '/orang-tua/nilai-kehadiran'));
  assert.ok(!ortu.some((item) => item.path.startsWith('/admin/')));
  assert.equal(menuUntukPeran('orang_tua'), menuUntukPeran('ortu'));
});

test('menu operator dibatasi pada dashboard, operasional sekolah, dan komunikasi', () => {
  const paths = menuUntukPeran('operator').flatMap((bagian) => bagian.item.map((item) => item.path));

  assert.deepEqual(paths, [
    '/dashboard',
    '/datadasar/siswa',
    '/datadasar/barcode',
    '/pelaksanaan/presensi',
    '/chat',
    '/chat/kontak',
    '/chat/grup',
  ]);
  assert.ok(!paths.some((path) => path.startsWith('/perencanaan')));
  assert.ok(!paths.some((path) => path.startsWith('/admin/')));
  assert.ok(!paths.some((path) => path.startsWith('/platform/')));
});

test('peran yang tidak dikenal tidak menerima menu guru, admin, atau platform', () => {
  const menu = menuUntukPeran('peran-tidak-dikenal');
  assert.deepEqual(menu.flatMap((bagian) => bagian.item.map((item) => item.path)), ['/dashboard']);
  assert.equal(cariMenu('/platform/tenant/sekolah', '', 'peran-tidak-dikenal'), null);
  assert.equal(cariMenu('/datadasar/siswa', '', null), null);
});

test('admin sekolah dan superadmin mendapat menu sesuai ruang lingkupnya', () => {
  assert.equal(MENU_ADMIN_SEKOLAH.length - 1, 13, '13 grup administrasi sekolah di luar grup Chat');
  assert.equal(MENU_SUPERADMIN.length, 11, '10 grup pengelolaan platform dan grup chat dukungan');
  assert.ok(!MENU_SUPERADMIN.some((group) => group.id === 'platform-firebase'));
  assert.ok(!MENU_SUPERADMIN.some((group) => group.item.some((item) => item.path === '/platform/keamanan/app-check')));
  assert.equal(menuUntukPeran('admin_sekolah'), MENU_ADMIN_SEKOLAH);
  assert.equal(menuUntukPeran('superadmin'), MENU_SUPERADMIN);

  assert.equal(cariMenu('/admin/pengguna/guru', '', 'admin_sekolah')?.grup.id, 'admin-pengguna');
  assert.equal(cariMenu('/admin/pengguna/tautkan-siswa', '', 'admin_sekolah')?.item.label, 'Tautkan akun siswa ke roster');
  assert.equal(cariMenu('/admin/pengguna/tautkan-siswa', '', 'guru'), null);
  assert.equal(cariMenu('/asesmen/ujian-online', '', 'guru')?.item.label, 'Ujian Online');
  assert.equal(cariMenu('/siswa/ujian', '', 'siswa')?.item.label, 'Ujian Saya');
  assert.equal(cariMenu('/siswa/nilai', '', 'siswa')?.item.label, 'Nilai Saya');
  assert.equal(cariMenu('/admin/perencanaan/paket', '', 'admin_sekolah')?.item.label, 'Paket Guru');
  assert.equal(cariMenu('/platform/tenant/sekolah', '', 'superadmin')?.grup.id, 'platform-tenant');
  assert.equal(cariMenu('/platform/tenant/tambah', '', 'superadmin')?.item.label, 'Tambah Tenant');
  assert.equal(cariMenu('/platform/pengguna/superadmin', '', 'superadmin')?.item.label, 'Tambah Super Admin');
  assert.equal(cariMenu('/platform/tenant/sekolah', '', 'admin_sekolah'), null);
  assert.equal(cariMenu('/platform/tenant/tambah', '', 'guru'), null);
  assert.equal(cariMenu('/platform/pengguna/superadmin', '', 'guru'), null);
  assert.equal(cariMenu('/admin/pengguna/guru', '', 'superadmin'), null);
  assert.equal(cariMenu('/chat', '', 'superadmin')?.grup.id, 'platform-chat');
  assert.equal(cariMenu('/chat/kontak', '', 'siswa')?.item.label, 'Kontak');
  assert.equal(cariMenu('/testimoni', '', 'guru')?.item.label, 'Testimoni');
  assert.equal(cariMenu('/purchase', '', 'admin_sekolah')?.item.label, 'Purchase Lisensi');
  assert.equal(cariMenu('/asesmen/bank-soal', '', 'admin_sekolah')?.item.label, 'Bank Soal');

  for (const menu of [MENU_ADMIN_SEKOLAH, MENU_SUPERADMIN]) {
    const rute = menu.flatMap((bagian) => bagian.item.map((item) => item.path));
    assert.equal(new Set(rute).size, rute.length, 'setiap menu admin memiliki rute unik');
  }
});

test('Dashboard menjadi tautan langsung tanpa submenu pada setiap peran', () => {
  for (const role of ['guru', 'admin_sekolah', 'superadmin', 'siswa', 'orang_tua']) {
    const dashboard = menuUntukPeran(role).find((bagian) =>
      bagian.id === 'beranda' || bagian.id.includes('dashboard'));
    assert.equal(dashboard?.item.length, 1, `${role}: dashboard hanya satu tautan`);
  }
});
