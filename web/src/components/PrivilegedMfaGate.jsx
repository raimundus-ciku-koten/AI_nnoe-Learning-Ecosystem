import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.ts';
import { inspectPrivilegedMfa, totpQrCodeImageSource } from '../services/privilegedMfa.js';
import '../styles/privileged-mfa.css';

const ROLES_WITH_REQUIRED_MFA = new Set(['admin_sekolah', 'superadmin']);

export default function PrivilegedMfaGate({ role, userId, children }) {
  const [state, setState] = useState({
    loading: true,
    access: false,
    factorId: '',
    enrollmentRequired: false,
    pendingEnrollment: false,
    qrCode: '',
    secret: '',
  });
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const requiresMfa = ROLES_WITH_REQUIRED_MFA.has(role);

  const load = useCallback(async () => {
    if (!requiresMfa || !userId) {
      setState({
        loading: false,
        access: true,
        factorId: '',
        enrollmentRequired: false,
        pendingEnrollment: false,
        qrCode: '',
        secret: '',
      });
      return;
    }

    setState({
      loading: true,
      access: false,
      factorId: '',
      enrollmentRequired: false,
      pendingEnrollment: false,
      qrCode: '',
      secret: '',
    });
    setError('');
    try {
      const status = await inspectPrivilegedMfa(supabase.auth.mfa);
      if (status.enrollmentRequired) {
        setState({
          loading: false,
          ...status,
          qrCode: '',
          secret: '',
        });
        return;
      }
      setState({
        loading: false, ...status, qrCode: '', secret: '',
      });
    } catch (cause) {
      console.error('[auth-mfa] Gagal menyiapkan MFA administrator:', cause);
      setState({
        loading: false,
        access: false,
        factorId: '',
        enrollmentRequired: false,
        pendingEnrollment: false,
        qrCode: '',
        secret: '',
      });
      const status = Number.isInteger(cause?.status) ? ` (HTTP ${cause.status})` : '';
      setError(`Status MFA tidak dapat diverifikasi${status}. Tidak ada perubahan MFA yang dilakukan. Akses administrator tetap terkunci.`);
    }
  }, [requiresMfa, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function verify(event) {
    event.preventDefault();
    if (!state.factorId || !/^\d{6,8}$/.test(code)) {
      setError('Masukkan kode autentikator yang terdiri dari 6–8 angka.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: state.factorId,
        code,
      });
      if (verifyError) throw verifyError;
      await load();
      setCode('');
    } catch (cause) {
      console.error('[auth-mfa] Verifikasi MFA gagal:', cause);
      setError('Kode autentikator tidak valid atau kedaluwarsa. Periksa waktu perangkat dan coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  async function createEnrollment() {
    const { data: enrollment, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'AI_nnoe administrator',
    });
    if (enrollError) throw enrollError;
    setState({
      loading: false,
      access: false,
      factorId: enrollment.id,
      enrollmentRequired: false,
      pendingEnrollment: true,
      qrCode: enrollment.totp.qr_code,
      secret: enrollment.totp.secret,
    });
  }

  function enrollmentErrorMessage(cause) {
    const status = Number.isInteger(cause?.status) ? ` (HTTP ${cause.status})` : '';
    return `Pendaftaran MFA gagal${status}. Status MFA tidak berubah; periksa konfigurasi Auth dan coba lagi.`;
  }

  async function enroll() {
    setBusy(true);
    setError('');
    try {
      await createEnrollment();
    } catch (cause) {
      console.error('[auth-mfa] Pendaftaran MFA administrator gagal:', cause);
      setError(enrollmentErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function restartEnrollment() {
    if (!window.confirm(
      'Hapus hanya pendaftaran TOTP yang masih tertunda ini dan buat QR baru? Faktor MFA terverifikasi tidak akan diubah.',
    )) return;

    setBusy(true);
    setError('');
    try {
      const { error: removeError } = await supabase.auth.mfa.unenroll({
        factorId: state.factorId,
      });
      if (removeError) throw removeError;
      setState({
        loading: false,
        access: false,
        factorId: '',
        enrollmentRequired: true,
        pendingEnrollment: false,
        qrCode: '',
        secret: '',
      });
      await createEnrollment();
    } catch (cause) {
      console.error('[auth-mfa] Pengulangan pendaftaran MFA gagal:', cause);
      setError(enrollmentErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!requiresMfa || state.access) return children;

  return (
    <main className="privileged-mfa" aria-labelledby="privileged-mfa-title">
      <section className="privileged-mfa-card">
        <p className="privileged-mfa-kicker">Perlindungan akun administrator</p>
        <h1 id="privileged-mfa-title">Verifikasi autentikasi dua faktor</h1>
        {state.loading ? (
          <p role="status">Memeriksa keamanan akun…</p>
        ) : state.qrCode ? (
          <>
            <p>Pindai QR ini dengan aplikasi autentikator. Simpan kode rahasia di tempat aman dan jangan bagikan.</p>
            <img
              className="privileged-mfa-qr"
              src={totpQrCodeImageSource(state.qrCode)}
              alt="QR untuk mendaftarkan autentikator"
            />
            <details>
              <summary>Tidak dapat memindai QR?</summary>
              <p>Tambahkan kode rahasia ini secara manual di aplikasi autentikator.</p>
              <code>{state.secret}</code>
            </details>
          </>
        ) : state.enrollmentRequired ? (
          <p>Authenticator belum terdaftar. Pendaftaran hanya dimulai setelah Anda memilih tombol di bawah.</p>
        ) : state.pendingEnrollment ? (
          <p>
            Pendaftaran authenticator sudah tertunda. Masukkan kode dari QR sebelumnya jika sudah dipindai,
            atau buat ulang QR jika QR sebelumnya tidak dapat diakses.
          </p>
        ) : (
          <p>Masukkan kode dari aplikasi autentikator yang telah didaftarkan.</p>
        )}
        {error && <p className="privileged-mfa-error" role="alert">{error}</p>}
        {!state.loading && state.factorId && (
          <form onSubmit={verify}>
            <label htmlFor="privileged-mfa-code">Kode autentikator</label>
            <input
              id="privileged-mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,8}"
              maxLength="8"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))}
              required
              disabled={busy}
            />
            <button type="submit" disabled={busy || code.length < 6}>
              {busy ? 'Memverifikasi…' : state.pendingEnrollment ? 'Aktifkan dan verifikasi MFA' : 'Verifikasi'}
            </button>
          </form>
        )}
        {!state.loading && state.enrollmentRequired && !state.factorId && (
          <button type="button" onClick={() => void enroll()} disabled={busy}>
            {busy ? 'Menyiapkan…' : 'Daftarkan authenticator'}
          </button>
        )}
        {!state.loading && state.pendingEnrollment && !state.qrCode && (
          <button type="button" onClick={() => void restartEnrollment()} disabled={busy}>
            {busy ? 'Menyiapkan…' : 'Buat ulang QR'}
          </button>
        )}
        {!state.loading && !state.factorId && !state.enrollmentRequired && (
          <button type="button" onClick={() => void load()}>Periksa ulang MFA</button>
        )}
        <p className="privileged-mfa-note">Akses admin dan superadmin dikunci sampai verifikasi berhasil.</p>
      </section>
    </main>
  );
}
