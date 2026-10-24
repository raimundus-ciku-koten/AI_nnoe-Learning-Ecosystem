import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { menuUntuk } from '../src/menu.js';
import { cariMenu, MENU_ADMIN_SEKOLAH } from '../src/navigasi.js';

const peranDikenal = [
  'admin', 'admin_sekolah', 'operator', 'superadmin',
  'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler',
  'siswa', 'ortu', 'orang_tua', 'kepala_sekolah', 'wali_kelas', 'demo',
];

function assertTautanMenuValid(role, item) {
  assert.equal(item.status, 'rute', `${role}: ${item.judul} bukan tautan aktif`);
  assert.ok(item.href.startsWith('#/'), `${role}: ${item.judul} tidak memiliki rute`);
  const [path, query = ''] = item.href.slice(1).split('?');
  assert.ok(
    cariMenu(path, query ? `?${query}` : '', role),
    `${role}: ${item.judul} tidak cocok dengan katalog rute`,
  );
}

describe('tautan submenu aktif untuk setiap peran yang dikenal', () => {
  for (const role of peranDikenal) {
    it(`memiliki tujuan katalog yang valid untuk ${role}`, () => {
      const groups = menuUntuk(role);
      assert.ok(groups.length > 0);
      for (const group of groups) {
        assert.ok(group.items.length > 0, `${role}: ${group.judul} kosong`);
        for (const item of group.items) assertTautanMenuValid(role, item);
      }
    });
  }
});

describe('menu admin sekolah aktif pada sidebar legacy dan modern', () => {
  for (const role of ['admin', 'admin_sekolah']) {
    it(`mengarahkan seluruh submenu ${role} ke katalog rute aktif`, () => {
      const items = menuUntuk(role).flatMap((group) => group.items);
      const expectedItems = MENU_ADMIN_SEKOLAH.flatMap((group) => group.item);

      assert.equal(items.length, expectedItems.length);
      assert.ok(items.length > 1);
      for (const item of items) assertTautanMenuValid(role, item);
      assert.ok(items.some((item) => item.href === '#/admin/pengguna/guru'));
      assert.ok(items.some((item) => item.href === '#/datadasar/profil'));
      assert.ok(items.some((item) => item.href === '#/ruang-kelas'));
    });
  }

  it('menempatkan Ruang Kelas setelah Dashboard pada menu admin sekolah legacy', () => {
    const items = menuUntuk('admin_sekolah').flatMap((group) => group.items);
    const dashboardIndex = items.findIndex((item) => item.href === '#/dashboard');
    const classroomIndex = items.findIndex((item) => item.href === '#/ruang-kelas');

    assert.ok(classroomIndex > dashboardIndex);
    assert.equal(items[classroomIndex].status, 'rute');
    assert.equal(cariMenu('/ruang-kelas', '', 'admin_sekolah')?.item.path, '/ruang-kelas');
  });
});

describe('menu legacy untuk siswa dan orang tua', () => {
  for (const [role, href] of [
    ['siswa', '#/siswa/jadwal'],
    ['ortu', '#/orang-tua/anak'],
    ['orang_tua', '#/orang-tua/anak'],
  ]) {
    it(`menampilkan tautan yang sesuai untuk ${role}`, () => {
      const items = menuUntuk(role).flatMap((group) => group.items);
      assert.ok(items.some((item) => item.href === href));
      assert.ok(items.every((item) => item.status === 'rute'));
    });
  }

  it('membatasi peran yang tidak dikenal ke dashboard', () => {
    const items = menuUntuk('role-tidak-dikenal').flatMap((group) => group.items);
    assert.deepEqual(items.map((item) => item.href), ['#/dashboard']);
  });
});
