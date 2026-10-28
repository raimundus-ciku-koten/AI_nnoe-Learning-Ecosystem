import assert from 'node:assert/strict';
import { test } from 'node:test';
import { menuUntukPeran } from '../navigasi.js';
import {
  canOpenRolePath, getAssignedRoleChoices, getRoleAssignmentFormState, isKnownRole,
  isParentRole, isSchoolAdminRole, isTeacherRole,
} from './roleAccess.js';
import { isMenuPathDisabled } from './menuAccessPolicy.js';
import { isMaintenanceBlocked, requiresPrivilegedMfa } from './privilegedAccessPolicy.js';

test('Kepala Sekolah dan Wali Kelas hanya dapat membuka dashboard dan modul sesuai lingkup', () => {
  assert.equal(canOpenRolePath('kepala_sekolah', '/dashboard'), true);
  assert.equal(canOpenRolePath('kepala_sekolah', '/kepala-sekolah/ringkasan'), true);
  assert.equal(canOpenRolePath('kepala_sekolah', '/wali-kelas/pemantauan'), false);
  assert.equal(canOpenRolePath('kepala_sekolah', '/admin/pengguna/guru'), false);
  assert.equal(canOpenRolePath('kepala_sekolah', '/perencanaan'), false);
  assert.equal(canOpenRolePath('kepala_sekolah', '/chat'), false);

  assert.equal(canOpenRolePath('wali_kelas', '/dashboard'), true);
  assert.equal(canOpenRolePath('wali_kelas', '/wali-kelas/pemantauan'), true);
  assert.equal(canOpenRolePath('wali_kelas', '/kepala-sekolah/ringkasan'), false);
  assert.equal(canOpenRolePath('wali_kelas', '/admin/pengguna/guru'), false);
  assert.equal(canOpenRolePath('wali_kelas', '/perencanaan'), false);
  assert.equal(canOpenRolePath('wali_kelas', '/chat'), false);
});

test('peran lain tetap mengikuti otorisasi rute yang sudah ada', () => {
  for (const role of ['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']) {
    assert.equal(canOpenRolePath(role, '/dashboard'), true);
    assert.equal(canOpenRolePath(role, '/perencanaan'), true);
  }
  assert.equal(canOpenRolePath('siswa', '/dashboard'), true);
  assert.equal(canOpenRolePath('siswa', '/perencanaan'), false);
  assert.equal(canOpenRolePath('superadmin', '/platform/fitur/flags'), true);
  assert.equal(canOpenRolePath('superadmin', '/perencanaan'), false);
});

test('alias admin sekolah dan peran guru spesialis menggunakan kebijakan role yang sama', () => {
  assert.equal(isSchoolAdminRole('admin'), true);
  assert.equal(isSchoolAdminRole('admin_sekolah'), true);
  assert.equal(isSchoolAdminRole('operator'), false);
  for (const role of ['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']) {
    assert.equal(isTeacherRole(role), true, role);
  }
  for (const role of ['admin', 'admin_sekolah', 'operator', 'siswa']) {
    assert.equal(isTeacherRole(role), false, role);
  }
});

test('alias orang tua dikenali bersama untuk halaman akademik yang gagal-tertutup', () => {
  assert.equal(isParentRole('ortu'), true);
  assert.equal(isParentRole('orang_tua'), true);
  assert.equal(isParentRole('guru'), false);
  for (const role of ['ortu', 'orang_tua']) {
    assert.equal(canOpenRolePath(role, '/orang-tua/anak'), true, role);
    assert.equal(canOpenRolePath(role, '/orang-tua/nilai-kehadiran'), true, role);
  }
  for (const role of ['guru', 'siswa', 'operator']) {
    assert.equal(canOpenRolePath(role, '/orang-tua/nilai-kehadiran'), false, role);
  }
});

test('peran demo hanya dapat membuka simulasi uji coba', () => {
  assert.equal(canOpenRolePath('demo', '/trial'), true);
  for (const path of ['/dashboard', '/admin/pengguna/guru', '/perencanaan', '/chat', '/ruang-kelas']) {
    assert.equal(canOpenRolePath('demo', path), false);
  }
});

test('peran yang tidak dikenal hanya dapat membuka dashboard', () => {
  for (const role of [null, '', 'role-tidak-dikenal']) {
    assert.equal(canOpenRolePath(role, '/dashboard'), true, String(role));
    for (const path of [
      '/admin/pengguna/guru',
      '/platform/fitur/flags',
      '/perencanaan',
      '/chat',
      '/ruang-kelas',
    ]) {
      assert.equal(canOpenRolePath(role, path), false, `${role}: ${path}`);
    }
  }
});

test('role yang belum diprovisikan hanya menawarkan role valid dari klaim server', () => {
  assert.equal(isKnownRole('admin_sekolah'), true);
  assert.equal(isKnownRole('unprovisioned'), false);
  assert.equal(isKnownRole(null), false);
  assert.deepEqual(
    getAssignedRoleChoices(['guru', 'admin_sekolah', 'guru', 'unprovisioned', null, 4]),
    ['guru', 'admin_sekolah'],
  );
  assert.deepEqual(getAssignedRoleChoices('guru'), []);
});

test('form provisioning tidak mengarang peran untuk akun yang belum ditetapkan', () => {
  const allowedRoles = ['admin_sekolah', 'guru', 'siswa'];
  assert.deepEqual(
    getRoleAssignmentFormState({ role: 'unprovisioned', roles: [] }, allowedRoles),
    { role: '', roles: [] },
  );
  assert.deepEqual(
    getRoleAssignmentFormState({ role: 'admin_sekolah', roles: ['admin_sekolah', 'unprovisioned'] }, allowedRoles),
    { role: 'admin_sekolah', roles: ['admin_sekolah'] },
  );
  assert.deepEqual(
    getRoleAssignmentFormState({ role: 'unprovisioned', roles: ['guru'] }, allowedRoles),
    { role: '', roles: ['guru'] },
  );
});

test('catatan kerja pribadi hanya dapat dibuka peran guru', () => {
  for (const role of ['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']) {
    assert.equal(canOpenRolePath(role, '/guru/catatan-pribadi'), true, role);
    assert.equal(canOpenRolePath(role, '/guru/catatan-pribadi/arsip'), true, role);
  }
  for (const role of ['admin_sekolah', 'operator', 'siswa', 'ortu', 'superadmin', 'unknown']) {
    assert.equal(canOpenRolePath(role, '/guru/catatan-pribadi'), false, role);
    assert.equal(canOpenRolePath(role, '/guru/catatan-pribadi/arsip'), false, role);
  }
});

test('analisis dan laporan penilaian Ruang Kelas hanya tersedia bagi guru yang berwenang', () => {
  for (const role of ['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']) {
    assert.equal(canOpenRolePath(role, '/asesmen/analisis'), true, role);
    assert.equal(canOpenRolePath(role, '/laporan/penilaian'), true, role);
  }
  for (const role of ['admin_sekolah', 'operator', 'siswa', 'ortu', 'superadmin', 'demo']) {
    assert.equal(canOpenRolePath(role, '/asesmen/analisis'), false, role);
    assert.equal(canOpenRolePath(role, '/laporan/penilaian'), false, role);
  }
});

test('rapor resmi mengikuti alur guru, admin sekolah, dan siswa tanpa membuka jalur orang tua', () => {
  for (const role of ['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']) {
    assert.equal(canOpenRolePath(role, '/asesmen/rapor'), true, role);
  }
  assert.equal(canOpenRolePath('admin_sekolah', '/admin/akademik/rapor'), true);
  assert.equal(canOpenRolePath('siswa', '/siswa/rapor'), true);
  for (const role of ['operator', 'ortu', 'orang_tua', 'superadmin']) {
    assert.equal(canOpenRolePath(role, '/asesmen/rapor'), false, role);
    assert.equal(canOpenRolePath(role, '/admin/akademik/rapor'), false, role);
    assert.equal(canOpenRolePath(role, '/siswa/rapor'), false, role);
  }
});

test('modul administratif, siswa, orang tua, dan asesmen membatasi URL langsung per peran', () => {
  for (const role of ['admin', 'admin_sekolah']) {
    assert.equal(canOpenRolePath(role, '/admin/pengguna/guru'), true, role);
    assert.equal(canOpenRolePath(role, '/asesmen/bank-soal'), true, role);
    assert.equal(canOpenRolePath(role, '/platform/fitur/flags'), false, role);
    assert.equal(canOpenRolePath(role, '/admin/akademik/wali-kelas'), true, role);
    assert.equal(canOpenRolePath(role, '/siswa/nilai'), false, role);
    assert.equal(canOpenRolePath(role, '/orang-tua/anak'), false, role);
  }
  assert.equal(canOpenRolePath('superadmin', '/platform/fitur/flags'), true);
  assert.equal(canOpenRolePath('superadmin', '/admin/perencanaan/paket/abc'), false);
  assert.equal(canOpenRolePath('superadmin', '/admin/pengguna/guru'), false);

  for (const role of ['siswa']) {
    assert.equal(canOpenRolePath(role, '/siswa/nilai'), true, role);
    assert.equal(canOpenRolePath(role, '/siswa/ujian'), true, role);
    assert.equal(canOpenRolePath(role, '/asesmen/ujian-online'), false, role);
    assert.equal(canOpenRolePath(role, '/admin/pengguna/guru'), false, role);
    assert.equal(canOpenRolePath(role, '/orang-tua/anak'), false, role);
  }
  for (const role of ['ortu', 'orang_tua']) {
    assert.equal(canOpenRolePath(role, '/orang-tua/anak'), true, role);
    assert.equal(canOpenRolePath(role, '/siswa/nilai'), false, role);
    assert.equal(canOpenRolePath(role, '/admin/pengguna/guru'), false, role);
  }
  for (const role of ['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']) {
    assert.equal(canOpenRolePath(role, '/asesmen/ujian-online'), true, role);
    assert.equal(canOpenRolePath(role, '/asesmen/bank-soal'), true, role);
    assert.equal(canOpenRolePath(role, '/admin/pengguna/guru'), false, role);
    assert.equal(canOpenRolePath(role, '/platform/fitur/flags'), false, role);
  }
});

test('penetapan wali kelas hanya tersedia bagi admin sekolah, bukan operator', () => {
  assert.equal(canOpenRolePath('admin', '/admin/akademik/wali-kelas'), true);
  assert.equal(canOpenRolePath('admin_sekolah', '/admin/akademik/wali-kelas'), true);
  for (const role of ['operator', 'kepala_sekolah', 'wali_kelas', 'guru', 'superadmin']) {
    assert.equal(canOpenRolePath(role, '/admin/akademik/wali-kelas'), false, role);
  }
});

test('Kanal Pengumuman sekolah dapat dibaca warga sekolah dan dikelola staf', () => {
  for (const role of ['admin', 'admin_sekolah', 'operator', 'guru', 'guru_bk', 'siswa', 'ortu', 'orang_tua']) {
    assert.equal(canOpenRolePath(role, '/pengumuman'), true, role);
  }
  for (const role of ['superadmin', 'demo', 'kepala_sekolah', 'wali_kelas']) {
    assert.equal(canOpenRolePath(role, '/admin/komunikasi/pengumuman'), false, role);
    assert.equal(canOpenRolePath(role, '/pengumuman'), false, role);
  }
});

test('URL akses pribadi yang tidak tercantum di menu ditolak', () => {
  for (const role of ['siswa', 'ortu', 'operator']) {
    assert.equal(canOpenRolePath(role, '/pengaturan/api-ai'), false, role);
    assert.equal(canOpenRolePath(role, '/pengaturan/google'), false, role);
  }
  assert.equal(canOpenRolePath('guru', '/pengaturan/api-ai'), true);
  assert.equal(canOpenRolePath('guru', '/pengaturan/google'), true);
});

test('semua rute yang tercantum dalam menu peran tetap dapat dibuka oleh peran tersebut', () => {
  const roles = [
    'admin', 'admin_sekolah', 'operator', 'superadmin',
    'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler',
    'siswa', 'ortu', 'orang_tua', 'kepala_sekolah', 'wali_kelas', 'demo',
  ];
  for (const role of roles) {
    for (const item of menuUntukPeran(role).flatMap((group) => group.item)) {
      assert.equal(
        canOpenRolePath(role, item.path),
        true,
        `${role} harus dapat membuka menu ${item.path}`,
      );
    }
  }
});

test('Ruang Kelas hanya dapat diakses operator, admin sekolah, superadmin, guru, dan siswa', () => {
  for (const role of [
    'operator', 'admin', 'admin_sekolah', 'superadmin',
    'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler', 'siswa',
  ]) {
    assert.equal(canOpenRolePath(role, '/ruang-kelas'), true, role);
  }
  for (const role of ['ortu', 'orang_tua', 'kepala_sekolah', 'wali_kelas', 'demo', 'unknown']) {
    assert.equal(canOpenRolePath(role, '/ruang-kelas'), false, role);
  }
});

test('pembatasan menu memblokir URL langsung dan gagal-tertutup untuk rute yang tidak dikenal', () => {
  assert.equal(isMenuPathDisabled(new Set(), 'guru', '/dashboard'), false);
  assert.equal(isMenuPathDisabled(new Set(['path:/pengaturan/api-ai']), 'guru', '/pengaturan/api-ai'), true);
  assert.equal(isMenuPathDisabled(new Set(['group:perencanaan']), 'guru', '/perencanaan', '?jenis=atp'), true);
  assert.equal(isMenuPathDisabled(new Set(['path:/chat']), 'guru', '/chat/conversation-id'), true);
  assert.equal(isMenuPathDisabled(new Set(['path:/chat']), 'guru', '/rute-tidak-terdaftar'), true);
});

test('MFA dan mode pemeliharaan mengikuti peran aktif yang dipilih', () => {
  for (const role of ['admin', 'admin_sekolah', 'superadmin']) {
    assert.equal(requiresPrivilegedMfa(role), true, role);
  }
  for (const role of ['guru', 'operator', 'siswa']) {
    assert.equal(requiresPrivilegedMfa(role), false, role);
  }
  assert.equal(isMaintenanceBlocked('guru', true), true);
  assert.equal(isMaintenanceBlocked('superadmin', true), false);
  assert.equal(isMaintenanceBlocked('superadmin', false), false);
});
