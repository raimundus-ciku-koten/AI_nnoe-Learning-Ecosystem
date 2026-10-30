import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { menuUntukPeran } from '../navigasi.js';
import { filterMenuSearch } from '../utils/menuSearch.js';

const auth = vi.hoisted(() => ({
  user: { uid: 'user-test', displayName: 'Pengguna Tes', email: 'test@example.com' },
  profile: {},
  role: 'admin_sekolah',
  activeRole: 'siswa',
  roles: ['admin_sekolah', 'siswa'],
  logout: vi.fn(),
  switchRole: vi.fn(),
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => auth,
}));

import AppShell from './AppShell.jsx';

function renderShell(path, search = '') {
  return renderToStaticMarkup(
    <AppShell path={path} search={search}>
      <p>Konten halaman</p>
    </AppShell>,
  );
}

describe('AppShell navigasi berdasarkan peran aktif', () => {
  beforeEach(() => {
    auth.role = 'admin_sekolah';
    auth.activeRole = 'siswa';
  });

  it('menampilkan menu siswa dan menandai submenu aktif saat peran aktif berbeda dari peran utama', () => {
    const html = renderShell('/siswa/jadwal');

    expect(html).toContain('Ruang Belajar');
    expect(html).toContain('href="#/siswa/jadwal"');
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('Operasional Sekolah');
  });

  it('menampilkan menu guru spesialis dari peran aktif', () => {
    auth.activeRole = 'guru_bk';
    const html = renderShell('/pelaksanaan/jurnal');

    expect(html).toContain('Pelaksanaan Pembelajaran');
    expect(html).toContain('Jurnal Mengajar Harian');
    expect(html).not.toContain('Operasional Sekolah');
    expect(html).toContain('href="#/datadasar/kelas"');
    expect(html).toContain('href="#/pengaturan/api-ai"');
    expect(html).toContain('href="#/pengaturan/google"');
  });

  it('tidak menampilkan pintasan guru atau kontrol profil yang belum didukung kepada siswa', () => {
    auth.activeRole = 'siswa';
    const html = renderShell('/siswa/jadwal');

    expect(html).not.toContain('href="#/datadasar/kelas"');
    expect(html).not.toContain('href="#/pengaturan/api-ai"');
    expect(html).not.toContain('href="#/pengaturan/google"');
    expect(html).not.toContain('Ubah foto profil');
    expect(html).not.toContain('Hapus foto profil');
  });

  it('menampilkan navigasi admin instansi tanpa menu platform atau siswa', () => {
    auth.activeRole = 'admin_sekolah';
    const html = renderShell('/admin/akademik/kelas');

    expect(html).toContain('data-grup="admin-pengguna"');
    expect(html).toContain('href="#/admin/akademik/kelas"');
    expect(html).not.toContain('data-grup="platform-pengguna"');
    expect(html).not.toContain('href="#/platform/supabase-users"');
    expect(html).not.toContain('href="#/siswa/jadwal"');
  });

  it('menampilkan navigasi superadmin tanpa menu administrasi sekolah', () => {
    auth.activeRole = 'superadmin';
    const html = renderShell('/platform/tenant/sekolah');

    expect(html).toContain('Dashboard Super Admin');
    expect(html).toContain('href="#/platform/tenant/sekolah"');
    expect(html).toContain('data-grup="platform-pengguna"');
    expect(html).not.toContain('data-grup="admin-pengguna"');
    expect(html).not.toContain('href="#/admin/pengguna/guru"');
    expect(html).not.toContain('href="#/admin/akademik/kelas"');
  });

  it('merender dan menandai aktif setiap tautan submenu untuk semua role', () => {
    const roles = [
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler', 'operator',
      'admin_sekolah', 'admin', 'superadmin', 'siswa', 'ortu', 'orang_tua',
      'kepala_sekolah', 'wali_kelas', 'demo',
    ];

    for (const role of roles) {
      auth.role = role;
      auth.activeRole = role;
      auth.roles = [role];
      for (const group of menuUntukPeran(role)) {
        for (const item of group.item) {
          const html = renderShell(item.path, item.search || '');
          const href = `href="#${item.path}${item.search || ''}"`.replaceAll('&', '&amp;');
          expect(html, `${role}: ${item.label} memiliki tautan`).toContain(href);
          expect(html, `${role}: ${item.label} ditandai aktif`).toContain('aria-current="page"');
        }
      }
    }
  });

  it('menyediakan pencarian menu pada top bar', () => {
    const html = renderShell('/dashboard');
    expect(html).toContain('aria-label="Cari menu"');
    expect(html).toContain('id="ale-pencarian-menu"');
    expect(html).toContain('title="Cari menu (Ctrl/Cmd+K)"');
    expect(html).toContain('title="Aktivitas dan notifikasi"');
    expect(html).toContain('aria-label="Aktivitas terbaru"');
  });

  it('mencari label dan grup hanya dari menu peran yang diberikan', () => {
    const siswa = menuUntukPeran('siswa');
    const hasilGrup = filterMenuSearch(siswa, 'komunikasi');
    expect(filterMenuSearch(siswa, 'ujian').map(({ item }) => item.label)).toEqual(['Ujian Saya']);
    expect(hasilGrup).toHaveLength(4);
    expect(hasilGrup.every(({ groupLabel }) => groupLabel === 'Komunikasi')).toBe(true);
    expect(filterMenuSearch(siswa, 'Barcode')).toEqual([]);
    expect(filterMenuSearch(siswa, 'jadwal', 1)).toHaveLength(1);
    const duplikat = [{ label: 'Satu', item: [{ label: 'Chat', path: '/chat' }] },
    { label: 'Dua', item: [{ label: 'Chat lain', path: '/chat' }] }];
    expect(filterMenuSearch(duplikat, 'chat')).toHaveLength(1);
  });
});
