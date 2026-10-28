import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import Ikon from '../components/Ikon.jsx';
import { normalisasiNama } from '../utils/nama.js';
import '../styles/teacher-workspace.css';

const NAMA_PERAN = {
  guru: 'Guru',
  admin_sekolah: 'Administrator sekolah',
  operator: 'Operator',
  demo: 'Akun demo',
};

export default function TeacherAccountPage() {
  const { user, profile, role, activeRole, updateProfil, resetPassword } = useAuth();
  const peranAktif = activeRole || role;
  const [nama, setNama] = useState(user?.displayName || profile?.nama || '');
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setNama(user?.displayName || profile?.nama || '');
  }, [user?.displayName, profile?.nama]);

  async function simpanNama(event) {
    event.preventDefault();
    const namaBersih = normalisasiNama(nama);
    if (!namaBersih || namaBersih.length > 100) {
      setError('Nama wajib diisi dan maksimal 100 karakter.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await updateProfil({ nama: namaBersih });
      setNama(namaBersih);
      setNotice('Nama profil berhasil diperbarui.');
    } catch (err) {
      console.error('[teacher-account] Gagal memperbarui nama profil:', err);
      setError(err?.code === 'permission-denied'
        ? 'Profil tidak dapat diperbarui oleh akun ini.'
        : 'Nama profil tidak dapat diperbarui. Periksa koneksi, lalu coba lagi.');
    } finally {
      setSaving(false);
    }
  }

  async function kirimResetKataSandi() {
    if (!user?.email || sendingReset) return;
    setSendingReset(true);
    setError('');
    setNotice('');
    try {
      await resetPassword(user.email);
      setNotice(`Tautan pengaturan ulang kata sandi telah dikirim ke ${user.email}.`);
    } catch (err) {
      console.error('[teacher-account] Gagal mengirim reset kata sandi:', err);
      setError(err?.code === 'auth/too-many-requests'
        ? 'Terlalu banyak permintaan. Tunggu beberapa saat sebelum mencoba lagi.'
        : 'Email pengaturan ulang kata sandi gagal dikirim. Periksa koneksi atau coba lagi nanti.');
    } finally {
      setSendingReset(false);
    }
  }

  return (
    <main className="teacher-workspace">
      <header className="teacher-workspace-header">
        <div>
          <p className="teacher-workspace-kicker"><Ikon nama="settings" /> Pengaturan akun</p>
          <h1>Akun &amp; Keamanan</h1>
          <p>Kelola nama profil dan akses pemulihan akun Anda.</p>
        </div>
        <span className="teacher-workspace-status">{NAMA_PERAN[peranAktif] || 'Guru'}</span>
      </header>

      <section className="ale-kartu teacher-account-card" aria-labelledby="teacher-account-title">
        <div className="teacher-workspace-section-head">
          <div>
            <p className="teacher-workspace-eyebrow">Profil akun</p>
            <h2 id="teacher-account-title">Informasi dan keamanan</h2>
          </div>
        </div>
        <form className="teacher-account-form" onSubmit={simpanNama}>
          <label>
            Email akun
            <input type="email" value={user?.email || ''} readOnly />
          </label>
          <label>
            Nama tampilan
            <input
              required maxLength={100} value={nama}
              onChange={(event) => setNama(event.target.value)}
              autoComplete="name"
            />
          </label>
          {error && <p className="teacher-workspace-error" role="alert">{error}</p>}
          {notice && <p className="teacher-workspace-notice" role="status">{notice}</p>}
          <button type="submit" disabled={saving}>
            {saving ? 'Menyimpan…' : 'Simpan nama profil'}
          </button>
        </form>
      </section>

      <section className="ale-kartu teacher-account-card" aria-labelledby="teacher-account-password-title">
        <div className="teacher-workspace-section-head">
          <div>
            <p className="teacher-workspace-eyebrow">Pemulihan akun</p>
            <h2 id="teacher-account-password-title">Kata sandi</h2>
          </div>
        </div>
        <p className="teacher-account-help">
          Tautan aman akan dikirim oleh Supabase Authentication ke email akun. Kata sandi
          tidak pernah dibaca atau disimpan oleh aplikasi.
        </p>
        <button type="button" className="teacher-account-reset"
          onClick={kirimResetKataSandi} disabled={!user?.email || sendingReset}>
          <Ikon nama="refresh" /> {sendingReset ? 'Mengirim…' : 'Kirim tautan reset kata sandi'}
        </button>
      </section>

      <p className="teacher-account-role-note">
        Peran dan akses sekolah dikelola oleh administrator melalui proses resmi; halaman ini
        tidak dapat menaikkan hak akses akun.
      </p>
    </main>
  );
}
