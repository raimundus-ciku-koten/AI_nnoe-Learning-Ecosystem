import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.ts';
import { useAuth } from '../context/AuthContext.jsx';
import '../styles/platform-tenants.css';

const UKURAN_HALAMAN = 40;

export function ringkasStatusTenant(tenants) {
  return tenants.reduce((summary, tenant) => {
    summary[tenant.active ? 'aktif' : 'nonaktif'] += 1;
    return summary;
  }, { aktif: 0, nonaktif: 0 });
}

function statusTenant(active) {
  return active
    ? { label: 'Aktif', className: 'is-active' }
    : { label: 'Nonaktif', className: 'is-inactive' };
}

export default function PlatformTenantsPage() {
  const { role: baseRole, activeRole } = useAuth();
  const role = activeRole || baseRole;
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
      let request = supabase
        .from('tenants')
        .select('id, name, active')
        .order('id')
        .limit(UKURAN_HALAMAN + 1);
      if (berikutnya && cursor.current) request = request.gt('id', cursor.current);
      const { data, error: queryError } = await request;
      if (queryError) throw queryError;
      if (!Array.isArray(data) || data.some((tenant) =>
        !tenant || typeof tenant.id !== 'string' ||
        typeof tenant.name !== 'string' || typeof tenant.active !== 'boolean')) {
        throw new Error('Supabase mengembalikan daftar tenant yang tidak valid.');
      }

      const page = data.slice(0, UKURAN_HALAMAN);
      cursor.current = page.at(-1)?.id || cursor.current;
      setHasMore(data.length > UKURAN_HALAMAN);
      setTenants((current) => berikutnya ? [...current, ...page] : page);
    } catch (err) {
      console.error('[platform-tenants] Gagal memuat daftar tenant:', err);
      setError(err?.code === '42501'
        ? 'Akses daftar tenant ditolak. Pastikan sesi superadmin aktif.'
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
      [tenant.id, tenant.name].some((nilai) =>
        String(nilai || '').toLocaleLowerCase('id').includes(kata)));
  }, [search, tenants]);
  const status = useMemo(() => ringkasStatusTenant(tenants), [tenants]);

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
        <p>Daftar tenant Supabase ditampilkan secara baca-saja untuk memeriksa status operasional sekolah.</p>
      </header>

      <section className="platform-tenants-card" aria-labelledby="platform-tenants-title">
        <div className="platform-tenants-toolbar">
          <div>
            <h2 id="platform-tenants-title">Tenant sekolah</h2>
            <p>{tenants.length ? `${tenants.length} tenant dimuat` : 'Daftar tenant pada platform.'}</p>
          </div>
          <label className="platform-tenants-search">
            <span>Cari di tenant yang sudah dimuat</span>
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
        {!error && tenants.length > 0 && (
          <div className="platform-ops-counts" aria-label="Ringkasan status tenant yang dimuat">
            <article><span>Tenant aktif · data dimuat</span><strong>{status.aktif.toLocaleString('id-ID')}</strong></article>
            <article><span>Tenant nonaktif · data dimuat</span><strong>{status.nonaktif.toLocaleString('id-ID')}</strong></article>
          </div>
        )}
        {hasMore && (
          <p className="platform-ops-note">
            Pencarian hanya mencakup tenant yang sudah dimuat. Muat halaman berikutnya untuk memperluas cakupan pencarian.
          </p>
        )}
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
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {terlihat.map((tenant) => {
                  const status = statusTenant(tenant.active);
                  return (
                    <tr key={tenant.id}>
                      <th scope="row">{tenant.name || tenant.id}</th>
                      <td>{tenant.id}</td>
                      <td><span className={`platform-tenants-status ${status.className}`}>{status.label}</span></td>
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
