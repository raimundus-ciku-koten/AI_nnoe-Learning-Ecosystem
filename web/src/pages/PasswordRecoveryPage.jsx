import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.ts';
import '../styles/login.css';

export default function PasswordRecoveryPage() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function simpanKataSandi(event) {
    event.preventDefault();
    if (saving) return;
    if (password.length < 8) {
      setError('Kata sandi harus terdiri dari minimal 8 karakter.');
      return;
    }
    if (password !== confirmation) {
      setError('Konfirmasi kata sandi tidak sama.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setSaved(true);
    } catch (cause) {
      console.error('[auth] Gagal memperbarui kata sandi Supabase:', cause);
      setError(cause?.message || 'Kata sandi tidak dapat diperbarui. Minta tautan pemulihan baru.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="public-login">
      <section className="hero">
        <div className="container hero-grid">
          <section className="card login-card" aria-labelledby="judul-reset-sandi">
            <div className="card-head">
              <h1 id="judul-reset-sandi">Buat kata sandi baru</h1>
              <p>Gunakan kata sandi baru untuk akun AI_nnoe Learning Ecosystem Anda.</p>
            </div>
            {saved ? (
              <div role="status">
                <p>Kata sandi berhasil diperbarui.</p>
                <Link className="btn btn-primary" to="/dashboard">Lanjutkan ke aplikasi</Link>
              </div>
            ) : (
              <form onSubmit={simpanKataSandi}>
                <div className="field">
                  <label htmlFor="password-baru">Kata sandi baru</label>
                  <input
                    className="input"
                    id="password-baru"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={password}
                    disabled={saving}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="konfirmasi-password-baru">Ulangi kata sandi baru</label>
                  <input
                    className="input"
                    id="konfirmasi-password-baru"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={confirmation}
                    disabled={saving}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                </div>
                {error && <p role="alert">{error}</p>}
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Menyimpan…' : 'Simpan kata sandi baru'}
                </button>
              </form>
            )}
            <p><Link to="/login">Kembali ke halaman masuk</Link></p>
          </section>
        </div>
      </section>
    </main>
  );
}
