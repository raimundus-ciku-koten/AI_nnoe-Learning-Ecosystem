import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  buatPengumumanSekolah,
  daftarPengumumanSekolah,
  hapusPengumumanSekolah,
  perbaruiPengumumanSekolah,
} from '../services/schoolAnnouncements.js';
import '../styles/school-announcements.css';

const ROLES_PENGELOLA = new Set(['admin', 'admin_sekolah', 'operator']);

function formatTanggal(value) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function SchoolAnnouncementsPage() {
  const { user, role, activeRole, tenantId } = useAuth();
  const currentRole = activeRole || role;
  const canManage = ROLES_PENGELOLA.has(currentRole);
  const context = useMemo(() => ({
    userId: user?.uid,
    role,
    activeRole: currentRole,
    tenantId,
  }), [currentRole, role, tenantId, user?.uid]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ title: '', body: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await daftarPengumumanSekolah(context));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Pengumuman gagal dimuat.');
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setForm({ title: '', body: '' });
    setEditingId('');
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await perbaruiPengumumanSekolah(context, editingId, form);
      } else {
        await buatPengumumanSekolah(context, form);
      }
      resetForm();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Pengumuman gagal disimpan.');
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(item) {
    setEditingId(item.id);
    setForm({ title: item.title, body: item.body });
    document.getElementById('school-announcement-title')?.focus();
  }

  async function remove(item) {
    if (!window.confirm(`Hapus pengumuman "${item.title}"?`)) return;
    setError('');
    try {
      await hapusPengumumanSekolah(context, item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      if (editingId === item.id) resetForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Pengumuman gagal dihapus.');
    }
  }

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('id');
    return items.filter((item) => !needle ||
      `${item.title} ${item.body}`.toLocaleLowerCase('id').includes(needle));
  }, [items, search]);

  return (
    <main className="ale-announcements">
      <header className="ale-announcements-hero">
        <p className="ale-announcements-kicker">Manajemen komunikasi sekolah</p>
        <h1>Kanal Pengumuman</h1>
        <p>
          Sampaikan informasi resmi kepada pengguna aktif di tenant sekolah ini.
          Pengumuman yang diterbitkan langsung dapat dibaca oleh warga sekolah yang
          berhak mengakses kanal.
        </p>
      </header>

      <section className="ale-announcements-notice">
        <strong>Catatan distribusi</strong>
        <span>
          Kanal ini menyimpan dan menampilkan pengumuman di dalam aplikasi. Kanal ini
          tidak mengirim email, push notification, atau pesan broadcast otomatis.
        </span>
      </section>

      {error && (
        <div className="ale-announcements-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} disabled={loading}>Coba lagi</button>
        </div>
      )}

      <div className={`ale-announcements-layout${canManage ? '' : ' is-reader'}`}>
        {canManage && (
          <form className="ale-announcements-form" onSubmit={submit}>
            <h2>{editingId ? 'Ubah pengumuman' : 'Buat pengumuman'}</h2>
            <label htmlFor="school-announcement-title">Judul</label>
            <input
              id="school-announcement-title"
              required
              maxLength={200}
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Contoh: Perubahan jadwal kegiatan"
            />
            <label htmlFor="school-announcement-body">Isi pengumuman</label>
            <textarea
              id="school-announcement-body"
              required
              maxLength={5000}
              rows={9}
              value={form.body}
              onChange={(event) => setForm({ ...form, body: event.target.value })}
              placeholder="Tuliskan informasi yang perlu diketahui warga sekolah."
            />
            <div className="ale-announcements-form-meta">
              <small>{form.body.length}/5.000 karakter</small>
              <div>
                <button type="submit" disabled={saving}>
                  {saving ? 'Menyimpan...' : editingId ? 'Simpan perubahan' : 'Terbitkan'}
                </button>
                {editingId && (
                  <button type="button" className="secondary" onClick={resetForm}>Batal</button>
                )}
              </div>
            </div>
          </form>
        )}

        <section className="ale-announcements-list" aria-labelledby="announcements-list-heading">
          <div className="ale-announcements-list-heading">
            <div>
              <h2 id="announcements-list-heading">Pengumuman sekolah</h2>
              <p>{items.length} pengumuman terbaru · maksimal 100 ditampilkan</p>
            </div>
            <label>
              <span className="sr-only">Cari pengumuman</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari pengumuman"
              />
            </label>
          </div>

          {loading ? (
            <p className="ale-announcements-empty" role="status">Memuat pengumuman...</p>
          ) : filteredItems.length === 0 ? (
            <p className="ale-announcements-empty">
              {items.length ? 'Tidak ada pengumuman yang cocok.' : 'Belum ada pengumuman untuk sekolah ini.'}
            </p>
          ) : (
            <ul className="ale-announcements-items">
              {filteredItems.map((item) => (
                <li key={item.id} className="ale-announcements-item">
                  <div className="ale-announcements-item-meta">
                    <time dateTime={item.createdAt}>{formatTanggal(item.createdAt)}</time>
                    <span>Warga sekolah</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                  {canManage && (
                    <div className="ale-announcements-item-actions">
                      <button type="button" className="secondary" onClick={() => beginEdit(item)}>Ubah</button>
                      <button type="button" className="danger" onClick={() => void remove(item)}>Hapus</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
