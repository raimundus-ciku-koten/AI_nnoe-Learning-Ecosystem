import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GRUP_MENU, MENU_ADMIN_SEKOLAH, MENU_SUPERADMIN, cariMenu, menuUntukPeran,
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
    assert.equal(menuUntukPeran(role), menuUntukPeran('guru'));
    assert.ok(menuUntukPeran(role).flatMap((group) => group.item)
      .some((item) => item.path === '/program-kegiatan'));
  }
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

test('menu operator dibatasi pada dashboard, ruang kelas, operasional sekolah, dan komunikasi', () => {
  const paths = menuUntukPeran('operator').flatMap((bagian) => bagian.item.map((item) => item.path));

  assert.deepEqual(paths, [
    '/dashboard',
    '/ruang-kelas',
    '/datadasar/siswa',
    '/datadasar/barcode',
    '/pelaksanaan/presensi',
    '/pengumuman',
    '/chat',
    '/chat/kontak',
    '/chat/grup',
  ]);
  assert.ok(!paths.some((path) => path.startsWith('/perencanaan')));
  assert.ok(!paths.some((path) => path.startsWith('/admin/')));
  assert.ok(!paths.some((path) => path.startsWith('/platform/')));
});

test('Ruang Kelas muncul setelah Dashboard untuk guru, siswa, operator, admin, dan superadmin', () => {
  for (const role of [
    'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler',
    'siswa', 'operator', 'admin_sekolah', 'admin', 'superadmin',
  ]) {
    const groups = menuUntukPeran(role);
    const dashboardIndex = groups.findIndex((group) =>
      group.id === 'beranda' || group.id.includes('dashboard'));
    const classroomsIndex = groups.findIndex((group) =>
      group.item.some((item) => item.path === '/ruang-kelas'));
    assert.ok(classroomsIndex > dashboardIndex, `${role}: Ruang Kelas mengikuti Dashboard`);
    assert.equal(groups[classroomsIndex].item[0].label, 'Ruang Kelas');
    assert.equal(cariMenu('/ruang-kelas', '', role)?.item.path, '/ruang-kelas');
  }
});

test('rapor resmi tersedia pada menu guru, admin sekolah, dan siswa sesuai alur akses', () => {
  const paths = (role) => menuUntukPeran(role).flatMap((group) => group.item.map((item) => item.path));
  assert.ok(paths('guru').includes('/asesmen/rapor'));
  assert.ok(paths('admin_sekolah').includes('/admin/akademik/rapor'));
  assert.ok(paths('siswa').includes('/siswa/rapor'));
  assert.ok(!paths('orang_tua').some((path) => path.includes('/rapor')));
});

test('peran yang tidak dikenal tidak menerima menu guru, admin, atau platform', () => {
  const menu = menuUntukPeran('peran-tidak-dikenal');
  assert.deepEqual(menu.flatMap((bagian) => bagian.item.map((item) => item.path)), ['/dashboard']);
  assert.equal(cariMenu('/platform/tenant/sekolah', '', 'peran-tidak-dikenal'), null);
  assert.equal(cariMenu('/datadasar/siswa', '', null), null);
});

test('admin sekolah dan superadmin mendapat menu sesuai ruang lingkupnya', () => {
  assert.equal(MENU_ADMIN_SEKOLAH.length - 1, 14, '14 grup administrasi sekolah di luar grup Chat');
  assert.equal(MENU_SUPERADMIN.length, 13, '12 grup pengelolaan platform dan grup chat dukungan');
  assert.ok(!MENU_SUPERADMIN.some((group) => group.id === 'platform-firebase'));
  assert.ok(!MENU_SUPERADMIN.some((group) => group.item.some((item) => item.path === '/platform/keamanan/app-check')));
  assert.equal(menuUntukPeran('admin_sekolah'), MENU_ADMIN_SEKOLAH);
  assert.equal(menuUntukPeran('superadmin'), MENU_SUPERADMIN);
  assert.equal(cariMenu('/datadasar/siswa', '', 'superadmin')?.item.label, 'Impor Data Siswa');
  assert.equal(cariMenu('/datadasar/profil', '', 'superadmin')?.item.label, 'Profil dan Kop Sekolah');
  const tenantItems = MENU_SUPERADMIN.find((group) => group.id === 'platform-tenant').item;
  assert.ok(tenantItems.some((item) => item.label === 'Status Tenant' && item.path === '/platform/tenant/status'));
  assert.ok(!tenantItems.some((item) => /langganan|pembayaran|tagihan/i.test(item.label)));

  assert.equal(cariMenu('/admin/pengguna/guru', '', 'admin_sekolah')?.grup.id, 'admin-pengguna');
  assert.equal(cariMenu('/datadasar/profil', '', 'admin_sekolah')?.item.label, 'Profil Sekolah');
  assert.equal(cariMenu('/datadasar/ta', '', 'admin_sekolah')?.item.label, 'Tahun Ajaran');
  assert.equal(cariMenu('/datadasar/kelas', '', 'admin_sekolah')?.item.label, 'Kelas');
  assert.equal(cariMenu('/datadasar/jadwal', '', 'admin_sekolah')?.item.label, 'Jadwal');
  assert.equal(cariMenu('/datadasar/denah', '', 'admin_sekolah')?.item.label, 'Denah Duduk');
  assert.equal(cariMenu('/admin/pengguna/tautkan-siswa', '', 'admin_sekolah')?.item.label, 'Tautkan akun siswa ke roster');
  assert.equal(cariMenu('/admin/pengguna/tautkan-siswa', '', 'guru'), null);
  assert.equal(cariMenu('/asesmen/ujian-online', '', 'guru')?.item.label, 'Ujian Online');
  assert.equal(cariMenu('/siswa/ujian', '', 'siswa')?.item.label, 'Ujian Saya');
  assert.equal(cariMenu('/siswa/nilai', '', 'siswa')?.item.label, 'Nilai Saya');
  assert.equal(cariMenu('/admin/perencanaan/paket', '', 'admin_sekolah')?.item.label, 'Paket Guru');
  assert.equal(cariMenu('/platform/tenant/sekolah', '', 'superadmin')?.grup.id, 'platform-tenant');
  assert.equal(cariMenu('/platform/tenant/sekolah', '', 'admin_sekolah'), null);
  assert.equal(cariMenu('/admin/pengguna/guru', '', 'superadmin'), null);
  assert.equal(cariMenu('/chat', '', 'superadmin')?.grup.id, 'platform-chat');
  assert.equal(cariMenu('/chat/kontak', '', 'siswa')?.item.label, 'Kontak');
  assert.equal(cariMenu('/testimoni', '', 'guru')?.item.label, 'Testimoni');
  assert.equal(cariMenu('/purchase', '', 'admin_sekolah')?.item.label, 'Harga Paket');
  assert.equal(cariMenu('/admin/keuangan/pembayaran', '', 'admin_sekolah'), null);
  assert.equal(cariMenu('/admin/keuangan/tagihan', '', 'admin_sekolah'), null);
  assert.equal(cariMenu('/asesmen/bank-soal', '', 'admin_sekolah')?.item.label, 'Bank Soal');
  assert.equal(cariMenu('/ruang-kelas', '', 'admin_sekolah')?.grup.id, 'admin-ruang-kelas');
  assert.equal(cariMenu('/ruang-kelas', '', 'superadmin')?.grup.id, 'platform-ruang-kelas');

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
