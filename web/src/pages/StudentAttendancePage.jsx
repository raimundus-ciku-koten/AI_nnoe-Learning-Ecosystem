import React, { useEffect, useState } from 'react';
import { muatRiwayatKehadiranSiswa } from '../services/studentAttendance.js';
import '../styles/attendance.css';

function displayDate(value, options = { dateStyle: 'medium' }) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Tanggal tidak valid'
    : new Intl.DateTimeFormat('id-ID', options).format(date);
}

export default function StudentAttendancePage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    muatRiwayatKehadiranSiswa()
      .then((rows) => { if (active) setRecords(rows); })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Riwayat kehadiran tidak dapat dimuat.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <section className="ale-kartu attendance-panel" aria-labelledby="student-attendance-title">
      <p className="attendance-kicker">Kehadiran siswa</p>
      <h1 id="student-attendance-title">Kehadiran Saya</h1>
      <p>Riwayat ini hanya menampilkan catatan milik akun siswa yang tertaut secara resmi.</p>
      {error && <p className="attendance-error" role="alert">{error}</p>}
      {loading && <p className="attendance-message" role="status">Memuat riwayat kehadiran…</p>}
      {!loading && !error && records.length === 0 && (
        <div className="attendance-empty">
          <h2>Belum ada riwayat kehadiran</h2>
          <p>Jika Anda sudah mengikuti kegiatan, hubungi sekolah untuk memeriksa tautan akun dan catatan presensi.</p>
        </div>
      )}
      {!loading && !error && records.length > 0 && (
        <>
          <p className="attendance-message">{records.length} catatan terbaru</p>
          <div className="attendance-table-wrap">
            <table className="attendance-table">
              <thead>
                <tr>
                  <th scope="col">Tanggal</th>
                  <th scope="col">Kelas</th>
                  <th scope="col">Status</th>
                  <th scope="col">Waktu dicatat</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record, index) => (
                  <tr key={`${record.date}-${record.recordedAt}-${index}`}>
                    <td>{displayDate(record.date)}</td>
                    <td>{record.className}</td>
                    <td>{record.status}</td>
                    <td>{displayDate(record.recordedAt, { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
