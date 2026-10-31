import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { menuUntuk } from '../src/menu.js';
import { cariMenu } from '../src/navigasi.js';
import { isChatFeaturePath } from '../src/services/featureFlags.js';

describe('rute menu guru, staf pengajar, dan superadmin', () => {
  for (const role of ['guru', 'operator', 'demo', 'superadmin']) {
    it(`setiap item ${role} memiliki tujuan yang dapat dibuka`, () => {
      const groups = menuUntuk(role);
      assert.ok(groups.length > 0);
      for (const group of groups) {
        assert.ok(group.items.length > 0, `${group.judul} tidak memiliki item`);
        for (const item of group.items) {
          if (item.status === 'nonaktif') {
            assert.equal(item.href, undefined, `${item.judul} tidak boleh menjadi tautan aktif`);
            continue;
          }
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
          assert.ok(items.every((item) =>
            item.status === 'rute' || (item.status === 'nonaktif' && item.judul === 'Chat')));
        });
      }

      it('membatasi peran yang tidak dikenal ke dashboard', () => {
        const items = menuUntuk('role-tidak-dikenal').flatMap((group) => group.items);
        assert.deepEqual(items.map((item) => item.href), ['#/dashboard']);
      });
    });
  }

  it('shows chat as unavailable without a link in every legacy role menu while the schema is gated', () => {
    for (const role of [
      'guru', 'operator', 'siswa', 'ortu', 'admin_sekolah', 'superadmin',
    ]) {
      const groups = menuUntuk(role);
      assert.ok(groups.every((group) => group.items.length > 0));
      const items = groups.flatMap((group) => group.items);
      const chat = items.filter((item) => item.judul === 'Chat');
      assert.equal(chat.length, 1, `${role}: status Chat tetap terlihat`);
      assert.equal(chat[0].status, 'nonaktif');
      assert.equal(chat[0].href, undefined);
      assert.match(chat[0].availabilityMessage, /kebijakan akses sekolah belum terverifikasi/);
      assert.ok(items.every((item) =>
        !item.href || !isChatFeaturePath(item.href.slice(1).split('?')[0])));
    }
  });
});
