import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { buatCsv, csvEscape, unduhBerkas } from '../lib/berkas.js';
import { PERAN_GURU_KELAS, muatDaftarRuangKelas, muatCatatanPresensiKelas, muatRosterPresensiKelas, muatSesiPresensiKelas } from '../services/learningClassrooms.js';
import { listClassroomJournals } from '../services/classroomJournals.js';
import {
  buatBarisLaporanAktivitas,
  filterRentangLaporan,
  kelompokkanLaporanBulanan,
} from '../services/classroomActivityReports.js';
import '../styles/classroom-activity-reports.css';

function tanggalHariIni() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function awalBulan() {
  return `${tanggalHariIni().slice(0, 7)}-01`;
}

function formatTanggal(value) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' })
    .format(new Date(`${value}T00:00:00`));
}

function formatBulan(value) {
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' })
    .format(new Date(`${value}-01T00:00:00`));
}

const LABEL_STATUS = {
  hadir: 'Hadir',
  izin: 'Izin',
  sakit: 'Sakit',
  alpa: 'Tanpa keterangan',
};

export default function ClassroomActivityReportPage() {
  const { user, role, activeRole, tenantId } = useAuth();
  const currentRole = activeRole || role;
  const canUse = PERAN_GURU_KELAS.includes(currentRole);
  const context = useMemo(() => ({
    userId: user?.uid,
    role,
    activeRole: currentRole,
    tenantId,
  }), [currentRole, role, tenantId, user?.uid]);
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('all');
  const [from, setFrom] = useState(awalBulan);
  const [to, setTo] = useState(tanggalHariIni);
  const [granularity, setGranularity] = useState('harian');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!canUse || !user?.uid || !tenantId) {
      setClasses([]);
      setRows([]);
      setError('Laporan ini hanya tersedia untuk guru dengan sekolah aktif.');
      setLoading(false);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      setError('Rentang tanggal tidak valid. Tanggal mulai harus sebelum atau sama dengan tanggal akhir.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const availableClasses = await muatDaftarRuangKelas(tenantId);
      const selectedClasses = selectedClassId === 'all'
        ? availableClasses
        : availableClasses.filter((room) => room.id === selectedClassId);
      const reports = await Promise.all(selectedClasses.map(async (room) => {
        const [journals, allSessions] = await Promise.all([
          listClassroomJournals(context, room.id),
          muatSesiPresensiKelas(room.id, tenantId),
        ]);
        const sessions = allSessions.filter((session) =>
          session.tanggal >= from && session.tanggal <= to);
        const [roster, attendance] = sessions.length
          ? await Promise.all([
            muatRosterPresensiKelas(room.id),
            muatCatatanPresensiKelas(sessions.map((session) => session.id)),
          ])
          : [[], []];
        return buatBarisLaporanAktivitas({
          room,
          journals: journals.filter((journal) => journal.lessonDate >= from && journal.lessonDate <= to),
          sessions,
          attendance,
          roster,
        });
      }));
      setClasses(availableClasses);
      setRows(reports.flat());
    } catch (cause) {
      console.error('[classroom-activity-report] Gagal memuat laporan aktivitas:', cause);
      setError(cause instanceof Error
        ? cause.message
        : 'Laporan gagal dimuat. Periksa koneksi dan izin kelas.');
      setRows([]);
      setClasses([]);
    } finally {
      setLoading(false);
    }
  }, [canUse, context, from, selectedClassId, tenantId, to, user?.uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    if (from > to || !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(to)) return [];
    return filterRentangLaporan(rows, from, to);
  }, [from, rows, to]);
  const displayRows = useMemo(() => granularity === 'bulanan'
    ? kelompokkanLaporanBulanan(filteredRows)
    : filteredRows, [filteredRows, granularity]);
  const summary = useMemo(() => filteredRows.reduce((total, row) => {
    total.hari += 1;
    total.jurnal += row.jurnal.length;
    if (row.presensi) {
      total.sesi += 1;
      total.hadir += row.presensi.hadir;
      total.izin += row.presensi.izin;
      total.sakit += row.presensi.sakit;
      total.alpa += row.presensi.alpa;
    }
    return total;
  }, { hari: 0, jurnal: 0, sesi: 0, hadir: 0, izin: 0, sakit: 0, alpa: 0 }), [filteredRows]);

  function exportCsv() {
    const header = [
      granularity === 'bulanan' ? 'Bulan' : 'Tanggal',
      'Kelas', 'Mata pelajaran', 'Jumlah jurnal', 'Topik jurnal',
      'Sesi presensi', 'Akumulasi roster saat ini per sesi', 'Catatan presensi',
      'Hadir', 'Izin', 'Sakit', 'Tanpa keterangan',
    ];
    const data = displayRows.map((row) => [
      granularity === 'bulanan' ? formatBulan(row.bulan) : formatTanggal(row.tanggal),
      row.classroomName,
      row.subject,
      granularity === 'bulanan' ? row.jumlahJurnal : row.jurnal.length,
      granularity === 'bulanan' ? row.topik.join('; ') : row.jurnal.map((journal) => journal.topik).join('; '),
      granularity === 'bulanan' ? row.jumlahSesiPresensi : Number(Boolean(row.presensi)),
      granularity === 'bulanan' ? row.jumlahSiswaTerdaftar : row.presensi?.jumlahSiswa || 0,
      granularity === 'bulanan' ? row.jumlahTercatat : row.presensi?.jumlahTercatat || 0,
      row.hadir ?? row.presensi?.hadir ?? 0,
      row.izin ?? row.presensi?.izin ?? 0,
      row.sakit ?? row.presensi?.sakit ?? 0,
      row.alpa ?? row.presensi?.alpa ?? 0,
    ]);
    unduhBerkas(
      'laporan-harian-bulanan.csv',
      buatCsv([header, ...data].map((line) => line.map((value) => csvEscape(value)))),
      'text/csv',
    );
  }

  return (
    <main className="classroom-activity-report">
      <header className="classroom-activity-hero">
        <p className="classroom-activity-kicker">Laporan dan Arsip · Ruang Kelas</p>
        <h1>Laporan Harian s.d. Bulanan</h1>
        <p>
          Ringkasan berbasis jurnal mengajar yang Anda tulis dan sesi presensi resmi
          dari kelas yang Anda ampu. Baris tanpa jurnal atau presensi tidak dibuat-buat.
        </p>
        <p className="classroom-activity-notice">
          Data sumber mengikuti batas akses kelas dan mencakup maksimal 100 jurnal serta
          100 sesi presensi terbaru per kelas. Ringkasan ini tidak mengganti rekap resmi
          sekolah di luar Ruang Kelas.
        </p>
        <nav className="classroom-activity-actions" aria-label="Modul kelas terkait">
          <a href="#/pelaksanaan/jurnal">Buka Jurnal Mengajar</a>
          <a href="#/ruang-kelas">Buka Ruang Kelas</a>
        </nav>
      </header>

      {error && <p className="classroom-activity-error" role="alert">{error}</p>}
      <section className="classroom-activity-panel" aria-label="Filter laporan">
        <div className="classroom-activity-filters">
          <label>
            Kelas
            <select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)}>
              <option value="all">Semua kelas yang diampu</option>
              {classes.map((room) => (
                <option value={room.id} key={room.id}>
                  {room.nama}{room.mapel ? ` · ${room.mapel}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tanggal mulai
            <input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>
            Tanggal akhir
            <input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} />
          </label>
          <label>
            Tampilan
            <select value={granularity} onChange={(event) => setGranularity(event.target.value)}>
              <option value="harian">Harian</option>
              <option value="bulanan">Bulanan</option>
            </select>
          </label>
        </div>
        <div className="classroom-activity-actions">
          <button type="button" className="secondary" onClick={() => void load()} disabled={loading}>
            {loading ? 'Memuat…' : 'Muat ulang'}
          </button>
          <button type="button" onClick={exportCsv} disabled={loading || displayRows.length === 0}>
            Ekspor CSV
          </button>
        </div>
      </section>

      <section className="classroom-activity-metrics" aria-label="Ringkasan periode">
        <article><span>Hari-kelas dengan data</span><strong>{summary.hari}</strong></article>
        <article><span>Jurnal mengajar</span><strong>{summary.jurnal}</strong></article>
        <article><span>Sesi presensi</span><strong>{summary.sesi}</strong></article>
        <article><span>Hadir</span><strong>{summary.hadir}</strong></article>
        <article><span>Izin / Sakit / Alpa</span><strong>{summary.izin} / {summary.sakit} / {summary.alpa}</strong></article>
      </section>

      {loading ? (
        <p className="classroom-activity-empty" role="status">Memuat jurnal dan presensi kelas…</p>
      ) : displayRows.length === 0 ? (
        <p className="classroom-activity-empty">Tidak ada jurnal atau sesi presensi pada rentang tanggal ini.</p>
      ) : (
        <section className="classroom-activity-panel">
          <div className="classroom-activity-table-wrap">
            <table>
              <thead><tr>
                <th>{granularity === 'bulanan' ? 'Bulan' : 'Tanggal'}</th>
                <th>Kelas / Mapel</th>
                <th>Jurnal mengajar</th>
                <th>Presensi</th>
              </tr></thead>
              <tbody>{displayRows.map((row) => (
                <tr key={row.id}>
                  <td>{granularity === 'bulanan' ? formatBulan(row.bulan) : formatTanggal(row.tanggal)}</td>
                  <td>{row.classroomName}{row.subject ? ` · ${row.subject}` : ''}</td>
                  <td>
                    {granularity === 'bulanan' ? (
                      <>
                        <strong>{row.jumlahJurnal} jurnal</strong>
                        {row.topik.length > 0 && <p>{row.topik.join('; ')}</p>}
                      </>
                    ) : row.jurnal.length ? row.jurnal.map((journal) => (
                      <div key={journal.id}>{journal.topik}</div>
                    )) : 'Tidak ada jurnal'}
                  </td>
                  <td>
                    {granularity === 'bulanan'
                      ? row.jumlahSesiPresensi
                        ? `${row.jumlahSesiPresensi} sesi · ${row.jumlahTercatat} catatan · Hadir ${row.hadir}, Izin ${row.izin}, Sakit ${row.sakit}, Alpa ${row.alpa}`
                        : 'Tidak ada sesi presensi'
                      : row.presensi
                        ? (
                          <>
                            <strong>{row.presensi.judul}</strong>
                            <p>{row.presensi.jumlahTercatat} catatan · roster saat ini {row.presensi.jumlahSiswa}</p>
                            <small>{Object.entries(LABEL_STATUS)
                              .map(([key, label]) => `${label}: ${row.presensi[key]}`).join(' · ')}</small>
                          </>
                        )
                        : 'Tidak ada sesi presensi'}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
