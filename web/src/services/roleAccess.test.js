import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canOpenRolePath } from './roleAccess.js';

test('Kepala Sekolah dan Wali Kelas hanya dapat membuka dashboard sampai ada izin terukur', () => {
  for (const role of ['kepala_sekolah', 'wali_kelas']) {
    assert.equal(canOpenRolePath(role, '/dashboard'), true);
    assert.equal(canOpenRolePath(role, '/admin/pengguna/guru'), false);
    assert.equal(canOpenRolePath(role, '/perencanaan'), false);
    assert.equal(canOpenRolePath(role, '/chat'), false);
  }
});

test('peran lain tetap mengikuti otorisasi rute yang sudah ada', () => {
  for (const role of ['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler', 'siswa', 'superadmin']) {
    assert.equal(canOpenRolePath(role, '/dashboard'), true);
    assert.equal(canOpenRolePath(role, '/perencanaan'), true);
  }
});

test('role yang tidak disediakan aplikasi tidak dapat membuka rute', () => {
  for (const path of ['/dashboard', '/admin/pengguna/guru', '/perencanaan', '/chat', '/trial']) {
    assert.equal(canOpenRolePath('unprovisioned', path), false);
    assert.equal(canOpenRolePath('invalid-role', path), false);
  }
});
