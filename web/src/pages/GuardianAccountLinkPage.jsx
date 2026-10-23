import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  lepasWaliDariSiswa,
  muatAkunWaliSekolah,
  muatRosterWaliSekolah,
  muatTautanWaliSekolah,
  tautkanWaliKeSiswa,
} from '../services/guardianPortal.js';
import '../styles/online-assessments.css';

export default function GuardianAccountLinkPage() {
  const { role } = useAuth();
  const [guardians, setGuardians] = useState([]);
  const [students, setStudents] = useState([]);
  const [links, setLinks] = useState([]);
  const [guardianId, setGuardianId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [relationshipVerified, setRelationshipVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    const [guardianRows, studentRows, linkedRows] = await Promise.all([
      muatAkunWaliSekolah(),
      muatRosterWaliSekolah(),
      muatTautanWaliSekolah(),
    ]);
    setGuardians(guardianRows);
    setStudents(studentRows);
    setLinks(linkedRows);
  }, []);

  useEffect(() => {
    if (role !== 'admin_sekolah') {
      setLoading(false);
      return undefined;
    }
    let active = true;
    refresh()
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Data penautan wali gagal dimuat.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [refresh, role]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await tautkanWaliKeSiswa(guardianId, studentId, relationshipVerified);
      setNotice('Akun wali berhasil ditautkan ke siswa dan dicatat pada audit sekolah.');
      setGuardianId('');
      setStudentId('');
      setRelationshipVerified(false);
      await refresh();
    } catch (saveError) {
      setError(saveError.message || 'Tautan wali tidak dapat disimpan.');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (link) => {
    if (!globalThis.confirm(`Lepas tautan ${link.guardian_nama} dari ${link.student_nama}?`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await lepasWaliDariSiswa(link.guardian_user_id, link.student_id);
      setNotice('Tautan dilepas dan dicatat pada audit sekolah.');
      await refresh();
    } catch (unlinkError) {
      setError(unlinkError.message || 'Tautan wali tidak dapat dilepas.');
    } finally {
      setBusy(false);
    }
  };

  if (role !== 'admin_sekolah') {
    return (
      <section className="ale-exam-card" role="alert">
        <h2>Hubungan wali dan siswa</h2>
        <p>Fitur ini hanya tersedia bagi admin sekolah aktif.</p>
      </section>
    );
  }

  return (
    <section className="ale-exam-card" aria-labelledby="guardian-link-title">
      <p className="ale-exam-kicker">Manajemen pengguna</p>
      <h2 id="guardian-link-title">Hubungan wali dan siswa</h2>
      <p className="ale-exam-intro">
        Tautkan hanya setelah sekolah memverifikasi hubungan wali melalui prosedur resmi.
        Wali hanya dapat melihat ringkasan data siswa yang ditautkan, bukan seluruh roster.
      </p>
      {error && <p className="ale-exam-error" role="alert">{error}</p>}
      {notice && <p className="ale-exam-notice" role="status">{notice}</p>}
      {loading ? <p role="status">Memuat data penautan…</p> : (
        <>
          <form className="ale-exam-form" onSubmit={submit}>
            <label>Akun wali aktif
              <select required value={guardianId} onChange={(event) => setGuardianId(event.target.value)}>
                <option value="">Pilih akun wali</option>
                {guardians.map((guardian) => (
                  <option key={guardian.user_id} value={guardian.user_id}>
                    {guardian.nama} · {guardian.email || 'email tidak tersedia'}
                  </option>
                ))}
              </select>
            </label>
            <label>Siswa pada roster sekolah
              <select required value={studentId} onChange={(event) => setStudentId(event.target.value)}>
                <option value="">Pilih siswa</option>
                {students.map((student) => (
                  <option key={student.student_id} value={student.student_id}>
                    {student.nama} · Kelas {student.kelas}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={relationshipVerified}
                onChange={(event) => setRelationshipVerified(event.target.checked)}
              />
              Saya telah memverifikasi hubungan wali melalui prosedur sekolah.
            </label>
            <button
              className="ale-exam-primary"
              type="submit"
              disabled={busy || loading || !guardians.length || !students.length || !relationshipVerified}
            >
              {busy ? 'Menyimpan…' : 'Tautkan wali ke siswa'}
            </button>
          </form>
          {!links.length && <p>Belum ada hubungan wali–siswa yang ditautkan.</p>}
          <h3>Tautan aktif</h3>
          <ul className="ale-exam-list">
            {links.map((link) => (
              <li key={`${link.guardian_user_id}:${link.student_id}`}>
                <div>
                  <strong>{link.student_nama} · Kelas {link.student_kelas}</strong>
                  <span>{link.guardian_nama} · {link.guardian_email || 'email tidak tersedia'}</span>
                </div>
                <button type="button" disabled={busy} onClick={() => unlink(link)}>
                  Lepas tautan
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
