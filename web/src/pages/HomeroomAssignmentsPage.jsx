import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  muatKandidatWaliKelas,
  muatPenugasanWaliKelas,
  tetapkanWaliKelas,
} from '../services/schoolLeadership.js';
import { isSchoolAdminRole } from '../services/roleAccess.js';
import '../styles/school-leadership.css';

export default function HomeroomAssignmentsPage() {
  const { role: baseRole, activeRole, tenantId } = useAuth();
  const role = activeRole || baseRole;
  const [candidates, setCandidates] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selected, setSelected] = useState({});
  const [saving, setSaving] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      if (!isSchoolAdminRole(role) || !tenantId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const [available, current] = await Promise.all([
          muatKandidatWaliKelas(tenantId),
          muatPenugasanWaliKelas(tenantId),
        ]);
        if (active) {
          setCandidates(available);
          setAssignments(current);
          setSelected(Object.fromEntries(current.map((item) => [item.id, item.waliId || ''])));
        }
      } catch (loadError) {
        console.error('[homeroom-assignments] Gagal memuat penugasan:', loadError);
        if (active) setError('Penugasan tidak dapat dimuat. Periksa sesi, tenant, dan izin admin sekolah.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [role, tenantId]);

  async function saveAssignment(event, classroom) {
    event.preventDefault();
    setSaving(classroom.id);
    setError('');
    setNotice('');
    try {
      await tetapkanWaliKelas(classroom.id, selected[classroom.id] || null);
      setAssignments((current) => current.map((item) => item.id === classroom.id
        ? {
          ...item,
          waliId: selected[classroom.id] || null,
          waliNama: candidates.find((candidate) => candidate.id === selected[classroom.id])?.nama || null,
        }
        : item));
      setNotice(`Penugasan kelas ${classroom.nama} berhasil diperbarui.`);
    } catch (saveError) {
      console.error('[homeroom-assignments] Gagal menyimpan penugasan:', saveError);
      setError('Penugasan tidak berhasil disimpan. Perubahan sebelumnya tetap berlaku.');
      setSelected((current) => ({ ...current, [classroom.id]: classroom.waliId || '' }));
    } finally {
      setSaving('');
    }
  }

  if (!isSchoolAdminRole(role)) {
    return <main className="leadership-page"><h1>Akses admin sekolah diperlukan</h1></main>;
  }

  return (
    <main className="leadership-page">
      <header>
        <p className="leadership-eyebrow">Manajemen akademik · akses terbatas</p>
        <h1>Penugasan Wali Kelas</h1>
        <p>Hanya admin sekolah yang dapat menetapkan wali. Operator tidak dapat melihat kandidat atau mengubah penugasan.</p>
      </header>
      {error && <p className="leadership-error" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!loading && candidates.length === 0 && assignments.length > 0 && (
        <p className="leadership-empty" role="status">
          Belum ada akun wali kelas aktif di sekolah ini. Aktifkan atau tetapkan peran wali kelas sebelum melakukan penugasan.
        </p>
      )}
      {loading ? <p role="status">Memuat daftar kelas dan wali…</p>
        : assignments.length === 0 ? <p className="leadership-empty">Belum ada kelas di sekolah ini untuk ditetapkan.</p>
          : (
            <div className="leadership-table-wrap leadership-roster">
              <table>
                <caption>Penugasan per kelas pada sekolah aktif</caption>
                <thead>
                  <tr><th scope="col">Kelas</th><th scope="col">Wali kelas</th><th scope="col">Aksi</th></tr>
                </thead>
                <tbody>
                  {assignments.map((classroom) => (
                    <tr key={classroom.id}>
                      <th scope="row">
                        {classroom.nama}
                        <small>{[classroom.tingkat, classroom.tahunAjaran].filter(Boolean).join(' · ')}</small>
                      </th>
                      <td>
                        <select
                          aria-label={`Wali kelas untuk ${classroom.nama}`}
                          value={selected[classroom.id] || ''}
                          onChange={(event) => setSelected((current) => ({
                            ...current,
                            [classroom.id]: event.currentTarget.value,
                          }))}
                        >
                          <option value="">Belum ditetapkan</option>
                          {candidates.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>{candidate.nama}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <form onSubmit={(event) => void saveAssignment(event, classroom)}>
                          <button type="submit" disabled={Boolean(saving)}>
                            {saving === classroom.id ? 'Menyimpan…' : 'Simpan'}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
    </main>
  );
}
