import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.ts';
import '../styles/supabase-platform-users.css';

const ROLES = [
  ['admin_sekolah', 'Admin sekolah'],
  ['operator', 'Operator'],
  ['guru', 'Guru'],
  ['siswa', 'Siswa'],
  ['ortu', 'Orang tua'],
  ['orang_tua', 'Orang tua (alias kompatibilitas)'],
];

const EMPTY_FORM = {
  email: '',
  nama: '',
  role: 'admin_sekolah',
  tenantId: '',
  nip: '',
  mapel: '',
  kelas: '',
  active: true,
};

const displayRole = (role) => ROLES.find(([value]) => value === role)?.[1] || role || 'Belum ditetapkan';

function splitValues(value) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function emailRedirectUrl() {
  return `${window.location.origin}${window.location.pathname}#/platform/supabase-users`;
}

function formatAuthError(error) {
  if (error?.status === 429) return 'Batas email sementara tercapai. Tunggu sebelum mengirim tautan masuk lagi.';
  if (error?.message?.toLowerCase().includes('redirect')) {
    return 'URL callback belum diizinkan. Tambahkan alamat aplikasi ini pada Supabase Authentication → URL Configuration.';
  }
  return error?.message || 'Permintaan tidak berhasil. Silakan coba kembali.';
}

export default function SupabasePlatformUsersPage() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [emailInput, setEmailInput] = useState('kotenraimundusc@gmail.com');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sendingLink, setSendingLink] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadDirectory = useCallback(async (userId) => {
    setLoading(true);
    setError('');
    try {
      const { data: ownProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id,email,nama,role,active,instansi')
        .eq('id', userId)
        .maybeSingle();
      if (profileError) throw profileError;
      if (ownProfile?.role !== 'superadmin' || ownProfile.active !== true) {
        await supabase.auth.signOut({ scope: 'local' });
        setSession(null);
        setProfile(null);
        setError('Akses ditolak. Masuklah menggunakan akun superadmin Supabase yang aktif.');
        return;
      }

      const [directoryResult, tenantResult, allowlistResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('id,email,nama,role,tenant_id,instansi,nip,mapel_ids,kelas_ids,active')
          .order('email')
          .limit(500),
        supabase.from('tenants').select('id,name,active').order('name').limit(200),
        supabase.from('user_allowlist').select('email,role,tenant_id,active').order('email').limit(500),
      ]);
      if (directoryResult.error) throw directoryResult.error;
      if (tenantResult.error) throw tenantResult.error;
      if (allowlistResult.error) throw allowlistResult.error;

      setProfile(ownProfile);
      const availableTenants = (tenantResult.data || []).filter((tenant) => tenant.active);
      const profilesByEmail = new Map((directoryResult.data || [])
        .filter((user) => user.email)
        .map((user) => [user.email.toLowerCase(), user]));
      const allowlistedProfiles = (allowlistResult.data || []).map((allowed) => {
        const profile = profilesByEmail.get(allowed.email.toLowerCase());
        const tenant = availableTenants.find((item) => item.id === allowed.tenant_id);
        return profile
          ? {
            ...profile,
            role: profile.role === 'unprovisioned' ? allowed.role : profile.role,
            pendingConfirmation: allowed.active && profile.active !== true,
          }
          : {
            id: `pending:${allowed.email}`,
            email: allowed.email,
            nama: 'Menunggu akun Auth',
            role: allowed.role,
            tenant_id: allowed.tenant_id,
            instansi: tenant?.name || '',
            nip: null,
            mapel_ids: [],
            kelas_ids: [],
            active: false,
            pendingConfirmation: allowed.active,
          };
      });
      const allowlistedEmails = new Set((allowlistResult.data || []).map((item) => item.email.toLowerCase()));
      const unlistedProfiles = (directoryResult.data || []).filter((user) =>
        !user.email || !allowlistedEmails.has(user.email.toLowerCase()));
      setUsers([...allowlistedProfiles, ...unlistedProfiles]);
      setTenants(availableTenants);
    } catch (loadError) {
      console.error('[supabase-platform-users] Gagal memuat direktori:', loadError);
      setError(formatAuthError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession);
    });
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return;
      if (sessionError) {
        setError(formatAuthError(sessionError));
        setLoading(false);
      } else {
        setSession(data.session);
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session?.user?.id) {
      void loadDirectory(session.user.id);
    } else {
      setProfile(null);
      setUsers([]);
      setTenants([]);
      setLoading(false);
    }
  }, [loadDirectory, session?.user?.id]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('id');
    if (!term) return users;
    return users.filter((user) => [
      user.nama, user.email, user.role, user.tenant_id, user.instansi, user.id,
    ].some((value) => String(value || '').toLocaleLowerCase('id').includes(term)));
  }, [search, users]);

  async function sendSignInLink(event) {
    event.preventDefault();
    if (sendingLink) return;
    setSendingLink(true);
    setError('');
    setNotice('');
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: emailInput.trim().toLowerCase(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: emailRedirectUrl(),
        },
      });
      if (otpError) throw otpError;
      setNotice('Tautan masuk telah dikirim. Buka email ini di perangkat yang sama untuk melanjutkan.');
    } catch (sendError) {
      console.error('[supabase-platform-users] Gagal mengirim tautan masuk:', sendError);
      setError(formatAuthError(sendError));
    } finally {
      setSendingLink(false);
    }
  }

  function editUser(user) {
    setForm({
      email: user.email || '',
      nama: user.nama || '',
      role: user.role === 'unprovisioned' ? 'guru' : user.role,
      tenantId: user.tenant_id || '',
      nip: user.nip || '',
      mapel: (user.mapel_ids || []).join(', '),
      kelas: (user.kelas_ids || []).join(', '),
      active: user.active === true,
    });
    setEditing(true);
    setError('');
    setNotice('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveUser(event) {
    event.preventDefault();
    if (saving || !profile) return;
    setSaving(true);
    setError('');
    setNotice('');

    let roleSaved = false;
    try {
      const request = {
        p_email: form.email.trim().toLowerCase(),
        p_nama: form.nama.trim(),
        p_role: form.role,
        p_tenant_id: form.tenantId,
        p_active: form.active,
        p_nip: form.nip.trim() || null,
        p_mapel_ids: splitValues(form.mapel),
        p_kelas_ids: splitValues(form.kelas),
      };
      const { data, error: rpcError } = await supabase.rpc('manage_platform_user', request);
      if (rpcError) throw rpcError;
      roleSaved = true;

      if (data?.invitation_required) {
        setNotice(`Peran ${request.p_role} disimpan pada allowlist untuk ${request.p_email}. Undangan tidak dikirim otomatis; buat atau undang identitas melalui Supabase Auth, lalu konfirmasikan email agar akses aplikasi dapat aktif.`);
      } else {
        setNotice(`Profil ${request.p_email} berhasil diperbarui. Perubahan hak akses berlaku pada token sesi baru pengguna.`);
      }

      setForm(EMPTY_FORM);
      setEditing(false);
      await loadDirectory(session.user.id);
    } catch (saveError) {
      console.error('[supabase-platform-users] Gagal menyimpan perubahan akun:', saveError);
      if (roleSaved) {
        setNotice('Perubahan peran sudah tersimpan, tetapi direktori gagal dimuat ulang. Muat ulang halaman untuk memverifikasi hasilnya.');
        setError(formatAuthError(saveError));
      } else {
        setError(formatAuthError(saveError));
      }
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(formatAuthError(signOutError));
      return;
    }
    setSession(null);
    setProfile(null);
    setUsers([]);
  }

  return (
    <main className="supabase-platform-users">
      <header className="supabase-platform-users__header">
        <p>Administrasi aman · Supabase</p>
        <h1>Manajemen pengguna platform</h1>
        <span>Kelola akses sekolah lintas tenant. Perubahan peran hanya diproses oleh fungsi database dengan izin superadmin.</span>
      </header>

      {error && <p className="supabase-platform-users__message is-error" role="alert">{error}</p>}
      {notice && <p className="supabase-platform-users__message is-notice" role="status">{notice}</p>}

      {!session ? (
        <section className="supabase-platform-users__card">
          <h2>Masuk sebagai superadmin</h2>
          <p>Tautan sekali pakai dikirim melalui Supabase Auth. Kata sandi tidak diminta atau disimpan oleh aplikasi ini.</p>
          <form onSubmit={sendSignInLink}>
            <label htmlFor="supabase-admin-email">Email akun</label>
            <input
              id="supabase-admin-email"
              type="email"
              autoComplete="email"
              required
              value={emailInput}
              onChange={(event) => setEmailInput(event.target.value)}
            />
            <button type="submit" disabled={sendingLink}>
              {sendingLink ? 'Mengirim tautan…' : 'Kirim tautan masuk'}
            </button>
          </form>
          {loading && <p role="status">Memeriksa sesi…</p>}
        </section>
      ) : profile ? (
        <>
          <div className="supabase-platform-users__session">
            <span>Masuk: <strong>{profile.email}</strong></span>
            <button type="button" className="is-secondary" onClick={signOut}>Keluar</button>
          </div>

          <section className="supabase-platform-users__card" aria-labelledby="supabase-user-form-title">
            <h2 id="supabase-user-form-title">{editing ? 'Ubah akses pengguna' : 'Tambahkan pengguna'}</h2>
            <p>Peran superadmin tidak dapat diberikan melalui formulir ini. Akun baru hanya dimasukkan ke allowlist; identitas Auth harus dibuat dan dikonfirmasi sebelum akses aktif.</p>
            <form className="supabase-platform-users__form" onSubmit={saveUser}>
              <label>
                Nama lengkap
                <input
                  required minLength={2} maxLength={120}
                  value={form.nama}
                  onChange={(event) => setForm((current) => ({ ...current, nama: event.target.value }))}
                />
              </label>
              <label>
                Email
                <input
                  required type="email" maxLength={254}
                  disabled={editing}
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
              <label>
                Peran
                <select
                  value={form.role}
                  onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
                >
                  {ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>
                Instansi / sekolah
                <select
                  required
                  value={form.tenantId}
                  onChange={(event) => setForm((current) => ({ ...current, tenantId: event.target.value }))}
                >
                  <option value="">Pilih instansi</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.id}</option>
                  ))}
                </select>
              </label>
              <label>
                NIP / NUPTK
                <input
                  maxLength={40}
                  value={form.nip}
                  onChange={(event) => setForm((current) => ({ ...current, nip: event.target.value }))}
                />
              </label>
              <label>
                Mata pelajaran
                <input
                  placeholder="Pisahkan dengan koma"
                  value={form.mapel}
                  onChange={(event) => setForm((current) => ({ ...current, mapel: event.target.value }))}
                />
              </label>
              <label>
                Kelas
                <input
                  placeholder="Pisahkan dengan koma"
                  value={form.kelas}
                  onChange={(event) => setForm((current) => ({ ...current, kelas: event.target.value }))}
                />
              </label>
              <label className="supabase-platform-users__checkbox">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                />
                Aktifkan akses setelah akun dikonfirmasi
              </label>
              <div className="supabase-platform-users__actions">
                <button type="submit" disabled={saving}>
                  {saving ? 'Menyimpan…' : editing ? 'Simpan perubahan' : 'Tambahkan ke allowlist'}
                </button>
                {editing && (
                  <button
                    type="button"
                    className="is-secondary"
                    disabled={saving}
                    onClick={() => { setForm(EMPTY_FORM); setEditing(false); }}
                  >
                    Batal
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="supabase-platform-users__card">
            <div className="supabase-platform-users__toolbar">
              <div>
                <h2>Pengguna terdaftar</h2>
                <p>{users.length} profil dimuat · maksimum 500 per permintaan</p>
              </div>
              <label>
                <span className="visually-hidden">Cari pengguna</span>
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, email, peran, sekolah…" />
              </label>
              <button type="button" className="is-secondary" disabled={loading} onClick={() => void loadDirectory(session.user.id)}>
                {loading ? 'Memuat…' : 'Muat ulang'}
              </button>
            </div>
            {loading ? <p role="status">Memuat daftar pengguna…</p> : (
              <div className="supabase-platform-users__table-wrap">
                <table>
                  <thead>
                    <tr><th>Nama</th><th>Email</th><th>Peran</th><th>Instansi</th><th>Status</th><th>Aksi</th></tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id}>
                        <td>{user.nama || 'Belum diisi'}{user.nip && <small>NIP/NUPTK: {user.nip}</small>}</td>
                        <td>{user.email || '—'}</td>
                        <td>{displayRole(user.role)}</td>
                        <td>{user.instansi || user.tenant_id || '—'}</td>
                        <td>{user.pendingConfirmation ? 'Menunggu Auth / konfirmasi' : user.active ? 'Aktif' : 'Nonaktif'}</td>
                        <td>
                          {user.role !== 'superadmin' && (
                            <button type="button" className="is-secondary" onClick={() => editUser(user)}>Ubah akses</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filteredUsers.length && <p className="supabase-platform-users__empty">Tidak ada profil yang cocok.</p>}
              </div>
            )}
          </section>
        </>
      ) : !loading ? (
        <section className="supabase-platform-users__card">
          <h2>Akses terbatas</h2>
          <p>Sesi Supabase ini bukan superadmin aktif. Silakan gunakan akun pemilik platform.</p>
          <button type="button" className="is-secondary" onClick={signOut}>Keluar</button>
        </section>
      ) : <p role="status">Memeriksa hak akses superadmin…</p>}
    </main>
  );
}
