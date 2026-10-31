import React, { useEffect, useState } from 'react';
import { buatDrafSoalDariPDF } from '../services/aiIntegrations.js';
import { ekstrakTeksPdf } from '../services/pdfTextExtraction.js';

const PDF_CONTEXT_LIMIT = 15000;

export default function PdfQuestionDraftPanel({ userId, classes, subjects = [], selectedClass, onDrafts }) {
    const [fileName, setFileName] = useState('');
    const [sourceText, setSourceText] = useState('');
    const [mapel, setMapel] = useState('');
    const [kelas, setKelas] = useState(selectedClass || '');
    const [jenis, setJenis] = useState('pilihan_ganda');
    const [count, setCount] = useState(5);
    const [consent, setConsent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    useEffect(() => {
        if (selectedClass && classes.includes(selectedClass)) setKelas(selectedClass);
    }, [classes, selectedClass]);

    async function loadPdf(event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        setError('');
        setNotice('');
        setSourceText('');
        setFileName('');
        setConsent(false);
        if (!file) return;
        if (file.type !== 'application/pdf' && !file.name.toLocaleLowerCase('id').endsWith('.pdf')) {
            setError('Pilih file PDF.');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            setError('Ukuran PDF maksimal 10 MB.');
            return;
        }
        setBusy(true);
        try {
            const text = await ekstrakTeksPdf(new Uint8Array(await file.arrayBuffer()));
            setSourceText(text);
            setFileName(file.name);
            setNotice(`Teks berhasil diekstrak di perangkat dari ${file.name}.`);
        } catch (cause) {
            setError(cause.message || 'PDF tidak dapat dibaca.');
        } finally {
            setBusy(false);
        }
    }

    async function generate() {
        if (!consent || !sourceText || !userId || !kelas || !mapel.trim()) return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            const result = await buatDrafSoalDariPDF(userId, {
                mapel,
                kelas,
                jenis,
                count: Number(count),
                sourceText: sourceText.slice(0, PDF_CONTEXT_LIMIT),
            });
            const drafts = result.payload.questions.map((question) => ({
                id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
                mapel: mapel.trim(),
                kelas,
                jenis,
                pertanyaan: question.pertanyaan,
                pilihan: question.pilihan,
                jawaban: question.jawaban,
                pembahasan: question.pembahasan,
            }));
            onDrafts(drafts);
            setNotice(`${drafts.length} draf dibuat dari ${fileName} dengan ${result.penyedia}. Tinjau dan pilih sebelum ujian dijadwalkan.`);
        } catch (cause) {
            setError(cause.message || 'Draf soal belum dapat dibuat.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="exam-pdf-drafts" aria-labelledby="pdf-question-title">
            <h2 id="pdf-question-title">Buat draf dari PDF</h2>
            <p className="ale-exam-intro">PDF dibaca di perangkat Anda. Hanya cuplikan teks yang Anda setujui yang dikirim ke provider AI aktif. Draf tidak disimpan otomatis dan harus ditinjau sebelum dijadikan soal ujian.</p>
            <label>Unggah bahan ajar PDF
                <input type="file" accept="application/pdf,.pdf" onChange={(event) => void loadPdf(event)} disabled={busy} />
            </label>
            {fileName && <p role="status">{fileName} · {sourceText.length.toLocaleString('id-ID')} karakter diekstrak · maksimal {PDF_CONTEXT_LIMIT.toLocaleString('id-ID')} karakter dipakai sebagai konteks AI.</p>}
            {sourceText && (
                <details>
                    <summary>Pratinjau teks PDF</summary>
                    <pre className="exam-pdf-preview">{sourceText.slice(0, 1200)}{sourceText.length > 1200 ? '\n…' : ''}</pre>
                </details>
            )}
            <div className="ale-exam-form exam-pdf-fields">
                <label>Mata pelajaran
                    {subjects.length
                        ? (
                            <select required value={mapel} onChange={(event) => setMapel(event.target.value)}>
                                <option value="">Pilih mata pelajaran</option>
                                {subjects.map((item) => <option key={item} value={item}>{item}</option>)}
                            </select>
                        )
                        : <input required maxLength="80" value={mapel} onChange={(event) => setMapel(event.target.value)} />}
                </label>
                <label>Kelas
                    <select value={kelas} onChange={(event) => setKelas(event.target.value)} required>
                        <option value="">Pilih kelas</option>
                        {classes.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                </label>
                <label>Bentuk soal
                    <select value={jenis} onChange={(event) => setJenis(event.target.value)}>
                        <option value="pilihan_ganda">Pilihan ganda</option>
                        <option value="uraian">Uraian</option>
                    </select>
                </label>
                <label>Jumlah draf
                    <input type="number" min="1" max="10" value={count} onChange={(event) => setCount(Number(event.target.value))} />
                </label>
            </div>
            <label className="exam-pdf-consent">
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                <span>Saya setuju mengirim cuplikan teks PDF (maksimal 15.000 karakter), mata pelajaran, dan kelas ke provider AI aktif untuk membuat draf. Jangan gunakan dokumen berisi data pribadi atau materi yang tidak boleh dibagikan.</span>
            </label>
            <button type="button" className="ale-exam-primary" onClick={() => void generate()} disabled={busy || !sourceText || !consent || !mapel.trim() || !kelas || count < 1 || count > 10}>
                {busy ? 'Memproses…' : 'Buat draf soal dengan AI'}
            </button>
            {error && <p className="ale-exam-error" role="alert">{error}</p>}
            {notice && <p className="ale-exam-notice" role="status">{notice}</p>}
        </section>
    );
}