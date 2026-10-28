import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { menuUntuk } from '../src/menu.js';
import { cariMenu } from '../src/navigasi.js';

describe('rute menu guru, staf pengajar, dan superadmin', () => {
  it('mencocokkan setiap tautan guru dan siswa dengan submenu yang aktif', () => {
    for (const role of ['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler', 'siswa']) {
      const groups = menuUntuk(role);
      const items = groups.flatMap((group) => group.items);

      assert.ok(items.length > 0, `${role} tidak memiliki item menu`);
      for (const item of items) {
        const [path, query = ''] = item.href.slice(1).split('?');
        const match = cariMenu(path, query ? `?${query}` : '', role);
        assert.ok(match, `${role}: ${item.judul} tidak cocok dengan rute ${item.href}`);
        assert.equal(match.item.label, item.judul, `${role}: label rute ${item.href} berbeda`);
      }
    }
  });

  for (const role of ['guru', 'operator', 'demo', 'superadmin']) {
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
  }
});
