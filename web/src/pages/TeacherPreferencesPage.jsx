import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { isTeacherRole } from '../services/roleAccess.js';
import {
  bacaPreferensiGuru,
  preferensiGuruDefault,
  simpanPreferensiGuru,
} from '../services/teacherPreferences.js';
import '../styles/teacher-preferences.css';

export default function TeacherPreferencesPage() {
  const { user, role, activeRole } = useAuth();
  const currentRole = activeRole || role;
  const [preferences, setPreferences] = useState(preferensiGuruDefault);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    try {
      if (!isTeacherRole(currentRole)) {
        throw new Error('Preferensi ini hanya tersedia untuk akun guru.');
      }
      setPreferences(bacaPreferensiGuru(user?.uid, currentRole));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Preferensi gagal dimuat.');
    } finally {
      setLoading(false);
    }
  }, [currentRole, user?.uid]);

  function update(field, value) {
    setPreferences((current) => ({ ...current, [field]: value }));
    setNotice('');
  }

  function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (!isTeacherRole(currentRole)) {
        throw new Error('Preferensi ini hanya tersedia untuk akun guru.');
      }
      const saved = simpanPreferensiGuru(user?.uid, currentRole, preferences);
      setPreferences(saved);
      setNotice('Preferensi tersimpan pada browser dan akun ini.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Preferensi gagal disimpan.');
    } finally {
      setSaving(false);
    }
  }

  if (!isTeacherRole(currentRole)) {
    return <section className="ale-teacher-preferences" role="alert">
      Preferensi ini hanya tersedia untuk akun guru.
    </section>;
  }

  return (
    <section className="ale-teacher-preferences" aria-labelledby="teacher-preferences-title">
      <header>
        <p className="ale-submenu-kicker">Pengaturan akun</p>
        <h2 id="teacher-preferences-title">Preferensi tampilan</h2>
        <p>Pengaturan ini disimpan di browser pada perangkat ini, terpisah untuk akun dan peran aktif.</p>
      </header>
      <form onSubmit={save}>
        <fieldset disabled={loading || saving || !user?.uid}>
          <legend>Kenyamanan membaca</legend>
          <label>
            Ukuran teks aplikasi
            <select value={preferences.textSize} onChange={(event) => update('textSize', event.target.value)}>
              <option value="normal">Normal</option>
              <option value="large">Besar</option>
            </select>
          </label>
          <label className="ale-teacher-preferences-check">
            <input
              type="checkbox"
              checked={preferences.motion === 'reduced'}
              onChange={(event) => update('motion', event.target.checked ? 'reduced' : 'system')}
            />
            Kurangi animasi dan gerakan
          </label>
        </fieldset>
        {loading && <p role="status">Memuat preferensi…</p>}
        {!user?.uid && <p className="is-error" role="alert">Sesi akun tidak tersedia. Masuk kembali untuk mengelola preferensi.</p>}
        {error && <p className="is-error" role="alert">{error}</p>}
        {notice && <p className="is-success" role="status">{notice}</p>}
        <button type="submit" disabled={loading || saving || !user?.uid}>
          {saving ? 'Menyimpan…' : 'Simpan preferensi'}
        </button>
      </form>
      <p className="ale-teacher-preferences-note">
        Preferensi lokal tidak disinkronkan ke perangkat lain dan tidak mengubah hak akses, data sekolah, atau pengaturan notifikasi.
      </p>
    </section>
  );
}
