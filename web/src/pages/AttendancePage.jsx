import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.ts';
import { useAuth } from '../context/AuthContext.jsx';
import Ikon from '../components/Ikon.jsx';
import '../styles/attendance.css';

const PERAN_PENDIDIK = new Set(['admin_sekolah', 'operator', 'guru', 'demo']);

function AttendanceAccessDenied() {
  return (
    <section className="ale-kartu attendance-empty" role="alert">
      <Ikon nama="badge" />
      <h2>Akses presensi tidak tersedia</h2>
      <p>Presensi hanya dapat dibuka oleh pendidik dan pengelola sekolah.</p>
    </section>
  );
}

export default function AttendancePage() {
  const { user, role } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tanggal, setTanggal] = useState('');
  const [kelas, setKelas] = useState('');
  const [cari, setCari] = useState('');

  useEffect(() => {
    if (!user?.uid || !PERAN_PENDIDIK.has(role)) {
      setRecords([]);
      setLoading(false);
      return undefined;
    }

    let active = true;
    async function muat() {
      setLoading(true);
      setError('');
      try {
        const { data, error: fetchError } = await supabase
          .from('attendance_records')
          .select('*')
          .eq('owner_id', user.uid)
          .order('tanggal', { ascending: false })
          .limit(50);

        if (!active) return;
        if (fetchError) throw fetchError;
        setRecords(data || []);
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
  }, [role, user?.uid]);

  const daftarKelas = useMemo(
    () => [...new Set(records.map((record) => record.kelas).filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b), 'id', { numeric: true })),
    [records],
  );

  const tampil = useMemo(() => {
    const kata = cari.trim().toLocaleLowerCase('id');
    return records.filter((record) =>
      (!tanggal || record.tanggal === tanggal)
      && (!kelas || record.kelas === kelas)
      && (!kata || String(record.nama || '').toLocaleLowerCase('id').includes(kata)
        || String(record.student_id || '').toLocaleLowerCase('id').includes(kata)),
    );
  }, [records, tanggal, kelas, cari]);

  if (!PERAN_PENDIDIK.has(role)) return <AttendanceAccessDenied />;

  return (
    <div className="attendance-page">
      <header className="attendance-header">
        <div>
          <p className="attendance-kicker"><Ikon nama="check" /> Pelaksanaan pembelajaran</p>
          <h1>Presensi siswa</h1>
          <p>Riwayat kehadiran dari Supabase. Migrasi skema hosted masih diperlukan sebelum pencatatan tersedia di produksi.</p>
        </div>
        <a className="attendance-cta" href="#/datadasar/barcode">
          <Ikon nama="qr" /> Buka kartu barcode
        </a>
      </header>

      <section className="ale-kartu attendance-guidance" role="note" aria-label="Metode presensi">
        <strong>QR/barcode adalah metode yang aktif.</strong>
        <span>
          Kode kartu baru bersifat acak dan tidak memuat NISN. Pengenalan wajah belum diaktifkan;
          pilot biometrik memerlukan persetujuan tertulis, alternatif QR/manual, liveness, dan
          kebijakan retensi serta penghapusan data.
        </span>
      </section>

      <section className="attendance-summary" aria-label="Ringkasan presensi">
        <article className="ale-kartu attendance-stat">
          <span>Catatan pada tampilan</span>
          <strong>{loading ? '…' : tampil.length}</strong>
        </article>
        <article className="ale-kartu attendance-stat">
          <span>Siswa tercatat</span>
          <strong>{loading ? '…' : new Set(tampil.map((record) => record.student_id).filter(Boolean)).size}</strong>
        </article>
        <article className="ale-kartu attendance-stat">
          <span>Kelas tercatat</span>
          <strong>{loading ? '…' : new Set(tampil.map((record) => record.kelas).filter(Boolean)).size}</strong>
        </article>
      </section>

      <section className="ale-kartu attendance-panel" aria-labelledby="attendance-list-title">
        <div className="attendance-panel-heading">
          <div>
            <h2 id="attendance-list-title">Riwayat kehadiran</h2>
            <p>Data dibaca dari tabel Supabase `attendance_records` untuk akun aktif.</p>
          </div>
        </div>

        <div className="attendance-filters">
          <label>
            Tanggal
            <input type="date" value={tanggal} onChange={(event) => setTanggal(event.target.value)} />
          </label>
          <label>
            Kelas
            <select value={kelas} onChange={(event) => setKelas(event.target.value)}>
              <option value="">Semua kelas</option>
              {daftarKelas.map((namaKelas) => <option key={namaKelas} value={namaKelas}>{namaKelas}</option>)}
            </select>
          </label>
          <label className="attendance-search">
            Cari siswa
            <input
              type="search"
              value={cari}
              onChange={(event) => setCari(event.target.value)}
              placeholder="Nama atau ID siswa"
            />
          </label>
        </div>

        {error && <p className="attendance-error" role="alert">{error}</p>}
        {loading && <p className="attendance-message" role="status">Memuat riwayat presensi…</p>}
        {!loading && !error && tampil.length === 0 && (
          <div className="attendance-empty">
            <Ikon nama="calendar" />
            <h3>{records.length ? 'Tidak ada catatan yang cocok' : 'Belum ada presensi tercatat'}</h3>
            <p>{records.length
              ? 'Ubah filter tanggal, kelas, atau pencarian.'
              : 'Belum ada data absensi di Supabase untuk akun ini.'}</p>
          </div>
        )}
        {!loading && !error && tampil.length > 0 && (
          <div className="attendance-table-wrap">
            <table className="attendance-table">
              <thead>
                <tr><th scope="col">Siswa</th><th scope="col">Kelas</th><th scope="col">Tanggal</th><th scope="col">Status</th></tr>
              </thead>
              <tbody>
                {tampil.map((record) => (
                  <tr key={record.id || `${record.tanggal}-${record.student_id}`}>
                    <td>{record.nama || record.student_id || '-'}</td>
                    <td>{record.kelas || '-'}</td>
                    <td>{record.tanggal || '-'}</td>
                    <td>{record.status || 'hadir'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
