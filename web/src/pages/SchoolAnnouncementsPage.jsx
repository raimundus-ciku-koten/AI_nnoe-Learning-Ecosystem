import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  buatPengumumanSekolah,
  hapusPengumumanSekolah,
  muatPengumumanSekolah,
  ubahPengumumanSekolah,
} from '../services/schoolAnnouncements.js';
import '../styles/online-assessments.css';

const EDITOR_ROLES = new Set(['admin_sekolah', 'operator']);

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Waktu tidak tersedia'
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function SchoolAnnouncementsPage() {
  const { pathname } = useLocation();
  const { user, role, tenantId } = useAuth();
  const canManage = EDITOR_ROLES.has(role);
  const [announcements, setAnnouncements] = useState([]);
  const [draft, setDraft] = useState({ title: '', body: '' });
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    setAnnouncements(await muatPengumumanSekolah(tenantId));
  }, [tenantId]);

  useEffect(() => {
    let active = true;
    if (!tenantId) {
      setError('Akun belum terhubung ke sekolah yang aktif.');
      setLoading(false);
      return undefined;
    }
    muatPengumumanSekolah(tenantId)
      .then((rows) => { if (active) setAnnouncements(rows); })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Pengumuman sekolah gagal dimuat.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tenantId]);

  const resetDraft = () => {
    setDraft({ title: '', body: '' });
    setEditingId('');
  };

  const save = async (event) => {
    event.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (editingId) {
        await ubahPengumumanSekolah(tenantId, editingId, draft);
        setNotice('Pengumuman diperbarui.');
      } else {
        await buatPengumumanSekolah(tenantId, user?.uid, draft);
        setNotice('Pengumuman diterbitkan.');
      }
      resetDraft();
      await refresh();
    } catch (saveError) {
      setError(saveError.message || 'Pengumuman tidak dapat disimpan.');
    } finally {
      setSaving(false);
    }
  };

  const edit = (announcement) => {
    setEditingId(announcement.id);
    setDraft({ title: announcement.title, body: announcement.body });
    setError('');
    setNotice('');
  };

  const remove = async (announcement) => {
    if (!canManage ||
        !globalThis.confirm(`Hapus pengumuman "${announcement.title}" untuk sekolah ini?`)) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await hapusPengumumanSekolah(tenantId, announcement.id);
      if (editingId === announcement.id) resetDraft();
      setNotice('Pengumuman dihapus.');
      await refresh();
    } catch (deleteError) {
      setError(deleteError.message || 'Pengumuman tidak dapat dihapus.');
    } finally {
      setSaving(false);
    }
  };

  const title = pathname === '/admin/komunikasi/pengumuman'
    ? 'Kanal Pengumuman Sekolah'
    : 'Pengumuman Sekolah';

  if (!tenantId) {
    return (
      <section className="ale-exam-card" role="alert">
        <h2>{title}</h2>
        <p>Akun belum terhubung ke sekolah yang aktif.</p>
      </section>
    );
  }

  return (
    <section className="ale-exam-card" aria-labelledby="school-announcements-title">
      <p className="ale-exam-kicker">Komunikasi sekolah</p>
      <h2 id="school-announcements-title">{title}</h2>
      <p className="ale-exam-intro">
        Pengumuman hanya dapat dibaca anggota aktif sekolah pada tenant yang sama.
        Jangan memasukkan informasi kesehatan, konseling, atau data pribadi siswa.
      </p>
      {error && <p className="ale-exam-error" role="alert">{error}</p>}
      {notice && <p className="ale-exam-notice" role="status">{notice}</p>}
      {canManage && (
        <form className="ale-exam-form" onSubmit={save}>
          <label>Judul
            <input
              required
              maxLength={200}
              value={draft.title}
              onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))}
            />
          </label>
          <label>Isi pengumuman
            <textarea
              required
              maxLength={5000}
              rows={5}
              value={draft.body}
              onChange={(event) => setDraft((value) => ({ ...value, body: event.target.value }))}
            />
          </label>
          <div>
            <button className="ale-exam-primary" type="submit" disabled={saving || loading}>
              {saving ? 'Menyimpan…' : editingId ? 'Simpan perubahan' : 'Terbitkan pengumuman'}
            </button>
            {editingId && (
              <button type="button" disabled={saving} onClick={resetDraft}>Batal</button>
            )}
          </div>
        </form>
      )}
      {loading && <p role="status">Memuat pengumuman…</p>}
      {!loading && !error && announcements.length === 0 && (
        <p>Belum ada pengumuman sekolah.</p>
      )}
      {!loading && !error && announcements.length > 0 && (
        <ul className="ale-exam-list">
          {announcements.map((announcement) => (
            <li key={announcement.id}>
              <div>
                <strong>{announcement.title}</strong>
                <span>{formatDate(announcement.createdAt)}</span>
                <p>{announcement.body}</p>
              </div>
              {canManage && (
                <div>
                  <button type="button" disabled={saving} onClick={() => edit(announcement)}>
                    Ubah
                  </button>
                  <button type="button" disabled={saving} onClick={() => remove(announcement)}>
                    Hapus
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
