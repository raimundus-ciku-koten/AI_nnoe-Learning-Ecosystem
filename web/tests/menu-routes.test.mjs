import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { menuUntuk } from '../src/menu.js';
import { cariMenu, menuUntukPeran } from '../src/navigasi.js';
import {
  CHAT_FEATURE_ENABLED,
  isChatFeaturePath,
} from '../src/services/featureFlags.js';

const appSource = readFileSync(new URL('../src/app/RouteWrapper.jsx', import.meta.url), 'utf8');
const submenuSource = readFileSync(new URL('../src/pages/SubMenuPage.jsx', import.meta.url), 'utf8');
const explicitRoutes = [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)]
  .map((match) => match[1]);

function cocokRuteEksplisit(route, path) {
  const routeParts = route.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  let pathIndex = 0;

  for (const part of routeParts) {
    if (part === '*') return true;
    if (part.startsWith(':')) {
      if (part.endsWith('?') && pathIndex === pathParts.length) continue;
      if (pathIndex === pathParts.length) return false;
      pathIndex += 1;
      continue;
    }
    if (part !== pathParts[pathIndex]) return false;
    pathIndex += 1;
  }

  return pathIndex === pathParts.length;
}

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
          assert.ok(
            explicitRoutes.some((route) => cocokRuteEksplisit(route, path)),
            `${role}: ${item.judul} jatuh ke fallback, bukan rute aplikasi eksplisit`,
          );
        }
      }
    });

    describe('menu legacy untuk siswa dan orang tua', () => {
      for (const [role, label] of [
        ['siswa', 'Jadwal dan Tugas'],
        ['ortu', 'Ringkasan Anak'],
        ['orang_tua', 'Ringkasan Anak'],
      ]) {
        it(`menonaktifkan submenu yang belum memiliki alur kerja untuk ${role}`, () => {
          const items = menuUntuk(role).flatMap((group) => group.items);
          const item = items.find((entry) => entry.judul === label);
          assert.ok(item, `${role}: ${label} tersedia sebagai status menu`);
          assert.equal(item.status, 'nonaktif');
          assert.equal(item.href, undefined);
          assert.match(item.availabilityMessage, /Alur kerja.*belum tersedia/);
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

  it('shows at most one unavailable chat entry in each role menu group while chat is gated', () => {
    if (CHAT_FEATURE_ENABLED) return;

    for (const role of [
      'guru', 'operator', 'siswa', 'ortu', 'admin_sekolah', 'superadmin',
    ]) {
      for (const group of menuUntukPeran(role)) {
        const chatItems = group.item
          .filter((item) => item.label === 'Chat' || isChatFeaturePath(item.path));

        assert.ok(chatItems.length <= 1, `${role}/${group.label}: Chat tidak boleh berulang`);
        assert.ok(chatItems.every((item) => item.disabled && !item.path));
      }
    }
  });

  it('requires the authenticated private shell and privileged MFA for the platform user directory', () => {
    assert.doesNotMatch(
      appSource,
      /location\.pathname\s*===\s*'\/platform\/supabase-users'/,
      'the administration page must not skip the auth-loading guard',
    );
    assert.match(
      appSource,
      /<Route path="\/platform\/supabase-users" element=\{user\s*\?\s*<PrivateShell><HalamanPenggunaSupabase \/><\/PrivateShell>/,
    );
    assert.match(appSource, /<PrivilegedMfaGate role=\{role\} userId=\{user\.uid\}>/);
  });

  it('routes active sidebar items specifically, allowing only the intentional teacher account fallback', () => {
    for (const role of [
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler',
      'operator', 'admin_sekolah', 'superadmin', 'siswa', 'ortu',
      'demo', 'kepala_sekolah', 'wali_kelas',
    ]) {
      for (const item of menuUntukPeran(role).flatMap((group) => group.item)) {
        if (item.disabled) continue;

        assert.ok(item.path, `${role}: ${item.label} tidak memiliki path`);
        const specificRoutes = explicitRoutes.filter((route) =>
          route !== '*' && cocokRuteEksplisit(route, item.path));
        if (specificRoutes.length === 0) {
          assert.equal(item.path, '/pengaturan/akun', `${role}: ${item.label} hanya ditangani rute fallback`);
          assert.ok(
            ['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'].includes(role),
            `${role}: fallback profil guru tidak boleh dipakai peran ini`,
          );
          assert.match(
            submenuSource,
            /adalahPeranGuru\(peranAktif\)\s*&&\s*item\.path\s*===\s*'\/pengaturan\/akun'\s*\)\s*return\s*<TeacherAccountPage\s*\/>/,
            'fallback akun harus ditangani halaman akun guru, bukan halaman generik',
          );
          continue;
        }

        assert.ok(
          specificRoutes.some((route) => cocokRuteEksplisit(route, item.path)),
          `${role}: ${item.label} tidak memiliki handler rute khusus (${item.path})`,
        );
      }
    }
  });
});
