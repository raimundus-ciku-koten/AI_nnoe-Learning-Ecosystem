import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  user: { uid: 'user-test' },
  role: 'guru',
  activeRole: null,
  tenantId: 'sekolah-test',
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => auth,
}));

vi.mock('../services/learningClassrooms.js', () => ({
  buatKuisRuangKelas: vi.fn(),
  buatJadwalRuangKelas: vi.fn(),
  ubahJadwalRuangKelas: vi.fn(),
  buatMateriRuangKelas: vi.fn(),
  buatRuangKelas: vi.fn(),
  buatSesiPresensiKelas: vi.fn(),
  buatTugasRuangKelas: vi.fn(),
  kirimJawabanTugas: vi.fn(),
  kirimJawabanKuis: vi.fn(),
  muatHasilKuisGuru: vi.fn(),
  muatHasilKuisSiswa: vi.fn(),
  muatJadwalRuangKelas: vi.fn(),
  muatCatatanPresensiKelas: vi.fn(),
  muatKuisRuangKelas: vi.fn(),
  muatSoalKuisUntukSiswa: vi.fn(),
  muatDaftarRuangKelas: vi.fn(),
  muatKandidatAnggotaRuangKelas: vi.fn(),
  muatPengumpulanTugas: vi.fn(),
  muatMateriRuangKelas: vi.fn(),
  hapusJadwalRuangKelas: vi.fn(),
  muatRosterPresensiKelas: vi.fn(),
  muatSesiPresensiKelas: vi.fn(),
  muatTugasRuangKelas: vi.fn(),
  nilaiPengumpulanTugas: vi.fn(),
  muatTenantRuangKelas: vi.fn(),
  simpanPresensiKelas: vi.fn(),
  PERAN_GURU_KELAS: ['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'],
}));

import RuangKelasPage, { bolehKelolaAktivitasKelas } from './RuangKelasPage.jsx';

function renderPage(path = '/ruang-kelas') {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: [path] },
      React.createElement(RuangKelasPage),
    ),
  );
}

describe('Ruang Kelas access and operator workflow', () => {
  beforeEach(() => {
    auth.role = 'guru';
    auth.activeRole = null;
  });

  it('shows the classroom list to teachers without exposing creation controls', () => {
    const html = renderPage();
    expect(html).toContain('Kelas saya');
    expect(html).toContain('Ruang Kelas');
    expect(html).not.toContain('Buat ruang kelas</h3>');
    expect(html).toContain('Memuat ruang kelas');
  });

  it('shows the classroom list to students without exposing creation controls', () => {
    auth.role = 'siswa';
    const html = renderPage();
    expect(html).toContain('Kelas saya');
    expect(html).not.toContain('Buat ruang kelas</h3>');
  });

  it('provides room creation and teacher/student assignment controls to operators', () => {
    auth.role = 'operator';
    const html = renderPage();
    expect(html).toContain('Buat ruang kelas');
    expect(html).toContain('Guru pengampu');
    expect(html).toContain('Siswa');
    expect(html).toContain('Penetapan anggota berlaku segera');
  });

  it('requires a target school for superadmin room creation', () => {
    auth.role = 'superadmin';
    auth.tenantId = '';
    expect(renderPage()).toContain('Pilih sekolah aktif');
    auth.tenantId = 'sekolah-test';
  });

  it('explains the current classroom activity scope', () => {
    const html = renderPage();
    expect(html).toContain('Lampiran berkas');
    expect(html).toContain('presensi kelas');
    expect(html).toContain('notifikasi LMS belum tersedia');
    expect(html).toContain('riwayat presensi');
  });

  it('allows assigned teacher roles to create and grade classroom tasks', () => {
    for (const role of ['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']) {
      expect(bolehKelolaAktivitasKelas(role)).toBe(true);
    }
    expect(renderPage()).toContain('kuis pilihan ganda');
  });

  it('uses the selected specialist teacher role for classroom activities', () => {
    auth.role = 'siswa';
    auth.activeRole = 'guru_bk';

    const html = renderPage();
    expect(html).toContain('kuis pilihan ganda');
    expect(html).not.toContain('Buat ruang kelas</h3>');
  });

  it('provides a teacher-only quiz workflow and hides the answer key by design', () => {
    expect(renderPage()).toContain('kuis pilihan ganda');
    expect(renderPage()).toContain('kunci jawaban kepada siswa');
    auth.role = 'siswa';
    expect(bolehKelolaAktivitasKelas(auth.role)).toBe(false);
  });

  it('does not expose task creation controls to students', () => {
    auth.role = 'siswa';
    expect(bolehKelolaAktivitasKelas(auth.role)).toBe(false);
    expect(renderPage()).toContain('kuis pilihan ganda');
  });
});
