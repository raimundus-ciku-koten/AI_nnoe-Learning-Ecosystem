import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import Ikon from '../components/Ikon.jsx';
import {
  muatJurnalMengajar,
  roleDapatMengelolaJurnal,
} from '../services/teacherJournals.js';
import '../styles/teacher-journal.css';

const EMPTY_FILTERS = { from: '', to: '', className: '', status: '' };

function csvCell(value) {
  const text = String(value ?? '');
  const safeText = /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export function buatCsvLaporanJurnal(entries) {
  const rows = [
    [
      'Tanggal', 'Kelas', 'Mata pelajaran', 'Topik', 'Tujuan pembelajaran',
      'Kegiatan', 'Refleksi', 'Tindak lanjut', 'Status',
    ],
    ...entries.map((entry) => [
      entry.date,
      entry.className,
      entry.subject,
      entry.topic,
      entry.learningObjective,
      entry.activities,
      entry.reflection,
      entry.followUp,
      entry.status,
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}

function tanggalTampil(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export default function TeacherJournalReportPage() {
  const { user, role, tenantId } = useAuth();
  const [entries, setEntries] = useState([]);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterError, setFilterError] = useState('');

  useEffect(() => {
    let active = true;
    setEntries([]);
    if (!roleDapatMengelolaJurnal(role) || !tenantId || !user?.uid) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    setError('');
    muatJurnalMengajar(tenantId, user.uid)
      .then((rows) => { if (active) setEntries(rows); })
      .catch((loadError) => {
        console.error('[teacher-journal-report] Gagal memuat laporan jurnal:', loadError);
        if (active) setError(loadError?.message || 'Laporan jurnal tidak dapat dimuat.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [role, tenantId, user?.uid]);

  const filteredEntries = useMemo(() => entries.filter((entry) =>
    (!filters.from || entry.date >= filters.from)
    && (!filters.to || entry.date <= filters.to)
    && (!filters.className || entry.className === filters.className)
    && (!filters.status || entry.status === filters.status)), [entries, filters]);
  const classes = useMemo(
    () => [...new Set(entries.map((entry) => entry.className))].sort((a, b) => a.localeCompare(b, 'id')),
    [entries],
  );

  function applyFilters(event) {
    event.preventDefault();
    if (draftFilters.from && draftFilters.to && draftFilters.from > draftFilters.to) {
      setFilterError('Tanggal mulai tidak boleh melewati tanggal akhir.');
      return;
    }
    setFilterError('');
    setFilters({ ...draftFilters, className: draftFilters.className.trim() });
  }

  function downloadCsv() {
    if (!filteredEntries.length) return;
    const blob = new Blob([buatCsvLaporanJurnal(filteredEntries)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `laporan-jurnal-mengajar-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  if (!roleDapatMengelolaJurnal(role)) {
    return (
      <section className="ale-kartu teacher-journal-denied" role="alert">
        <h1>Akses laporan jurnal tidak tersedia</h1>
        <p>Laporan ini hanya tersedia bagi akun guru.</p>
      </section>
    );
  }
  if (!tenantId || !user?.uid) {
    return (
      <section className="ale-kartu teacher-journal-denied" role="alert">
        <h1>Sekolah aktif belum tersedia</h1>
        <p>Akun guru belum terhubung ke sekolah aktif.</p>
      </section>
    );
  }

  return (
    <main className="teacher-journal teacher-journal-report">
      <header className="teacher-journal-header">
        <div>
          <p className="teacher-journal-kicker"><Ikon nama="file" /> Laporan dan arsip pribadi</p>
          <h1>Laporan Jurnal Mengajar</h1>
          <p>Tinjau dan ekspor jurnal pembelajaran milik akun Anda.</p>
        </div>
        <a href="#/pelaksanaan/jurnal">Buka jurnal mengajar</a>
      </header>

      <aside className="teacher-journal-privacy" role="note">
        <Ikon nama="shield" />
        <p>
          Laporan hanya membaca jurnal pribadi pada tenant aktif. Untuk menjaga beban dan batas
          respons, daftar memuat maksimal 200 jurnal terbaru; filter dan ekspor berlaku hanya
          pada daftar yang ditampilkan.
        </p>
      </aside>

      {error && <p className="teacher-journal-error" role="alert">{error}</p>}
      {filterError && <p className="teacher-journal-error" role="alert">{filterError}</p>}
      <section className="ale-kartu teacher-journal-report-card" aria-labelledby="teacher-journal-report-title">
        <div className="teacher-journal-report-heading">
          <div>
            <p className="teacher-journal-eyebrow">Ringkasan jurnal yang dimuat</p>
            <h2 id="teacher-journal-report-title">{loading ? 'Memuat laporan…' : `${filteredEntries.length} jurnal`}</h2>
          </div>
          <button type="button" disabled={loading || filteredEntries.length === 0} onClick={downloadCsv}>
            Unduh CSV
          </button>
        </div>
        <form className="teacher-journal-report-filters" onSubmit={applyFilters}>
          <label>Dari tanggal
            <input type="date" value={draftFilters.from}
              onChange={(event) => setDraftFilters((current) => ({ ...current, from: event.target.value }))} />
          </label>
          <label>Sampai tanggal
            <input type="date" value={draftFilters.to}
              onChange={(event) => setDraftFilters((current) => ({ ...current, to: event.target.value }))} />
          </label>
          <label>Kelas
            <select value={draftFilters.className}
              onChange={(event) => setDraftFilters((current) => ({ ...current, className: event.target.value }))}>
              <option value="">Semua kelas yang dimuat</option>
              {classes.map((className) => <option key={className} value={className}>{className}</option>)}
            </select>
          </label>
          <label>Status
            <select value={draftFilters.status}
              onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="">Semua status</option>
              <option value="draf">Draf</option>
              <option value="selesai">Selesai</option>
            </select>
          </label>
          <button type="submit" disabled={loading}>Terapkan filter</button>
        </form>
        {loading && <p role="status">Memuat jurnal pribadi…</p>}
        {!loading && !error && filteredEntries.length === 0 && (
          <p role="status">Tidak ada jurnal yang sesuai dengan filter ini.</p>
        )}
        {!loading && !error && filteredEntries.length > 0 && (
          <div className="teacher-journal-report-table-wrap">
            <table className="teacher-journal-report-table">
              <thead>
                <tr>
                  <th scope="col">Tanggal</th>
                  <th scope="col">Kelas dan mapel</th>
                  <th scope="col">Topik dan kegiatan</th>
                  <th scope="col">Refleksi dan tindak lanjut</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{tanggalTampil(entry.date)}</td>
                    <td>{entry.className}<br />{entry.subject}</td>
                    <td><strong>{entry.topic}</strong><p>{entry.activities}</p></td>
                    <td>
                      <p>{entry.reflection || 'Tidak ada refleksi.'}</p>
                      <p><strong>Tindak lanjut:</strong> {entry.followUp || 'Tidak ada.'}</p>
                    </td>
                    <td>{entry.status === 'selesai' ? 'Selesai' : 'Draf'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
