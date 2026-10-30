import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { muatPengaturanTenant, simpanProfilTenant, simpanKopSuratTenant } from '../services/tenantSettings.js';
import { buatTenantPlatform, muatHalamanDirektoriTenant } from '../services/platformTenantDirectory.js';
import {
  buatTautanKopSuratTenant,
  hapusKopSuratTenant,
  unggahKopSuratTenant,
} from '../services/tenantLetterhead.js';
import '../styles/platform-tenants.css';

const UKURAN_HALAMAN = 40;

function statusTenant(active) {
  return active
    ? { label: 'Aktif', className: 'is-active' }
    : { label: 'Nonaktif', className: 'is-inactive' };
}

function statusPesanan(status) {
  return {
    creating: 'Dibuat',
    pending: 'Menunggu pembayaran',
    paid: 'Lunas',
    paid_review: 'Menunggu verifikasi',
    failed: 'Gagal',
  }[status] || 'Belum ada pesanan';
}

function rupiah(value) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
}

function waktu(value) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(value));
}

function TenantLetterheadDialog({ tenant, user, onClose }) {
  const dialogRef = useRef(null);
  const [settings, setSettings] = useState(null);
  const [kopUrl, setKopUrl] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!tenant) {
      if (dialog?.open) dialog.close();
      return undefined;
    }
    if (dialog && !dialog.open) dialog.showModal();
    let active = true;
    setSettings(null);
    setKopUrl('');
    setFile(null);
    setError('');
    setNotice('');

    async function load() {
      try {
        const result = await muatPengaturanTenant(tenant.id);
        if (!active) return;
        setSettings(result);
        if (result.kopSuratTersedia && result.kopSuratPath) {
          try {
            setKopUrl(await buatTautanKopSuratTenant(tenant.id, result.kopSuratPath));
          } catch (cause) {
            console.error('[platform-tenants] Kop tenant tidak dapat dibuka:', cause);
            if (active) setError('Metadata tenant termuat, tetapi kop belum dapat dibuka.');
          }
        }
      } catch (cause) {
        console.error('[platform-tenants] Pengaturan kop tenant gagal dimuat:', cause);
        if (active) setError('Pengaturan sekolah tidak dapat dimuat. Periksa RLS dan migration tenant.');
      }
    }
    void load();
    return () => { active = false; };
  }, [tenant]);

  async function saveAddress(event) {
    event.preventDefault();
    if (!tenant || !settings || busy) return;
    setBusy('address');
    setError('');
    setNotice('');
    try {
      const saved = await simpanProfilTenant(tenant.id, user?.uid, {
        nama: settings.nama,
        npsn: settings.npsn,
        kepalaSekolah: settings.kepalaSekolah,
        nipKepalaSekolah: settings.nipKepalaSekolah,
        alamat: settings.alamat,
      });
      setSettings(saved);
      setNotice(saved.kopSuratTersedia
        ? 'Alamat sekolah resmi berhasil disimpan.'
        : 'Profil tenant tersimpan; alamat menunggu migration tenant letterhead.');
    } catch (cause) {
      console.error('[platform-tenants] Alamat tenant tidak dapat disimpan:', cause);
      setError(cause?.message || 'Alamat sekolah tidak dapat disimpan.');
    } finally {
      setBusy('');
    }
  }

  async function uploadLetterhead() {
    if (!tenant || !file || busy) return;
    setBusy('upload');
    setError('');
    setNotice('');
    try {
      const saved = await unggahKopSuratTenant({ tenantId: tenant.id, userId: user?.uid, file });
      setKopUrl(saved.url);
      setSettings((current) => ({ ...current, kopSuratPath: saved.path }));
      setFile(null);
      setNotice('Kop resmi sekolah berhasil diperbarui.');
    } catch (cause) {
      console.error('[platform-tenants] Kop tenant tidak dapat diunggah:', cause);
      setError(cause?.message || 'Kop sekolah tidak dapat diunggah.');
    } finally {
      setBusy('');
    }
  }

  async function removeLetterhead() {
    if (!tenant || !settings?.kopSuratPath || busy ||
      !window.confirm(`Hapus kop surat untuk ${tenant.name || tenant.id}?`)) return;
    setBusy('remove');
    setError('');
    setNotice('');
    try {
      const result = await hapusKopSuratTenant({ tenantId: tenant.id, userId: user?.uid });
      setKopUrl('');
      setSettings((current) => ({ ...current, kopSuratPath: '' }));
      setNotice(result.assetDeleted
        ? 'Kop resmi sekolah berhasil dihapus.'
        : 'Kop dilepas dari tenant, tetapi file privat lama belum berhasil dibersihkan.');
    } catch (cause) {
      console.error('[platform-tenants] Kop tenant tidak dapat dihapus:', cause);
      setError(cause?.message || 'Kop sekolah tidak dapat dihapus.');
    } finally {
      setBusy('');
    }
  }

  if (!tenant) return null;

  return (
    <dialog
      ref={dialogRef}
      className="platform-tenant-letterhead-dialog"
      aria-labelledby="tenant-letterhead-title"
      onClose={onClose}
    >
      <header className="platform-tenant-letterhead-heading">
        <div>
          <p className="platform-tenants-kicker">Aset resmi tenant</p>
          <h2 id="tenant-letterhead-title">Kop Surat Sekolah</h2>
          <p>{tenant.name || tenant.id} · {tenant.id}</p>
        </div>
        <button className="platform-tenants-button secondary" type="button" onClick={() => dialogRef.current?.close()}>
          Tutup
        </button>
      </header>

      {error && <p className="platform-tenants-error" role="alert">{error}</p>}
      {notice && <p className="platform-tenant-letterhead-notice" role="status">{notice}</p>}
      {!settings ? <p role="status">Memuat profil sekolah…</p> : (
        <>
          {!settings.kopSuratTersedia && (
            <p className="platform-tenant-letterhead-notice" role="note">
              Fitur alamat dan kop menunggu migration tenant letterhead tervalidasi. Profil dasar tetap dapat dibaca.
            </p>
          )}
          <form className="platform-tenant-letterhead-form" onSubmit={saveAddress}>
            <label>
              Alamat resmi sekolah
              <textarea
                rows={3}
                maxLength={300}
                value={settings.alamat}
                onChange={(event) => setSettings((current) => ({ ...current, alamat: event.target.value }))}
                disabled={!settings.kopSuratTersedia || Boolean(busy)}
              />
            </label>
            <button type="submit" className="platform-tenants-button" disabled={!settings.kopSuratTersedia || Boolean(busy)}>
              {busy === 'address' ? 'Menyimpan…' : 'Simpan alamat'}
            </button>
          </form>

          <div className="platform-tenant-letterhead-preview">
            {kopUrl
              ? <img src={kopUrl} alt={`Kop resmi ${tenant.name || 'sekolah'}`} referrerPolicy="no-referrer" />
              : <p>Belum ada kop surat yang diunggah.</p>}
          </div>
          <div className="platform-tenant-letterhead-form">
            <label>
              Gambar kop sekolah (PNG, JPEG, atau WebP, maksimal 2 MiB)
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                disabled={!settings.kopSuratTersedia || Boolean(busy)}
              />
            </label>
            <div className="platform-tenant-letterhead-actions">
              <button type="button" className="platform-tenants-button" onClick={() => void uploadLetterhead()}
                disabled={!settings.kopSuratTersedia || Boolean(busy) || !file}>
                {busy === 'upload' ? 'Mengunggah…' : 'Unggah / ganti kop'}
              </button>
              <button type="button" className="platform-tenants-button secondary" onClick={() => void removeLetterhead()}
                disabled={!settings.kopSuratTersedia || Boolean(busy) || !settings.kopSuratPath}>
                {busy === 'remove' ? 'Menghapus…' : 'Hapus kop'}
              </button>
            </div>
          </div>
        </>
      )}
    </dialog>
  );
}

export default function PlatformTenantsPage() {
  const { role, user } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [tenantKop, setTenantKop] = useState(null);
  const [tenantForm, setTenantForm] = useState({ id: '', name: '' });
  const [creatingTenant, setCreatingTenant] = useState(false);
  const [notice, setNotice] = useState('');
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
      const data = await muatHalamanDirektoriTenant({
        after: berikutnya ? cursor.current : null,
        limit: UKURAN_HALAMAN + 1,
      });

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

  async function createTenant(event) {
    event.preventDefault();
    if (creatingTenant) return;
    setCreatingTenant(true);
    setError('');
    setNotice('');
    try {
      const created = await buatTenantPlatform(tenantForm);
      setTenantForm({ id: '', name: '' });
      setNotice(`Tenant ${created.name} (${created.tenant_id}) berhasil dibuat dan dicatat pada audit platform.`);
      await muat();
    } catch (cause) {
      console.error('[platform-tenants] Gagal membuat tenant:', cause);
      setError(cause?.code === '23505'
        ? 'ID tenant sudah digunakan. Pilih ID yang berbeda.'
        : cause?.code === '42501'
          ? 'Pembuatan tenant ditolak. Pastikan sesi superadmin masih aktif.'
          : cause?.message || 'Tenant tidak dapat dibuat.');
    } finally {
      setCreatingTenant(false);
    }
  }

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
        <p>Ringkasan tenant, akun, roster, dan pesanan sekolah terbaru diambil melalui fungsi backend superadmin. Perubahan akses dan langganan tidak dilakukan dari direktori ini.</p>
      </header>

      <section className="platform-tenants-card" aria-labelledby="create-tenant-title">
        <h2 id="create-tenant-title">Tambah tenant sekolah</h2>
        <p>Tenant dibuat aktif. Penambahan tenant tidak membuat pengguna atau mengubah status langganan.</p>
        <form className="platform-tenant-create-form" onSubmit={createTenant}>
          <label>
            ID tenant (slug)
            <input
              required
              minLength={3}
              maxLength={80}
              pattern="[a-z0-9]+([a-z0-9-]*[a-z0-9])?"
              autoComplete="off"
              value={tenantForm.id}
              onChange={(event) => setTenantForm((current) => ({ ...current, id: event.target.value.toLowerCase() }))}
              placeholder="contoh: sekolah-baru"
            />
          </label>
          <label>
            Nama sekolah
            <input
              required
              minLength={2}
              maxLength={160}
              value={tenantForm.name}
              onChange={(event) => setTenantForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Nama resmi sekolah"
            />
          </label>
          <button type="submit" className="platform-tenants-button" disabled={creatingTenant}>
            {creatingTenant ? 'Membuat tenant…' : 'Buat tenant'}
          </button>
        </form>
        {notice && <p className="platform-tenant-letterhead-notice" role="status">{notice}</p>}
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
                  <th scope="col">Akun aktif / total</th>
                  <th scope="col">Roster siswa</th>
                  <th scope="col">Pesanan sekolah terbaru</th>
                  <th scope="col"><span className="platform-tenants-sr-only">Kop surat</span></th>
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
                      <td>{tenant.activeProfileCount.toLocaleString('id-ID')} / {tenant.profileCount.toLocaleString('id-ID')}</td>
                      <td>{tenant.studentCount.toLocaleString('id-ID')}</td>
                      <td>{tenant.latestPlanName ? (
                        <>
                          {tenant.latestPlanName}
                          <small>{statusPesanan(tenant.latestOrderStatus)} · {rupiah(tenant.latestOrderTotal)} · {waktu(tenant.latestOrderCreatedAt)}</small>
                        </>
                      ) : 'Belum ada pesanan sekolah'}
                      </td>
                      <td><button className="platform-tenants-button secondary" type="button" onClick={() => setTenantKop(tenant)}>Kop surat</button></td>
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
      <TenantLetterheadDialog tenant={tenantKop} user={user} onClose={() => setTenantKop(null)} />
    </main>
  );
}
