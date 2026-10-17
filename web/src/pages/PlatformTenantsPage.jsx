import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, documentId, getDocs, limit, orderBy, query, startAfter,
} from 'firebase/firestore';
import { db } from '../firebase/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import '../styles/platform-tenants.css';

const UKURAN_HALAMAN = 40;

function namaSekolah(data, id) {
  return typeof data.nama === 'string' && data.nama.trim() ? data.nama.trim() : id;
}

function statusLangganan(nilai) {
  if (!nilai || typeof nilai !== 'object') return { label: 'Belum berlangganan', className: 'is-unknown' };
  if (nilai.aktif !== true) return { label: 'Tidak aktif', className: 'is-inactive' };

  const sampai = nilai.sampai?.toDate?.();
  if (!(sampai instanceof Date) || Number.isNaN(sampai.getTime())) {
    return { label: 'Perlu verifikasi', className: 'is-unknown' };
  }
  if (sampai <= new Date()) return { label: 'Kedaluwarsa', className: 'is-inactive' };

  return {
    label: `Aktif hingga ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(sampai)}`,
    className: 'is-active',
  };
}

export default function PlatformTenantsPage() {
  const { role } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const cursor = useRef(null);
  const busy = useRef(false);

  const muat = useCallback(async (berikutnya = false) => {
    if (role !== 'superadmin' || busy.current) return;
    busy.current = true;
    setLoading(!berikutnya);
    setLoadingMore(berikutnya);
    setError('');
    if (!berikutnya) {
      cursor.current = null;
      setTenants([]);
      setHasMore(false);
    }

    try {
      const batas = query(
        collection(db, 'tenants'),
        orderBy(documentId()),
        ...(berikutnya && cursor.current ? [startAfter(cursor.current)] : []),
        limit(UKURAN_HALAMAN + 1),
      );
      const snapshot = await getDocs(batas);
      const dokumen = snapshot.docs.slice(0, UKURAN_HALAMAN);
      const halaman = dokumen.map((item) => ({ id: item.id, ...item.data() }));

      cursor.current = dokumen.at(-1) || cursor.current;
      setHasMore(snapshot.docs.length > UKURAN_HALAMAN);
      setTenants((saatIni) => berikutnya ? [...saatIni, ...halaman] : halaman);
    } catch (err) {
      console.error('[platform-tenants] Gagal memuat daftar tenant:', err);
      setError(err?.code === 'permission-denied'
        ? 'Akses daftar tenant ditolak. Pastikan sesi memiliki klaim superadmin yang terbaru.'
        : 'Daftar tenant tidak dapat dimuat. Periksa koneksi lalu coba lagi.');
    } finally {
      busy.current = false;
      setLoading(false);
      setLoadingMore(false);
    }
  }, [role]);

  useEffect(() => {
    if (role === 'superadmin') void muat();
  }, [muat, role]);

  const terlihat = useMemo(() => {
    const kata = search.trim().toLocaleLowerCase('id');
    if (!kata) return tenants;
    return tenants.filter((tenant) =>
      [tenant.id, namaSekolah(tenant, tenant.id), tenant.npsn, tenant.jenjang]
        .some((nilai) => String(nilai || '').toLocaleLowerCase('id').includes(kata)));
  }, [search, tenants]);

  if (role !== 'superadmin') {
    return (
      <main className="platform-tenants">
        <section className="platform-tenants-card" role="alert">
          <h1>Daftar sekolah</h1>
          <p>Data tenant lintas sekolah hanya tersedia bagi superadmin.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="platform-tenants">
      <header className="platform-tenants-heading">
        <p className="platform-tenants-kicker">Manajemen tenant · platform</p>
        <h1>Daftar sekolah</h1>
        <p>Informasi tenant dan status langganan ditampilkan secara baca-saja. Perubahan langganan harus melalui alur server yang berizin.</p>
      </header>

      <section className="platform-tenants-card" aria-labelledby="platform-tenants-title">
        <div className="platform-tenants-toolbar">
          <div>
            <h2 id="platform-tenants-title">Tenant sekolah</h2>
            <p>{tenants.length ? `${tenants.length} tenant dimuat` : 'Daftar tenant pada platform.'}</p>
          </div>
          <label className="platform-tenants-search">
            <span>Cari nama, NPSN, atau ID tenant</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ketik nama atau ID"
            />
          </label>
          <button
            className="platform-tenants-button secondary"
            type="button"
            onClick={() => void muat()}
            disabled={loading || loadingMore}
          >
            {loading ? 'Memuat…' : 'Muat ulang'}
          </button>
        </div>

        {error && <p className="platform-tenants-error" role="alert">{error}</p>}
        {loading && !tenants.length ? (
          <p className="platform-tenants-empty" role="status">Memuat daftar tenant…</p>
        ) : !error && !terlihat.length ? (
          <p className="platform-tenants-empty">
            {search ? 'Tidak ada tenant yang cocok dengan pencarian.' : 'Belum ada tenant yang terdaftar.'}
          </p>
        ) : (
          <div className="platform-tenants-table-wrap">
            <table className="platform-tenants-table">
              <thead>
                <tr>
                  <th scope="col">Sekolah</th>
                  <th scope="col">ID tenant</th>
                  <th scope="col">NPSN</th>
                  <th scope="col">Jenjang</th>
                  <th scope="col">Langganan</th>
                </tr>
              </thead>
              <tbody>
                {terlihat.map((tenant) => {
                  const langganan = statusLangganan(tenant.langganan);
                  return (
                    <tr key={tenant.id}>
                      <th scope="row">{namaSekolah(tenant, tenant.id)}</th>
                      <td>{tenant.id}</td>
                      <td>{tenant.npsn || '—'}</td>
                      <td>{tenant.jenjang || '—'}</td>
                      <td><span className={`platform-tenants-status ${langganan.className}`}>{langganan.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {hasMore && (
          <div className="platform-tenants-more">
            <button
              className="platform-tenants-button"
              type="button"
              onClick={() => void muat(true)}
              disabled={loading || loadingMore}
            >
              {loadingMore ? 'Memuat…' : 'Muat tenant berikutnya'}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
