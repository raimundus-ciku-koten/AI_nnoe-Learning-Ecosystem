import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import PdfQuestionDraftPanel from '../components/PdfQuestionDraftPanel.jsx';
import { muatGuruTenant } from '../services/teacherAssignments.js';
import {
    buatTautanUjianSiswa,
    buatUjianSekolahOnline,
    muatKelasUjianSekolah,
    muatRosterUjianSekolah,
    muatSoalUjianSekolah,
} from '../services/onlineAssessments.js';
import '../styles/online-assessments.css';

const JENIS_UJIAN = [
    'Ujian Tengah Semester',
    'Ujian Akhir Semester',
    'Ujian Akhir Tahun',
    'Ujian Sekolah',
];

export default function SchoolExamBuilderPage() {
    const { user, role, activeRole, tenantId } = useAuth();
    const roleAktif = activeRole || role;
    const [questions, setQuestions] = useState([]);
    const [classRows, setClassRows] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [roster, setRoster] = useState([]);
    const [jenis, setJenis] = useState(JENIS_UJIAN[1]);
    const [title, setTitle] = useState('');
    const [selectedClasses, setSelectedClasses] = useState([]);
    const [selectedQuestions, setSelectedQuestions] = useState([]);
    const [draftQuestions, setDraftQuestions] = useState([]);
    const [selectedDraftIds, setSelectedDraftIds] = useState([]);
    const [audience, setAudience] = useState('classes');
    const [selectedStudentIds, setSelectedStudentIds] = useState([]);
    const [reviewerTeacherId, setReviewerTeacherId] = useState('');
    const [startsAt, setStartsAt] = useState('');
    const [endsAt, setEndsAt] = useState('');
    const [duration, setDuration] = useState(90);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [created, setCreated] = useState([]);

    useEffect(() => {
        let active = true;
        if (roleAktif !== 'admin_sekolah' || !tenantId) {
            setLoading(false);
            return () => { active = false; };
        }
        setLoading(true);
        Promise.all([
            muatSoalUjianSekolah(tenantId),
            muatKelasUjianSekolah(),
            muatGuruTenant(tenantId),
        ])
            .then(([rows, classList, teacherList]) => {
                if (!active) return;
                setQuestions(rows);
                setClassRows(classList);
                setTeachers(teacherList);
            })
            .catch((cause) => { if (active) setError(cause.message || 'Bank soal sekolah tidak dapat dimuat.'); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [roleAktif, tenantId]);

    useEffect(() => {
        let active = true;
        if (roleAktif !== 'admin_sekolah' || !selectedClasses.length) {
            setRoster([]);
            return () => { active = false; };
        }
        muatRosterUjianSekolah(selectedClasses)
            .then((rows) => { if (active) setRoster(rows); })
            .catch((cause) => { if (active) setError(cause.message || 'Roster peserta tidak dapat dimuat.'); });
        return () => { active = false; };
    }, [roleAktif, selectedClasses]);

    const classes = useMemo(() => classRows.map((row) => row.kelas), [classRows]);
    const visibleQuestions = questions.filter((question) => selectedClasses.includes(question.kelas));
    const visibleDraftQuestions = draftQuestions.filter((question) => selectedClasses.includes(question.kelas));
    const selectedQuestionItems = [
        ...visibleQuestions.filter((question) => selectedQuestions.includes(question.id)),
        ...visibleDraftQuestions.filter((question) => selectedDraftIds.includes(question.id)),
    ];
    const countsByClass = selectedClasses.map((kelas) => ({
        kelas,
        count: selectedQuestionItems.filter((question) => question.kelas === kelas).length,
    }));
    const canSubmit = selectedClasses.length > 0 && countsByClass.every((item) => item.count > 0);
    const hasEssay = selectedQuestionItems.some((question) => question.jenis === 'uraian');
    const eligibleReviewers = teachers.filter((teacher) =>
        selectedClasses.every((kelas) => teacher.kelas.includes(kelas)));
    const linkedRoster = roster.filter((student) => student.akunTertaut);
    const rosterByClass = selectedClasses.map((kelas) => ({
        kelas,
        count: selectedStudentIds.filter((id) => linkedRoster.some((student) => student.id === id && student.kelas === kelas)).length,
    }));
    const canTargetSelectedStudents = audience !== 'selected'
        || (rosterByClass.length > 0 && rosterByClass.every((item) => item.count > 0));

    function toggleClass(kelas) {
        if (selectedClasses.includes(kelas)) {
            setSelectedClasses((previous) => previous.filter((item) => item !== kelas));
            const removedIds = questions.filter((question) => question.kelas === kelas).map((question) => question.id);
            setSelectedQuestions((selected) => selected.filter((id) => !removedIds.includes(id)));
            const removedDraftIds = draftQuestions.filter((question) => question.kelas === kelas).map((question) => question.id);
            setSelectedDraftIds((selected) => selected.filter((id) => !removedDraftIds.includes(id)));
            setSelectedStudentIds((selected) => selected.filter((id) => !roster.some((student) => student.id === id && student.kelas === kelas)));
            return;
        }
        setSelectedClasses((previous) => [...previous, kelas]);
    }

    async function submit(event) {
        event.preventDefault();
        setBusy(true);
        setError('');
        setNotice('');
        setCreated([]);
        try {
            const ids = await buatUjianSekolahOnline({
                title: `${jenis}: ${title}`.slice(0, 160),
                kelas: selectedClasses,
                startsAt: new Date(startsAt).toISOString(),
                endsAt: new Date(endsAt).toISOString(),
                durationMinutes: Number(duration),
                questionIds: selectedQuestions.filter((id) => visibleQuestions.some((question) => question.id === id)),
                customQuestions: visibleDraftQuestions.filter((question) => selectedDraftIds.includes(question.id)),
                studentIds: audience === 'selected' ? selectedStudentIds : [],
                reviewerTeacherId: hasEssay ? reviewerTeacherId : '',
            });
            setCreated(selectedClasses.map((kelas, index) => ({
                kelas,
                href: buatTautanUjianSiswa(ids[index], window.location.origin, window.location.pathname),
            })));
            setNotice(`${ids.length} paket ujian berhasil dibuat, satu untuk setiap kelas terpilih.`);
            setTitle('');
            setSelectedClasses([]);
            setSelectedQuestions([]);
            setSelectedDraftIds([]);
            setSelectedStudentIds([]);
            setReviewerTeacherId('');
        } catch (cause) {
            setError(cause.message || 'Ujian sekolah tidak dapat dibuat.');
        } finally {
            setBusy(false);
        }
    }

    if (roleAktif !== 'admin_sekolah') {
        return <section className="ale-exam-card" role="alert"><h1>Buat Ujian Sekolah</h1><p>Fitur ini hanya tersedia untuk Admin Sekolah.</p></section>;
    }
    if (!tenantId) {
        return <section className="ale-exam-card" role="alert"><h1>Buat Ujian Sekolah</h1><p>Akun ini belum terhubung ke tenant sekolah.</p></section>;
    }

    return (
        <main className="ale-exam-card" aria-labelledby="school-exam-title">
            <p className="ale-exam-kicker">Manajemen asesmen · tenant sekolah</p>
            <h1 id="school-exam-title">Buat Ujian Sekolah</h1>
            <p className="ale-exam-intro">Atur jadwal dan durasi ujian, pilih beberapa kelas atau siswa tertentu, lalu gabungkan soal bank sekolah dengan draf yang dibuat dari PDF.</p>
            <p className="ale-exam-intro" role="note">PDF diproses di perangkat. Kunci jawaban tidak dimuat ke halaman; soal uraian wajib memiliki guru penilai.</p>

            {loading && <p role="status">Memuat bank soal tenant…</p>}
            {error && <p className="ale-exam-error" role="alert">{error}</p>}
            {!loading && !error && !classes.length && <p>Belum ada kelas siswa pada tenant sekolah.</p>}

            {!!classes.length && (
                <form className="ale-exam-form" onSubmit={submit}>
                    <label>Jenis ujian
                        <select value={jenis} onChange={(event) => setJenis(event.target.value)}>
                            {JENIS_UJIAN.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                    </label>
                    <label>Nama ujian / semester
                        <input required maxLength="120" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Contoh: Semester Ganjil 2026/2027" />
                    </label>
                    <fieldset className="ale-exam-select-questions">
                        <legend>Pilih kelas</legend>
                        {classRows.map((item) => (
                            <label key={item.kelas}>
                                <input type="checkbox" checked={selectedClasses.includes(item.kelas)} onChange={() => toggleClass(item.kelas)} />
                                <span>{item.kelas} · {item.linked_count}/{item.student_count} akun tertaut</span>
                            </label>
                        ))}
                    </fieldset>
                    {selectedClasses.length > 0 && (
                        <fieldset className="ale-exam-select-questions">
                            <legend>Peserta ujian</legend>
                            <label><input type="radio" name="school-exam-audience" checked={audience === 'classes'} onChange={() => setAudience('classes')} /><span>Semua siswa dengan akun tertaut pada kelas terpilih</span></label>
                            <label><input type="radio" name="school-exam-audience" checked={audience === 'selected'} onChange={() => setAudience('selected')} /><span>Pilih beberapa siswa</span></label>
                            {audience === 'selected' && (
                                <>
                                    {!roster.length && <p role="status">Memuat roster kelas…</p>}
                                    {linkedRoster.map((student) => (
                                        <label key={student.id}>
                                            <input type="checkbox" checked={selectedStudentIds.includes(student.id)} onChange={(event) => setSelectedStudentIds((previous) => (
                                                event.target.checked ? [...previous, student.id] : previous.filter((id) => id !== student.id)
                                            ))} />
                                            <span>{student.nama} · {student.kelas}</span>
                                        </label>
                                    ))}
                                    {roster.length > 0 && !linkedRoster.length && <p>Tidak ada siswa dengan akun tertaut pada kelas terpilih.</p>}
                                    {rosterByClass.length > 0 && <p>Peserta terpilih: {rosterByClass.map((item) => `${item.kelas} (${item.count})`).join(' · ')}</p>}
                                </>
                            )}
                        </fieldset>
                    )}
                    {!!classes.length && (
                        <PdfQuestionDraftPanel
                            userId={user?.uid}
                            classes={classes}
                            selectedClass={selectedClasses.at(-1) || ''}
                            onDrafts={(drafts) => {
                                setDraftQuestions((previous) => [...previous, ...drafts]);
                                setSelectedClasses((previous) => [...new Set([...previous, ...drafts.map((draft) => draft.kelas)])]);
                            }}
                        />
                    )}
                    <fieldset className="ale-exam-select-questions">
                        <legend>Pilih soal tersimpan ({selectedQuestions.length}/500)</legend>
                        {visibleQuestions.map((question) => (
                            <label key={question.id}>
                                <input
                                    type="checkbox"
                                    checked={selectedQuestions.includes(question.id)}
                                    disabled={!selectedQuestions.includes(question.id) && (selectedQuestionItems.length >= 500 || selectedQuestionItems.filter((item) => item.kelas === question.kelas).length >= 100)}
                                    onChange={(event) => setSelectedQuestions((previous) => (
                                        event.target.checked ? [...previous, question.id] : previous.filter((id) => id !== question.id)
                                    ))}
                                />
                                <span>{question.kelas} · {question.mapel} · {question.jenis}: {question.pertanyaan}</span>
                            </label>
                        ))}
                        {visibleDraftQuestions.map((question) => (
                            <label key={question.id}>
                                <input
                                    type="checkbox"
                                    checked={selectedDraftIds.includes(question.id)}
                                    disabled={!selectedDraftIds.includes(question.id) && (selectedQuestionItems.length >= 500 || selectedQuestionItems.filter((item) => item.kelas === question.kelas).length >= 100)}
                                    onChange={(event) => setSelectedDraftIds((previous) => (
                                        event.target.checked ? [...previous, question.id] : previous.filter((id) => id !== question.id)
                                    ))}
                                />
                                <span>{question.kelas} · {question.mapel} · draf PDF {question.jenis}: {question.pertanyaan}</span>
                            </label>
                        ))}
                        {!visibleQuestions.length && !visibleDraftQuestions.length && <p>Pilih kelas, lalu unggah PDF atau pilih kelas yang memiliki soal tersimpan.</p>}
                    </fieldset>
                    {countsByClass.length > 0 && <p className="ale-exam-intro">Soal terpilih: {countsByClass.map((item) => `${item.kelas} (${item.count})`).join(' · ')}</p>}
                    {hasEssay && (
                        <label>Guru penilai uraian
                            <select value={reviewerTeacherId} onChange={(event) => setReviewerTeacherId(event.target.value)} required>
                                <option value="">Pilih guru penilai</option>
                                {eligibleReviewers.map((teacher) => <option key={teacher.uid} value={teacher.uid}>{teacher.nama}</option>)}
                            </select>
                        </label>
                    )}
                    <label>Mulai
                        <input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
                    </label>
                    <label>Batas akhir pengerjaan
                        <input required type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
                    </label>
                    <label>Durasi (menit)
                        <input required type="number" min="1" max="300" value={duration} onChange={(event) => setDuration(event.target.value)} />
                    </label>
                    <button className="ale-exam-primary" type="submit" disabled={busy || loading || !canSubmit || !canTargetSelectedStudents || (hasEssay && !reviewerTeacherId) || !startsAt || !endsAt || !title.trim()}>
                        {busy ? 'Membuat paket ujian…' : `Buat paket untuk ${selectedClasses.length || 0} kelas`}
                    </button>
                </form>
            )}

            {notice && <p className="ale-exam-notice" role="status">{notice}</p>}
            {!!created.length && <ul className="ale-exam-list">{created.map((item) => (
                <li key={item.kelas}><div><strong>Kelas {item.kelas}</strong><span>Paket ujian siap dibagikan kepada peserta yang sudah tertaut ke roster.</span></div><a className="ale-exam-secondary" href={item.href}>Buka tautan siswa</a></li>
            ))}</ul>}
        </main>
    );
}