import assert from 'node:assert/strict';
import { test } from 'node:test';
import { menuUntukPeran } from '../navigasi.js';
import { canOpenRolePath } from './roleAccess.js';

test('Kepala Sekolah dan Wali Kelas hanya dapat membuka dashboard sampai ada izin terukur', () => {
  for (const role of ['kepala_sekolah', 'wali_kelas']) {
    assert.equal(canOpenRolePath(role, '/dashboard'), true);
    assert.equal(canOpenRolePath(role, '/admin/pengguna/guru'), false);
    assert.equal(canOpenRolePath(role, '/perencanaan'), false);
    assert.equal(canOpenRolePath(role, '/chat'), false);
  }
});

test('setiap tautan menu aktif diizinkan oleh gerbang rute peran yang sama', () => {
  const roles = [
    'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler', 'siswa',
    'ortu', 'orang_tua', 'operator', 'admin_sekolah', 'admin', 'superadmin',
  ];
  for (const role of roles) {
    assert.equal(canOpenRolePath(role, '/dashboard'), true);
    for (const item of menuUntukPeran(role).flatMap((group) => group.item)) {
      assert.equal(canOpenRolePath(role, item.path, item.search || ''), true, `${role}: ${item.label}`);
    }
  }
});

test('menolak rute lintas-peran dan hanya memberi dashboard pada role tak dikenal', () => {
  assert.equal(canOpenRolePath('siswa', '/admin/pengguna/guru'), false);
  assert.equal(canOpenRolePath('siswa', '/admin/komunikasi/broadcast'), false);
  assert.equal(canOpenRolePath('guru', '/admin/komunikasi/broadcast'), false);
  assert.equal(canOpenRolePath('admin_sekolah', '/admin/komunikasi/broadcast'), true);
  assert.equal(canOpenRolePath('guru', '/platform/tenant/sekolah'), false);
  assert.equal(canOpenRolePath('operator', '/perencanaan'), false);
  assert.equal(canOpenRolePath('peran-tidak-dikenal', '/admin/pengguna/guru'), false);
  assert.equal(canOpenRolePath('peran-tidak-dikenal', '/dashboard'), false);
});

test('tautan lama menuju perencanaan tetap tersedia hanya untuk role guru', () => {
  assert.equal(canOpenRolePath('guru', '/perencanaan/atp'), true);
  assert.equal(canOpenRolePath('siswa', '/perencanaan/atp'), false);
});

test('peran demo hanya dapat membuka simulasi uji coba', () => {
  assert.equal(canOpenRolePath('demo', '/trial'), true);
  for (const path of ['/dashboard', '/admin/pengguna/guru', '/perencanaan', '/chat']) {
    assert.equal(canOpenRolePath('demo', path), false);
  }
});

test('menu nonaktif memblokir rute langsung tetapi tidak memengaruhi menu lain', () => {
  const disabled = ['pelaksanaan|/pelaksanaan/jurnal'];
  assert.equal(canOpenRolePath('guru', '/pelaksanaan/jurnal', '', disabled), false);
  assert.equal(canOpenRolePath('guru', '/pelaksanaan/tugas', '', disabled), true);
  assert.equal(canOpenRolePath('guru', '/dashboard', '', ['beranda|/dashboard']), true);
  assert.equal(canOpenRolePath('guru', '/perencanaan', '?jenis=atp', ['perencanaan|/perencanaan?jenis=atp']), false);
  assert.equal(canOpenRolePath('guru', '/perencanaan/atp', '', ['perencanaan|/perencanaan?jenis=atp']), false);
});
