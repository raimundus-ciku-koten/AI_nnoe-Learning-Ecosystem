import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './role-workspaces.css';

const BASE = '/kepala-sekolah/supervisi';
const VIEWS = [
    { path: BASE, label: 'Program' },
    { path: `${BASE}/jadwal`, label: 'Jadwal' },
    { path: `${BASE}/pra-observasi`, label: 'Pra-observasi' },
    { path: `${BASE}/observasi`, label: 'Observasi' },
    { path: `${BASE}/tindak-lanjut`, label: 'Pasca-observasi & RTL' },
    { path: `${BASE}/rekap`, label: 'Rekapitulasi' },
];
const DOCUMENTS = [
    { label: 'Pedoman kalender pendidikan NTT 2026/2027', href: '/referensi/kalender-pendidikan-2026-2027/pedoman-kalender-pendidikan-ntt-2026-2027.pdf' },
    { label: 'SK kalender pendidikan Flores Timur 2026/2027', href: '/referensi/kalender-pendidikan-2026-2027/sk-kalender-pendidikan-flores-timur-2026-2027.pdf' },
    { label: 'Kalender akademik SMA Frateran Podor 2026/2027', href: '/referensi/kalender-pendidikan-2026-2027/kalender-akademik-sma-frador-2026-2027.pdf', schoolSpecific: true },
];
const PHASES = [
    { title: 'Pra-observasi', path: `${BASE}/pra-observasi`, detail: 'Sepakati fokus, konteks kelas, dan bukti pembelajaran yang akan diamati.' },
    { title: 'Observasi kelas', path: `${BASE}/observasi`, detail: 'Catat bukti secara deskriptif selama pembelajaran berlangsung.' },
    { title: 'Pasca-observasi dan RTL', path: `${BASE}/tindak-lanjut`, detail: 'Refleksikan bukti bersama guru, lalu sepakati dukungan dan waktu tindak lanjut.' },
];

function FormDraft({ phase }) {
    const [saved, setSaved] = useState(false);
    const isSchedule = phase === 'jadwal';
    const isPre = phase === 'pra-observasi';
    const isObservation = phase === 'observasi';
    const title = isSchedule ? 'Rencana jadwal supervisi' : isPre ? 'Persiapan pra-observasi' : isObservation ? 'Catatan observasi kelas' : 'Kesepakatan tindak lanjut';
    const fields = isSchedule
        ? [['Guru yang disupervisi', 'text'], ['Kelas atau unit', 'text'], ['Tanggal rencana', 'date'], ['Fokus supervisi', 'text']]
        : isPre
            ? [['Nama guru', 'text'], ['Kelas atau unit', 'text'], ['Tujuan pembelajaran', 'text'], ['Fokus yang disepakati', 'text']]
            : isObservation
                ? [['Nama guru', 'text'], ['Kelas atau unit', 'text'], ['Tanggal observasi', 'date'], ['Bukti pembelajaran yang teramati', 'textarea']]
                : [['Nama guru', 'text'], ['Kekuatan praktik yang teramati', 'textarea'], ['Area pengembangan yang disepakati', 'textarea'], ['Dukungan / aksi berikutnya', 'textarea'], ['Tanggal tinjau ulang', 'date']];

    return (
        <section className="role-workspace__panel">
            <div className="role-workspace__panel-head">
                <div><h2>{title}</h2><p>Gunakan dokumen kalender sebagai rujukan, lalu konfirmasikan tanggal dengan sekolah.</p></div>
                <span className="role-workspace__draft-label">Draf sementara</span>
            </div>
            <form className="supervision-form" onSubmit={(event) => { event.preventDefault(); setSaved(true); }}>
                {fields.map(([label, type]) => (
                    <label key={label} className={type === 'textarea' ? 'supervision-form__wide' : ''}>
                        <span>{label}</span>
                        {type === 'textarea' ? <textarea required rows="3" /> : <input required type={type} />}
                    </label>
                ))}
                <div className="supervision-form__actions">
                    <button type="submit">Tandai draf siap ditinjau</button>
                    {saved && <span role="status">Draf ditandai siap di halaman ini; belum tersimpan ke server.</span>}
                </div>
            </form>
        </section>
    );
}

function DocumentReferences() {
    return (
        <section className="role-workspace__panel">
            <div className="role-workspace__panel-head">
                <div><h2>Rujukan kalender pendidikan 2026/2027</h2><p>Periksa kalender yang berlaku untuk sekolah sebelum menetapkan jadwal observasi.</p></div>
            </div>
            <ul className="supervision-documents">{DOCUMENTS.map((document) => (
                <li key={document.href}>
                    <a href={document.href} target="_blank" rel="noreferrer">{document.label}</a>
                    {document.schoolSpecific && <small>Khusus SMA Frateran Podor, bukan kalender umum.</small>}
                </li>
            ))}</ul>
            <p className="role-workspace__fineprint">Tanggal dalam PDF adalah rujukan; kalender belum diimpor otomatis dan perlu diverifikasi dengan sekolah.</p>
        </section>
    );
}

export default function SchoolSupervisionPage() {
    const { pathname } = useLocation();
    const active = VIEWS.find((view) => view.path === pathname) || VIEWS[0];
    const stage = PHASES.find((item) => item.path === pathname);
    const isWorkflow = pathname === BASE || pathname.endsWith('/rekap');

    return (
        <div className="role-workspace">
            <header className="role-workspace__heading">
                <div>
                    <p className="role-workspace__eyebrow">Kepala sekolah · Tahun pelajaran 2026/2027</p>
                    <h1>Supervisi akademik</h1>
                    <p>Ruang kerja supervisi dari perencanaan, percakapan pra-observasi, bukti kelas, hingga tindak lanjut.</p>
                </div>
            </header>
            <nav className="role-workspace__tabs role-workspace__tabs--scroll" aria-label="Tahapan supervisi">
                {VIEWS.map((view) => <Link key={view.path} className={active.path === view.path ? 'is-active' : ''} aria-current={active.path === view.path ? 'page' : undefined} to={view.path}>{view.label}</Link>)}
            </nav>

            <section className="role-workspace__notice" role="note">
                <strong>Ruang kerja belum tersambung ke penyimpanan supervisi.</strong>
                <span>Isian hanya draf di browser selama halaman terbuka. Belum ada tabel atau RPC supervisi untuk penyimpanan dan rekap server.</span>
            </section>

            {stage && <FormDraft key={stage.path} phase={pathname.split('/').at(-1)} />}
            {pathname === `${BASE}/jadwal` && <DocumentReferences />}

            {isWorkflow && (
                <>
                    <section className="role-workspace__panel">
                        <div className="role-workspace__panel-head">
                            <div><h2>{pathname.endsWith('/rekap') ? 'Rekap kegiatan' : 'Alur supervisi'}</h2><p>{pathname.endsWith('/rekap') ? 'Belum ada catatan tersimpan di server.' : 'Ikuti percakapan profesional dari kesepakatan awal sampai tindak lanjut.'}</p></div>
                            <span className="role-workspace__draft-label">0 catatan tersimpan</span>
                        </div>
                        <ol className="supervision-phases">{PHASES.map((phase, index) => (
                            <li key={phase.path}>
                                <span className="supervision-phases__number">0{index + 1}</span>
                                <div><Link to={phase.path}>{phase.title}</Link><p>{phase.detail}</p></div>
                            </li>
                        ))}</ol>
                        <Link className="role-workspace__primary-link" to={`${BASE}/jadwal`}>Rencanakan jadwal supervisi</Link>
                    </section>
                    <DocumentReferences />
                </>
            )}

            {pathname === `${BASE}/jadwal` && (
                <FormDraft key="jadwal-form" phase="jadwal" />
            )}

            {stage && <DocumentReferences />}
        </div>
    );
}