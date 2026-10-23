import assert from 'node:assert/strict';
import { test } from 'node:test';
import { menuUntuk } from '../menu.js';
import { canOpenRolePath } from './roleAccess.js';

test('Kepala Sekolah dan Wali Kelas hanya dapat membuka dashboard sampai ada izin terukur', () => {
  for (const role of ['kepala_sekolah', 'wali_kelas']) {
    assert.equal(canOpenRolePath(role, '/dashboard'), true);
    assert.equal(canOpenRolePath(role, '/admin/pengguna/guru'), false);
    assert.equal(canOpenRolePath(role, '/perencanaan'), false);
    assert.equal(canOpenRolePath(role, '/chat'), false);
  }
});

test('setiap tautan menu dapat dibuka hanya dalam konteks peran pemiliknya', () => {
  for (const role of [
    'superadmin', 'admin_sekolah', 'operator', 'guru', 'guru_bk',
    'guru_kokurikuler', 'guru_ekstrakurikuler', 'kepala_sekolah',
    'wali_kelas', 'siswa', 'ortu', 'orang_tua',
  ]) {
    assert.equal(canOpenRolePath(role, '/dashboard'), true);
    for (const item of menuUntuk(role).flatMap((group) => group.items)) {
      if (item.status !== 'rute') {
        assert.equal(item.href, undefined, `${role} placeholder ${item.judul} unexpectedly has a route`);
        continue;
      }
      const target = new URL(item.href.slice(1), 'https://app.invalid');
      assert.equal(
        canOpenRolePath(role, target.pathname, target.search),
        true,
        `${role} tidak dapat membuka menu ${item.judul} (${target.pathname}${target.search})`,
      );
    }
  }
});

test('rute lintas peran yang tidak tercantum pada menu ditolak', () => {
  assert.equal(canOpenRolePath('siswa', '/perencanaan'), false);
  assert.equal(canOpenRolePath('guru', '/admin/pengguna/guru'), false);
  assert.equal(canOpenRolePath('admin_sekolah', '/platform/keamanan/audit'), false);
  assert.equal(canOpenRolePath('superadmin', '/siswa/nilai'), false);
  assert.equal(canOpenRolePath('operator', '/trial'), false);
});

test('role yang tidak disediakan aplikasi tidak dapat membuka rute', () => {
  for (const path of ['/dashboard', '/admin/pengguna/guru', '/perencanaan', '/chat', '/trial']) {
    assert.equal(canOpenRolePath('unprovisioned', path), false);
    assert.equal(canOpenRolePath('invalid-role', path), false);
  }
});
