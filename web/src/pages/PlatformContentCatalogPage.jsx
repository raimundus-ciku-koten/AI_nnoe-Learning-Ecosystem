import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
    arsipkanKonten,
    CONTENT_TYPES,
    muatKatalogKonten,
    simpanDrafKonten,
    terbitkanKonten,
} from '../services/platformContentCatalog.js';
import '../styles/platform-content-catalog.css';

const KOSONG = {
    id: '', title: '', description: '', contentText: '', subject: '', gradeLevel: '',
    licenseLabel: '', sourceUrl: '', questionItemsText: '[]', answerKeyText: '{}',
    status: 'draft', version: 0,
};

export default function PlatformContentCatalogPage({ type }) {
    const { role, activeRole } = useAuth();
    const roleAktif = activeRole || role;
    const label = CONTENT_TYPES[type] || 'Katalog Konten';
    const [items, setItems] = useState([]);
    const [selectedId, setSelectedId] = useState('');
    const [form, setForm] = useState(KOSONG);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const refresh = useCallback(async () => {
        if (roleAktif !== 'superadmin' || !CONTENT_TYPES[type]) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const rows = await muatKatalogKonten(type);
            setItems(rows);
            setSelectedId((id) => rows.some((item) => item.id === id) ? id : '');
            return rows;
        } catch (cause) {
            console.error('[platform-content] Gagal memuat katalog:', cause);
            setError(cause?.code === '42501'
                ? 'Akses katalog global ditolak. Masuk dengan akun superadmin aktif.'
                : 'Katalog global belum tersedia. Pastikan migrasi platform content telah diterapkan.');
        } finally {
            setLoading(false);
        }
    }, [roleAktif, type]);

    useEffect(() => { void refresh(); }, [refresh]);

    const selected = useMemo(() => items.find((item) => item.id === selectedId), [items, selectedId]);
    const visible = useMemo(() => {
        const term = search.trim().toLocaleLowerCase('id');
        return items.filter((item) => (statusFilter === 'all' || item.status === statusFilter)
            && (!term || `${item.title} ${item.description} ${item.subject} ${item.grade_level}`
                .toLocaleLowerCase('id').includes(term)));
    }, [items, search, statusFilter]);
    const locked = selected?.status === 'published' || selected?.status === 'archived';

    function edit(item) {
        setSelectedId(item.id);
        setForm({
            id: item.id,
            title: item.title,
            description: item.description,
            contentText: item.content_text,
            subject: item.subject,
            gradeLevel: item.grade_level,
            licenseLabel: item.license_label,
            sourceUrl: item.source_url,
            questionItemsText: JSON.stringify(item.question_items || [], null, 2),
            answerKeyText: JSON.stringify(item.answer_key || {}, null, 2),
            status: item.status,
            version: item.version,
        });
        setError('');
        setNotice('');
    }

    function newDraft() {
        setSelectedId('');
        setForm(KOSONG);
        setError('');
        setNotice('');
    }

    async function save(event) {
        event.preventDefault();
        if (busy || locked) return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            let questionItems = [];
            let answerKey = {};
            if (type === 'bank_soal') {
                try {
                    questionItems = JSON.parse(form.questionItemsText);
                    answerKey = JSON.parse(form.answerKeyText);
                } catch {
                    throw new Error('Butir soal dan kunci harus berupa JSON yang valid.');
                }
            }
            const saved = await simpanDrafKonten({ ...form, contentType: type, questionItems, answerKey });
            setSelectedId(saved.saved_id);
            setForm((current) => ({ ...current, id: saved.saved_id, version: saved.saved_version, status: 'draft' }));
            setNotice(`Draf tersimpan sebagai versi ${saved.saved_version}.`);
            await refresh();
        } catch (cause) {
            console.error('[platform-content] Gagal menyimpan draf:', cause);
            setError(cause?.message || 'Draf tidak dapat disimpan. Periksa isi dan hak akses.');
        } finally {
            setBusy(false);
        }
    }

    async function publish() {
        if (!selectedId || busy || form.status !== 'draft') return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await terbitkanKonten(selectedId);
            setNotice('Konten diterbitkan dan perubahan tercatat pada audit platform.');
            const rows = await refresh();
            const updated = rows?.find((item) => item.id === selectedId);
            if (updated) setForm({
                id: updated.id, title: updated.title, description: updated.description,
                contentText: updated.content_text, subject: updated.subject, gradeLevel: updated.grade_level,
                licenseLabel: updated.license_label, sourceUrl: updated.source_url,
                questionItemsText: JSON.stringify(updated.question_items || [], null, 2),
                answerKeyText: JSON.stringify(updated.answer_key || {}, null, 2),
                status: 'published', version: updated.version,
            });
        } catch (cause) {
            console.error('[platform-content] Gagal menerbitkan konten:', cause);
            setError(cause?.message || 'Konten belum dapat diterbitkan. Lengkapi isi dan lisensi/sumber.');
        } finally {
            setBusy(false);
        }
    }

    async function archive() {
        if (!selectedId || busy || !window.confirm('Arsipkan item ini? Item tidak akan dihapus dari audit.')) return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await arsipkanKonten(selectedId);
            setNotice('Konten diarsipkan dan perubahan tercatat pada audit platform.');
            newDraft();
            await refresh();
        } catch (cause) {
            console.error('[platform-content] Gagal mengarsipkan konten:', cause);
            setError(cause?.message || 'Konten tidak dapat diarsipkan.');
        } finally {
            setBusy(false);
        }
    }

    if (roleAktif !== 'superadmin') {
        return <section className="platform-content-card" role="alert"><h1>Akses dibatasi</h1><p>Katalog konten global hanya tersedia bagi superadmin.</p></section>;
    }

    return (
        <main className="platform-content-page" aria-labelledby="platform-content-title">
            <header className="platform-content-header">
                <p>Konten global · superadmin</p>
                <h1 id="platform-content-title">{label}</h1>
                <span>Katalog draf dan terbit. Item baru tidak disebarkan ke tenant oleh halaman ini.</span>
            </header>
            <p className="platform-content-note" role="note">Cantumkan lisensi dan sumber yang sah sebelum menerbitkan. Bank soal dapat berisi kunci jawaban; katalog ini hanya dapat dikelola superadmin dan belum memiliki endpoint distribusi ke guru/siswa.</p>
            {error && <p className="platform-content-message is-error" role="alert">{error}</p>}
            {notice && <p className="platform-content-message is-notice" role="status">{notice}</p>}

            <div className="platform-content-layout">
                <section className="platform-content-card" aria-labelledby="platform-content-editor-title">
                    <div className="platform-content-section-head">
                        <div><p>{form.id ? `Versi ${form.version}` : 'Item baru'}</p><h2 id="platform-content-editor-title">{form.id ? form.title : 'Buat draf'}</h2></div>
                        <button type="button" className="platform-content-secondary" onClick={newDraft} disabled={busy}>Item baru</button>
                    </div>
                    <form className="platform-content-form" onSubmit={save}>
                        <label>Judul<input required maxLength={160} value={form.title} disabled={busy || locked} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label>
                        <label>Deskripsi<textarea rows={2} maxLength={2000} value={form.description} disabled={busy || locked} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
                        <div className="platform-content-fields">
                            <label>Mata pelajaran<input maxLength={80} value={form.subject} disabled={busy || locked} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} /></label>
                            <label>Jenjang / kelas<input maxLength={80} value={form.gradeLevel} disabled={busy || locked} onChange={(event) => setForm((current) => ({ ...current, gradeLevel: event.target.value }))} /></label>
                        </div>
                        {type === 'bank_soal' ? (
                            <>
                                <label>Butir soal publik · JSON
                                    <textarea required rows={9} maxLength={30000} value={form.questionItemsText} disabled={busy || locked} onChange={(event) => setForm((current) => ({ ...current, questionItemsText: event.target.value }))} />
                                    <small>Gunakan array soal berisi position, kind, prompt, dan choices. Jangan masukkan kunci di sini.</small>
                                </label>
                                <label>Kunci jawaban · superadmin only · JSON
                                    <textarea required rows={5} maxLength={30000} value={form.answerKeyText} disabled={busy || locked} onChange={(event) => setForm((current) => ({ ...current, answerKeyText: event.target.value }))} />
                                    <small>Object terpisah dengan nomor posisi sebagai key; tidak pernah dikirim oleh RPC pustaka tenant.</small>
                                </label>
                            </>
                        ) : (
                            <label>Isi konten<textarea required rows={9} maxLength={30000} value={form.contentText} disabled={busy || locked} onChange={(event) => setForm((current) => ({ ...current, contentText: event.target.value }))} /></label>
                        )}
                        <div className="platform-content-fields">
                            <label>Lisensi / izin penggunaan<input required maxLength={160} value={form.licenseLabel} disabled={busy || locked} placeholder="Contoh: CC BY 4.0 atau izin pemilik" onChange={(event) => setForm((current) => ({ ...current, licenseLabel: event.target.value }))} /></label>
                            <label>URL sumber HTTPS<input type="url" maxLength={2048} value={form.sourceUrl} disabled={busy || locked} placeholder="https://…" onChange={(event) => setForm((current) => ({ ...current, sourceUrl: event.target.value }))} /></label>
                        </div>
                        {locked && <p className="platform-content-footnote">Item terbit/arsip tidak dapat diedit. Arsipkan item terbit, lalu buat draf revisi terpisah.</p>}
                        <div className="platform-content-actions">
                            {!locked && <button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan draf'}</button>}
                            {form.status === 'draft' && form.id && <button type="button" className="platform-content-secondary" onClick={() => void publish()} disabled={busy}>{busy ? 'Memproses…' : 'Terbitkan'}</button>}
                            {form.id && form.status !== 'archived' && <button type="button" className="platform-content-danger" onClick={() => void archive()} disabled={busy}>Arsipkan</button>}
                        </div>
                    </form>
                </section>

                <section className="platform-content-card" aria-labelledby="platform-content-list-title">
                    <div className="platform-content-section-head"><div><p>{items.length} item</p><h2 id="platform-content-list-title">Daftar katalog</h2></div></div>
                    <div className="platform-content-list-controls">
                        <label>Cari item<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Judul, mapel, atau jenjang" /></label>
                        <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Semua</option><option value="draft">Draf</option><option value="published">Terbit</option><option value="archived">Arsip</option></select></label>
                    </div>
                    {loading ? <p className="platform-content-empty" role="status">Memuat katalog…</p> : !visible.length ? (
                        <p className="platform-content-empty">{items.length ? 'Tidak ada item yang cocok.' : 'Katalog ini belum memiliki konten. Tambahkan hanya materi yang hak penggunaannya sudah dipastikan.'}</p>
                    ) : (
                        <ul className="platform-content-list">{visible.map((item) => (
                            <li key={item.id}><button type="button" className={item.id === selectedId ? 'is-selected' : ''} onClick={() => edit(item)}>
                                <span><strong>{item.title}</strong><small>{item.subject || 'Tanpa mapel'} · {item.grade_level || 'Tanpa jenjang'} · v{item.version}</small></span>
                                <b className={`is-${item.status}`}>{item.status === 'published' ? 'Terbit' : item.status === 'archived' ? 'Arsip' : 'Draf'}</b>
                            </button></li>
                        ))}</ul>
                    )}
                </section>
            </div>
        </main>
    );
}
