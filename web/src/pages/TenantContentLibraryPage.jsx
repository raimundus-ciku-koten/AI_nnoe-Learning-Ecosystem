import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { muatPenugasanGuru } from '../services/teacherAssignments.js';
import {
    CONTENT_TYPES,
    imporSoalGlobalKeBank,
    muatKontenGlobalTenant,
} from '../services/platformContentCatalog.js';
import '../styles/tenant-content-library.css';

const ROLES = new Set(['admin_sekolah', 'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']);
const JENIS = Object.entries(CONTENT_TYPES);

export default function TenantContentLibraryPage() {
    const { user, role, activeRole, tenantId } = useAuth();
    const roleAktif = activeRole || role;
    const canView = ROLES.has(roleAktif) && Boolean(tenantId);
    const canImport = roleAktif === 'guru';
    const [items, setItems] = useState([]);
    const [assignments, setAssignments] = useState({ mapel: [], kelas: [] });
    const [selectedId, setSelectedId] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [status, setStatus] = useState({ loading: true, busy: false, error: '', notice: '' });
    const [search, setSearch] = useState('');
    const [mapel, setMapel] = useState('');
    const [kelas, setKelas] = useState('');

    useEffect(() => {
        let active = true;
        if (!canView) {
            setStatus((current) => ({ ...current, loading: false }));
            return () => { active = false; };
        }
        setStatus({ loading: true, busy: false, error: '', notice: '' });
        const requests = [muatKontenGlobalTenant()];
        if (canImport && user?.uid) requests.push(muatPenugasanGuru(user.uid));
        Promise.all(requests)
            .then(([catalog, teacherAssignments]) => {
                if (!active) return;
                setItems(catalog);
                if (teacherAssignments) {
                    setAssignments(teacherAssignments);
                    setMapel(teacherAssignments.mapel[0] || '');
                    setKelas(teacherAssignments.kelas[0] || '');
                }
                setSelectedId((id) => catalog.some((item) => item.id === id) ? id : catalog[0]?.id || '');
            })
            .catch((cause) => {
                console.error('[tenant-content-library] Gagal memuat pustaka:', cause);
                if (active) setStatus({ loading: false, busy: false, error: 'Pustaka global belum dapat dimuat. Pastikan migrasi katalog dan endpoint distribusi tersedia.', notice: '' });
            })
            .finally(() => { if (active) setStatus((current) => ({ ...current, loading: false })); });
        return () => { active = false; };
    }, [canImport, canView, tenantId, user?.uid]);

    const visible = useMemo(() => {
        const term = search.trim().toLocaleLowerCase('id');
        return items.filter((item) => (typeFilter === 'all' || item.content_type === typeFilter)
            && (!term || `${item.title} ${item.description} ${item.subject} ${item.grade_level}`
                .toLocaleLowerCase('id').includes(term)));
    }, [items, search, typeFilter]);
    const selected = items.find((item) => item.id === selectedId) || null;

    async function importQuestions() {
        if (!selected || selected.content_type !== 'bank_soal' || !canImport || status.busy) return;
        setStatus({ loading: false, busy: true, error: '', notice: '' });
        try {
            const count = await imporSoalGlobalKeBank({ contentId: selected.id, mapel, kelas });
            setStatus({ loading: false, busy: false, error: '', notice: `${count} soal disalin ke Bank Soal tenant. Kunci disimpan melalui RPC server dan tidak dikirim dari katalog global.` });
        } catch (cause) {
            console.error('[tenant-content-library] Gagal menyalin soal global:', cause);
            setStatus({ loading: false, busy: false, error: cause?.message || 'Soal belum dapat disalin. Periksa penugasan dan entitlement guru.', notice: '' });
        }
    }

    if (!canView) {
        return <section className="tenant-library-card" role="alert"><h1>Pustaka Global</h1><p>Pustaka hanya tersedia bagi guru dan admin sekolah pada tenant aktif.</p></section>;
    }

    return (
        <main className="tenant-library" aria-labelledby="tenant-library-title">
            <header className="tenant-library-header">
                <p>Konten global · tenant aktif</p>
                <h1 id="tenant-library-title">Pustaka Global</h1>
                <span>Materi terbit dengan lisensi dan sumber yang dicatat. Konten global tetap terpisah dari dokumen sekolah.</span>
            </header>
            <p className="tenant-library-note" role="note">Bank soal ditampilkan tanpa answer key. Saat guru menyalin soal ke bank tenant, server menyimpan kunci di ruang bank soal guru yang berizin.</p>
            {status.error && <p className="tenant-library-message is-error" role="alert">{status.error}</p>}
            {status.notice && <p className="tenant-library-message is-notice" role="status">{status.notice}</p>}
            <div className="tenant-library-layout">
                <section className="tenant-library-card" aria-labelledby="tenant-library-list-title">
                    <div className="tenant-library-heading"><div><p>{items.length} materi</p><h2 id="tenant-library-list-title">Katalog terbit</h2></div></div>
                    <label className="tenant-library-search">Cari judul, mata pelajaran, atau jenjang
                        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ketik untuk mencari" />
                    </label>
                    <label className="tenant-library-filter">Jenis konten
                        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                            <option value="all">Semua jenis</option>
                            {JENIS.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                        </select>
                    </label>
                    {status.loading ? <p className="tenant-library-empty" role="status">Memuat pustaka…</p> : !visible.length ? (
                        <p className="tenant-library-empty">{items.length ? 'Tidak ada materi yang cocok.' : 'Belum ada konten global yang diterbitkan.'}</p>
                    ) : (
                        <ul className="tenant-library-list">{visible.map((item) => (
                            <li key={item.id}><button type="button" className={selectedId === item.id ? 'is-selected' : ''} onClick={() => setSelectedId(item.id)}>
                                <span><strong>{item.title}</strong><small>{CONTENT_TYPES[item.content_type]} · {item.subject || 'Umum'} · {item.grade_level || 'Semua jenjang'}</small></span>
                                <span className="tenant-library-version">v{item.version}</span>
                            </button></li>
                        ))}</ul>
                    )}
                </section>
                <section className="tenant-library-card tenant-library-detail" aria-labelledby="tenant-library-detail-title">
                    {!selected ? <p className="tenant-library-empty">Pilih konten terbit untuk melihat detail.</p> : (
                        <>
                            <header className="tenant-library-heading"><div><p>{CONTENT_TYPES[selected.content_type]} · versi {selected.version}</p><h2 id="tenant-library-detail-title">{selected.title}</h2></div></header>
                            {selected.description && <p className="tenant-library-description">{selected.description}</p>}
                            <dl className="tenant-library-meta">
                                <div><dt>Lisensi / izin</dt><dd>{selected.license_label}</dd></div>
                                <div><dt>Mata pelajaran</dt><dd>{selected.subject || 'Umum'}</dd></div>
                                <div><dt>Jenjang / kelas</dt><dd>{selected.grade_level || 'Semua jenjang'}</dd></div>
                                {selected.source_url && <div><dt>Sumber</dt><dd><a href={selected.source_url} target="_blank" rel="noopener noreferrer">Buka sumber HTTPS</a></dd></div>}
                            </dl>
                            {selected.content_type === 'bank_soal' ? (
                                <>
                                    <ol className="tenant-library-questions">{selected.question_items.map((question) => (
                                        <li key={question.position}><strong>{question.prompt}</strong>
                                            {question.choices.length > 0 && <ul>{question.choices.map((choice, index) => <li key={`${question.position}:${index}`}>{choice}</li>)}</ul>}
                                        </li>
                                    ))}</ol>
                                    {canImport && (
                                        <div className="tenant-library-import">
                                            <label>Mata pelajaran
                                                <select value={mapel} onChange={(event) => setMapel(event.target.value)} disabled={status.busy || !assignments.mapel.length}>
                                                    {assignments.mapel.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                                                </select>
                                            </label>
                                            <label>Kelas
                                                <select value={kelas} onChange={(event) => setKelas(event.target.value)} disabled={status.busy || !assignments.kelas.length}>
                                                    {assignments.kelas.map((className) => <option key={className} value={className}>{className}</option>)}
                                                </select>
                                            </label>
                                            <button type="button" onClick={() => void importQuestions()} disabled={status.busy || !mapel || !kelas || !selected.question_items.length}>
                                                {status.busy ? 'Menyalin…' : 'Salin ke Bank Soal'}
                                            </button>
                                            {!assignments.mapel.length || !assignments.kelas.length ? <p>Lengkapi penugasan mapel dan kelas sebelum menyalin soal.</p> : null}
                                        </div>
                                    )}
                                </>
                            ) : <div className="tenant-library-text">{selected.content_text}</div>}
                        </>
                    )}
                </section>
            </div>
        </main>
    );
}
