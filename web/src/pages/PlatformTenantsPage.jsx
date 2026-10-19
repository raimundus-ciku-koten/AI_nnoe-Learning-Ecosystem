import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.ts';
import { useAuth } from '../context/AuthContext.jsx';
import '../styles/platform-tenants.css';

const UKURAN_HALAMAN = 40;

function statusTenant(active) {
  return active
    ? { label: 'Aktif', className: 'is-active' }
    : { label: 'Nonaktif', className: 'is-inactive' };
}

export default function PlatformTenantsPage() {
  const { role } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [requests, setRequests] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [requestError, setRequestError] = useState('');
  const [reviewingId, setReviewingId] = useState('');
  const [reviewNotes, setReviewNotes] = useState({});
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
      let tenantQuery = supabase
        .from('tenants')
        .select('id, name, active')
        .order('id')
        .limit(UKURAN_HALAMAN + 1);
      if (berikutnya && cursor.current) tenantQuery = tenantQuery.gt('id', cursor.current);
      const [tenantResult, requestResult] = await Promise.all([
        tenantQuery,
        supabase
          .from('school_registration_requests')
          .select('id,email,school_name,npsn,status,submitted_at')
          .eq('status', 'pending')
          .order('submitted_at')
          .limit(100),
      ]);
      const { data, error: queryError } = tenantResult;
      if (queryError) throw queryError;
      if (requestResult.error) {
        console.error('[platform-tenants] Gagal memuat permohonan sekolah:', requestResult.error);
        setRequestError('Antrean permohonan sekolah belum tersedia. Pastikan migrasi pendaftaran sekolah telah diterapkan.');
        setRequests([]);
      } else {
        setRequestError('');
        setRequests(requestResult.data || []);
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

  const tinjauPermohonan = async (item, keputusan) => {
    const pertanyaan = keputusan === 'approve'
      ? `Setujui pendaftaran ${item.school_name} (NPSN ${item.npsn}) dan buat tenant aktif?`
      : `Tolak permohonan ${item.school_name} (NPSN ${item.npsn})?`;
    if (!window.confirm(pertanyaan)) return;

    setReviewingId(item.id);
    setRequestError('');
    try {
      const { error: reviewError } = await supabase.rpc('review_school_registration_request', {
        p_request_id: item.id,
        p_decision: keputusan,
        p_review_notes: reviewNotes[item.id] || null,
      });
      if (reviewError) throw reviewError;
      setRequests((current) => current.filter((request) => request.id !== item.id));
      setReviewNotes((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      await muat();
    } catch (reviewError) {
      console.error('[platform-tenants] Gagal meninjau permohonan:', reviewError);
      setRequestError('Keputusan belum tersimpan. Pastikan MFA superadmin aktif dan coba lagi.');
    } finally {
      setReviewingId('');
    }
  };

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
        <p>Daftar tenant Supabase ditampilkan secara baca-saja. Status langganan dan perubahan tenant dikelola melalui alur backend berizin.</p>
      </header>

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
            disabled={loading || loadingMore || Boolean(reviewingId)}
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

      <section className="platform-tenants-card" aria-labelledby="school-requests-title">
        <div className="platform-tenants-toolbar">
          <div>
            <h2 id="school-requests-title">Permohonan sekolah menunggu pemeriksaan</h2>
            <p>{requests.length} permohonan dimuat · maksimum 100 per pemuatan</p>
          </div>
          <button
            className="platform-tenants-button secondary"
            type="button"
            onClick={() => void muat()}
            disabled={loading || loadingMore || Boolean(reviewingId)}
          >
            {loading ? 'Memuat…' : 'Muat ulang'}
          </button>
        </div>
        {requestError && <p className="platform-tenants-error" role="alert">{requestError}</p>}
        {!requestError && requests.length === 0 ? (
          <p className="platform-tenants-empty">Tidak ada permohonan yang menunggu pemeriksaan.</p>
        ) : !requestError && (
          <div className="platform-tenants-table-wrap">
            <table className="platform-tenants-table">
              <thead>
                <tr>
                  <th scope="col">Sekolah</th>
                  <th scope="col">NPSN</th>
                  <th scope="col">Email pemohon</th>
                  <th scope="col">Pemeriksaan</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((item) => (
                  <tr key={item.id}>
                    <th scope="row">{item.school_name}</th>
                    <td>{item.npsn}</td>
                    <td>{item.email}</td>
                    <td className="platform-tenant-review">
                      <label>
                        <span>Catatan (opsional)</span>
                        <textarea
                          value={reviewNotes[item.id] || ''}
                          maxLength={1000}
                          onChange={(event) => setReviewNotes((current) => ({
                            ...current,
                            [item.id]: event.target.value,
                          }))}
                        />
                      </label>
                      <div>
                        <button
                          className="platform-tenants-button"
                          type="button"
                          onClick={() => void tinjauPermohonan(item, 'approve')}
                          disabled={Boolean(reviewingId)}
                        >
                          {reviewingId === item.id ? 'Menyimpan…' : 'Setujui'}
                        </button>
                        <button
                          className="platform-tenants-button secondary"
                          type="button"
                          onClick={() => void tinjauPermohonan(item, 'reject')}
                          disabled={Boolean(reviewingId)}
                        >
                          Tolak
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
