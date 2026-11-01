import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.ts';
import '../styles/privileged-mfa.css';

const ROLES_WITH_REQUIRED_MFA = new Set(['admin_sekolah', 'superadmin']);

export function resolveMfaFactors(factors = []) {
  const verified = factors.find((factor) => factor.status === 'verified');
  if (verified) {
    return { factorId: verified.id, needsEnrollment: false, canReplaceFactor: false };
  }
  const pending = factors.find((factor) => factor.status === 'unverified');
  if (pending) {
    return { factorId: pending.id, needsEnrollment: false, canReplaceFactor: true };
  }
  return { factorId: '', needsEnrollment: true, canReplaceFactor: false };
}

export default function PrivilegedMfaGate({ role, userId, children }) {
  const [state, setState] = useState({
    loading: true, access: false, factorId: '', qrCode: '', secret: '',
    needsEnrollment: false, canReplaceFactor: false,
  });
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const requiresMfa = ROLES_WITH_REQUIRED_MFA.has(role);

  const load = useCallback(async () => {
    if (!requiresMfa || !userId) {
      setState({
        loading: false, access: true, factorId: '', qrCode: '', secret: '',
        needsEnrollment: false, canReplaceFactor: false,
      });
      return;
    }

    setState({
      loading: true, access: false, factorId: '', qrCode: '', secret: '',
      needsEnrollment: false, canReplaceFactor: false,
    });
    setError('');
    setCode('');
    try {
      const { data: assurance, error: assuranceError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;
      if (assurance.currentLevel === 'aal2') {
        setState({ loading: false, access: true, factorId: '', qrCode: '', secret: '' });
        return;
      }

      const { data: listed, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      const factorState = resolveMfaFactors(listed.totp);
      setState({
        loading: false,
        access: false,
        ...factorState,
        qrCode: '',
        secret: '',
      });
    } catch (cause) {
      console.error('[auth-mfa] Gagal menyiapkan MFA administrator:', cause);
      setState({
        loading: false, access: false, factorId: '', qrCode: '', secret: '',
        needsEnrollment: false, canReplaceFactor: false,
      });
      setError('Status MFA tidak dapat diverifikasi. Akses administrator dikunci sampai faktor autentikasi berhasil diperiksa.');
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

  async function enroll() {
    setBusy(true);
    setError('');
    try {
      const { data: enrollment, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'AI_nnoe administrator',
      });
      if (enrollError) throw enrollError;
      setState({
        loading: false,
        access: false,
        factorId: enrollment.id,
        qrCode: enrollment.totp.qr_code,
        secret: enrollment.totp.secret,
        needsEnrollment: false,
        canReplaceFactor: true,
      });
    } catch (cause) {
      console.error('[auth-mfa] Pendaftaran MFA gagal:', cause);
      setError('Faktor autentikator tidak dapat didaftarkan. Periksa koneksi lalu coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  async function replacePendingFactor() {
    if (!state.canReplaceFactor || !state.factorId) return;
    if (!window.confirm('Hapus faktor autentikator yang belum diverifikasi ini? Anda perlu mendaftarkan faktor baru.')) return;
    setBusy(true);
    setError('');
    try {
      const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: state.factorId });
      if (removeError) throw removeError;
      setState({
        loading: false,
        access: false,
        factorId: '',
        qrCode: '',
        secret: '',
        needsEnrollment: true,
        canReplaceFactor: false,
      });
      setCode('');
    } catch (cause) {
      console.error('[auth-mfa] Penggantian faktor MFA gagal:', cause);
      setError('Faktor autentikator belum dapat diganti. Faktor lama tetap dipertahankan.');
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
        ) : state.needsEnrollment ? (
          <>
            <p>Daftarkan aplikasi autentikator untuk melindungi akses administrator.</p>
            <button type="button" onClick={() => void enroll()} disabled={busy}>
              Daftarkan aplikasi autentikator
            </button>
          </>
        ) : state.qrCode ? (
          <>
            <p>Pindai QR ini dengan aplikasi autentikator. Simpan kode rahasia di tempat aman dan jangan bagikan.</p>
            <img
              className="privileged-mfa-qr"
              src={`data:image/svg+xml;utf-8,${encodeURIComponent(state.qrCode)}`}
              alt="QR untuk mendaftarkan autentikator"
            />
            <details>
              <summary>Tidak dapat memindai QR?</summary>
              <p>Tambahkan kode rahasia ini secara manual di aplikasi autentikator.</p>
              <code>{state.secret}</code>
            </details>
          </>
        ) : (
          <p>Masukkan kode dari aplikasi autentikator yang telah didaftarkan.</p>
        )}
        {error && <p className="privileged-mfa-error" role="alert">{error}</p>}
        {!state.loading && state.factorId && (
          <>
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
                {busy ? 'Memverifikasi…' : state.qrCode ? 'Aktifkan dan verifikasi MFA' : 'Verifikasi'}
              </button>
            </form>
            {state.canReplaceFactor && !state.qrCode && (
              <button type="button" className="is-secondary" onClick={() => void replacePendingFactor()} disabled={busy}>
                Ganti faktor yang belum diverifikasi
              </button>
            )}
          </>
        )}
        {!state.loading && !state.factorId && !state.needsEnrollment && (
          <button type="button" onClick={() => void load()}>Periksa ulang MFA</button>
        )}
        <p className="privileged-mfa-note">Akses admin dan superadmin dikunci sampai verifikasi berhasil.</p>
      </section>
    </main>
  );
}
