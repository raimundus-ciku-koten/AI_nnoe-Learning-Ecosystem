import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { hubungkanGoogleWorkspace } from '../auth.js';
import {
  buatAcaraCalendar, kirimEmailUji, unggahKeDrive,
} from '../services/googleWorkspace.js';
import Ikon from '../components/Ikon.jsx';
import '../styles/google-workspace.css';

const jamLokal = (waktu) => {
  const lokal = new Date(waktu.getTime() - waktu.getTimezoneOffset() * 60000);
  return lokal.toISOString().slice(0, 16);
};

function ScopeCard({ ikon, judul, cakupan, children }) {
  return (
    <section className="ale-kartu workspace-card">
      <div className="workspace-card-heading">
        <span><Ikon nama={ikon} /></span>
        <div><h2>{judul}</h2><small>{cakupan}</small></div>
      </div>
      {children}
    </section>
  );
}

export default function GoogleWorkspacePage() {
  const { user } = useAuth();
  const [koneksi, setKoneksi] = useState(null);
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [waktuMulai, setWaktuMulai] = useState(() => jamLokal(new Date(Date.now() + 3600000)));
  const [waktuSelesai, setWaktuSelesai] = useState(() => jamLokal(new Date(Date.now() + 7200000)));
  const [fileName, setFileName] = useState('');

  const tokenAktif = koneksi && koneksi.expiresAt > Date.now() ? koneksi.accessToken : '';

  async function hubungkan() {
    setBusy('connect');
    setError('');
    setStatus('');
    try {
      const sesi = await hubungkanGoogleWorkspace();
      setKoneksi(sesi);
      setStatus(`Layanan Google terhubung untuk ${sesi.email}. Izin berlaku sementara di sesi ini.`);
    } catch (err) {
      console.error('[workspace] Gagal menghubungkan akun Google:', err);
      setError(err?.message || 'Akun Google Workspace tidak dapat dihubungkan.');
    } finally {
      setBusy('');
    }
  }

  async function unggah(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const berkas = formElement.elements.berkas.files?.[0];
    if (!tokenAktif) {
      setError('Hubungkan kembali Google Workspace untuk melanjutkan.');
      return;
    }
    setBusy('drive');
    setError('');
    setStatus('');
    try {
      const hasil = await unggahKeDrive(tokenAktif, berkas);
      setFileName(hasil.name || berkas.name);
      setStatus(`Berkas berhasil dibuat di Google Drive: ${hasil.name || berkas.name}.`);
      formElement.reset();
    } catch (err) {
      console.error('[workspace] Gagal mengunggah ke Drive:', err);
      setError(err?.message || 'Berkas tidak dapat diunggah ke Drive.');
    } finally {
      setBusy('');
    }
  }

  async function buatAcara(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!tokenAktif) {
      setError('Hubungkan kembali Google Workspace untuk melanjutkan.');
      return;
    }
    const form = new FormData(event.currentTarget);
    setBusy('calendar');
    setError('');
    setStatus('');
    try {
      await buatAcaraCalendar(tokenAktif, {
        judul: String(form.get('judul') || ''),
        deskripsi: String(form.get('deskripsi') || ''),
        mulai: waktuMulai,
        selesai: waktuSelesai,
      });
      setStatus('Acara berhasil dibuat di Google Calendar.');
      formElement.reset();
    } catch (err) {
      console.error('[workspace] Gagal membuat acara Calendar:', err);
      setError(err?.message || 'Acara tidak dapat dibuat di Calendar.');
    } finally {
      setBusy('');
    }
  }

  async function kirimEmail() {
    if (!tokenAktif) {
      setError('Hubungkan kembali Google Workspace untuk melanjutkan.');
      return;
    }
    setBusy('gmail');
    setError('');
    setStatus('');
    try {
      await kirimEmailUji(tokenAktif, user?.email);
      setStatus(`Email uji berhasil dikirim ke ${user.email}.`);
    } catch (err) {
      console.error('[workspace] Gagal mengirim email uji:', err);
      setError(err?.message || 'Email tidak dapat dikirim melalui Gmail.');
    } finally {
      setBusy('');
    }
  }

  return (
    <main className="workspace-page">
      <header className="workspace-header">
        <p className="workspace-kicker"><Ikon nama="external" /> Integrasi akun pribadi</p>
        <h1>Google Workspace</h1>
        <p>Hubungkan akun Google milik Anda sendiri untuk menggunakan Drive, Calendar, dan Gmail.</p>
        <button className="workspace-connect" type="button" onClick={hubungkan} disabled={!!busy}>
          <Ikon nama="external" />
          {busy === 'connect' ? 'Meminta izin Google…' : tokenAktif ? 'Perbarui izin Google' : 'Hubungkan akun Google'}
        </button>
        {koneksi && <p className="workspace-account">Akun terhubung: <strong>{koneksi.email}</strong></p>}
      </header>

      {error && <p className="workspace-message is-error" role="alert">{error}</p>}
      {status && <p className="workspace-message is-success" role="status">{status}</p>}

      <div className="workspace-grid">
        <ScopeCard ikon="file" judul="Google Drive" cakupan="Buat berkas yang Anda pilih (drive.file)">
          <form className="workspace-form" onSubmit={unggah}>
            <label htmlFor="workspace-file">Pilih berkas, maksimal 10 MB</label>
            <input id="workspace-file" name="berkas" type="file" required disabled={!tokenAktif || !!busy} />
            <button type="submit" disabled={!tokenAktif || !!busy}>
              {busy === 'drive' ? 'Mengunggah…' : 'Unggah ke Drive'}
            </button>
          </form>
          {fileName && <small className="workspace-detail">Terakhir dibuat dari aplikasi: {fileName}</small>}
        </ScopeCard>

        <ScopeCard ikon="calendar" judul="Google Calendar" cakupan="Buat acara di kalender milik Anda (calendar.events.owned)">
          <form className="workspace-form" onSubmit={buatAcara}>
            <label htmlFor="workspace-event-title">Judul acara</label>
            <input id="workspace-event-title" name="judul" type="text" maxLength="120" required disabled={!tokenAktif || !!busy} />
            <label htmlFor="workspace-event-start">Mulai</label>
            <input id="workspace-event-start" type="datetime-local" value={waktuMulai} onChange={(event) => setWaktuMulai(event.target.value)} required disabled={!tokenAktif || !!busy} />
            <label htmlFor="workspace-event-end">Selesai</label>
            <input id="workspace-event-end" type="datetime-local" value={waktuSelesai} onChange={(event) => setWaktuSelesai(event.target.value)} required disabled={!tokenAktif || !!busy} />
            <label htmlFor="workspace-event-description">Catatan (opsional)</label>
            <textarea id="workspace-event-description" name="deskripsi" maxLength="2000" rows="3" disabled={!tokenAktif || !!busy} />
            <button type="submit" disabled={!tokenAktif || !!busy}>
              {busy === 'calendar' ? 'Membuat acara…' : 'Buat acara'}
            </button>
          </form>
        </ScopeCard>

        <ScopeCard ikon="chat" judul="Gmail" cakupan="Kirim email saja; akses inbox tidak diminta (gmail.send)">
          <p className="workspace-description">Email uji hanya dikirim ke alamat akun Anda: <strong>{user?.email || 'email akun tidak tersedia'}</strong>.</p>
          <button type="button" onClick={kirimEmail} disabled={!tokenAktif || !!busy || !user?.email}>
            {busy === 'gmail' ? 'Mengirim email…' : 'Kirim email uji ke diri sendiri'}
          </button>
        </ScopeCard>
      </div>

      <aside className="workspace-privacy">
        <Ikon nama="badge" />
        <p>
          Aplikasi meminta izin Drive untuk membuat berkas aplikasi dan menyimpan salinan lampiran chat atau foto profil milik Anda,
          Calendar untuk membuat acara di kalender milik Anda, dan Gmail hanya untuk mengirim email. Salinan lampiran chat bersifat opsional
          dan hanya dibuat saat Anda memilihnya. Token akses disimpan sementara di memori halaman, bukan di Firestore atau penyimpanan browser;
          izin dapat dicabut dari pengaturan Akun Google.
        </p>
      </aside>
    </main>
  );
}
