import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Ikon from '../components/Ikon.jsx';
import {
  muatPengaturanTenant,
  simpanProfilTenant,
  simpanSiklusTenant,
} from '../services/tenantSettings.js';
import '../styles/school-settings.css';

const EMPTY_SETTINGS = {
  nama: '',
  npsn: '',
  kepalaSekolah: '',
  nipKepalaSekolah: '',
  tahunAjaran: '',
  semester: 'Ganjil',
};

function halamanUntukPath(pathname) {
  if (pathname.endsWith('/tahun-ajaran') || pathname.endsWith('/semester')) return 'siklus';
  return 'profil';
}

export default function SchoolSettingsPage() {
  const { pathname } = useLocation();
  const { role, tenantId, user } = useAuth();
  const halaman = halamanUntukPath(pathname);
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    if (role !== 'admin_sekolah' || !tenantId) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    setError('');
    muatPengaturanTenant(tenantId)
      .then((data) => { if (active) setSettings(data); })
      .catch((loadError) => {
        console.error('[school-settings] Gagal memuat pengaturan sekolah:', loadError);
        if (active) setError(loadError?.message || 'Pengaturan sekolah tidak dapat dimuat.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [role, tenantId]);

  function change(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function save(event) {
    event.preventDefault();
    if (role !== 'admin_sekolah' || !tenantId || !user?.uid || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const updated = halaman === 'profil'
        ? await simpanProfilTenant(tenantId, user.uid, settings)
        : await simpanSiklusTenant(tenantId, user.uid, settings);
      setSettings(updated);
      setNotice(halaman === 'profil'
        ? 'Profil sekolah berhasil diperbarui.'
        : 'Siklus akademik berhasil diperbarui.');
    } catch (saveError) {
      console.error('[school-settings] Gagal menyimpan pengaturan sekolah:', saveError);
      setError(saveError?.message || 'Pengaturan sekolah tidak dapat disimpan.');
    } finally {
      setSaving(false);
    }
  }

  if (role !== 'admin_sekolah') {
    return (
      <section className="ale-kartu school-settings-denied" role="alert">
        <h1>Akses pengaturan sekolah tidak tersedia</h1>
        <p>Pengaturan profil dan siklus akademik hanya dapat diubah administrator sekolah.</p>
      </section>
    );
  }

  if (!tenantId) {
    return (
      <section className="ale-kartu school-settings-denied" role="alert">
        <h1>Sekolah aktif tidak tersedia</h1>
        <p>Akun belum terhubung ke tenant sekolah aktif. Hubungi administrator platform.</p>
      </section>
    );
  }

  const isProfile = halaman === 'profil';

  return (
    <main className="school-settings">
      <header className="school-settings-header">
        <div>
          <p className="school-settings-kicker"><Ikon nama={isProfile ? 'building' : 'calendar'} /> Administrasi sekolah</p>
          <h1>{isProfile ? 'Profil Sekolah' : 'Siklus Akademik Aktif'}</h1>
          <p>
            {isProfile
              ? 'Kelola identitas dasar sekolah yang digunakan dalam lingkungan tenant aktif.'
              : 'Tetapkan tahun ajaran dan semester yang menjadi acuan kegiatan akademik sekolah.'}
          </p>
        </div>
        <a href="#/dashboard">Kembali ke Dashboard</a>
      </header>

      <nav className="school-settings-nav" aria-label="Pengaturan sekolah">
        <a
          href="#/admin/instansi/profil"
          aria-current={isProfile ? 'page' : undefined}
        >Profil Sekolah</a>
        <a
          href="#/admin/instansi/tahun-ajaran"
          aria-current={!isProfile ? 'page' : undefined}
        >Tahun Ajaran &amp; Semester</a>
      </nav>

      <section className="ale-kartu school-settings-card">
        <p className="school-settings-scope">
          Data hanya untuk tenant sekolah aktif. Perubahan disimpan langsung ke konfigurasi sekolah.
        </p>
        {error && <p className="school-settings-error" role="alert">{error}</p>}
        {notice && <p className="school-settings-notice" role="status">{notice}</p>}
        {loading && <p role="status">Memuat pengaturan sekolah…</p>}
        <form onSubmit={save}>
          {isProfile ? (
            <>
              <label>Nama sekolah
                <input required maxLength={160} value={settings.nama} disabled={loading || saving}
                  onChange={(event) => change('nama', event.target.value)} />
              </label>
              <label>NPSN <span>(opsional)</span>
                <input maxLength={20} value={settings.npsn} disabled={loading || saving}
                  onChange={(event) => change('npsn', event.target.value)} />
              </label>
              <label>Nama kepala sekolah <span>(opsional)</span>
                <input maxLength={160} value={settings.kepalaSekolah} disabled={loading || saving}
                  onChange={(event) => change('kepalaSekolah', event.target.value)} />
              </label>
              <label>NIP kepala sekolah <span>(opsional)</span>
                <input maxLength={40} value={settings.nipKepalaSekolah} disabled={loading || saving}
                  onChange={(event) => change('nipKepalaSekolah', event.target.value)} />
              </label>
            </>
          ) : (
            <>
              <label>Tahun ajaran aktif
                <input required maxLength={9} pattern="\d{4}/\d{4}"
                  placeholder="Contoh: 2026/2027" value={settings.tahunAjaran}
                  disabled={loading || saving}
                  onChange={(event) => change('tahunAjaran', event.target.value)} />
                <small>Format tahun berikutnya harus berurutan, misalnya 2026/2027.</small>
              </label>
              <label>Semester berjalan
                <select value={settings.semester} disabled={loading || saving}
                  onChange={(event) => change('semester', event.target.value)}>
                  <option value="Ganjil">Ganjil</option>
                  <option value="Genap">Genap</option>
                </select>
              </label>
            </>
          )}
          <button type="submit" disabled={saving || loading}>
            {saving ? 'Menyimpan…' : isProfile ? 'Simpan profil sekolah' : 'Simpan siklus akademik'}
          </button>
        </form>
      </section>
    </main>
  );
}
