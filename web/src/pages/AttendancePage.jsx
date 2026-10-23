import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import Ikon from '../components/Ikon.jsx';
import { ATTENDANCE_PAGE_SIZE, muatLaporanPresensi } from '../services/attendanceReports.js';
import '../styles/attendance.css';

const PERAN_PENDIDIK = new Set([
  'admin_sekolah', 'operator', 'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler',
]);

const EMPTY_FILTERS = { date: '', className: '', search: '' };

function formatDate(value) {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime())
    ? 'Tanggal tidak valid'
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date);
}

function csvCell(value) {
  const text = String(value ?? '');
  const formulaSafe = /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${formulaSafe.replaceAll('"', '""')}"`;
}

export function buatCsvPresensi(records) {
  const rows = [
    ['Nama siswa', 'Kelas', 'Tanggal', 'Status', 'Waktu dicatat'],
    ...records.map((record) => [
      record.name,
      record.className,
      record.date,
      record.status,
      record.recordedAt,
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}

function AttendanceAccessDenied() {
  return (
    <section className="ale-kartu attendance-empty" role="alert">
      <Ikon nama="badge" />
      <h2>Akses presensi tidak tersedia</h2>
      <p>Presensi hanya dapat dibuka oleh pendidik dan pengelola sekolah.</p>
    </section>
  );
}

export default function AttendancePage({ reportMode = false }) {
  const { role } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [filterDraft, setFilterDraft] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [refreshKey, setRefreshKey] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const pageRequestId = useRef(0);

  useEffect(() => {
    pageRequestId.current += 1;
    if (!PERAN_PENDIDIK.has(role)) {
      setRecords([]);
      setLoading(false);
      setLoadingMore(false);
      setHasMore(false);
      return undefined;
    }

    setLoadingMore(false);
    let active = true;
    async function muat() {
      setLoading(true);
      setError('');
      try {
        const rows = await muatLaporanPresensi({ ...filters, limit: ATTENDANCE_PAGE_SIZE, offset: 0 });
        if (!active) return;
        setRecords(rows);
        setHasMore(rows.length === ATTENDANCE_PAGE_SIZE);
      } catch (err) {
        console.error('[presensi] Gagal memuat riwayat presensi:', err);
        if (active) setError(err?.message || 'Riwayat presensi tidak dapat dimuat.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void muat();
    return () => {
      active = false;
    };
  }, [filters, refreshKey, role]);

  const loadMore = useCallback(async () => {
    const requestId = ++pageRequestId.current;
    setLoadingMore(true);
    setError('');
    try {
      const rows = await muatLaporanPresensi({
        ...filters,
        limit: ATTENDANCE_PAGE_SIZE,
        offset: records.length,
      });
      if (requestId !== pageRequestId.current) return;
      setRecords((current) => [...current, ...rows]);
      setHasMore(rows.length === ATTENDANCE_PAGE_SIZE);
    } catch (loadError) {
      if (requestId !== pageRequestId.current) return;
      console.error('[presensi] Gagal memuat halaman presensi berikutnya:', loadError);
      setError(loadError?.message || 'Halaman presensi berikutnya tidak dapat dimuat.');
    } finally {
      if (requestId === pageRequestId.current) setLoadingMore(false);
    }
  }, [filters, records.length]);

  const applyFilters = (event) => {
    event.preventDefault();
    setRecords([]);
    setFilters({
      date: filterDraft.date,
      className: filterDraft.className.trim(),
      search: filterDraft.search.trim(),
    });
  };

  const downloadCsv = () => {
    if (!records.length) return;
    const blob = new Blob([buatCsvPresensi(records)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `laporan-kehadiran-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  if (!PERAN_PENDIDIK.has(role)) return <AttendanceAccessDenied />;

  return (
    <div className="attendance-page">
      <header className="attendance-header">
        <div>
          <p className="attendance-kicker"><Ikon nama="check" /> {reportMode ? 'Laporan akademik' : 'Pelaksanaan pembelajaran'}</p>
          <h1>{reportMode ? 'Laporan Kehadiran Akademik' : 'Presensi siswa'}</h1>
          <p>
            {reportMode
              ? 'Laporan ini mencakup data kehadiran yang diizinkan untuk akun dan sekolah aktif; nilai dan data akademik lain tidak termasuk.'
              : 'Riwayat presensi dibatasi otomatis oleh akun aktif, peran, tenant, dan roster yang diizinkan.'}
          </p>
        </div>
        <div className="attendance-header-actions">
          {reportMode && (
            <button
              className="attendance-reload"
              type="button"
              disabled={loading || records.length === 0}
              onClick={downloadCsv}
            >
              Unduh CSV ({records.length} baris)
            </button>
          )}
          <a className="attendance-cta" href="#/datadasar/barcode">
            <Ikon nama="qr" /> Buka kartu barcode
          </a>
          <button
            className="attendance-reload"
            type="button"
            disabled={loading}
            onClick={() => setRefreshKey((current) => current + 1)}
          >
            Muat ulang
          </button>
        </div>
      </header>

      <section className="attendance-summary" aria-label="Ringkasan presensi">
        <article className="ale-kartu attendance-stat">
          <span>Catatan dimuat</span>
          <strong>{loading ? '…' : records.length}</strong>
        </article>
        <article className="ale-kartu attendance-stat">
          <span>Siswa tercatat</span>
          <strong>{loading ? '…' : new Set(records.map((record) => record.studentId)).size}</strong>
        </article>
        <article className="ale-kartu attendance-stat">
          <span>Kelas tercatat</span>
          <strong>{loading ? '…' : new Set(records.map((record) => record.className)).size}</strong>
        </article>
      </section>

      <section className="ale-kartu attendance-panel" aria-labelledby="attendance-list-title">
        <div className="attendance-panel-heading">
          <div>
            <h2 id="attendance-list-title">{reportMode ? 'Rincian kehadiran' : 'Riwayat kehadiran'}</h2>
            <p>
              Admin/operator melihat tenant aktif; guru melihat siswa dalam roster miliknya.
              {reportMode && ' CSV hanya berisi baris yang telah dimuat pada halaman ini.'}
            </p>
          </div>
        </div>

        <form className="attendance-filters" onSubmit={applyFilters}>
          <label>
            Tanggal
            <input
              type="date"
              value={filterDraft.date}
              onChange={(event) => setFilterDraft((current) => ({ ...current, date: event.target.value }))}
            />
          </label>
          <label>
            Kelas
            <input
              type="text"
              maxLength={30}
              value={filterDraft.className}
              onChange={(event) => setFilterDraft((current) => ({ ...current, className: event.target.value }))}
              placeholder="Semua kelas, mis. 7A"
            />
          </label>
          <label className="attendance-search">
            Cari siswa
            <input
              type="search"
              maxLength={100}
              value={filterDraft.search}
              onChange={(event) => setFilterDraft((current) => ({ ...current, search: event.target.value }))}
              placeholder="Nama atau ID siswa"
            />
          </label>
          <button className="attendance-cta" type="submit" disabled={loading}>Terapkan filter</button>
        </form>

        {error && <p className="attendance-error" role="alert">{error}</p>}
        {loading && <p className="attendance-message" role="status">Memuat riwayat presensi…</p>}
        {!loading && !error && records.length === 0 && (
          <div className="attendance-empty">
            <Ikon nama="calendar" />
            <h3>{filters.date || filters.className || filters.search
              ? 'Tidak ada catatan yang cocok'
              : 'Belum ada presensi tercatat'}</h3>
            <p>{filters.date || filters.className || filters.search
              ? 'Ubah filter tanggal, kelas, atau pencarian.'
              : 'Belum ada catatan presensi yang dapat diakses untuk tenant atau roster ini.'}</p>
          </div>
        )}
        {!loading && !error && records.length > 0 && (
          <>
            <div className="attendance-table-wrap">
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th scope="col">Siswa</th><th scope="col">Kelas</th>
                    <th scope="col">Tanggal</th><th scope="col">Status</th><th scope="col">Waktu dicatat</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id}>
                      <td>{record.name}</td>
                      <td>{record.className}</td>
                      <td>{formatDate(record.date)}</td>
                      <td><span className="attendance-status">{record.status}</span></td>
                      <td>{formatDate(record.recordedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <button
                className="attendance-load-more"
                type="button"
                disabled={loadingMore}
                onClick={loadMore}
              >
                {loadingMore ? 'Memuat…' : 'Muat catatan berikutnya'}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
