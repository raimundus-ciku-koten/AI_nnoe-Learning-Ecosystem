import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { muatHasilUjianGuru } from '../services/onlineAssessments.js';
import '../styles/online-assessments.css';

const PAGE_SIZE = 100;
const EMPTY_FILTERS = { search: '', className: '', from: '', to: '' };

function csvCell(value) {
  const text = String(value ?? '');
  const safeText = /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export function buatCsvLaporanPenilaian(results) {
  const rows = [
    ['Nama siswa', 'Kelas', 'Ujian', 'Waktu pengumpulan', 'PG benar', 'Total soal PG', 'Nilai akhir', 'Status penilaian'],
    ...results.map((row) => [
      row.student_name,
      row.kelas,
      row.title,
      row.submitted_at,
      row.objective_correct,
      row.objective_total,
      row.grade_pending ? '' : row.score ?? '',
      row.grade_pending ? 'Menunggu uraian' : 'Dinilai',
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}

export function filterHasilPenilaian(results, filters) {
  const search = filters.search.toLocaleLowerCase('id');
  return results.filter((row) => {
    const date = row.submitted_at.slice(0, 10);
    return (!filters.className || row.kelas === filters.className)
      && (!filters.from || date >= filters.from)
      && (!filters.to || date <= filters.to)
      && (!search || `${row.student_name} ${row.title}`.toLocaleLowerCase('id').includes(search));
  });
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Waktu tidak valid'
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function TeacherAssessmentReportPage() {
  const { role } = useAuth();
  const [results, setResults] = useState([]);
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterError, setFilterError] = useState('');

  useEffect(() => {
    let active = true;
    setResults([]);
    if (role !== 'guru') {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    setError('');
    muatHasilUjianGuru()
      .then((rows) => { if (active) setResults(rows); })
      .catch((loadError) => {
        console.error('[teacher-assessment-report] Gagal memuat hasil penilaian:', loadError);
        if (active) setError(loadError?.message || 'Hasil penilaian tidak dapat dimuat.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [role]);

  const filtered = useMemo(() => filterHasilPenilaian(results, filters), [filters, results]);
  const classes = useMemo(
    () => [...new Set(results.map((row) => row.kelas))].sort((a, b) => a.localeCompare(b, 'id')),
    [results],
  );
  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function applyFilters(event) {
    event.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) {
      setFilterError('Tanggal mulai tidak boleh melewati tanggal akhir.');
      return;
    }
    setFilterError('');
    setPage(0);
    setFilters({
      search: draft.search.trim(),
      className: draft.className,
      from: draft.from,
      to: draft.to,
    });
  }

  function downloadCsv() {
    if (!filtered.length) return;
    const blob = new Blob([buatCsvLaporanPenilaian(filtered)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `laporan-penilaian-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  if (role !== 'guru') {
    return (
      <section className="ale-exam-card" role="alert">
        <h1>Akses laporan penilaian tidak tersedia</h1>
        <p>Laporan ini hanya tersedia bagi akun guru yang diizinkan oleh layanan asesmen.</p>
      </section>
    );
  }

  return (
    <section className="ale-exam-card" aria-labelledby="teacher-assessment-report-title">
      <p className="ale-exam-kicker">Laporan dan arsip</p>
      <h1 id="teacher-assessment-report-title">Laporan Penilaian Ujian Online</h1>
      <p className="ale-exam-intro">
        Hanya hasil ujian yang dibuat oleh akun guru ini yang ditampilkan. Jawaban uraian yang
        belum dinilai tetap ditandai sebagai menunggu penilaian.
      </p>
      <p className="ale-exam-notice" role="note">
        Tabel menampilkan maksimal 100 baris per halaman. Layanan hasil yang tersedia saat ini
        belum memakai pagination server, sehingga ukuran data yang dimuat mengikuti jumlah hasil
        ujian pada akun ini. Ekspor mencakup semua hasil sesuai filter yang sudah dimuat.
      </p>
      {error && <p className="ale-exam-error" role="alert">{error}</p>}
      {filterError && <p className="ale-exam-error" role="alert">{filterError}</p>}
      <form className="ale-exam-form" onSubmit={applyFilters}>
        <label>Cari nama siswa atau ujian
          <input value={draft.search} maxLength={120}
            onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))} />
        </label>
        <label>Kelas
          <select value={draft.className}
            onChange={(event) => setDraft((current) => ({ ...current, className: event.target.value }))}>
            <option value="">Semua kelas</option>
            {classes.map((className) => <option key={className} value={className}>{className}</option>)}
          </select>
        </label>
        <label>Dari tanggal
          <input type="date" value={draft.from}
            onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))} />
        </label>
        <label>Sampai tanggal
          <input type="date" value={draft.to}
            onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))} />
        </label>
        <button className="ale-exam-primary" type="submit" disabled={loading}>Terapkan filter</button>
      </form>
      <button
        className="ale-exam-secondary"
        type="button"
        disabled={loading || filtered.length === 0}
        onClick={downloadCsv}
      >
        Unduh CSV ({filtered.length} hasil)
      </button>
      {loading && <p role="status">Memuat hasil penilaian…</p>}
      {!loading && !error && (
        <p role="status">
          Menampilkan {visible.length} dari {filtered.length} hasil yang sesuai; maksimal 100 hasil per halaman.
        </p>
      )}
      {!loading && !error && filtered.length === 0 && <p>Belum ada hasil yang sesuai dengan filter.</p>}
      {!loading && !error && visible.length > 0 && (
        <>
          <div className="ale-exam-results-wrap">
            <table className="ale-exam-results">
              <thead>
                <tr>
                  <th scope="col">Siswa</th>
                  <th scope="col">Kelas</th>
                  <th scope="col">Ujian</th>
                  <th scope="col">Dikumpulkan</th>
                  <th scope="col">Pilihan ganda</th>
                  <th scope="col">Nilai akhir</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.attempt_id}>
                    <td>{row.student_name}</td>
                    <td>{row.kelas}</td>
                    <td>{row.title}</td>
                    <td>{formatDate(row.submitted_at)}</td>
                    <td>{row.objective_total ? `${row.objective_correct}/${row.objective_total}` : '—'}</td>
                    <td>{row.grade_pending ? 'Menunggu uraian' : row.score ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pageCount > 1 && (
            <nav className="ale-exam-report-pagination" aria-label="Halaman hasil penilaian">
              <button type="button" className="ale-exam-secondary" disabled={page === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}>Sebelumnya</button>
              <span>Halaman {page + 1} dari {pageCount}</span>
              <button type="button" className="ale-exam-secondary" disabled={page + 1 >= pageCount}
                onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>Berikutnya</button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
