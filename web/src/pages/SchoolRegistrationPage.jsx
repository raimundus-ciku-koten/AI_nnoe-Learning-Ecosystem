import React, { useEffect, useState } from 'react';
import { daftarSekolah, logout } from '../auth.js';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.ts';
import { pasangTurnstile } from '../services/turnstile.js';
import '../styles/school-registration.css';

const TURNSTILE_SITE_KEY = import.meta.env?.VITE_TURNSTILE_SITE_KEY?.trim() || '';
const SCHOOL_SIGNUP_ENABLED = import.meta.env?.VITE_PUBLIC_SCHOOL_SIGNUP_ENABLED?.trim().toLowerCase() === 'true'
  && Boolean(TURNSTILE_SITE_KEY);

export default function SchoolRegistrationPage() {
  const { user } = useAuth();
  const [fullName, setFullName] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [schoolName, setSchoolName] = useState(user?.user_metadata?.school_name || '');
  const [npsn, setNpsn] = useState(user?.user_metadata?.school_npsn || '');
  const [password, setPassword] = useState('');
  const [confirmedPassword, setConfirmedPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [requestConsent, setRequestConsent] = useState(false);
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(Boolean(user));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [captcha, setCaptcha] = useState(null);
  const [captchaError, setCaptchaError] = useState('');

  useEffect(() => {
    let live = true;
    let widget;

    if (user) {
      setEmail(user.email || '');
      setFullName(user.displayName || '');
      Promise.all([
        supabase.auth.getUser(),
        supabase
          .from('school_registration_requests')
          .select('id,email,school_name,npsn,status,review_notes,submitted_at,reviewed_at')
          .eq('user_id', user.uid)
          .maybeSingle(),
      ]).then(([authResult, requestResult]) => {
        if (!live) return;
        if (authResult.error) throw authResult.error;
        const metadata = authResult.data?.user?.user_metadata || {};
        setSchoolName(metadata.school_name || '');
        setNpsn(metadata.school_npsn || '');
        if (requestResult.error) {
          console.error('[school-registration] Gagal memuat status permohonan:', requestResult.error);
          setError('Status permohonan belum dapat dimuat. Pastikan migrasi pendaftaran sekolah sudah diterapkan pada lingkungan ini.');
        } else if (requestResult.data) {
          setRequest(requestResult.data);
          setSchoolName(requestResult.data.school_name);
          setNpsn(requestResult.data.npsn);
        }
      }).catch((loadError) => {
        console.error('[school-registration] Gagal memuat data pendaftaran:', loadError);
        if (live) setError('Data pendaftaran belum dapat dimuat. Muat ulang halaman untuk mencoba kembali.');
      }).finally(() => {
        if (live) setLoading(false);
      });
    } else if (SCHOOL_SIGNUP_ENABLED) {
      pasangTurnstile(document.getElementById('schoolSignupCaptcha'), TURNSTILE_SITE_KEY)
        .then((mounted) => {
          if (live) {
            widget = mounted;
            setCaptcha(mounted);
          }
          else mounted.remove();
        })
        .catch((setupError) => {
          console.error('[school-registration] Turnstile gagal disiapkan:', setupError);
          if (live) setCaptchaError('Verifikasi keamanan tidak dapat dimuat. Muat ulang halaman atau coba lagi nanti.');
        });
    }

    return () => {
      live = false;
      widget?.remove();
    };
  }, [user]);

  const kirimPermohonan = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    const namaSekolah = schoolName.trim();
    const nomorNpsn = npsn.trim();
    if (namaSekolah.length < 2 || namaSekolah.length > 160) {
      setError('Nama sekolah harus terdiri dari 2–160 karakter.');
      return;
    }
    if (!/^\d{8}$/.test(nomorNpsn)) {
      setError('NPSN harus terdiri dari tepat 8 angka.');
      return;
    }
    if (!requestConsent) {
      setError('Persetujuan pemrosesan data pendaftaran wajib diberikan sebelum permohonan dikirim.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('submit_school_registration_request', {
        p_school_name: namaSekolah,
        p_npsn: nomorNpsn,
        p_accepted_terms: true,
      });
      if (rpcError) throw rpcError;
      setRequest({
        id: data.id,
        email: user.email,
        school_name: data.school_name,
        npsn: nomorNpsn,
        status: data.status,
        submitted_at: data.submitted_at,
      });
      setNotice('Permohonan terkirim dan menunggu pemeriksaan admin platform.');
    } catch (submitError) {
      console.error('[school-registration] Pengajuan gagal:', submitError);
      setError(submitError?.message?.includes('duplicate key')
        ? 'Akun ini sudah mengirim permohonan atau NPSN tersebut telah terdaftar.'
        : 'Permohonan belum dapat dikirim. Pastikan email sudah diverifikasi dan coba kembali.');
    } finally {
      setSubmitting(false);
    }
  };

  const daftarAkun = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!SCHOOL_SIGNUP_ENABLED) {
      setError('Pendaftaran sekolah belum dibuka pada lingkungan ini.');
      return;
    }
    if (fullName.trim().length < 2 || fullName.trim().length > 120) {
      setError('Nama pemohon harus terdiri dari 2–120 karakter.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Masukkan alamat email yang valid.');
      return;
    }
    if (schoolName.trim().length < 2 || schoolName.trim().length > 160) {
      setError('Nama sekolah harus terdiri dari 2–160 karakter.');
      return;
    }
    if (!/^\d{8}$/.test(npsn.trim())) {
      setError('NPSN harus terdiri dari tepat 8 angka.');
      return;
    }
    if (password.length < 12 || password.length > 72) {
      setError('Kata sandi harus terdiri dari 12–72 karakter.');
      return;
    }
    if (password !== confirmedPassword) {
      setError('Konfirmasi kata sandi belum sama.');
      return;
    }
    if (!consent) {
      setError('Persetujuan penggunaan data pendaftaran wajib diberikan.');
      return;
    }
    let captchaToken;
    try {
      captchaToken = captcha?.token();
    } catch (tokenError) {
      console.error('[school-registration] Token Turnstile tidak tersedia:', tokenError);
    }
    if (!captchaToken) {
      setError(captchaError || 'Selesaikan verifikasi keamanan sebelum mendaftar.');
      return;
    }

    setSubmitting(true);
    try {
      await daftarSekolah({
        nama: fullName.trim(),
        email: email.trim().toLowerCase(),
        sandi: password,
        namaSekolah: schoolName.trim(),
        npsn: npsn.trim(),
        captchaToken,
      });
      setPassword('');
      setConfirmedPassword('');
      setNotice('Jika pendaftaran memenuhi syarat, tautan verifikasi telah dikirim. Setelah verifikasi, masuk kembali untuk mengirim permohonan pemeriksaan sekolah.');
      captcha?.reset();
    } catch (signupError) {
      console.error('[school-registration] Pendaftaran akun gagal:', signupError);
      const alreadyRegistered = signupError?.code === 'user_already_exists'
        || /already registered|already been registered/i.test(signupError?.message || '');
      setError(alreadyRegistered
        ? 'Jika akun dengan alamat tersebut sudah ada, silakan masuk menggunakan akun itu.'
        : 'Pendaftaran belum dapat diproses. Periksa data lalu coba kembali.');
      captcha?.reset();
    } finally {
      setSubmitting(false);
    }
  };

  const keluar = async () => {
    try {
      await logout();
    } catch (logoutError) {
      console.error('[school-registration] Gagal keluar:', logoutError);
      setError('Belum dapat keluar. Muat ulang halaman lalu coba kembali.');
    }
  };
  return (
    <main className="school-registration">
      <section className="school-registration-card" aria-labelledby="school-registration-title">
        <a className="school-registration-brand" href="#/login">AI_nnoe Learning Ecosystem</a>
        {user ? (
          <>
            <p className="school-registration-kicker">Pendaftaran institusi</p>
            <h1 id="school-registration-title">Permohonan akses sekolah</h1>
            <p className="school-registration-intro">
              Akun Anda belum memiliki akses ke data sekolah. Permohonan hanya dapat dikirim setelah email diverifikasi dan akan ditinjau admin platform.
            </p>
            {loading ? <p role="status">Memeriksa status permohonan…</p> : request ? (
              <section className={`school-registration-status is-${request.status}`} aria-live="polite">
                <h2>{request.status === 'pending' ? 'Menunggu pemeriksaan' : request.status === 'approved' ? 'Permohonan disetujui' : 'Permohonan ditolak'}</h2>
                <p><strong>Sekolah:</strong> {request.school_name}</p>
                <p><strong>NPSN:</strong> {request.npsn}</p>
                <p><strong>Status:</strong> {request.status}</p>
                {request.review_notes && <p><strong>Catatan admin:</strong> {request.review_notes}</p>}
                {request.status === 'approved' && <p>Silakan keluar lalu masuk kembali agar peran sekolah yang telah disetujui dimuat.</p>}
                {request.status === 'rejected' && <p>Perbaiki data sesuai catatan admin, lalu kirim ulang untuk pemeriksaan.</p>}
              </section>
            ) : (
              <form className="school-registration-form" onSubmit={kirimPermohonan}>
                <p className="school-registration-account">Akun terverifikasi: <strong>{user.email}</strong></p>
                <label>Nama sekolah
                  <input value={schoolName} onChange={(event) => setSchoolName(event.target.value)} minLength={2} maxLength={160} required />
                </label>
                <label>NPSN (8 angka)
                  <input value={npsn} onChange={(event) => setNpsn(event.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" pattern="[0-9]{8}" maxLength={8} required />
                </label>
                <label className="school-registration-consent">
                  <input type="checkbox" checked={requestConsent} onChange={(event) => setRequestConsent(event.target.checked)} required />
                  <span>Saya menyetujui pemrosesan data kontak dan identitas sekolah untuk meninjau permohonan ini.</span>
                </label>
                <p className="school-registration-note">Pengiriman permohonan tidak langsung membuat tenant atau membuka akses data. Tenant dan peran admin sekolah baru dibuat setelah persetujuan admin platform.</p>
                <button type="submit" disabled={submitting || loading}>{submitting ? 'Mengirim…' : 'Kirim untuk ditinjau'}</button>
              </form>
            )}
            {request?.status === 'rejected' && (
              <form className="school-registration-form" onSubmit={kirimPermohonan}>
                <label>Nama sekolah
                  <input value={schoolName} onChange={(event) => setSchoolName(event.target.value)} minLength={2} maxLength={160} required />
                </label>
                <label>NPSN (8 angka)
                  <input value={npsn} onChange={(event) => setNpsn(event.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" pattern="[0-9]{8}" maxLength={8} required />
                </label>
                <label className="school-registration-consent">
                  <input type="checkbox" checked={requestConsent} onChange={(event) => setRequestConsent(event.target.checked)} required />
                  <span>Saya menyetujui pemrosesan data kontak dan identitas sekolah untuk meninjau permohonan ini.</span>
                </label>
                <button type="submit" disabled={submitting}>{submitting ? 'Mengirim…' : 'Ajukan ulang permohonan'}</button>
              </form>
            )}
            <button className="school-registration-link" type="button" onClick={() => void keluar()}>Keluar</button>
          </>
        ) : (
          <>
            <p className="school-registration-kicker">Akun sekolah</p>
            <h1 id="school-registration-title">Daftarkan sekolah</h1>
            <p className="school-registration-intro">Buat akun pemohon, verifikasi email, lalu kirim permohonan. Akses sekolah tetap tertutup sampai admin platform menyetujui pendaftaran.</p>
            {!SCHOOL_SIGNUP_ENABLED ? (
              <p className="school-registration-error" role="status">Pendaftaran publik belum diaktifkan untuk lingkungan ini. Silakan masuk atau coba kembali setelah konfigurasi keamanan tersedia.</p>
            ) : (
              <form className="school-registration-form" onSubmit={daftarAkun}>
                <label>Nama pemohon
                  <input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" minLength={2} maxLength={120} required />
                </label>
                <label>Email
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" maxLength={254} required />
                </label>
                <label>Nama sekolah
                  <input value={schoolName} onChange={(event) => setSchoolName(event.target.value)} minLength={2} maxLength={160} required />
                </label>
                <label>NPSN (8 angka)
                  <input value={npsn} onChange={(event) => setNpsn(event.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" pattern="[0-9]{8}" maxLength={8} required />
                </label>
                <label>Kata sandi (12–72 karakter)
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={12} maxLength={72} required />
                </label>
                <label>Ulangi kata sandi
                  <input type="password" value={confirmedPassword} onChange={(event) => setConfirmedPassword(event.target.value)} autoComplete="new-password" minLength={12} maxLength={72} required />
                </label>
                <label className="school-registration-consent">
                  <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required />
                  <span>Saya berwenang mengajukan pendaftaran sekolah ini dan menyetujui pemrosesan data kontak serta identitas sekolah untuk verifikasi permohonan.</span>
                </label>
                <div id="schoolSignupCaptcha" className="school-registration-captcha" aria-label="Verifikasi keamanan Cloudflare" />
                {captchaError && <p className="school-registration-error" role="alert">{captchaError}</p>}
                <button type="submit" disabled={submitting || Boolean(captchaError)}>{submitting ? 'Mendaftar…' : 'Kirim tautan verifikasi'}</button>
              </form>
            )}
            <p className="school-registration-footer">Sudah memiliki akun? <a href="#/login">Masuk</a></p>
          </>
        )}
        {error && <p className="school-registration-error" role="alert">{error}</p>}
        {notice && <p className="school-registration-notice" role="status">{notice}</p>}
      </section>
    </main>
  );
}
