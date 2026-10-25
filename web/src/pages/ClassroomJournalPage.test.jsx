import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  role: 'guru',
  activeRole: 'guru',
  user: { uid: 'teacher-1' },
  tenantId: 'tenant-1',
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => auth,
}));
vi.mock('./perencanaan/services/repository.js', () => ({
  daftarArsipPerencanaan: vi.fn(async () => []),
}));

import ClassroomJournalPage from './ClassroomJournalPage.jsx';

describe('ClassroomJournalPage', () => {
  it('menyediakan form jurnal akademik dan bukan laporan presensi/nilai', () => {
    auth.role = 'guru';
    auth.activeRole = 'guru';
    const html = renderToStaticMarkup(<ClassroomJournalPage />);
    expect(html).toContain('Jurnal Mengajar');
    expect(html).toContain('Tujuan pembelajaran');
    expect(html).toContain('Kegiatan dan pelaksanaan');
    expect(html).toContain('Refleksi pembelajaran');
    expect(html).toContain('Jurnal ini terpisah dari presensi, nilai, dan laporan resmi');
    expect(html).toContain('href="#/laporan/harian-bulanan"');
    expect(html).toContain('href="#/ruang-kelas"');
  });

  it('menyediakan catatan cepat yang tersambung ke jurnal kelas dan laporan yang sama', () => {
    auth.role = 'guru';
    auth.activeRole = 'guru';
    const html = renderToStaticMarkup(<ClassroomJournalPage quickMode />);
    expect(html).toContain('Catatan Kelas Cepat');
    expect(html).toContain('Ringkasan kegiatan kelas');
    expect(html).toContain('Simpan catatan cepat');
    expect(html).toContain('Lengkapi tujuan, refleksi, atau tindak lanjut (opsional)');
    expect(html).toContain('href="#/pelaksanaan/jurnal"');
    expect(html).toContain('href="#/laporan/harian-bulanan"');
    expect(html).not.toMatch(/<textarea id="classroom-journal-objectives" required/);
  });

  it('menyediakan realisasi yang menautkan jurnal ke arsip rencana milik guru', () => {
    auth.role = 'guru';
    auth.activeRole = 'guru';
    const html = renderToStaticMarkup(<ClassroomJournalPage realizationMode />);
    expect(html).toContain('Realisasi terhadap Rencana');
    expect(html).toContain('Dokumen rencana terkait');
    expect(html).toContain('Pilih dokumen pada arsip Anda');
    expect(html).toContain('bukan validasi atau pengesahan resmi');
    expect(html).toContain('Buka arsip perencanaan');
  });

  it('mendukung peran guru spesialis aktif pada akun multi-role', () => {
    auth.role = 'admin_sekolah';
    auth.activeRole = 'guru_bk';
    expect(renderToStaticMarkup(<ClassroomJournalPage />)).toContain('Jurnal Mengajar');
  });

  it('menolak akses role yang tidak berhak', () => {
    auth.role = 'siswa';
    auth.activeRole = 'siswa';
    expect(renderToStaticMarkup(<ClassroomJournalPage />))
      .toContain('Akses jurnal mengajar dibatasi');
  });
});
