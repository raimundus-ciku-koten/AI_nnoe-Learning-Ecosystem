import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection, getDocs, limit, orderBy, query, startAfter,
} from 'firebase/firestore';
import { db } from '../firebase/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import Ikon from '../components/Ikon.jsx';
import '../styles/attendance.css';

const BATAS_CATATAN = 200;
const PERAN_PENDIDIK = new Set(['admin_sekolah', 'operator', 'guru', 'demo']);

function tanggalTampil(nilai) {
  if (!nilai) return '-';
  const [tahun, bulan, hari] = nilai.split('-').map(Number);
  if (!tahun || !bulan || !hari) return nilai;
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(tahun, bulan - 1, hari)));
}

function waktuTampil(nilai) {
  if (!nilai?.toDate) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit', minute: '2-digit',
  }).format(nilai.toDate());
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

export default function AttendancePage() {
  const { user, role } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [error, setError] = useState('');
  const [tanggal, setTanggal] = useState('');
  const [kelas, setKelas] = useState('');
  const [cari, setCari] = useState('');

  const muat = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    setError('');
    try {
      const presensi = collection(db, 'guru', user.uid, 'absensi');
      const hasil = await getDocs(query(
        presensi,
        orderBy('tanggal', 'desc'),
        limit(BATAS_CATATAN + 1),
      ));
      const halaman = hasil.docs.slice(0, BATAS_CATATAN);
      setRecords(halaman.map((dokumen) => ({
        id: dokumen.id,
        ...dokumen.data(),
      })));
      setHasMore(hasil.docs.length > BATAS_CATATAN);
      setCursor(halaman.at(-1) || null);
    } catch (err) {
      console.error('[presensi] Gagal memuat riwayat presensi:', err);
      setError(err?.code === 'permission-denied'
        ? 'Akun ini belum diizinkan membaca riwayat presensi.'
        : 'Riwayat presensi tidak dapat dimuat. Periksa koneksi, lalu coba lagi.');
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => { muat(); }, [muat]);

  const muatBerikutnya = useCallback(async () => {
    if (!user?.uid || !cursor || loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError('');
    try {
      const presensi = collection(db, 'guru', user.uid, 'absensi');
      const hasil = await getDocs(query(
        presensi,
        orderBy('tanggal', 'desc'),
        startAfter(cursor),
        limit(BATAS_CATATAN + 1),
      ));
      const halaman = hasil.docs.slice(0, BATAS_CATATAN);
      setRecords((sebelumnya) => [
        ...sebelumnya,
        ...halaman.map((dokumen) => ({ id: dokumen.id, ...dokumen.data() })),
      ]);
      setHasMore(hasil.docs.length > BATAS_CATATAN);
      setCursor(halaman.at(-1) || cursor);
    } catch (err) {
      console.error('[presensi] Gagal memuat halaman berikutnya:', err);
      setError(err?.code === 'permission-denied'
        ? 'Akun ini belum diizinkan membaca riwayat presensi.'
        : 'Catatan berikutnya tidak dapat dimuat. Coba lagi.');
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, hasMore, loadingMore, user?.uid]);

  const daftarKelas = useMemo(
    () => [...new Set(records.map((record) => record.kelas).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'id', { numeric: true })),
    [records],
  );
  const tampil = useMemo(() => {
    const kata = cari.trim().toLocaleLowerCase('id');
    return records.filter((record) =>
      (!tanggal || record.tanggal === tanggal)
      && (!kelas || record.kelas === kelas)
      && (!kata || String(record.nama || '').toLocaleLowerCase('id').includes(kata)
        || String(record.siswaId || '').toLocaleLowerCase('id').includes(kata)),
    );
  }, [records, tanggal, kelas, cari]);
  const jumlahSiswa = new Set(tampil.map((record) => record.siswaId)).size;

  if (!PERAN_PENDIDIK.has(role)) return <AttendanceAccessDenied />;

  return (
    <div className="attendance-page">
      <header className="attendance-header">
        <div>
          <p className="attendance-kicker"><Ikon nama="check" /> Pelaksanaan pembelajaran</p>
          <h1>Presensi siswa</h1>
          <p>Riwayat kehadiran yang tercatat melalui pemindaian kartu siswa.</p>
        </div>
        <a className="attendance-cta" href="#/datadasar/barcode">
          <Ikon nama="qr" /> Buka kartu barcode
        </a>
      </header>

      <section className="attendance-summary" aria-label="Ringkasan presensi">
        <article className="ale-kartu attendance-stat">
          <span>Catatan pada tampilan</span>
          <strong>{loading ? '…' : tampil.length}</strong>
        </article>
        <article className="ale-kartu attendance-stat">
          <span>Siswa tercatat</span>
          <strong>{loading ? '…' : jumlahSiswa}</strong>
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
            <p>Filter dan pencarian berlaku pada catatan yang sudah dimuat dari akun ini.</p>
          </div>
          <button type="button" className="attendance-reload" onClick={muat} disabled={loading}>
            <Ikon nama="refresh" /> Muat ulang
          </button>
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
              : 'Pindai QR atau barcode dari kartu siswa untuk mencatat kehadiran.'}</p>
          </div>
        )}
        {!loading && !error && tampil.length > 0 && (
          <div className="attendance-table-wrap">
            <table className="attendance-table">
              <thead>
                <tr><th scope="col">Siswa</th><th scope="col">Kelas</th><th scope="col">Tanggal</th><th scope="col">Waktu</th><th scope="col">Status</th></tr>
              </thead>
              <tbody>
                {tampil.map((record) => (
                  <tr key={record.id}>
                    <td>{record.nama || record.siswaId || '-'}</td>
                    <td>{record.kelas || '-'}</td>
                    <td>{tanggalTampil(record.tanggal)}</td>
                    <td>{waktuTampil(record.waktu)}</td>
                    <td><span className="attendance-status">{record.status === 'hadir' ? 'Hadir' : record.status || '-'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !error && hasMore && (
          <button
            type="button"
            className="attendance-load-more"
            onClick={muatBerikutnya}
            disabled={loadingMore}
          >
            {loadingMore ? 'Memuat catatan…' : 'Muat catatan berikutnya'}
          </button>
        )}
      </section>
    </div>
  );
}
