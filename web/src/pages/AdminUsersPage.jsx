import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.ts';
import '../styles/admin-users.css';

const UKURAN_HALAMAN = 50;
const LABEL_PERAN = {
  admin_sekolah: 'Admin sekolah',
  operator: 'Operator',
  guru: 'Guru',
  siswa: 'Siswa',
  ortu: 'Orang tua',
  orang_tua: 'Orang tua',
};
const KATEGORI = {
  guru: { judul: 'Guru', roles: ['guru', 'operator'] },
  siswa: { judul: 'Siswa', roles: ['siswa'] },
  'orang-tua': { judul: 'Orang tua', roles: ['ortu', 'orang_tua'] },
  admin: { judul: 'Admin sekolah', roles: ['admin_sekolah'] },
};

function namaPengguna(data) {
  return String(data.nama || data.displayName || data.email || 'Nama belum tersedia').trim();
}

function statusPengguna(data) {
  if (data.active === true) return { label: 'Aktif', className: 'is-active' };
  if (data.active === false) return { label: 'Nonaktif', className: 'is-inactive' };
  return { label: 'Belum dicatat', className: 'is-unknown' };
}

export default function AdminUsersPage() {
  const { pathname } = useLocation();
  const { role, tenantId } = useAuth();
  const sub = pathname.split('/').filter(Boolean).at(-1);
  const kategori = KATEGORI[sub];
  const pengelola = role === 'admin_sekolah';
  const [users, setUsers] = useState([]);
  const [lastId, setLastId] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);

  const ambilHalaman = useCallback(async (cursor, reset = false) => {
    if (!tenantId || !kategori) return;
    setLoading(true);
    setError('');
    try {
      let request = supabase
        .from('profiles')
        .select('id,email,nama,role,tenant_id,active')
        .eq('tenant_id', tenantId)
        .in('role', kategori.roles)
        .order('id')
        .limit(UKURAN_HALAMAN + 1);
      if (cursor) request = request.gt('id', cursor);
      const { data, error: queryError } = await request;
      if (queryError) throw queryError;
      const rows = data || [];
      const docs = rows.slice(0, UKURAN_HALAMAN);
      setUsers((current) => {
        const halaman = docs.map((item) => ({
          uid: item.id,
          ...item,
          aktif: item.active,
        }));
        return reset ? halaman : [...current, ...halaman];
      });
      setLastId(docs.at(-1)?.id || null);
      setHasMore(rows.length > UKURAN_HALAMAN);
    } catch (err) {
      console.error('[admin-users] Gagal memuat pengguna tenant:', err);
      setError(err?.code === '42501'
        ? 'Akses daftar pengguna ditolak. Pastikan akun admin sekolah aktif dan berada pada tenant yang sesuai.'
        : 'Daftar pengguna tidak dapat dimuat. Periksa koneksi lalu coba lagi.');
    } finally {
      setLoading(false);
    }
  }, [kategori, tenantId]);

  useEffect(() => {
    setUsers([]);
    setLastId(null);
    setHasMore(false);
    setSearch('');
    if (pengelola && tenantId && kategori) ambilHalaman(null, true);
  }, [ambilHalaman, kategori, pengelola, tenantId]);

  const daftar = useMemo(() => {
    if (!kategori) return [];
    const needle = search.trim().toLocaleLowerCase('id');
    return users
      .filter((user) => kategori.roles.includes(user.role))
      .filter((user) => !needle || [namaPengguna(user), user.email || '', LABEL_PERAN[user.role] || user.role]
        .some((value) => String(value).toLocaleLowerCase('id').includes(needle)))
      .sort((a, b) => namaPengguna(a).localeCompare(namaPengguna(b), 'id'));
  }, [kategori, search, users]);

  if (!pengelola) {
    return (
      <section className="ale-admin-users-card" role="alert">
        <h2>Manajemen pengguna</h2>
        <p>Daftar ini hanya tersedia bagi admin sekolah di tenant masing-masing.</p>
      </section>
    );
  }

  if (!tenantId) {
    return (
      <section className="ale-admin-users-card" role="alert">
        <h2>Tenant sekolah belum tersedia</h2>
        <p>Sesi akun tidak memiliki identitas tenant. Hubungi superadmin untuk memperbaiki akses.</p>
      </section>
    );
  }

  if (sub === 'peran') {
    return (
      <main className="ale-admin-users">
        <header className="ale-admin-users-heading">
          <p className="ale-admin-users-kicker">Manajemen pengguna</p>
          <h2>Peran dan hak akses</h2>
          <p>Peran ditetapkan melalui app metadata Supabase oleh administrator tepercaya. Halaman ini menjelaskan akses yang berlaku dan tidak mengubah peran akun.</p>
        </header>
        <section className="ale-admin-users-card">
          <div className="ale-admin-users-table-wrap">
            <table className="ale-admin-users-table">
              <thead><tr><th scope="col">Peran</th><th scope="col">Cakupan akses</th></tr></thead>
              <tbody>
                <tr><th scope="row">Admin sekolah</th><td>Mengelola pengguna dan data operasional di tenant sekolah sendiri.</td></tr>
                <tr><th scope="row">Operator</th><td>Membantu administrasi sesuai aturan data dan izin operasional.</td></tr>
                <tr><th scope="row">Guru</th><td>Mengakses kegiatan mengajar dan data yang terkait dengan penugasan.</td></tr>
                <tr><th scope="row">Siswa</th><td>Mengakses ruang belajar dan data belajar milik sendiri.</td></tr>
                <tr><th scope="row">Orang tua</th><td>Melihat informasi anak yang telah ditautkan secara resmi.</td></tr>
              </tbody>
            </table>
          </div>
          <p className="ale-admin-users-note">Perubahan peran harus dilakukan melalui prosedur server/admin yang tercatat. Jangan membagikan kredensial atau mengubah klaim dari browser.</p>
        </section>
      </main>
    );
  }

  if (!kategori) {
    return <section className="ale-admin-users-card" role="alert"><h2>Kategori pengguna tidak dikenal</h2><p>Pilih kategori dari menu Manajemen Pengguna.</p></section>;
  }

  return (
    <main className="ale-admin-users">
      <header className="ale-admin-users-heading">
        <p className="ale-admin-users-kicker">Manajemen pengguna · tenant sekolah</p>
        <h2>{kategori.judul}</h2>
        <p>Daftar ini hanya membaca profil pada sekolah Anda. Pembuatan akun dan perubahan peran memerlukan alur server yang berizin.</p>
      </header>
      <section className="ale-admin-users-card" aria-labelledby="ale-admin-users-list-title">
        <div className="ale-admin-users-toolbar">
          <div>
            <h3 id="ale-admin-users-list-title">Akun {kategori.judul.toLocaleLowerCase('id')}</h3>
            <p>{users.length ? `${users.length} profil dimuat` : 'Profil dibaca dari direktori akun sekolah.'}</p>
          </div>
          <label className="ale-admin-users-search">
            <span>Cari nama atau email</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ketik nama atau email"
            />
          </label>
          <button className="ale-admin-users-button secondary" type="button" onClick={() => ambilHalaman(null, true)} disabled={loading}>
            {loading ? 'Memuat…' : 'Muat ulang'}
          </button>
        </div>
        {error && <p className="ale-admin-users-error" role="alert">{error}</p>}
        {loading && !users.length ? (
          <p className="ale-admin-users-empty" role="status">Memuat daftar pengguna…</p>
        ) : !error && !daftar.length ? (
          <p className="ale-admin-users-empty">{search ? 'Tidak ada pengguna yang cocok dengan pencarian.' : 'Belum ada profil pada kategori ini di tenant sekolah.'}</p>
        ) : (
          <div className="ale-admin-users-table-wrap">
            <table className="ale-admin-users-table">
              <thead><tr><th scope="col">Nama</th><th scope="col">Email</th><th scope="col">Peran</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {daftar.map((user) => {
                  const status = statusPengguna(user);
                  return (
                    <tr key={user.uid}>
                      <th scope="row">{namaPengguna(user)}</th>
                      <td>{user.email || 'Email belum dicatat'}</td>
                      <td>{LABEL_PERAN[user.role] || 'Peran belum dicatat'}</td>
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
            <button className="ale-admin-users-button" type="button" onClick={() => ambilHalaman(lastId)} disabled={loading}>
              {loading ? 'Memuat…' : 'Muat 50 berikutnya'}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
