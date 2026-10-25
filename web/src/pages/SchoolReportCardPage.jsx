import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { isSchoolAdminRole } from '../services/roleAccess.js';
import { buatCsv, csvEscape, unduhBerkas } from '../lib/berkas.js';
import { muatPengaturanTenant } from '../services/tenantSettings.js';
import {
  PERAN_GURU_KELAS,
  muatDaftarRuangKelas,
  muatRosterPresensiKelas,
} from '../services/learningClassrooms.js';
import {
  bukaKembaliPortofolioRapor,
  bukaKembaliRapor,
  muatDaftarRapor,
  muatPortofolioRapor,
  simpanPortofolioRapor,
  simpanDrafRapor,
  terbitkanPortofolioRapor,
  terbitkanRapor,
} from '../services/schoolReportCards.js';
import '../styles/school-report-cards.css';

const SEMESTER_LABEL = { ganjil: 'Ganjil', genap: 'Genap' };
const DIMENSI_PROFIL = [
  { key: 'faith', label: 'Keimanan dan ketakwaan terhadap Tuhan YME' },
  { key: 'citizenship', label: 'Kewargaan' },
  { key: 'criticalReasoning', label: 'Penalaran kritis' },
  { key: 'creativity', label: 'Kreativitas' },
  { key: 'collaboration', label: 'Kolaborasi' },
  { key: 'independence', label: 'Kemandirian' },
  { key: 'health', label: 'Kesehatan' },
  { key: 'communication', label: 'Komunikasi' },
];
const PRESENSI = [
  { key: 'attendance_present', label: 'Hadir' },
  { key: 'attendance_excused', label: 'Izin' },
  { key: 'attendance_sick', label: 'Sakit' },
  { key: 'attendance_absent', label: 'Alpa' },
];

function draftPortofolio(portfolio) {
  return portfolio || {
    presensi: Object.fromEntries(PRESENSI.map(({ key }) => [key, null])),
    kokurikuler: '',
    perkembanganAnak: '',
    dimensiProfil: Object.fromEntries(DIMENSI_PROFIL.map(({ key }) => [key, ''])),
    ekstrakurikuler: '',
    prestasi: '',
    catatanWaliKelas: '',
  };
}

export default function SchoolReportCardPage() {
  const { user, role, activeRole, tenantId } = useAuth();
  const { pathname } = useLocation();
  const currentRole = activeRole || role;
  const isTeacher = PERAN_GURU_KELAS.includes(currentRole);
  const isSchoolAdmin = isSchoolAdminRole(currentRole);
  const isStudent = currentRole === 'siswa';
  const mode = isSchoolAdmin ? 'review' : isStudent ? 'student' : 'teacher';
  const [school, setSchool] = useState(null);
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [roster, setRoster] = useState([]);
  const [reports, setReports] = useState([]);
  const [portfolios, setPortfolios] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [portfolioDrafts, setPortfolioDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [printId, setPrintId] = useState('');
  const [periodFilter, setPeriodFilter] = useState('active');
  const [isSaving, setIsSaving] = useState(false);
  const jenjang = school?.jenjang || '';
  const isTk = jenjang === 'tk';

  const context = useMemo(() => ({
    userId: user?.uid,
    role,
    activeRole: currentRole,
    tenantId,
  }), [currentRole, role, tenantId, user?.uid]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!user?.uid || !tenantId ||
          !(isTeacher || isSchoolAdmin || isStudent)) {
        throw new Error('Rapor hanya tersedia untuk guru, siswa, dan admin sekolah aktif.');
      }
      const [schoolSettings, availableClasses, portfolioRows] = await Promise.all([
        muatPengaturanTenant(tenantId),
        muatDaftarRuangKelas(tenantId),
        muatPortofolioRapor(context),
      ]);
      setSchool(schoolSettings);
      setClasses(availableClasses);
      setPortfolios(portfolioRows);
      if (isStudent) {
        setReports(await muatDaftarRapor(context));
        setRoster([]);
        return;
      }
      const nextClassId = availableClasses.some((room) => room.id === selectedClassId)
        ? selectedClassId
        : availableClasses[0]?.id || '';
      setSelectedClassId(nextClassId);
      if (isSchoolAdmin) {
        const reportsByClass = await Promise.all(
          availableClasses.map((room) => muatDaftarRapor(context, room.id)),
        );
        setReports(reportsByClass.flat());
        setRoster([]);
      } else if (isTeacher && nextClassId) {
        const [classRoster, classReports] = await Promise.all([
          muatRosterPresensiKelas(nextClassId),
          muatDaftarRapor(context, nextClassId),
        ]);
        setRoster(classRoster);
        setReports(classReports);
      } else {
        setReports([]);
        setPortfolios([]);
        setRoster([]);
      }
    } catch (cause) {
      console.error('[school-report-cards] Gagal memuat rapor:', cause);
      setError(cause instanceof Error
        ? cause.message
        : 'Rapor gagal dimuat. Periksa koneksi, konfigurasi periode, dan izin akun.');
      setReports([]);
      setRoster([]);
    } finally {
      setLoading(false);
    }
  }, [context, isSchoolAdmin, isStudent, isTeacher, selectedClassId, tenantId, user?.uid]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const roomById = useMemo(
    () => new Map(classes.map((room) => [room.id, room])),
    [classes],
  );
  const currentYear = school?.tahunAjaran || '';
  const currentSemester = ['ganjil', 'genap'].includes(school?.semester?.toLowerCase())
    ? school.semester.toLowerCase()
    : '';
  const isPeriodConfigured = Boolean(currentYear && currentSemester);
  const selectedRoom = roomById.get(selectedClassId);
  const classroomMatchesPeriod = Boolean(selectedRoom && selectedRoom.tahunAjaran === currentYear);
  const reportByStudent = useMemo(
    () => new Map(reports
      .filter((report) => report.tahunAjaran === currentYear && report.semester === currentSemester)
      .map((report) => [report.studentId, report])),
    [currentSemester, currentYear, reports],
  );
  const activeReports = reports.filter((report) =>
    report.tahunAjaran === currentYear && report.semester === currentSemester);
  const portfolioByStudent = useMemo(
    () => new Map(portfolios
      .filter((portfolio) => portfolio.tahunAjaran === currentYear &&
        portfolio.semester === currentSemester)
      .map((portfolio) => [portfolio.studentId, portfolio])),
    [currentSemester, currentYear, portfolios],
  );
  const reportPeriods = [...new Set([
    ...reports.map((report) => `${report.tahunAjaran}|${report.semester}`),
    ...portfolios.map((portfolio) => `${portfolio.tahunAjaran}|${portfolio.semester}`),
  ])].sort((left, right) => right.localeCompare(left));
  const reportsForPeriod = isSchoolAdmin && periodFilter !== 'active'
    ? reports.filter((report) => `${report.tahunAjaran}|${report.semester}` === periodFilter)
    : activeReports;
  const reportsForExport = isStudent
    ? reports.filter((report) => report.status === 'published')
    : reportsForPeriod;
  const pendingReports = reportsForPeriod.filter((report) => report.status === 'draft');
  const publishedReports = isStudent
    ? reports.filter((report) => report.status === 'published')
    : reportsForPeriod.filter((report) => report.status === 'published');
  const portfoliosForPeriod = isStudent
    ? portfolios.filter((portfolio) => portfolio.status === 'published')
    : isSchoolAdmin && periodFilter !== 'active'
      ? portfolios.filter((portfolio) =>
        `${portfolio.tahunAjaran}|${portfolio.semester}` === periodFilter)
      : portfolios.filter((portfolio) =>
        portfolio.tahunAjaran === currentYear && portfolio.semester === currentSemester);
  const pendingPortfolios = portfoliosForPeriod.filter((portfolio) => portfolio.status === 'draft');
  const publishedPortfolios = portfoliosForPeriod.filter((portfolio) => portfolio.status === 'published');
  const title = pathname === '/admin/akademik/rapor'
    ? 'Pengesahan Rapor Sekolah'
    : mode === 'student'
      ? 'Rapor Resmi Saya'
      : 'Nilai & Capaian Rapor';

  async function saveDraft(event, student) {
    event.preventDefault();
    if (!selectedClassId) return;
    const value = drafts[student.id] || {};
    setIsSaving(true);
    setError('');
    try {
      await simpanDrafRapor(
        context,
        selectedClassId,
        student.id,
        value.nilai,
        value.capaian || '',
      );
      const classReports = await muatDaftarRapor(context, selectedClassId);
      setReports(classReports);
      setDrafts((current) => ({ ...current, [student.id]: undefined }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Draf rapor gagal disimpan.');
    } finally {
      setIsSaving(false);
    }
  }

  async function savePortfolio(student) {
    if (!selectedClassId) return;
    setBusyId(`portfolio:${student.id}`);
    setError('');
    try {
      const portfolio = portfolioDrafts[student.id] ||
        draftPortofolio(portfolioByStudent.get(student.id));
      if (isTk && !portfolio.perkembanganAnak.trim()) {
        throw new Error('Narasi perkembangan anak wajib diisi untuk rapor TK.');
      }
      await simpanPortofolioRapor(context, selectedClassId, student.id, portfolio);
      setPortfolios(await muatPortofolioRapor(context));
      setPortfolioDrafts((current) => ({ ...current, [student.id]: undefined }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Portofolio rapor gagal disimpan.');
    } finally {
      setBusyId('');
    }
  }

  function updatePortfolioField(studentId, key, value) {
    const existing = portfolioDrafts[studentId] ||
      draftPortofolio(portfolioByStudent.get(studentId));
    const [group, field] = key.split('.');
    const updated = group === 'presensi' || group === 'dimensiProfil'
      ? { ...existing, [group]: { ...existing[group], [field]: value } }
      : { ...existing, [group]: value };
    setPortfolioDrafts((current) => ({ ...current, [studentId]: updated }));
  }

  async function publish(report) {
    setBusyId(report.id);
    setError('');
    try {
      await terbitkanRapor(context, report.id);
      setReports((current) => current.map((item) =>
        item.id === report.id
          ? { ...item, status: 'published', diterbitkan: new Date().toISOString() }
          : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Penerbitan rapor gagal.');
    } finally {
      setBusyId('');
    }
  }

  async function publishPortfolio(portfolio) {
    setBusyId(portfolio.id);
    setError('');
    try {
      await terbitkanPortofolioRapor(context, portfolio.id);
      setPortfolios((current) => current.map((item) =>
        item.id === portfolio.id
          ? { ...item, status: 'published', diterbitkan: new Date().toISOString() }
          : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Penerbitan portofolio rapor gagal.');
    } finally {
      setBusyId('');
    }
  }

  async function reopenPortfolio(portfolio) {
    const reason = window.prompt('Masukkan alasan pembukaan kembali portofolio rapor (minimal 10 karakter).');
    if (reason === null) return;
    setBusyId(portfolio.id);
    setError('');
    try {
      await bukaKembaliPortofolioRapor(context, portfolio.id, reason);
      setPortfolios((current) => current.map((item) =>
        item.id === portfolio.id
          ? { ...item, status: 'draft', diterbitkan: null, diterbitkanOleh: null }
          : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Portofolio rapor gagal dibuka kembali.');
    } finally {
      setBusyId('');
    }
  }

  async function reopen(report) {
    const reason = window.prompt('Masukkan alasan pembukaan kembali rapor (minimal 10 karakter).');
    if (reason === null) return;
    setBusyId(report.id);
    setError('');
    try {
      await bukaKembaliRapor(context, report.id, reason);
      setReports((current) => current.map((item) =>
        item.id === report.id
          ? { ...item, status: 'draft', diterbitkan: null, diterbitkanOleh: null }
          : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Rapor gagal dibuka kembali.');
    } finally {
      setBusyId('');
    }
  }

  function printReport(report) {
    setPrintId(report.id);
    window.setTimeout(() => window.print(), 0);
  }

  function exportReports() {
    const rows = [
      ['Nama siswa', 'Kelas', 'Mata pelajaran', 'Tahun ajaran', 'Semester', 'Nilai akhir', 'Capaian', 'Status'],
      ...reportsForExport.map((report) => {
        const room = roomById.get(report.classroomId);
        return [
          report.namaSiswa,
          room?.nama || '',
          room?.mapel || '',
          report.tahunAjaran,
          SEMESTER_LABEL[report.semester],
          report.nilai,
          report.capaian,
          report.status === 'published' ? 'Terbit' : 'Draf',
        ];
      }),
    ];
    unduhBerkas(
      'rapor-sekolah.csv',
      buatCsv(rows.map((row) => row.map((cell) => csvEscape(cell)))),
      'text/csv',
    );
  }

  function renderPortfolioDocument(portfolio, selected = false) {
    const subjectReports = reports
      .filter((report) => report.studentId === portfolio.studentId &&
        report.tahunAjaran === portfolio.tahunAjaran &&
        report.semester === portfolio.semester &&
        report.status === 'published')
      .sort((left, right) => (roomById.get(left.classroomId)?.mapel || '')
        .localeCompare(roomById.get(right.classroomId)?.mapel || '', 'id'));
    const attendanceValues = PRESENSI
      .map(({ key, label }) => ({ label, value: portfolio.presensi[key] }))
      .filter(({ value }) => value !== null);
    const dimensions = DIMENSI_PROFIL
      .map(({ key, label }) => ({ label, value: portfolio.dimensiProfil[key] }))
      .filter(({ value }) => value.trim());
    const classNames = [...new Set(subjectReports.map((report) =>
      roomById.get(report.classroomId)?.nama).filter(Boolean))];
    const reportLevel = portfolio.jenjang || jenjang;
    const isTkReport = reportLevel === 'tk';
    const levelLabel = ({ tk: 'TK / PAUD', sd: 'SD', smp: 'SMP', sma: 'SMA' })[reportLevel] || 'Belum ditetapkan';
    return (
      <article
        className={`school-report-document${selected ? ' print-selected' : ''}`}
        key={portfolio.id}
      >
        <header>
          <p>{school?.nama || 'Sekolah'}</p>
          {school?.alamat && <p>{school.alamat}</p>}
          {school?.npsn && <small>NPSN {school.npsn}</small>}
          <h2>{isTkReport ? 'Laporan Perkembangan Anak' : `Rapor Hasil Belajar ${levelLabel}`}</h2>
          <p>Jenjang {levelLabel}</p>
          <p>{portfolio.tahunAjaran} · Semester {SEMESTER_LABEL[portfolio.semester]}</p>
        </header>
        <dl>
          <div><dt>Nama peserta didik</dt><dd>{portfolio.namaSiswa}</dd></div>
          <div><dt>NISN</dt><dd>{portfolio.nisn || 'Belum tertaut ke data induk siswa'}</dd></div>
          {portfolio.jenisKelamin && (
            <div><dt>Jenis kelamin</dt><dd>{portfolio.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan'}</dd></div>
          )}
          <div><dt>Kelas</dt><dd>{classNames.join(', ') || '—'}</dd></div>
          <div><dt>Satuan pendidikan</dt><dd>{school?.nama || '—'}</dd></div>
          {school?.alamat && <div><dt>Alamat satuan pendidikan</dt><dd>{school.alamat}</dd></div>}
        </dl>
        {!isTkReport && <section>
          <h3>Capaian intrakurikuler</h3>
          {subjectReports.length ? (
            <div className="school-report-table-wrap">
              <table>
                <thead><tr><th>Mata pelajaran</th><th>Nilai akhir</th><th>Deskripsi capaian pembelajaran</th></tr></thead>
                <tbody>{subjectReports.map((report) => (
                  <tr key={report.id}>
                    <td>{roomById.get(report.classroomId)?.mapel || 'Mata pelajaran'}</td>
                    <td>{report.nilai}</td>
                    <td>{report.capaian || '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p>Belum ada capaian intrakurikuler yang diterbitkan.</p>}
        </section>}
        {isTkReport && (
          <section>
            <h3>Perkembangan anak · narasi berbasis observasi</h3>
            <p>{portfolio.perkembanganAnak || 'Belum ada catatan perkembangan yang diterbitkan.'}</p>
          </section>
        )}
        <section>
          <h3>Kokurikuler dan pembelajaran mendalam</h3>
          <p>{portfolio.kokurikuler || 'Belum ada deskripsi kokurikuler yang dicatat.'}</p>
          {!isTkReport && <p className="school-report-helper">
            Umpan balik memperhatikan bukti belajar dan dimensi profil lulusan; pengalaman belajar
            dapat mencakup memahami, mengaplikasi, dan merefleksi. Prinsip pembelajaran: berkesadaran,
            bermakna, dan menggembirakan.
          </p>}
          {!isTkReport && <h4>Dimensi profil lulusan</h4>}
          {!isTkReport && dimensions.length ? (
            <dl>{dimensions.map(({ label, value }) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}</dl>
          ) : !isTkReport && <p>Belum ada deskripsi dimensi profil lulusan.</p>}
        </section>
        <section>
          <h3>Presensi</h3>
          {attendanceValues.length ? (
            <dl>{attendanceValues.map(({ label, value }) => (
              <div key={label}><dt>{label}</dt><dd>{value} hari</dd></div>
            ))}</dl>
          ) : <p>Data presensi belum dicatat.</p>}
        </section>
        <section><h3>Ekstrakurikuler</h3><p>{portfolio.ekstrakurikuler || '—'}</p></section>
        <section><h3>Prestasi dan penghargaan</h3><p>{portfolio.prestasi || '—'}</p></section>
        <section><h3>Catatan guru / wali kelas</h3><p>{portfolio.catatanWaliKelas || '—'}</p></section>
        {school?.kepalaSekolah && (
          <footer><span>{school.kepalaSekolah}</span><small>Kepala Sekolah</small></footer>
        )}
        <button type="button" className="screen-only" onClick={() => printReport(portfolio)}>
          Cetak rapor lengkap
        </button>
      </article>
    );
  }

  return (
    <main className="school-report-cards">
      <header className="school-report-hero">
        <p className="school-report-kicker">Dokumen Akademik · {school?.nama || 'Sekolah'}</p>
        <h1>{title}</h1>
        <p>
          Periode aktif: <strong>{currentYear || 'Belum diatur'}</strong>
          {' · '}Semester <strong>{SEMESTER_LABEL[currentSemester] || 'Belum diatur'}</strong>
          {' · '}jenjang {({ tk: 'TK / PAUD', sd: 'SD', smp: 'SMP', sma: 'SMA' })[jenjang] || 'belum ditetapkan'}.
        </p>
        <p className="school-report-notice">
          {isTk
            ? 'Rapor TK menggunakan narasi perkembangan anak berbasis observasi; guru tidak memasukkan nilai mata pelajaran 0–100.'
            : 'Rapor jenjang SD, SMP, dan SMA menampilkan nilai akhir per mata pelajaran serta deskripsi capaian; Dimensi profil lulusan dicatat secara deskriptif dan nilai tidak dihitung otomatis dari tugas/kuis.'}
          {' '}Portofolio memuat bagian kokurikuler, presensi terverifikasi, ekstrakurikuler, prestasi, dan catatan guru.
          {jenjang === 'sma' && ' Susunan SMA diarahkan agar selaras secara struktural dengan e-Rapor SMA 2025.1, tetapi belum merupakan template resmi atau integrasi Dapodik.'}
          {' '}Admin sekolah mengesahkan dan menerbitkan.
        </p>
        {!jenjang && (
          <p className="school-report-empty" role="status">
            Jenjang belum ditetapkan pada Data Dasar. Rapor lama tetap dapat dibaca; pilih jenjang untuk menggunakan susunan rapor yang sesuai.
          </p>
        )}
        <p className="school-report-reference">
          Acuan kebijakan dan pembanding: {' '}
          <a href="https://sma.kemendikdasmen.go.id/erapor" target="_blank" rel="noreferrer">
            e-Rapor SMA 2025.1
          </a>
          {' · '}
          <a
            href="https://peraturan.bpk.go.id/Details/322506/permendikdasmen-no-13-tahun-2025"
            target="_blank"
            rel="noreferrer"
          >
            Permendikdasmen 13/2025
          </a>
          {' · '}
          <a
            href="https://kurikulum.kemendikdasmen.go.id/pembelajaran-mendalam"
            target="_blank"
            rel="noreferrer"
          >
            Panduan Pembelajaran Mendalam
          </a>
          . Modul ini bukan aplikasi e-Rapor resmi atau integrasi Dapodik.
        </p>
        {school && (school.npsn || school.kepalaSekolah) && (
          <p className="school-report-school-meta">
            {school.npsn && <>NPSN: {school.npsn} · </>}
            {school.kepalaSekolah && <>Kepala sekolah: {school.kepalaSekolah}</>}
          </p>
        )}
      </header>

      {error && <p className="school-report-error" role="alert">{error}</p>}
      <div className="school-report-toolbar">
        {mode === 'teacher' && (
          <label>
            Kelas yang diampu
            <select
              value={selectedClassId}
              onChange={(event) => setSelectedClassId(event.target.value)}
              disabled={loading}
            >
              {classes.map((room) => (
                <option value={room.id} key={room.id}>
                  {room.nama}{room.mapel ? ` · ${room.mapel}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        {isSchoolAdmin && (
          <label>
            Periode rapor
            <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)}>
              <option value="active">
                Periode aktif · {currentYear || 'belum diatur'} · {SEMESTER_LABEL[currentSemester] || 'belum diatur'}
              </option>
              {reportPeriods.map((period) => {
                const [year, semester] = period.split('|');
                return (
                  <option value={period} key={period}>
                    {year} · Semester {SEMESTER_LABEL[semester]}
                  </option>
                );
              })}
            </select>
          </label>
        )}
        <div className="school-report-actions">
          <button type="button" className="secondary" onClick={() => void loadAll()} disabled={loading}>
            {loading ? 'Memuat…' : 'Muat ulang'}
          </button>
          {(isSchoolAdmin || isStudent) && (
            <button type="button" onClick={exportReports} disabled={loading || reportsForExport.length === 0}>
              Ekspor CSV
            </button>
          )}
        </div>
      </div>

      {!isPeriodConfigured && !loading && (
        <p className="school-report-empty" role="status">
          Admin sekolah perlu menetapkan Tahun Ajaran &amp; Semester di Data Dasar sebelum rapor dapat dibuat.
        </p>
      )}
      {loading ? (
        <p className="school-report-empty" role="status">Memuat data rapor…</p>
      ) : mode === 'teacher' ? (
        <section className="school-report-panel">
          <h2>{isTk ? 'Catat perkembangan anak' : 'Entri nilai akhir per siswa'}</h2>
          <p className="school-report-helper">
            {isTk
              ? 'Tuliskan perkembangan yang teramati berdasarkan bukti belajar. Tidak ada skor angka wajib.'
              : 'Simpan sebagai draf. Nilai yang diterbitkan tidak dapat diubah guru sampai admin sekolah membuka kembali rapor.'}
          </p>
          {roster.length ? (
            <>
              {!classroomMatchesPeriod && (
                <p className="school-report-empty" role="status">
                  Tahun ajaran kelas yang dipilih tidak sama dengan siklus akademik aktif.
                  Perbarui konfigurasi kelas atau pilih kelas pada tahun ajaran {currentYear || 'aktif'}.
                </p>
              )}
              <div className="school-report-student-grid">
                {roster.map((student) => {
                const report = reportByStudent.get(student.id);
                const draft = drafts[student.id] || {
                  nilai: report?.nilai ?? '',
                  capaian: report?.capaian ?? '',
                };
                const portfolio = portfolioByStudent.get(student.id);
                const portfolioDraft = portfolioDrafts[student.id] || draftPortofolio(portfolio);
                const locked = report?.status === 'published';
                const portfolioLocked = portfolio?.status === 'published';
                return (
                  <form
                    className="school-report-student-form"
                    key={student.id}
                    onSubmit={(event) => {
                      if (isTk) event.preventDefault();
                      else void saveDraft(event, student);
                    }}
                  >
                    <div className="school-report-student-heading">
                      <div>
                        <h3>{student.nama}</h3>
                        <p>{isTk
                          ? portfolio?.status === 'published' ? 'Sudah diterbitkan' : portfolio ? 'Draf tersimpan' : 'Belum diisi'
                          : report?.status === 'published' ? 'Sudah diterbitkan' : report ? 'Draf tersimpan' : 'Belum diisi'}</p>
                      </div>
                      {report?.status === 'published' && <span className="school-report-badge published">Terbit</span>}
                    </div>
                    {!isTk && <label>
                      Nilai akhir (0–100)
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        required
                        value={draft.nilai}
                        disabled={locked || isSaving || !classroomMatchesPeriod || !isPeriodConfigured}
                        onChange={(event) => setDrafts((current) => ({
                          ...current,
                          [student.id]: { ...draft, nilai: event.target.value },
                        }))}
                      />
                    </label>}
                    {!isTk && <label>
                      Deskripsi capaian pembelajaran
                      <textarea
                        rows="3"
                        maxLength="3000"
                        value={draft.capaian}
                        disabled={locked || isSaving || !classroomMatchesPeriod || !isPeriodConfigured}
                        onChange={(event) => setDrafts((current) => ({
                          ...current,
                          [student.id]: { ...draft, capaian: event.target.value },
                        }))}
                        placeholder="Tuliskan capaian dan area pengembangan yang relevan."
                      />
                    </label>}
                    <details className="school-report-portfolio-editor" open={isTk}>
                      <summary>
                        {isTk ? 'Perkembangan semester' : 'Rapor semester'} · {portfolio?.status === 'published' ? 'Terbit' : portfolio ? 'Draf tersimpan' : 'Lengkapi'}
                      </summary>
                      <p className="school-report-helper">
                        Masukkan data yang telah diverifikasi. Kosongkan presensi bila rekap resmi belum tersedia;
                        jangan mengisi angka perkiraan.
                      </p>
                      {isTk && <label>
                        Narasi perkembangan anak
                        <textarea
                          rows="5"
                          maxLength="5000"
                          required
                          value={portfolioDraft.perkembanganAnak}
                          disabled={portfolioLocked || busyId === `portfolio:${student.id}`}
                          onChange={(event) => updatePortfolioField(student.id, 'perkembanganAnak', event.target.value)}
                          placeholder="Ceritakan kemajuan, minat, kekuatan, dan dukungan lanjutan berdasarkan observasi selama semester."
                        />
                      </label>}
                      {!isTk && <fieldset>
                        <legend>Presensi resmi semester</legend>
                        <div className="school-report-attendance-fields">
                          {PRESENSI.map(({ key, label }) => (
                            <label key={key}>
                              {label}
                              <input
                                type="number"
                                min="0"
                                max="366"
                                step="1"
                                value={portfolioDraft.presensi[key] ?? ''}
                                disabled={portfolioLocked || busyId === `portfolio:${student.id}`}
                                onChange={(event) => updatePortfolioField(student.id, `presensi.${key}`, event.target.value)}
                              />
                            </label>
                          ))}
                        </div>
                      </fieldset>}
                      <label>
                        Kokurikuler · kegiatan, pengalaman, bukti belajar, dan perkembangan
                        <textarea
                          rows="4"
                          maxLength="5000"
                          value={portfolioDraft.kokurikuler}
                          disabled={portfolioLocked || busyId === `portfolio:${student.id}`}
                          onChange={(event) => updatePortfolioField(student.id, 'kokurikuler', event.target.value)}
                          placeholder="Tuliskan program/kegiatan kokurikuler, peran dan bukti kontribusi siswa, serta refleksi atau kemajuan yang teramati."
                        />
                      </label>
                      {!isTk && <fieldset>
                        <legend>Dimensi profil lulusan · deskripsi berbasis bukti</legend>
                        <p className="school-report-helper">
                          Catat hanya dimensi yang teramati dan relevan. Ini bukan daftar skor wajib.
                        </p>
                        <div className="school-report-dimension-grid">
                          {DIMENSI_PROFIL.map(({ key, label }) => (
                            <label key={key}>
                              {label}
                              <textarea
                                rows="2"
                                maxLength="1000"
                                value={portfolioDraft.dimensiProfil[key] || ''}
                                disabled={portfolioLocked || busyId === `portfolio:${student.id}`}
                                onChange={(event) => updatePortfolioField(student.id, `dimensiProfil.${key}`, event.target.value)}
                                placeholder="Deskripsi singkat berdasarkan bukti belajar (opsional)"
                              />
                            </label>
                          ))}
                        </div>
                      </fieldset>}
                      <label>
                        Ekstrakurikuler
                        <textarea
                          rows="2"
                          maxLength="3000"
                          value={portfolioDraft.ekstrakurikuler}
                          disabled={portfolioLocked || busyId === `portfolio:${student.id}`}
                          onChange={(event) => updatePortfolioField(student.id, 'ekstrakurikuler', event.target.value)}
                          placeholder="Nama kegiatan, partisipasi, dan capaian (jika ada)."
                        />
                      </label>
                      <label>
                        Prestasi dan penghargaan
                        <textarea
                          rows="2"
                          maxLength="3000"
                          value={portfolioDraft.prestasi}
                          disabled={portfolioLocked || busyId === `portfolio:${student.id}`}
                          onChange={(event) => updatePortfolioField(student.id, 'prestasi', event.target.value)}
                          placeholder="Prestasi yang telah diverifikasi (jika ada)."
                        />
                      </label>
                      <label>
                        Catatan guru / wali kelas
                        <textarea
                          rows="3"
                          maxLength="3000"
                          value={portfolioDraft.catatanWaliKelas}
                          disabled={portfolioLocked || busyId === `portfolio:${student.id}`}
                          onChange={(event) => updatePortfolioField(student.id, 'catatanWaliKelas', event.target.value)}
                          placeholder="Umpan balik yang konstruktif untuk perkembangan belajar."
                        />
                      </label>
                      <button
                        type="button"
                        className="secondary"
                        disabled={portfolioLocked || busyId === `portfolio:${student.id}` ||
                          !classroomMatchesPeriod || !isPeriodConfigured}
                        onClick={() => void savePortfolio(student)}
                      >
                        {busyId === `portfolio:${student.id}` ? 'Menyimpan…' : isTk ? 'Simpan draf perkembangan' : 'Simpan bagian rapor semester'}
                      </button>
                    </details>
                    {!isTk && <button type="submit" disabled={
                      locked || isSaving || !isPeriodConfigured || !classroomMatchesPeriod
                    }>
                      {isSaving ? 'Menyimpan…' : report ? 'Simpan perubahan draf' : 'Simpan draf'}
                    </button>}
                  </form>
                );
                })}
              </div>
            </>
          ) : (
            <p className="school-report-empty">
              {classes.length ? 'Tidak ada siswa yang terdaftar pada kelas ini.' : 'Belum ada kelas yang ditugaskan ke akun ini.'}
            </p>
          )}
        </section>
      ) : mode === 'review' ? (
        <section className="school-report-panel">
          <div className="school-report-panel-heading">
            <div>
              <h2>Persetujuan rapor</h2>
              <p>{!isTk && <>{pendingReports.length} nilai mapel menunggu · {publishedReports.length} nilai mapel terbit ·</>}
                {' '}{pendingPortfolios.length} portofolio menunggu · {publishedPortfolios.length} portofolio terbit
              </p>
            </div>
            <button type="button" className="secondary" onClick={exportReports} disabled={!reportsForPeriod.length}>
              Ekspor periode terpilih
            </button>
          </div>
          {!isTk && reportsForPeriod.length ? (
            <div className="school-report-table-wrap">
              <table>
                <thead><tr>
                  <th>Siswa</th><th>Kelas / Mapel</th><th>Nilai</th><th>Capaian</th><th>Status</th><th>Aksi</th>
                </tr></thead>
                <tbody>{reportsForPeriod.map((report) => {
                  const room = roomById.get(report.classroomId);
                  return (
                    <tr key={report.id}>
                      <td>{report.namaSiswa}</td>
                      <td>{room?.nama || 'Kelas'}{room?.mapel ? ` · ${room.mapel}` : ''}</td>
                      <td>{report.nilai}</td>
                      <td>{report.capaian || '—'}</td>
                      <td><span className={`school-report-badge ${report.status}`}>
                        {report.status === 'published' ? 'Terbit' : 'Draf'}
                      </span></td>
                      <td className="school-report-row-actions">
                        {report.status === 'draft' ? (
                          <button type="button" disabled={busyId === report.id} onClick={() => void publish(report)}>
                            {busyId === report.id ? 'Menerbitkan…' : 'Setujui & terbitkan'}
                          </button>
                        ) : (
                          <>
                            <button type="button" className="secondary" onClick={() => printReport(report)}>
                              Cetak
                            </button>
                            {report.tahunAjaran === currentYear && report.semester === currentSemester
                              ? (
                                <button type="button" className="danger" disabled={busyId === report.id} onClick={() => void reopen(report)}>
                                  Buka kembali
                                </button>
                              )
                              : <span className="school-report-archive-label">Arsip terkunci</span>}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          ) : (
            <p className="school-report-empty">Belum ada draf atau rapor yang diterbitkan pada periode aktif.</p>
          )}
          <section className="school-report-portfolio-review">
            <h3>Portofolio rapor semester</h3>
            <p className="school-report-helper">
              {isTk
                ? 'Laporan perkembangan anak dapat diterbitkan setelah narasi perkembangan disimpan.'
                : 'Portofolio dapat diterbitkan setelah seluruh nilai mapel siswa pada periode tersebut diterbitkan dan tidak ada draf nilai yang tertinggal.'}
            </p>
            {portfoliosForPeriod.length ? (
              <div className="school-report-table-wrap">
                <table>
                  <thead><tr><th>Siswa</th><th>Periode</th><th>Status</th><th>Aksi</th></tr></thead>
                  <tbody>{portfoliosForPeriod.map((portfolio) => (
                    <tr key={portfolio.id}>
                      <td>{portfolio.namaSiswa}</td>
                      <td>{portfolio.tahunAjaran} · {SEMESTER_LABEL[portfolio.semester]}</td>
                      <td><span className={`school-report-badge ${portfolio.status}`}>
                        {portfolio.status === 'published' ? 'Terbit' : 'Draf'}
                      </span></td>
                      <td className="school-report-row-actions">
                        {portfolio.status === 'draft' ? (
                          <button
                            type="button"
                            disabled={busyId === portfolio.id}
                            onClick={() => void publishPortfolio(portfolio)}
                          >
                            {busyId === portfolio.id
                              ? 'Menerbitkan…'
                              : isTk ? 'Terbitkan laporan perkembangan' : 'Terbitkan portofolio'}
                          </button>
                        ) : (
                          <>
                            <button type="button" className="secondary" onClick={() => printReport(portfolio)}>
                              Cetak rapor lengkap
                            </button>
                            {portfolio.tahunAjaran === currentYear && portfolio.semester === currentSemester
                              ? (
                                <button
                                  type="button"
                                  className="danger"
                                  disabled={busyId === portfolio.id}
                                  onClick={() => void reopenPortfolio(portfolio)}
                                >
                                  Buka kembali
                                </button>
                              )
                              : <span className="school-report-archive-label">Arsip terkunci</span>}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : (
              <p className="school-report-empty">Belum ada portofolio pada periode yang dipilih.</p>
            )}
          </section>
          <div className="school-report-print-preview" aria-hidden="true">
            {portfoliosForPeriod.filter((portfolio) => portfolio.status === 'published')
              .map((portfolio) => renderPortfolioDocument(portfolio, printId === portfolio.id))}
            {!isTk && reportsForPeriod.filter((report) => report.status === 'published').map((report) => {
              const room = roomById.get(report.classroomId);
              return (
                <article
                  className={`school-report-document${printId === report.id ? ' print-selected' : ''}`}
                  key={report.id}
                >
                  <header>
                    <p>{school?.nama || 'Sekolah'}</p>
                    {school?.alamat && <p>{school.alamat}</p>}
                    {school?.npsn && <small>NPSN {school.npsn}</small>}
                    <h2>Rapor Hasil Belajar</h2>
                    <p>{report.tahunAjaran} · Semester {SEMESTER_LABEL[report.semester]}</p>
                  </header>
                  <dl>
                    <div><dt>Nama siswa</dt><dd>{report.namaSiswa}</dd></div>
                    <div><dt>Kelas</dt><dd>{room?.nama || '—'}</dd></div>
                    <div><dt>Mata pelajaran</dt><dd>{room?.mapel || '—'}</dd></div>
                    <div><dt>Nilai akhir</dt><dd>{report.nilai}</dd></div>
                  </dl>
                  <section>
                    <h3>Capaian pembelajaran</h3>
                    <p>{report.capaian || 'Tidak ada deskripsi capaian yang dicatat.'}</p>
                  </section>
                  {school?.kepalaSekolah && (
                    <footer><span>{school.kepalaSekolah}</span><small>Kepala Sekolah</small></footer>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="school-report-panel">
          <h2>{isTk ? 'Laporan perkembangan yang telah diterbitkan' : 'Rapor hasil belajar yang telah diterbitkan'}</h2>
          {publishedPortfolios.length > 0 && (
            <>
              <p className="school-report-helper">
                {isTk
                  ? 'Dokumen perkembangan naratif disusun dari observasi guru dan informasi semester yang tersedia.'
                  : 'Dokumen lengkap menggabungkan capaian mapel, kokurikuler, dimensi profil lulusan, presensi, ekstrakurikuler, prestasi, dan catatan wali kelas.'}
              </p>
              <div className="school-report-card-grid">
                {publishedPortfolios.map((portfolio) =>
                  renderPortfolioDocument(portfolio, printId === portfolio.id))}
              </div>
            </>
          )}
          {!isTk && publishedReports.length > 0 && (
            <details className="school-report-subject-archive">
              <summary>Rincian nilai per mata pelajaran</summary>
              <div className="school-report-card-grid">
              {publishedReports.map((report) => {
                const room = roomById.get(report.classroomId);
                return (
                  <article
                    className={`school-report-document${printId === report.id ? ' print-selected' : ''}`}
                    key={report.id}
                  >
                    <header>
                      <p>{school?.nama || 'Sekolah'}</p>
                      {school?.alamat && <p>{school.alamat}</p>}
                      {school?.npsn && <small>NPSN {school.npsn}</small>}
                      <h2>Rapor Hasil Belajar</h2>
                      <p>{report.tahunAjaran} · Semester {SEMESTER_LABEL[report.semester]}</p>
                    </header>
                    <dl>
                      <div><dt>Nama siswa</dt><dd>{report.namaSiswa}</dd></div>
                      <div><dt>Kelas</dt><dd>{room?.nama || '—'}</dd></div>
                      <div><dt>Mata pelajaran</dt><dd>{room?.mapel || '—'}</dd></div>
                      <div><dt>Nilai akhir</dt><dd>{report.nilai}</dd></div>
                    </dl>
                    <section>
                      <h3>Capaian pembelajaran</h3>
                      <p>{report.capaian || 'Tidak ada deskripsi capaian yang dicatat.'}</p>
                    </section>
                    {school?.kepalaSekolah && (
                      <footer>
                        <span>{school.kepalaSekolah}</span>
                        <small>Kepala Sekolah</small>
                      </footer>
                    )}
                    <button type="button" className="screen-only" onClick={() => printReport(report)}>
                      Cetak rapor
                    </button>
                  </article>
                );
              })}
              </div>
            </details>
          )}
          {!publishedPortfolios.length && (isTk || !publishedReports.length) && (
            <p className="school-report-empty">Belum ada rapor yang diterbitkan untuk akun ini.</p>
          )}
        </section>
      )}
    </main>
  );
}
