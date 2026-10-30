// web/src/pages/DashboardPage.jsx
import React, { useMemo } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { LINK_PERENCANAAN_AKTIF } from '../config.js';
import { LABEL_PERAN, salam } from '../ui.js';
import { adalahPeranGuru, menuUntukPeran } from '../navigasi.js';
import Ikon from '../components/Ikon.jsx';

const formatTanggal = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

function Statistik({ warna, ikon, label, nilai, ket }) {
  return (
    <div className={`ale-stat ale-stat-${warna}`}>
      <span className="ale-stat-ikon" aria-hidden="true"><Ikon nama={ikon} /></span>
      <span className="ale-stat-label">{label}</span>
      <strong className="ale-stat-nilai">{nilai}</strong>
      {ket && <span className="ale-stat-foot">{ket}</span>}
    </div>
  );
}

function Aksi({ href, warna, ikon, judul, ket, luar }) {
  const isi = (
    <>
      <span className="ale-aksi-ikon" aria-hidden="true"><Ikon nama={ikon} /></span>
      <span className="ale-aksi-teks"><strong>{judul}</strong><small>{ket}</small></span>
    </>
  );
  if (!href) {
    return <div className="ale-aksi is-soon" aria-disabled="true">{isi}</div>;
  }
  return (
    <a className={`ale-aksi ale-aksi-${warna}`} href={href}
      {...(luar ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {isi}
    </a>
  );
}

export default function DashboardPage() {
  const { user, profile, role, activeRole, isDemo } = useAuth();
  const roleAktif = activeRole || role;
  const shortcutItems = useMemo(() => menuUntukPeran(roleAktif)
    .flatMap((group) => group.item)
    .filter((item) => item.path !== '/dashboard')
    .slice(0, 3), [roleAktif]);
  const sekarang = useMemo(() => new Date(), []);
  const namaDepan = (user?.displayName || 'Pengguna').split(' ')[0];

  return (
    <>
      <section className="ale-hero" aria-labelledby="ale-hero-judul">
        <div className="ale-hero-teks">
          <p className="ale-kicker"><Ikon nama="spark" /> Ruang kerja Anda</p>
          <h2 id="ale-hero-judul" className="ale-hero-judul">
            <span className="ale-hero-sapa">{salam()}, </span>
            <span className="ale-nama">{namaDepan}</span>
          </h2>
          <p>Mulai dari perencanaan, lanjutkan ke pelaksanaan, dan tutup dengan refleksi — semuanya di satu tempat.</p>
        </div>
        <div className="ale-tanggal">
          <span>Hari ini</span>
          <strong>{formatTanggal.format(sekarang)}</strong>
        </div>
      </section>

      <section className="ale-stat-grid" aria-label="Ringkasan akun" style={{ marginBottom: '1.25rem' }}>
        <Statistik warna="sky" ikon="user" label="Peran"
          nilai={LABEL_PERAN[roleAktif] || roleAktif || '—'}
          ket={isDemo ? 'Mode demonstrasi' : undefined} />
        <Statistik warna="grape" ikon="school" label="Sekolah"
          nilai={profile?.sekolah || 'Belum diisi'}
          ket={profile?.sekolah ? undefined : 'Dilengkapi oleh administrator'} />
        <Statistik warna="mint" ikon="badge" label="Langganan"
          nilai={profile?.langganan ? 'Aktif' : 'Belum aktif'} />
      </section>

      <section className="ale-akses" aria-labelledby="ale-akses-judul">
        <h2 id="ale-akses-judul" className="ale-sub-judul">Akses cepat</h2>
        <div className="ale-aksi-grid">
          {adalahPeranGuru(roleAktif) && LINK_PERENCANAAN_AKTIF && (
            <Aksi href={LINK_PERENCANAAN_AKTIF} luar warna="teal" ikon="clipboard"
              judul="Perencanaan pembelajaran" ket="Buka aplikasi perencanaan di tab baru" />
          )}
          {shortcutItems.map((item) => (
            <Aksi key={`${item.path}${item.search || ''}`} href={`#${item.path}${item.search || ''}`}
              warna="teal" ikon={item.ikon} judul={item.label} ket={`Buka ${item.label.toLocaleLowerCase('id')}`} />
          ))}
        </div>
      </section>

      <div className="ale-grid">
        <div className="ale-kolom">
          <section className="ale-kartu ale-aksen-teal ale-jadwal-utama" aria-labelledby="ale-jadwal-judul">
            <div className="ale-kartu-kepala">
              <h2 id="ale-jadwal-judul" className="ale-kartu-judul">
                <Ikon nama="calendar" /> Jadwal hari ini
              </h2>
            </div>
            <div className="ale-kosong">
              <Ikon nama="calendar" />
              <p>Belum ada jadwal yang terhubung. Jadwal mengajar akan tampil di sini.</p>
            </div>
          </section>
        </div>

        <div className="ale-kolom">
          <section className="ale-kartu ale-aksen-indigo" aria-labelledby="ale-info-judul">
            <div className="ale-kartu-kepala">
              <h2 id="ale-info-judul" className="ale-kartu-judul">
                <Ikon nama="chat" /> Pesan terbaru
              </h2>
            </div>
            <div className="ale-kosong">
              <Ikon nama="chat" />
              <p>Belum ada percakapan.</p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
