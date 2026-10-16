import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, documentId, getDocs, limit, orderBy, query, startAfter,
} from 'firebase/firestore';
import { db } from '../firebase/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { createPlatformUser } from '../services/platformAdminApi.js';
import '../styles/admin-users.css';

const UKURAN_HALAMAN = 50;
const PERAN_AKUN = [
  ['admin_sekolah', 'Admin Sekolah'],
  ['operator', 'Operator'],
  ['guru', 'Guru'],
  ['siswa', 'Siswa'],
  ['ortu', 'Orang Tua'],
];
const FORM_AKUN_KOSONG = { nama: '', email: '', role: 'admin_sekolah', tenantId: '' };

function statusAkun(aktif) {
  if (aktif === true) return { label: 'Aktif', className: 'is-active' };
  if (aktif === false) return { label: 'Nonaktif', className: 'is-inactive' };
  return { label: 'Belum dicatat', className: 'is-unknown' };
}

function labelPeran(role) {
  return PERAN_AKUN.find(([id]) => id === role)?.[1] || role || 'Belum ditetapkan';
}

export default function PlatformUsersPage() {
  const { role } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(FORM_AKUN_KOSONG);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createNotice, setCreateNotice] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const cursor = useRef(null);
  const busy = useRef(false);
  const reloadQueued = useRef(false);

  const muat = useCallback(async (berikutnya = false) => {
    if (role !== 'superadmin') return;
    if (busy.current) {
      if (!berikutnya) reloadQueued.current = true;
      return;
    }
    busy.current = true;
    setLoading(!berikutnya);
    setLoadingMore(berikutnya);
    setError('');
    if (!berikutnya) {
      cursor.current = null;
      setUsers([]);
      setHasMore(false);
    }

    try {
      const daftar = query(
        collection(db, 'users'),
        orderBy(documentId()),
        ...(berikutnya && cursor.current ? [startAfter(cursor.current)] : []),
        limit(UKURAN_HALAMAN + 1),
      );
      const snapshot = await getDocs(daftar);
      const dokumen = snapshot.docs.slice(0, UKURAN_HALAMAN);
      const halaman = dokumen.map((item) => ({ uid: item.id, ...item.data() }));

      cursor.current = dokumen.at(-1) || cursor.current;
      setHasMore(snapshot.docs.length > UKURAN_HALAMAN);
      setUsers((saatIni) => berikutnya ? [...saatIni, ...halaman] : halaman);
    } catch (err) {
      console.error('[platform-users] Gagal memuat akun pengguna:', err);
      setError(err?.code === 'permission-denied'
        ? 'Akses daftar pengguna ditolak. Pastikan sesi memiliki klaim superadmin yang terbaru.'
        : 'Daftar pengguna tidak dapat dimuat. Periksa koneksi lalu coba lagi.');
    } finally {
      busy.current = false;
      setLoading(false);
      setLoadingMore(false);
      if (reloadQueued.current) {
        reloadQueued.current = false;
        queueMicrotask(() => { void muat(); });
      }
    }
  }, [role]);

  useEffect(() => {
    if (role === 'superadmin') void muat();
  }, [muat, role]);

  const terlihat = useMemo(() => {
    const kata = search.trim().toLocaleLowerCase('id');
    if (!kata) return users;
    return users.filter((user) =>
      [user.nama, user.email, user.role, user.tenantId, user.uid]
        .some((nilai) => String(nilai || '').toLocaleLowerCase('id').includes(kata)));
  }, [search, users]);

  async function buatAkun(event) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setCreateError('');
    setCreateNotice('');
    try {
      const accountRequest = {
        nama: form.nama.trim(),
        email: form.email.trim(),
        role: form.role,
        tenantId: form.tenantId.trim(),
      };
      const hasil = await createPlatformUser(accountRequest);
      setUsers((current) => [...current.filter((user) => user.uid !== hasil.uid), {
        uid: hasil.uid,
        nama: accountRequest.nama,
        email: hasil.email,
        role: hasil.role,
        tenantId: hasil.tenantId,
        aktif: true,
      }].sort((a, b) => a.uid.localeCompare(b.uid)));
      setForm(FORM_AKUN_KOSONG);
      setCreateNotice(hasil.resetEmailSent
        ? `Akun ${hasil.email} berhasil dibuat. Email setel kata sandi sudah dikirim.`
        : `Akun ${hasil.email} berhasil dibuat, tetapi email setel kata sandi gagal dikirim. Minta pengguna memilih “Lupa sandi” pada halaman masuk.`);
      void muat();
    } catch (err) {
      console.error('[platform-users] Gagal membuat akun:', err);
      setCreateError(err?.message || 'Akun tidak dapat dibuat. Periksa data dan coba lagi.');
    } finally {
      setCreating(false);
    }
  }

  if (role !== 'superadmin') {
    return (
      <section className="ale-admin-users-card" role="alert">
        <h1>Manajemen pengguna global</h1>
        <p>Direktori dan pembuatan akun lintas tenant hanya tersedia bagi superadmin.</p>
      </section>
    );
  }

  return (
    <main className="ale-admin-users">
      <header className="ale-admin-users-heading">
        <p className="ale-admin-users-kicker">Manajemen pengguna · platform</p>
        <h1>Manajemen pengguna global</h1>
        <p>Buat akun sekolah melalui layanan server tepercaya. Peran dan tenant divalidasi di server serta dicatat dalam audit.</p>
      </header>

      <section className="ale-admin-users-card" aria-labelledby="platform-create-user-title">
        <div>
          <h2 id="platform-create-user-title">Tambahkan akun pengguna</h2>
          <p>Akun dibuat tanpa kata sandi sementara. Aplikasi akan mengirim email agar pengguna menetapkan kata sandinya sendiri.</p>
        </div>
        <form className="ale-platform-user-form" onSubmit={buatAkun}>
          <label>
            Nama lengkap
            <input
              required minLength={2} maxLength={120} autoComplete="name"
              disabled={creating}
              value={form.nama}
              onChange={(event) => setForm((current) => ({ ...current, nama: event.target.value }))}
            />
          </label>
          <label>
            Email pengguna
            <input
              required type="email" maxLength={254} autoComplete="email"
              disabled={creating}
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            />
          </label>
          <label>
            Peran
            <select
              disabled={creating}
              value={form.role}
              onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
            >
              {PERAN_AKUN.map(([id, nama]) => <option key={id} value={id}>{nama}</option>)}
            </select>
          </label>
          <label>
            ID tenant sekolah
            <input
              required maxLength={128} pattern="[A-Za-z0-9_-]+"
              disabled={creating}
              value={form.tenantId}
              onChange={(event) => setForm((current) => ({ ...current, tenantId: event.target.value }))}
              placeholder="ID tenant dari menu Daftar Sekolah"
            />
          </label>
          {createError && <p className="ale-admin-users-error" role="alert">{createError}</p>}
          {createNotice && <p className="ale-admin-users-notice" role="status">{createNotice}</p>}
          <div className="ale-platform-user-form-actions">
            <button className="ale-admin-users-button" type="submit" disabled={creating}>
              {creating ? 'Membuat akun…' : 'Buat akun dan kirim email setel sandi'}
            </button>
          </div>
        </form>
      </section>

      <section className="ale-admin-users-card" aria-labelledby="platform-admin-list-title">
        <div className="ale-admin-users-toolbar">
          <div>
            <h2 id="platform-admin-list-title">Akun pengguna</h2>
            <p>{users.length ? `${users.length} akun dimuat` : 'Akun ditampilkan bertahap dari profil pengguna.'}</p>
          </div>
          <label className="ale-admin-users-search">
            <span>Cari nama, email, peran, tenant, atau UID</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ketik nama atau ID"
            />
          </label>
          <button
            className="ale-admin-users-button secondary"
            type="button"
            onClick={() => void muat()}
            disabled={loading || loadingMore}
          >
            {loading ? 'Memuat…' : 'Muat ulang'}
          </button>
        </div>

        {error && <p className="ale-admin-users-error" role="alert">{error}</p>}
        {loading && !users.length ? (
          <p className="ale-admin-users-empty" role="status">Memuat daftar pengguna…</p>
        ) : !error && !terlihat.length ? (
          <p className="ale-admin-users-empty">
            {search ? 'Tidak ada akun yang cocok dengan pencarian.' : 'Belum ada profil pengguna.'}
          </p>
        ) : (
          <div className="ale-admin-users-table-wrap">
            <table className="ale-admin-users-table">
              <thead>
                <tr>
                  <th scope="col">Nama</th>
                  <th scope="col">Email</th>
                  <th scope="col">Peran</th>
                  <th scope="col">Tenant</th>
                  <th scope="col">Status akun</th>
                </tr>
              </thead>
              <tbody>
                {terlihat.map((user) => {
                  const status = statusAkun(user.aktif);
                  return (
                    <tr key={user.uid}>
                      <th scope="row">{user.nama || user.displayName || 'Nama belum tersedia'}</th>
                      <td>{user.email || '—'}</td>
                      <td>{labelPeran(user.role)}</td>
                      <td>{user.tenantId || '—'}</td>
                      <td><span className={`ale-admin-users-status ${status.className}`}>{status.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {hasMore && (
          <div className="ale-admin-users-more">
            <button
              className="ale-admin-users-button"
              type="button"
              onClick={() => void muat(true)}
              disabled={loading || loadingMore}
            >
              {loadingMore ? 'Memuat…' : 'Muat akun berikutnya'}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
