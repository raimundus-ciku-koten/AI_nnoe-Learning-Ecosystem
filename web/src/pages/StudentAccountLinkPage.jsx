import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { isSchoolAdminRole } from '../services/roleAccess.js';
import {
  muatAkunSiswaBelumTertaut,
  muatAkunSiswaTertaut,
  muatRosterBelumTertaut,
  lepasTautanAkunSiswa,
  tautkanAkunSiswa,
} from '../services/onlineAssessments.js';
import '../styles/online-assessments.css';

export default function StudentAccountLinkPage() {
  const { role, activeRole } = useAuth();
  const currentRole = activeRole || role;
  const [roster, setRoster] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [linked, setLinked] = useState([]);
  const [studentId, setStudentId] = useState('');
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    const [students, studentAccounts, linkedAccounts] = await Promise.all([
      muatRosterBelumTertaut(),
      muatAkunSiswaBelumTertaut(),
      muatAkunSiswaTertaut(),
    ]);
    setRoster(students);
    setAccounts(studentAccounts);
    setLinked(linkedAccounts);
  }, []);

  useEffect(() => {
    if (!isSchoolAdminRole(currentRole)) return;
    refresh().catch((loadError) => setError(loadError.message));
  }, [refresh, currentRole]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await tautkanAkunSiswa(studentId, userId);
      setNotice('Akun berhasil ditautkan ke roster siswa pada sekolah ini.');
      setStudentId('');
      setUserId('');
      await refresh();
    } catch (linkError) {
      setError(linkError.message);
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (student) => {
    if (!globalThis.confirm(`Lepas tautan akun untuk ${student.nama}? Perubahan ini akan dicatat pada audit sekolah.`)) {
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await lepasTautanAkunSiswa(student.student_id);
      setNotice(`Tautan akun untuk ${student.nama} dilepas dan tercatat pada audit.`);
      await refresh();
    } catch (unlinkError) {
      setError(unlinkError.message);
    } finally {
      setBusy(false);
    }
  };

  if (!isSchoolAdminRole(currentRole)) {
    return (
      <section className="ale-exam-card" role="alert">
        <h2>Tautkan akun siswa</h2>
        <p>Fitur ini hanya tersedia bagi admin sekolah aktif.</p>
      </section>
    );
  }

  return (
    <section className="ale-exam-card" aria-labelledby="student-link-title">
      <p className="ale-exam-kicker">Manajemen pengguna</p>
      <h2 id="student-link-title">Tautkan akun ke roster siswa</h2>
      <p className="ale-exam-intro">
        Cocokkan satu akun siswa aktif di sekolah ini dengan satu baris roster.
        Periksa nama dan kelas sebelum menyimpan. Tautan dapat dilepas oleh admin
        sekolah sebelum siswa memiliki sesi ujian; setiap perubahan dicatat untuk audit.
      </p>
      {!roster.length && !accounts.length && !error && (
        <p>Semua roster dan akun siswa aktif sudah ditautkan, atau belum tersedia.</p>
      )}
      <form className="ale-exam-form" onSubmit={submit}>
        <label>Data roster
          <select required value={studentId} onChange={(event) => setStudentId(event.target.value)}>
            <option value="">Pilih siswa dari roster</option>
            {roster.map((student) => (
              <option key={student.student_id} value={student.student_id}>
                {student.nama} · Kelas {student.kelas}
                {student.nisn_tail ? ` · NISN berakhir ${student.nisn_tail}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>Akun Supabase siswa
          <select required value={userId} onChange={(event) => setUserId(event.target.value)}>
            <option value="">Pilih akun siswa aktif</option>
            {accounts.map((account) => (
              <option key={account.user_id} value={account.user_id}>
                {account.nama} · {account.email || 'email tidak tersedia'}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="ale-exam-error" role="alert">{error}</p>}
        {notice && <p className="ale-exam-notice" role="status">{notice}</p>}
        <button className="ale-exam-primary" type="submit" disabled={busy || !roster.length || !accounts.length}>
          {busy ? 'Menyimpan…' : 'Tautkan akun siswa'}
        </button>
      </form>
      <h3>Akun yang sudah ditautkan</h3>
      {!linked.length && <p>Belum ada akun siswa yang ditautkan.</p>}
      <ul className="ale-exam-list">
        {linked.map((item) => (
          <li key={item.student_id}>
            <div>
              <strong>{item.nama} · Kelas {item.kelas}</strong>
              <span>{item.user_nama} · {item.email || 'email tidak tersedia'}</span>
            </div>
            <button type="button" disabled={busy} onClick={() => unlink(item)}>
              Lepas tautan
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
