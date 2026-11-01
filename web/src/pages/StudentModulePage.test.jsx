import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useAuth, generateStudentModule } = vi.hoisted(() => ({
  useAuth: vi.fn(),
  generateStudentModule: vi.fn(),
}));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth }));
vi.mock('../services/studentModuleAi.js', () => ({ generateStudentModule }));

import StudentModulePage, { StudentModuleDocument } from './StudentModulePage.jsx';
import { MODUL_SISWA_BAGIAN } from '../services/studentModuleAiPrompts.js';

const moduleInput = {
  mapel: 'Matematika',
  kelas: 'X',
  topik: 'Persamaan Linear',
  tp: 'Menyelesaikan persamaan linear.',
  jumlahJP: 8,
  durasi: 45,
  level: 'Campuran',
  tahunAjaran: '',
  penulis: '',
  sekolah: '',
};

const moduleSections = MODUL_SISWA_BAGIAN.map((section) => ({
  id: section.id,
  judul: section.judul,
  markdown: 'Isi yang aman dan dapat dibaca siswa.',
  provider: 'local',
  model: 'llama3.2:3b',
  fallbackUsed: false,
}));

describe('StudentModulePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lets a signed-in teacher use the local draft generator without a tenant', () => {
    useAuth.mockReturnValue({
      user: { uid: 'teacher-1' },
      role: 'guru',
      activeRole: 'guru',
      tenantId: null,
    });

    const markup = renderToStaticMarkup(<StudentModulePage />);

    expect(markup).toContain('Modul Siswa');
    expect(markup).toContain('Draf tersimpan hanya setelah Anda memilih Simpan ke Drive.');
    expect(markup).toContain('Sinkronisasi otomatis RPE, Prosem, dan ATP belum tersedia');
    expect(markup).toContain('Hubungkan Google Drive');
    expect(markup).toContain('Isi Modul Siswa dienkripsi sebelum diunggah');
    expect(markup).toContain('Sumber pustaka terverifikasi');
    expect(markup).toContain('Susun Modul Siswa');
    expect(markup).not.toContain('Sudah tersimpan');
    expect(generateStudentModule).not.toHaveBeenCalled();
  });

  it('does not expose the generator to non-teacher roles', () => {
    useAuth.mockReturnValue({
      user: { uid: 'student-1' },
      role: 'siswa',
      activeRole: 'siswa',
    });

    const markup = renderToStaticMarkup(<StudentModulePage />);

    expect(markup).toContain('hanya tersedia untuk guru');
    expect(markup).not.toContain('Susun Modul Siswa');
    expect(generateStudentModule).not.toHaveBeenCalled();
  });
});

describe('StudentModuleDocument', () => {
  it('renders the cover and all nine document sections without inventing optional identity', () => {
    const markup = renderToStaticMarkup(
      <StudentModuleDocument input={moduleInput} sections={moduleSections} />,
    );

    expect(markup).toContain('Persamaan Linear');
    expect(markup).toContain('Matematika · X');
    expect(markup).toContain('8 JP × 45 menit');
    expect(markup).not.toContain('Tahun Ajaran');
    expect(markup).not.toContain('Sekolah Contoh');
    expect(markup).toContain('9. Kunci Jawaban dan Pembahasan');
    expect(markup).toContain('Pratinjau cetak Modul Siswa');
  });

  it('escapes AI content and renders Markdown tables as semantic tables', () => {
    const sections = moduleSections.map((section, index) => ({
      ...section,
      markdown: index === 0
        ? '### Aman\n<script>alert(1)</script>\n\n| Konsep | Makna |\n| --- | --- |\n| Persamaan | Kesetaraan |'
        : section.markdown,
    }));
    const markup = renderToStaticMarkup(
      <StudentModuleDocument input={moduleInput} sections={sections} />,
    );

    expect(markup).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(markup).not.toContain('<script>');
    expect(markup).toContain('<table>');
    expect(markup).toContain('<th>Konsep</th>');
  });

  it('does not present a partial module as a printable finished document', () => {
    expect(renderToStaticMarkup(
      <StudentModuleDocument input={moduleInput} sections={moduleSections.slice(0, 8)} />,
    )).toBe('');
  });
});
