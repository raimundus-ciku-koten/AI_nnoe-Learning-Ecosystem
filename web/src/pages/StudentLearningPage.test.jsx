import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  role: 'siswa',
  activeRole: null,
  user: { uid: 'student-a' },
}));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../services/studentLearning.js', () => ({
  muatJadwalSiswa: vi.fn(),
  muatMateriSiswa: vi.fn(),
}));

import StudentLearningPage from './StudentLearningPage.jsx';

function renderPage(path) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <StudentLearningPage />
    </MemoryRouter>,
  );
}

describe('StudentLearningPage', () => {
  beforeEach(() => {
    auth.role = 'siswa';
    auth.activeRole = null;
  });

  it('renders the dedicated schedule view and student learning navigation', () => {
    const html = renderPage('/siswa/jadwal');

    expect(html).toContain('<h1 id="student-learning-title">Jadwal Kelas</h1>');
    expect(html).toContain('href="#/siswa/jadwal"');
    expect(html).toContain('href="#/siswa/materi"');
    expect(html).toContain('Memuat ruang belajar');
    expect(html).not.toContain('Panduan · baca saja');
  });

  it('renders the dedicated learning materials view', () => {
    const html = renderPage('/siswa/materi');

    expect(html).toContain('<h1 id="student-learning-title">Materi Belajar</h1>');
    expect(html).toContain('Bahan ajar yang diterbitkan guru');
  });

  it('blocks another primary role unless its active role is student', () => {
    auth.role = 'admin_sekolah';
    expect(renderPage('/siswa/materi')).toContain('Halaman ini hanya tersedia saat Anda masuk sebagai siswa.');

    auth.activeRole = 'siswa';
    expect(renderPage('/siswa/materi')).toContain('<h1 id="student-learning-title">Materi Belajar</h1>');
  });
});
