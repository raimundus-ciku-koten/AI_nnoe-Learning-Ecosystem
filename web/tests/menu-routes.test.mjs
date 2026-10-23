import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { menuUntuk } from '../src/menu.js';
import { cariMenu } from '../src/navigasi.js';

describe('rute menu guru, staf pengajar, dan superadmin', () => {
  for (const role of ['guru', 'operator', 'superadmin']) {
    it(`setiap item ${role} memiliki tujuan yang dapat dibuka`, () => {
      const groups = menuUntuk(role);
      assert.ok(groups.length > 0);
      for (const group of groups) {
        assert.ok(group.items.length > 0, `${group.judul} tidak memiliki item`);
        for (const item of group.items) {
          assert.equal(item.status, 'rute', `${item.judul} bukan tautan aktif`);
          assert.ok(item.href.startsWith('#/'), `${item.judul} tidak memiliki path hash`);
          const [path, query = ''] = item.href.slice(1).split('?');
          assert.ok(cariMenu(path, query ? `?${query}` : '', role), `${item.judul} tidak terdaftar pada rute ${item.href}`);
        }
      }
    });
  }

  it('akun demo legacy tidak lagi mendapat menu fitur trial', () => {
    const items = menuUntuk('demo').flatMap((group) => group.items);
    assert.deepEqual(items.map((item) => item.href), ['#/dashboard']);
  });

  it('menu admin sekolah menautkan alur wali dan kanal pengumuman yang aktif', () => {
    const items = menuUntuk('admin_sekolah').flatMap((group) => group.items);
    for (const href of [
      '#/admin/pengguna/hubungan-wali',
      '#/admin/komunikasi/pengumuman',
    ]) {
      const item = items.find((entry) => entry.href === href);
      assert.ok(item, `menu ${href} tersedia`);
      assert.equal(item.status, 'rute');
    }
  });

  it('menu admin sekolah menyediakan laporan akademik', () => {
    const report = cariMenu('/admin/laporan/akademik', '', 'admin_sekolah');
    assert.equal(report?.item.label, 'Laporan Akademik');
  });

  it('menu laporan guru membuka ringkasan jurnal pribadi', () => {
    const report = cariMenu('/laporan/harian-bulanan', '', 'guru');
    assert.equal(report?.item.label, 'Laporan Harian s.d. Bulanan');
  });

  it('menu laporan penilaian guru memiliki rute aktif', () => {
    const report = cariMenu('/laporan/penilaian', '', 'guru');
    assert.equal(report?.item.label, 'Laporan Penilaian');
  });

  it('menu analisis hasil guru memiliki rute aktif', () => {
    const analysis = cariMenu('/asesmen/analisis', '', 'guru');
    assert.equal(analysis?.item.label, 'Analisis Hasil');
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
});
