import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { isSchoolAdminRole } from '../services/roleAccess.js';
import { muatKatalogMateriAdminSekolah } from '../services/schoolAdminMaterialCatalog.js';
import '../styles/online-assessments.css';

function formatTanggal(value) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(value));
}

export default function SchoolAdminMaterialCatalogPage() {
  const { role, activeRole, tenantId } = useAuth();
  const allowed = isSchoolAdminRole(activeRole || role);
  const [materials, setMaterials] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!tenantId) throw new Error('Sesi admin sekolah tidak memiliki tenant aktif.');
      setMaterials(await muatKatalogMateriAdminSekolah());
    } catch (cause) {
      console.error('[school-material-catalog] Gagal memuat materi sekolah:', cause);
      setError('Katalog materi tidak dapat dimuat. Periksa sesi admin, tenant, dan izin server.');
      setMaterials([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return undefined;
    }
    void refresh();
    return undefined;
  }, [allowed, refresh]);

  const visibleMaterials = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('id');
    return materials.filter((material) => (
      !term
      || `${material.title} ${material.classroomName} ${material.subject}`
        .toLocaleLowerCase('id').includes(term)
    ));
  }, [materials, search]);

  if (!allowed) {
    return (
      <section className="ale-exam-card" role="alert">
        <h1>Katalog materi sekolah</h1>
        <p>Halaman ini hanya tersedia bagi admin sekolah yang berwenang.</p>
      </section>
    );
  }

  return (
    <main className="ale-exam-card" aria-labelledby="school-material-catalog-title">
      <p className="ale-exam-kicker">Konten · tenant sekolah</p>
      <h1 id="school-material-catalog-title">Katalog Materi Ruang Kelas</h1>
      <p className="ale-exam-intro">
        Katalog baca-saja untuk materi yang dibuat di Ruang Kelas. Pilih kelas untuk
        meninjau materi di modul sumber; perubahan materi tetap mengikuti hak akses Ruang Kelas.
      </p>
      <p className="ale-exam-notice">
        Hanya 50 materi terakhir yang ditampilkan. Isi materi dan data siswa tidak ditampilkan
        di katalog ini. Perpustakaan digital dan arsip perangkat ajar tidak termasuk.
      </p>
      <label>
        Cari judul, kelas, atau mata pelajaran
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Contoh: Matematika"
        />
      </label>
      {error && <p className="ale-exam-error" role="alert">{error}</p>}
      <button
        className="ale-exam-secondary"
        type="button"
        disabled={loading}
        onClick={() => void refresh()}
      >
        {loading ? 'Memuat…' : 'Muat ulang'}
      </button>
      {loading && <p role="status">Memuat katalog materi tenant…</p>}
      {!loading && !error && visibleMaterials.length === 0 && (
        <p>{materials.length ? 'Tidak ada materi yang cocok.' : 'Belum ada materi Ruang Kelas pada tenant ini.'}</p>
      )}
      {visibleMaterials.length > 0 && (
        <div className="ale-exam-results-wrap">
          <table className="ale-exam-results">
            <caption>Materi terbaru yang tersimpan di Ruang Kelas</caption>
            <thead>
              <tr>
                <th scope="col">Materi</th>
                <th scope="col">Kelas</th>
                <th scope="col">Diperbarui</th>
                <th scope="col"><span className="ale-sr-only">Tindakan</span></th>
              </tr>
            </thead>
            <tbody>
              {visibleMaterials.map((material) => (
                <tr key={material.id}>
                  <td>
                    <strong>{material.title}</strong>
                    <span>{material.subject || 'Mata pelajaran tidak dicantumkan'}</span>
                  </td>
                  <td>{material.classroomName}</td>
                  <td>{formatTanggal(material.updatedAt)}</td>
                  <td>
                    <a href={`#/ruang-kelas?kelas=${encodeURIComponent(material.classroomId)}`}>
                      Buka kelas
                    </a>
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
