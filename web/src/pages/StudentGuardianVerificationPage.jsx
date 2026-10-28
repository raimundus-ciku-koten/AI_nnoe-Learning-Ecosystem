import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { isSchoolAdminRole } from '../services/roleAccess.js';
import {
  muatKandidatWaliSiswa,
  ubahStatusWaliSiswa,
} from '../services/studentGuardianLinks.js';
import '../styles/online-assessments.css';

const STATUS_LABEL = {
  pending: 'Menunggu verifikasi',
  verified: 'Terverifikasi',
  rejected: 'Ditolak',
  revoked: 'Dicabut',
};
const ACTION_LABEL = {
  request: 'Penautan diajukan',
  verify: 'Hubungan diverifikasi',
  reject: 'Penautan ditolak',
  revoke: 'Verifikasi dicabut',
};

export default function StudentGuardianVerificationPage() {
  const { role, activeRole, tenantId } = useAuth();
  const currentRole = activeRole || role;
  const [students, setStudents] = useState([]);
  const [guardians, setGuardians] = useState([]);
  const [links, setLinks] = useState([]);
  const [audit, setAudit] = useState([]);
  const [studentId, setStudentId] = useState('');
  const [guardianId, setGuardianId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (!tenantId) {
        throw new Error('Tenant sekolah tidak tersedia pada sesi admin.');
      }
      const result = await muatKandidatWaliSiswa(tenantId);
      setStudents(result.students);
      setGuardians(result.guardians);
      setLinks(result.links);
      setAudit(result.audit);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!isSchoolAdminRole(currentRole)) return;
    let active = true;
    refresh().catch((cause) => {
      console.error('[student-guardian-links] Gagal memuat data verifikasi wali:', cause);
      if (active) setError('Data verifikasi tidak dapat dimuat. Periksa tenant, sesi, dan izin admin sekolah.');
    });
    return () => { active = false; };
  }, [currentRole, refresh]);

  const ubahStatus = async (student, guardian, action) => {
    if (!student?.id || !guardian?.id) {
      setError('Data siswa atau wali tidak tersedia; perubahan dibatalkan.');
      return;
    }
    const konfirmasi = action === 'verify'
      ? `Verifikasi bahwa ${guardian.nama} adalah wali sah dari ${student.nama}? Pastikan bukti telah diperiksa sesuai prosedur sekolah.`
      : action === 'reject'
        ? `Tolak penautan ${guardian.nama} dengan ${student.nama}?`
        : action === 'revoke'
          ? `Cabut hubungan terverifikasi ${guardian.nama} dengan ${student.nama}?`
          : `Buat permintaan verifikasi untuk ${guardian.nama} dan ${student.nama}?`;
    if (!globalThis.confirm(konfirmasi)) return;

    setBusy(true);
    setError('');
    setNotice('');
    try {
      await ubahStatusWaliSiswa(student.id, guardian.id, action);
      setNotice('Status hubungan wali-siswa berhasil diperbarui. Data akademik anak tetap tidak dibuka oleh halaman ini.');
      if (action === 'request') {
        setStudentId('');
        setGuardianId('');
      }
    } catch (cause) {
      console.error('[student-guardian-links] Perubahan status hubungan gagal:', cause);
      setError('Status penautan tidak berhasil diperbarui. Periksa izin dan coba lagi.');
      setBusy(false);
      return;
    }

    try {
      await refresh();
    } catch (cause) {
      console.error('[student-guardian-links] Status tersimpan tetapi daftar gagal dimuat ulang:', cause);
      setError('Status berhasil disimpan, tetapi daftar terbaru tidak dapat dimuat. Gunakan Muat ulang untuk memeriksa status.');
    } finally {
      setBusy(false);
    }
  };

  if (!isSchoolAdminRole(currentRole)) {
    return (
      <section className="ale-exam-card" role="alert">
        <h1>Verifikasi wali-siswa</h1>
        <p>Fitur ini hanya tersedia bagi admin sekolah aktif.</p>
      </section>
    );
  }
  const availableGuardians = guardians.filter((guardian) => !links.some((link) => (
    link.student_id === studentId
    && link.guardian_user_id === guardian.id
    && ['pending', 'verified'].includes(link.status)
  )));

  return (
    <main className="ale-exam-card" aria-labelledby="guardian-verification-title">
      <p className="ale-exam-kicker">Manajemen pengguna · tenant sekolah</p>
      <h1 id="guardian-verification-title">Verifikasi hubungan wali-siswa</h1>
      <p className="ale-exam-intro">
        Cocokkan identitas wali dengan siswa pada sekolah ini dan periksa bukti melalui
        prosedur resmi sekolah sebelum verifikasi. Jangan unggah dokumen identitas atau
        catatan sensitif ke halaman ini. Status hubungan tidak otomatis membuka nilai,
        presensi, atau data akademik lainnya.
      </p>
      {loading && <p role="status">Memuat data tenant sekolah…</p>}
      {error && <p className="ale-exam-error" role="alert">{error}</p>}
      {notice && <p className="ale-exam-notice" role="status">{notice}</p>}
      <button className="ale-exam-secondary" type="button" disabled={loading || busy}
        onClick={() => {
          setError('');
          refresh().catch((cause) => {
            console.error('[student-guardian-links] Gagal memuat ulang data verifikasi wali:', cause);
            setError('Data terbaru tidak dapat dimuat. Periksa koneksi dan izin tenant.');
          });
        }}>
        Muat ulang
      </button>

      <section aria-labelledby="guardian-link-create-title">
        <h2 id="guardian-link-create-title">Ajukan penautan untuk ditinjau</h2>
        <form className="ale-exam-form" onSubmit={(event) => {
          event.preventDefault();
          const student = students.find((item) => item.id === studentId);
          const guardian = guardians.find((item) => item.id === guardianId);
          void ubahStatus(student, guardian, 'request');
        }}>
          <label>Siswa pada roster sekolah
            <select required value={studentId} onChange={(event) => setStudentId(event.target.value)}>
              <option value="">Pilih siswa</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>{student.nama} · Kelas {student.kelas}</option>
              ))}
            </select>
          </label>
          <label>Akun orang tua/wali aktif
            <select required value={guardianId} onChange={(event) => setGuardianId(event.target.value)}>
              <option value="">Pilih akun wali</option>
              {availableGuardians.map((guardian) => (
                <option key={guardian.id} value={guardian.id}>
                  {guardian.nama} · {guardian.email || 'email tidak tersedia'}
                </option>
              ))}
            </select>
          </label>
          <button className="ale-exam-primary" type="submit" disabled={loading || busy || !students.length || !guardians.length}>
            {busy ? 'Menyimpan…' : 'Ajukan penautan'}
          </button>
        </form>
      </section>

      <section aria-labelledby="guardian-link-list-title">
        <h2 id="guardian-link-list-title">Status penautan pada sekolah ini</h2>
        {!links.length && <p>Belum ada hubungan wali-siswa yang tercatat.</p>}
        <ul className="ale-exam-list">
          {links.map((link) => (
            <li key={link.id}>
              <div>
                <strong>{link.guardian?.nama || 'Akun wali tidak tersedia'} · {link.student?.nama || 'Siswa tidak tersedia'}</strong>
                <span>Status: {STATUS_LABEL[link.status] || 'Tidak dikenal'}</span>
                {link.status === 'verified' && link.verified_at && (
                  <span>Diverifikasi: {new Date(link.verified_at).toLocaleString('id-ID')}</span>
                )}
              </div>
              {link.status === 'pending' && (
                <div className="ale-exam-actions">
                  <button type="button" disabled={loading || busy || !link.student || !link.guardian}
                    onClick={() => void ubahStatus(link.student, link.guardian, 'verify')}>
                    Verifikasi
                  </button>
                  <button type="button" disabled={loading || busy || !link.student || !link.guardian}
                    onClick={() => void ubahStatus(link.student, link.guardian, 'reject')}>
                    Tolak
                  </button>
                </div>
              )}
              {link.status === 'verified' && (
                <button type="button" disabled={loading || busy || !link.student || !link.guardian}
                  onClick={() => void ubahStatus(link.student, link.guardian, 'revoke')}>
                  Cabut verifikasi
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="guardian-link-audit-title">
        <h2 id="guardian-link-audit-title">Riwayat perubahan (100 terakhir)</h2>
        {!audit.length && <p>Belum ada perubahan penautan yang tercatat.</p>}
        <ol className="ale-exam-list">
          {audit.map((entry) => (
            <li key={entry.id}>
              <div>
                <strong>{entry.guardian?.nama || 'Akun wali tidak tersedia'} · {entry.student?.nama || 'Siswa tidak tersedia'}</strong>
                <span>{ACTION_LABEL[entry.action] || 'Perubahan status'}: {STATUS_LABEL[entry.previous_status] || 'belum ada'} → {STATUS_LABEL[entry.new_status] || 'tidak dikenal'}</span>
                <span>Oleh: {entry.actor?.nama || 'Akun admin tidak tersedia'}</span>
                <span>{new Date(entry.created_at).toLocaleString('id-ID')}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
