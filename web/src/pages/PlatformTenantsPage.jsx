import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.ts';
import { useAuth } from '../context/AuthContext.jsx';
import { tinjauPermohonanSekolah } from '../services/schoolRegistration.js';
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
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [requests, setRequests] = useState([]);
  const [requestError, setRequestError] = useState('');
  const [reviewDrafts, setReviewDrafts] = useState({});
  const [reviewingId, setReviewingId] = useState('');
  const cursor = useRef(null);
  const busy = useRef(false);

  const muatPermohonan = useCallback(async () => {
    if (role !== 'superadmin') return;
    setRequestError('');
    const { data, error: queryError } = await supabase
      .from('school_registration_requests_v2')
      .select('id,email,npsn,submitted_name,education_level,province,city,address,created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(100);
    if (queryError) {
      console.error('[platform-tenants] Gagal memuat permohonan sekolah:', queryError);
      setRequestError('Permohonan sekolah tidak dapat dimuat.');
      return;
    }
    setRequests(Array.isArray(data) ? data : []);
  }, [role]);

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
  useEffect(() => { void muatPermohonan(); }, [muatPermohonan]);

  async function tinjau(request, approved) {
    if (reviewingId) return;
    setReviewingId(request.id);
    setRequestError('');
    try {
      const draft = reviewDrafts[request.id] || {};
      const officialRecord = approved ? {
        npsn: request.npsn,
        nama: String(draft.nama || '').trim(),
        bentuk_pendidikan: String(draft.bentuk_pendidikan || '').trim(),
        propinsi: String(draft.propinsi || '').trim(),
        kabupaten_kota: String(draft.kabupaten_kota || '').trim(),
        alamat: String(draft.alamat || '').trim(),
      } : null;
      if (approved && Object.values(officialRecord).some((value) => !value)) {
        throw new Error('Lengkapi data resmi kementerian setelah memeriksa NPSN sebelum menyetujui.');
      }
      await tinjauPermohonanSekolah(request.id, officialRecord);
      setRequests((current) => current.filter((item) => item.id !== request.id));
    } catch (reviewError) {
      console.error('[platform-tenants] Gagal meninjau permohonan sekolah:', reviewError);
      setRequestError(reviewError.message || 'Permohonan tidak dapat diproses.');
    } finally {
      setReviewingId('');
    }
  }

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

      <section className="platform-tenants-card" aria-labelledby="school-requests-title">
        <div>
          <h2 id="school-requests-title">Persetujuan pendaftaran sekolah</h2>
          <p>Periksa NPSN dan salin data resmi dari referensi kementerian. Data pengajuan pengguna tidak digunakan sebagai identitas tenant.</p>
        </div>
        {requestError && <p className="platform-tenants-error" role="alert">{requestError}</p>}
        {!requests.length && !requestError && <p className="platform-tenants-empty">Tidak ada permohonan yang menunggu.</p>}
        {requests.map((request) => {
          const draft = reviewDrafts[request.id] || {};
          const update = (key, value) => setReviewDrafts((current) => ({
            ...current,
            [request.id]: { ...current[request.id], [key]: value },
          }));
          return (
            <article className="school-registration-review" key={request.id}>
              <h3>NPSN {request.npsn} · {request.submitted_name}</h3>
              <p>{request.email} · {request.education_level} · {request.city}, {request.province}</p>
              <p>Alamat pengajuan: {request.address}</p>
              <p className="platform-ops-note">Pastikan record resmi ditemukan dan cocok. Jika tidak ditemukan, jangan setujui; tolak permohonan ini.</p>
              <div className="school-registration-review-fields">
                <label>Nama resmi kementerian<input value={draft.nama || ''} onChange={(event) => update('nama', event.target.value)} maxLength={160} /></label>
                <label>Bentuk pendidikan<input value={draft.bentuk_pendidikan || ''} onChange={(event) => update('bentuk_pendidikan', event.target.value)} maxLength={40} /></label>
                <label>Provinsi resmi<input value={draft.propinsi || ''} onChange={(event) => update('propinsi', event.target.value)} maxLength={80} /></label>
                <label>Kabupaten / kota resmi<input value={draft.kabupaten_kota || ''} onChange={(event) => update('kabupaten_kota', event.target.value)} maxLength={100} /></label>
                <label className="school-registration-review-wide">Alamat resmi<input value={draft.alamat || ''} onChange={(event) => update('alamat', event.target.value)} maxLength={240} /></label>
              </div>
              <div className="platform-tenants-more">
                <button className="platform-tenants-button" type="button" disabled={Boolean(reviewingId)} onClick={() => void tinjau(request, true)}>
                  {reviewingId === request.id ? 'Memproses…' : 'Setujui dan buat tenant'}
                </button>
                <button className="platform-tenants-button secondary" type="button" disabled={Boolean(reviewingId)} onClick={() => void tinjau(request, false)}>
                  Tolak
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
