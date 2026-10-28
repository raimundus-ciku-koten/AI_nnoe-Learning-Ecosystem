import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { isParentRole } from '../services/roleAccess.js';

export default function ParentAcademicAccessPage() {
  const { role, activeRole } = useAuth();
  const currentRole = activeRole || role;

  if (!isParentRole(currentRole)) {
    return (
      <main className="ale-kartu" role="alert">
        <h1>Akses informasi akademik anak</h1>
        <p>Halaman ini hanya tersedia bagi akun orang tua atau wali.</p>
      </main>
    );
  }

  return (
    <main className="ale-kartu" aria-labelledby="parent-academic-access-title">
      <p className="ale-submenu-kicker">Perkembangan Anak</p>
      <h1 id="parent-academic-access-title">Informasi akademik belum tersedia</h1>
      <p>
        Sekolah belum memverifikasi hubungan akun wali dengan siswa. Nilai dan kehadiran
        tidak ditampilkan sampai penautan resmi dan izin akses data tersedia.
      </p>
      <p>
        Hubungi sekolah melalui kanal komunikasi resmi untuk memeriksa penautan akun.
        Halaman ini tidak menyimpan atau menampilkan catatan akademik anak.
      </p>
      <nav aria-label="Komunikasi dengan sekolah">
        <a className="ale-submenu-tombol" href="#/pengumuman">Pengumuman Sekolah</a>
        {' '}
        <a className="ale-submenu-tombol" href="#/chat">Hubungi sekolah</a>
      </nav>
    </main>
  );
}
