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
  for (const role of [
    'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler',
    'siswa', 'ortu', 'orang_tua', 'superadmin',
  ]) {
    assert.equal(canOpenRolePath(role, '/dashboard'), true);
    assert.equal(canOpenRolePath(role, '/perencanaan'), true);
  }
});

test('akun orang tua dapat membuka halaman paket untuk permintaan manual', () => {
  for (const role of ['ortu', 'orang_tua']) {
    assert.equal(canOpenRolePath(role, '/purchase'), true);
  }
});

test('peran demo hanya dapat membuka simulasi uji coba', () => {
  assert.equal(canOpenRolePath('demo', '/trial'), true);
  for (const path of ['/dashboard', '/admin/pengguna/guru', '/perencanaan', '/chat']) {
    assert.equal(canOpenRolePath('demo', path), false);
  }
});
