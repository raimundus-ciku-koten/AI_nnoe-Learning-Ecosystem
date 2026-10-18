import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.ts';
import '../styles/privileged-mfa.css';

const ROLES_WITH_REQUIRED_MFA = new Set(['admin_sekolah', 'superadmin']);

export default function PrivilegedMfaGate({ role, userId, children }) {
  const [state, setState] = useState({
    loading: true, access: false, factorId: '', qrCode: '', secret: '',
  });
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const requiresMfa = ROLES_WITH_REQUIRED_MFA.has(role);

  const load = useCallback(async () => {
    if (!requiresMfa || !userId) {
      setState({ loading: false, access: true, factorId: '', qrCode: '', secret: '' });
      return;
    }

    setState({ loading: true, access: false, factorId: '', qrCode: '', secret: '' });
    setError('');
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
      const verified = listed.totp.find((factor) => factor.status === 'verified');
      if (verified) {
        setState({ loading: false, access: false, factorId: verified.id, qrCode: '', secret: '' });
        return;
      }

      for (const factor of listed.totp) {
        const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (removeError) throw removeError;
      }
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
      });
    } catch (cause) {
      console.error('[auth-mfa] Gagal menyiapkan MFA administrator:', cause);
      setState({ loading: false, access: false, factorId: '', qrCode: '', secret: '' });
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
        )}
        {!state.loading && !state.factorId && (
          <button type="button" onClick={() => void load()}>Periksa ulang MFA</button>
        )}
        <p className="privileged-mfa-note">Akses admin dan superadmin dikunci sampai verifikasi berhasil.</p>
      </section>
    </main>
  );
}
