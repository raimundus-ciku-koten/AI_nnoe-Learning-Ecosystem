import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
    buatPengumumanSekolah,
    hapusPengumumanSekolah,
    muatPengumumanSekolah,
    ubahPengumumanSekolah,
} from '../services/schoolAnnouncements.js';
import '../styles/school-announcements.css';

const KOSONG = { title: '', body: '' };

function tanggalPengumuman(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? 'Waktu tidak tersedia'
        : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function SchoolAnnouncementsPage() {
    const { user, role, activeRole, tenantId } = useAuth();
    const roleAktif = activeRole || role;
    const canManage = ['admin_sekolah', 'operator'].includes(roleAktif);
    const [items, setItems] = useState([]);
    const [form, setForm] = useState(KOSONG);
    const [editId, setEditId] = useState('');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const refresh = useCallback(async () => {
        if (!tenantId) {
            setItems([]);
            setError('Akun belum terhubung ke tenant sekolah. Hubungi administrator sekolah.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            setItems(await muatPengumumanSekolah(tenantId));
        } catch (cause) {
            console.error('[school-announcements] Gagal memuat pengumuman:', cause);
            setError('Pengumuman belum dapat dimuat. Periksa sesi dan koneksi, lalu coba lagi.');
        } finally {
            setLoading(false);
        }
    }, [tenantId]);

    useEffect(() => { void refresh(); }, [refresh]);

    const daftar = useMemo(() => {
        const term = search.trim().toLocaleLowerCase('id');
        if (!term) return items;
        return items.filter((item) => `${item.title} ${item.body}`.toLocaleLowerCase('id').includes(term));
    }, [items, search]);

    function resetForm() {
        setForm(KOSONG);
        setEditId('');
    }

    async function submit(event) {
        event.preventDefault();
        if (!canManage || !tenantId || !user?.uid || busy) return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            if (editId) {
                await ubahPengumumanSekolah({ tenantId, announcementId: editId, ...form });
                setNotice('Pengumuman diperbarui.');
            } else {
                await buatPengumumanSekolah({ tenantId, authorId: user.uid, ...form });
                setNotice('Pengumuman diterbitkan untuk anggota sekolah.');
            }
            resetForm();
            await refresh();
        } catch (cause) {
            console.error('[school-announcements] Gagal menyimpan pengumuman:', cause);
            setError(cause?.message || 'Pengumuman tidak dapat disimpan. Periksa hak akses dan status langganan sekolah.');
        } finally {
            setBusy(false);
        }
    }

    function edit(item) {
        setForm({ title: item.title, body: item.body });
        setEditId(item.id);
        setNotice('');
        setError('');
        document.getElementById('announcement-title')?.focus();
    }

    async function remove(item) {
        if (!canManage || busy ||
            !window.confirm(`Hapus pengumuman “${item.title}”? Tindakan ini tidak dapat dibatalkan.`)) return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await hapusPengumumanSekolah({ tenantId, announcementId: item.id });
            setItems((current) => current.filter((entry) => entry.id !== item.id));
            if (editId === item.id) resetForm();
            setNotice('Pengumuman dihapus.');
        } catch (cause) {
            console.error('[school-announcements] Gagal menghapus pengumuman:', cause);
            setError(cause?.message || 'Pengumuman tidak dapat dihapus.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <main className="school-announcements" aria-labelledby="school-announcements-title">
            <header className="school-announcements__header">
                <p className="school-announcements__eyebrow">Komunikasi sekolah</p>
                <h1 id="school-announcements-title">Pengumuman Sekolah</h1>
                <p>Informasi resmi untuk anggota sekolah pada tenant aktif.</p>
            </header>

            {canManage && (
                <section className="school-announcements__editor" aria-labelledby="announcement-editor-title">
                    <div className="school-announcements__section-head">
                        <div>
                            <p className="school-announcements__eyebrow">{editId ? 'Perbarui informasi' : 'Informasi baru'}</p>
                            <h2 id="announcement-editor-title">{editId ? 'Edit pengumuman' : 'Buat pengumuman'}</h2>
                        </div>
                        <span>{editId ? 'Mengedit' : 'Draf'}</span>
                    </div>
                    <form onSubmit={submit}>
                        <label htmlFor="announcement-title">Judul</label>
                        <input
                            id="announcement-title"
                            required
                            maxLength={200}
                            value={form.title}
                            disabled={busy}
                            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                            placeholder="Contoh: Jadwal rapat orang tua"
                        />
                        <label htmlFor="announcement-body">Isi</label>
                        <textarea
                            id="announcement-body"
                            required
                            maxLength={5000}
                            rows={5}
                            value={form.body}
                            disabled={busy}
                            onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
                            placeholder="Tulis informasi yang perlu diketahui anggota sekolah."
                        />
                        <p className="school-announcements__privacy" role="note">
                            Jangan sertakan nilai, nomor identitas, atau informasi pribadi siswa. Pengumuman dapat dibaca anggota sekolah pada tenant ini.
                        </p>
                        {error && <p className="school-announcements__error" role="alert">{error}</p>}
                        {notice && <p className="school-announcements__notice" role="status">{notice}</p>}
                        <div className="school-announcements__actions">
                            {editId && <button type="button" className="is-secondary" disabled={busy} onClick={resetForm}>Batal</button>}
                            <button type="submit" disabled={busy || !tenantId}>
                                {busy ? 'Menyimpan…' : editId ? 'Simpan perubahan' : 'Terbitkan pengumuman'}
                            </button>
                        </div>
                    </form>
                </section>
            )}

            <section className="school-announcements__feed" aria-labelledby="announcement-feed-title">
                <div className="school-announcements__feed-head">
                    <div>
                        <h2 id="announcement-feed-title">Pengumuman terbaru</h2>
                        <p>{items.length} pengumuman tersedia</p>
                    </div>
                    <label>
                        <span className="school-announcements__sr-only">Cari pengumuman</span>
                        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari pengumuman" />
                    </label>
                    <button type="button" className="is-secondary" disabled={loading} onClick={() => void refresh()}>
                        {loading ? 'Memuat…' : 'Muat ulang'}
                    </button>
                </div>
                {!canManage && error && <p className="school-announcements__error" role="alert">{error}</p>}
                {loading && !items.length ? <p className="school-announcements__empty" role="status">Memuat pengumuman…</p> : null}
                {!loading && !error && !daftar.length ? (
                    <p className="school-announcements__empty">
                        {search ? 'Tidak ada pengumuman yang cocok.' : 'Belum ada pengumuman untuk sekolah ini.'}
                    </p>
                ) : null}
                <div className="school-announcements__items">
                    {daftar.map((item) => (
                        <article className="school-announcement" key={item.id}>
                            <div className="school-announcement__meta">
                                <time dateTime={item.created_at}>{tanggalPengumuman(item.created_at)}</time>
                                {canManage && (
                                    <div className="school-announcement__actions">
                                        <button type="button" disabled={busy} onClick={() => edit(item)}>Edit</button>
                                        <button type="button" className="is-danger" disabled={busy} onClick={() => void remove(item)}>Hapus</button>
                                    </div>
                                )}
                            </div>
                            <h3>{item.title}</h3>
                            <p>{item.body}</p>
                        </article>
                    ))}
                </div>
            </section>
        </main>
    );
}