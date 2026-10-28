import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.ts';
import { createPlatformTenant } from '../services/platformAdminApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import '../styles/platform-tenants.css';

const UKURAN_HALAMAN = 40;

function statusTenant(active) {
  return active
    ? { label: 'Aktif', className: 'is-active' }
    : { label: 'Nonaktif', className: 'is-inactive' };
}

export default function PlatformTenantsPage({ mode = 'list' }) {
  const { role, activeRole } = useAuth();
  const peranAktif = activeRole || role;
  const [tenants, setTenants] = useState([]);
  const [tenantName, setTenantName] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [creating, setCreating] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [createError, setCreateError] = useState('');
  const [notice, setNotice] = useState('');
  const cursor = useRef(null);
  const busy = useRef(false);

  const muat = useCallback(async (berikutnya = false) => {
    if (peranAktif !== 'superadmin' || busy.current) return;
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
  }, [peranAktif]);

  useEffect(() => {
    if (peranAktif === 'superadmin') void muat();
  }, [muat, peranAktif]);

  const terlihat = useMemo(() => {
    const kata = search.trim().toLocaleLowerCase('id');
    if (!kata) return tenants;
    return tenants.filter((tenant) =>
      [tenant.id, tenant.name].some((nilai) =>
        String(nilai || '').toLocaleLowerCase('id').includes(kata)));
  }, [search, tenants]);

  async function tambahTenant(event) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setCreateError('');
    setNotice('');
    try {
      const tenant = await createPlatformTenant(tenantName);
      setTenantName('');
      setNotice(`Tenant berhasil dibuat. ID tenant: ${tenant.id}`);
      await muat();
    } catch (createError) {
      console.error('[platform-tenants] Gagal membuat tenant:', createError);
      setCreateError(createError?.code === '42501'
        ? 'Pembuatan tenant ditolak. Pastikan sesi superadmin aktif dan migrasi manajemen tenant sudah diterapkan.'
        : 'Tenant tidak dapat dibuat. Periksa input dan koneksi, lalu coba lagi.');
    } finally {
      setCreating(false);
    }
  }

  if (peranAktif !== 'superadmin') {
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
        <h1>{mode === 'create' ? 'Tambah tenant' : 'Daftar sekolah'}</h1>
        <p>Buat tenant sekolah melalui fungsi database yang memeriksa hak superadmin dan mencatat perubahan pada audit platform.</p>
      </header>

      <section className="platform-tenants-card" aria-labelledby="platform-tenant-create-title">
        <div>
          <h2 id="platform-tenant-create-title">Tenant baru</h2>
          <p>ID tenant dibuat otomatis dan digunakan saat menghubungkan pengguna ke sekolah.</p>
        </div>
        <form className="platform-tenants-create-form" onSubmit={tambahTenant}>
          <label className="platform-tenants-search">
            Nama sekolah / tenant
            <input
              required minLength={2} maxLength={160}
              value={tenantName}
              onChange={(event) => setTenantName(event.target.value)}
              placeholder="Contoh: SMP Negeri 1"
            />
          </label>
          <button className="platform-tenants-button" type="submit" disabled={creating}>
            {creating ? 'Membuat tenant…' : 'Tambahkan tenant'}
          </button>
        </form>
        {createError && <p className="platform-tenants-error" role="alert">{createError}</p>}
        {notice && <p className="platform-tenants-notice" role="status">{notice}</p>}
        {mode === 'create' && <a href="#/platform/tenant/sekolah">Kembali ke daftar tenant</a>}
      </section>

      <section className="platform-tenants-card" aria-labelledby="platform-tenants-title">
        <div className="platform-tenants-toolbar">
          <div>
            <h2 id="platform-tenants-title">Tenant sekolah</h2>
            <p>{tenants.length ? `${tenants.length} tenant dimuat` : 'Daftar tenant pada platform.'}</p>
          </div>
          <label className="platform-tenants-search">
            <span>Cari nama atau ID tenant</span>
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
