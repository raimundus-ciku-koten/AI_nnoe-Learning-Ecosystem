import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  user: { uid: 'school-user' },
  role: 'siswa',
  tenantId: 'school-a',
}));

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../services/schoolLearning.js', () => ({
  beriUmpanBalikTugas: vi.fn(),
  buatJadwalMateri: vi.fn(),
  hapusJadwalMateri: vi.fn(),
  kirimJawabanTugas: vi.fn(),
  muatKelasRosterGuru: vi.fn(async () => ['7A', '7B']),
  muatPengumpulanTugasStaf: vi.fn(async () => []),
  muatPengumpulanTugasSiswa: vi.fn(async () => []),
  muatJadwalMateriStaf: vi.fn(async () => []),
  muatJadwalMateriSiswa: vi.fn(async () => []),
  ubahJadwalMateri: vi.fn(),
}));

import SchoolLearningPage from './SchoolLearningPage.jsx';

function renderPage(path) {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: [path] },
      React.createElement(SchoolLearningPage),
    ),
  );
}

describe('school learning page', () => {
  beforeEach(() => {
    auth.role = 'siswa';
    auth.tenantId = 'school-a';
  });

  it('shows students only their schedule/tasks and materials feeds', () => {
    expect(renderPage('/siswa/jadwal')).toContain('Jadwal dan Tugas');
    expect(renderPage('/siswa/materi')).toContain('Materi Belajar');
    expect(renderPage('/siswa/jadwal')).not.toContain('Terbitkan agar dapat dilihat siswa');
  });

  it('provides school staff with schedule/task or material authoring controls', () => {
    auth.role = 'guru_bk';
    const schedule = renderPage('/datadasar/jadwal');
    expect(schedule).toContain('Jadwal dan Tugas Sekolah');
    expect(schedule).toContain('Terbitkan agar dapat dilihat siswa');
    expect(schedule).toContain('<option value="task">Tugas</option>');
    expect(schedule).toContain('Pilih kelas pada roster Anda');
    expect(schedule).toContain('disabled=""');

    auth.role = 'admin_sekolah';
    const materials = renderPage('/admin/konten/bahan-ajar');
    expect(materials).toContain('Pengelolaan Materi Ajar');
    expect(materials).not.toContain('<select');
    expect(materials).toContain('Contoh: 7A');
  });

  it('denies non-student, non-staff roles and reports missing staff tenant context', () => {
    auth.role = 'superadmin';
    expect(renderPage('/siswa/jadwal')).toContain('Akses ke modul pembelajaran tidak tersedia.');

    auth.role = 'operator';
    auth.tenantId = '';
    expect(renderPage('/admin/akademik/jadwal')).toContain('Akun belum terhubung ke sekolah yang aktif.');
  });
});
