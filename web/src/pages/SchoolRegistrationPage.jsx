import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { ajukanSekolah, daftarPermohonanSekolah } from '../services/schoolRegistration.js';
import '../styles/platform-tenants.css';

const FORM_DEFAULT = {
  npsn: '',
  name: '',
  educationLevel: '',
  province: '',
  city: '',
  address: '',
};

export default function SchoolRegistrationPage() {
  const { user, role } = useAuth();
  const [form, setForm] = useState(FORM_DEFAULT);
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    try {
      setRequests(await daftarPermohonanSekolah(user?.uid));
    } catch (loadError) {
      console.error('[school-registration] Gagal memuat permohonan:', loadError);
      setError('Riwayat permohonan tidak dapat dimuat.');
    }
  }

  useEffect(() => { void load(); }, [user?.uid]);

  async function submit(event) {
    event.preventDefault();
    if (role !== 'unprovisioned' || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await ajukanSekolah(form);
      setForm(FORM_DEFAULT);
      setNotice('Permohonan diterima dan menunggu pemeriksaan data kementerian oleh superadmin. Tenant belum dibuat dan akses sekolah belum diberikan.');
      await load();
    } catch (submitError) {
      console.error('[school-registration] Gagal mengajukan sekolah:', submitError);
      setError(submitError.code === '23505'
        ? 'NPSN ini sudah terdaftar atau sedang menunggu persetujuan.'
        : submitError.message || 'Permohonan sekolah tidak dapat dikirim.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="platform-tenants">
      <header className="platform-tenants-heading">
        <p className="platform-tenants-kicker">Pendaftaran tenant sekolah</p>
        <h1>Hubungkan akun ke sekolah</h1>
        <p>Nama dari formulir ini hanya menjadi data pengajuan. Tenant baru aktif setelah superadmin mencocokkan NPSN dan data resmi kementerian; akun ini tetap tanpa akses sekolah selama menunggu.</p>
      </header>
      {error && <p className="platform-tenants-error" role="alert">{error}</p>}
      {notice && <p className="platform-ops-note" role="status">{notice}</p>}
      {role === 'unprovisioned' && (
        <form className="platform-tenants-card school-registration-form" onSubmit={submit}>
          <h2>Data sekolah untuk pemeriksaan</h2>
          <label>NPSN (8 digit)
            <input required inputMode="numeric" pattern="[0-9]{8}" maxLength={8} value={form.npsn} onChange={(event) => setForm({ ...form, npsn: event.target.value.replace(/\D/g, '') })} />
          </label>
          <label>Nama sekolah yang diajukan
            <input required maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label>Jenjang pendidikan
            <input required maxLength={40} value={form.educationLevel} onChange={(event) => setForm({ ...form, educationLevel: event.target.value })} />
          </label>
          <label>Provinsi
            <input required maxLength={80} value={form.province} onChange={(event) => setForm({ ...form, province: event.target.value })} />
          </label>
          <label>Kabupaten / kota
            <input required maxLength={100} value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
          </label>
          <label>Alamat sekolah
            <input required maxLength={240} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
          </label>
          <button className="platform-tenants-button" type="submit" disabled={busy}>{busy ? 'Mengirim…' : 'Kirim untuk persetujuan'}</button>
        </form>
      )}
      <section className="platform-tenants-card">
        <h2>Riwayat permohonan</h2>
        {!requests.length && <p>Belum ada permohonan sekolah.</p>}
        {requests.map((request) => (
          <article className="school-registration-request" key={request.id}>
            <strong>{request.verified_name || request.submitted_name}</strong>
            <span>NPSN {request.npsn} · {request.city}, {request.province}</span>
            <span>Status: {request.status === 'pending' ? 'Menunggu persetujuan superadmin' : request.status === 'approved' ? 'Disetujui' : 'Ditolak'}</span>
            {request.status === 'approved' && <span>Akun sekolah sudah diprovisikan. Keluar lalu masuk kembali untuk menyegarkan akses.</span>}
          </article>
        ))}
      </section>
    </main>
  );
}
