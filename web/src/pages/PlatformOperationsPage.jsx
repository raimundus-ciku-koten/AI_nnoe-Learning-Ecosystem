import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase.ts';
import { useAuth } from '../context/AuthContext.jsx';
import { usePlatformControls } from '../context/PlatformControlContext.jsx';
import { GRUP_MENU, MENU_ADMIN_SEKOLAH, MENU_SUPERADMIN, menuUntukPeran } from '../navigasi.js';
import { setPlatformControl } from '../services/platformAdminApi.js';
import {
  loadManageableUsers,
  loadUserMenuRestrictions,
  saveUserMenuRestrictions,
} from '../services/userMenuAccess.js';
import {
  formatRupiah,
  hargaEkuivalenBulanan,
  KELOMPOK_PAKET,
  NOMOR_WHATSAPP_OWNER,
  tautanWhatsApp,
} from '../services/publicPricing.js';
import '../styles/platform-tenants.css';

const PERAN_MENU = [
  ['Superadmin', 'superadmin'],
  ['Admin sekolah', 'admin_sekolah'],
  ['Guru', 'guru'],
  ['Operator', 'operator'],
  ['Siswa', 'siswa'],
  ['Orang tua', 'ortu'],
];

const INFO_MODUL = {
  '/platform/dashboard/kesehatan': {
    judul: 'Kesehatan Sistem',
    ringkasan: 'Status konfigurasi aplikasi yang dapat dibaca dari klien. Kesehatan layanan backend harus diverifikasi melalui dashboard Supabase.',
    status: 'Sebagian tersedia',
    tindakan: 'Metrik operasional tidak dapat disimpulkan dari konfigurasi klien.',
  },
  '/platform/dashboard/statistik': {
    judul: 'Statistik Global',
    ringkasan: 'Snapshot agregat baris Supabase yang diizinkan untuk superadmin. Bukan pengguna aktif, telemetry historis, atau metrik biaya.',
    status: 'Snapshot Supabase',
    tindakan: 'Jumlah profil bukan jumlah akun Auth aktif. Muat ulang untuk mengambil hitungan terbaru.',
  },
  '/platform/dashboard/aktivitas': {
    judul: 'Log Aktivitas Platform',
    ringkasan: 'Riwayat provisioning akun platform dan perubahan kontrol yang dicatat layanan backend Supabase.',
    status: 'Audit operasi backend',
    tindakan: 'Log hanya mencakup operasi yang tercatat backend; bukan audit seluruh aktivitas pengguna.',
  },
  '/platform/tenant/status': {
    judul: 'Status Tenant',
    ringkasan: 'Status aktif atau nonaktif sekolah dapat ditinjau di direktori tenant.',
    status: 'Baca-saja tersedia',
    tindakan: 'Halaman ini hanya menampilkan status operasional tenant secara baca-saja.',
    link: { href: '#/platform/tenant/sekolah', label: 'Buka daftar sekolah' },
  },
  '/platform/pengguna/peran': {
    judul: 'Peran Global',
    ringkasan: 'Metadata peran Supabase Auth dan kebijakan RLS menentukan izin efektif. Matriks menu hanya memperlihatkan navigasi aplikasi.',
    status: 'Matriks navigasi tersedia',
    tindakan: 'Perubahan klaim peran tetap melalui proses provisioning tepercaya; tidak ada perubahan peran dari browser.',
  },
  '/platform/fitur/flags': {
    judul: 'Feature Flags',
    ringkasan: 'Kontrol fitur platform yang disimpan dan diperiksa oleh backend Supabase.',
    status: 'Dikelola server dan diaudit',
    tindakan: 'Perubahan divalidasi oleh RPC Supabase yang membatasi superadmin dan menulis audit backend.',
  },
  '/platform/ai/api-key': {
    judul: 'API Key Gemini',
    ringkasan: 'Kunci model AI harus dikelola sebagai secret backend dan tidak pernah ditampilkan dari browser.',
    status: 'Dikelola server',
    tindakan: 'Periksa dan rotasi kunci melalui secret manager backend; aplikasi tidak dapat mengonfirmasi nilainya.',
  },
  '/platform/ai/prompt': {
    judul: 'Template Prompt',
    ringkasan: 'Prompt AI saat ini ditetapkan di kode layanan, belum melalui katalog template global yang terversi.',
    status: 'Belum dikelola dari platform',
    tindakan: 'Ubah prompt melalui proses perubahan kode dan pengujian; jangan menyimpan prompt baru ke koleksi tanpa skema dan audit.',
  },
  '/platform/ai/monitoring': {
    judul: 'Monitoring Penggunaan AI',
    ringkasan: 'Agregat pemakaian AI lintas tenant belum disediakan oleh backend Supabase.',
    status: 'Metrik tidak tersedia',
    tindakan: 'Jangan menganggap angka penggunaan atau biaya tersedia pada dashboard ini.',
  },
  '/platform/keamanan/rules': {
    judul: 'Supabase RLS',
    ringkasan: 'Row Level Security dan fungsi otorisasi PostgreSQL membatasi akses tenant dan pengguna.',
    status: 'Pemeriksaan lokal tidak sama dengan deployment',
    tindakan: 'Terapkan dan verifikasi migrasi pada project target; hasil tes lokal tidak membuktikan kebijakan hosted aktif.',
  },
  '/platform/keamanan/audit': {
    judul: 'Audit Log',
    ringkasan: 'Riwayat pembuatan akun dan perubahan kontrol platform yang dicatat server dan hanya dapat dibaca superadmin.',
    status: 'Audit operasi backend',
    tindakan: 'Log mencatat pembuatan akun serta perubahan maintenance mode dan feature flags melalui API; bukan audit umum semua aktivitas.',
  },
  '/platform/laporan/penggunaan': {
    judul: 'Penggunaan Platform',
    ringkasan: 'Ringkasan berikut merupakan jumlah dokumen saat ini, bukan metrik pengguna aktif atau telemetry historis.',
    status: 'Snapshot Supabase',
    tindakan: 'Jumlah profil tidak sama dengan jumlah akun Auth aktif.',
  },
  '/platform/laporan/performa': {
    judul: 'Performa Platform',
    ringkasan: 'Frontend ini tidak mengumpulkan metrik latensi, availability, atau performa lintas tenant.',
    status: 'Metrik tidak tersedia',
    tindakan: 'Observabilitas operasional belum tersedia pada aplikasi.',
  },
  '/platform/laporan/biaya': {
    judul: 'Biaya Platform',
    ringkasan: 'Data biaya operasional belum tersedia pada aplikasi ini.',
    status: 'Metrik tidak tersedia',
  },
  '/platform/pengaturan/konfigurasi': {
    judul: 'Konfigurasi Platform',
    ringkasan: 'Konfigurasi publik yang dipakai aplikasi saat ini. Kunci privat tidak ditampilkan.',
    status: 'Konfigurasi klien',
    tindakan: 'Perubahan konfigurasi dilakukan melalui environment deployment dan proses rilis.',
  },
  '/platform/pengaturan/integrasi': {
    judul: 'Integrasi Platform',
    ringkasan: 'Status integrasi secret atau layanan pihak ketiga tidak tersedia bagi browser.',
    status: 'Pemeriksaan server diperlukan',
    tindakan: 'Verifikasi secret, webhook, dan koneksi backend tanpa mengekspos nilainya.',
  },
  '/platform/pengaturan/cadangan': {
    judul: 'Cadangan Platform',
    ringkasan: 'Jadwal dan hasil backup database tidak dicatat dalam aplikasi.',
    status: 'Pemeriksaan server diperlukan',
    tindakan: 'Konfigurasikan dan verifikasi backup database melalui provider yang digunakan.',
  },
  '/platform/pengaturan/pemeliharaan': {
    judul: 'Mode Pemeliharaan',
    ringkasan: 'Hentikan akses aplikasi bagi pengguna non-superadmin. Keadaan diperiksa langsung oleh UI dan endpoint AI.',
    status: 'Dikelola server dan diaudit',
    tindakan: 'Mengaktifkan mode ini akan memblokir area aplikasi dan endpoint AI; superadmin tetap dapat mengakses konsol.',
  },
  '/platform/konten/template': {
    judul: 'Template Perangkat',
    ringkasan: 'Belum tersedia katalog template global terpisah dengan versi, status publikasi, dan kontrol akses lintas tenant.',
    status: 'Belum terintegrasi',
    tindakan: 'Template belum dapat diterbitkan atau diubah dari browser. Tetapkan skema dan alur persetujuan sebelum menyediakan editor global.',
  },
  '/platform/konten/bank-soal': {
    judul: 'Bank Soal Global',
    ringkasan: 'Konten bank soal dapat memuat kunci jawaban atau materi berlisensi dan tidak boleh dibuka melalui pembacaan global dari klien.',
    status: 'Tidak tersedia untuk akses global klien',
    tindakan: 'Gunakan bank soal yang dibatasi tenant. Katalog global perlu API server yang hanya mengembalikan metadata terkurasi.',
  },
  '/platform/konten/modul': {
    judul: 'Modul Global',
    ringkasan: 'Belum tersedia katalog modul global yang terpisah dari dokumen sekolah dan memiliki kontrol publikasi lintas tenant.',
    status: 'Belum terintegrasi',
    tindakan: 'Data modul lintas tenant tidak dibaca dari browser karena belum ada API metadata yang membatasi cakupan data.',
  },
};

function KartuInfo({ info }) {
  return (
    <>
      <header className="platform-tenants-heading">
        <p className="platform-tenants-kicker">Pusat kendali · superadmin</p>
        <h1>{info.judul}</h1>
        <p>{info.ringkasan}</p>
      </header>
      <section className="platform-tenants-card">
        <span className="platform-tenants-status is-unknown">{info.status}</span>
        <p>{info.tindakan}</p>
        {info.link && <a className="platform-tenants-button platform-ops-console" href={info.link.href}>{info.link.label}</a>}
      </section>
    </>
  );
}

function DaftarPaket() {
  return (
    <>
      <header className="platform-tenants-heading">
        <p className="platform-tenants-kicker">Manajemen tenant · katalog</p>
        <h1>Paket</h1>
        <p>Harga informatif bersumber dari katalog. Hubungi owner untuk bertanya tentang ketentuan paket.</p>
      </header>
      <section className="platform-tenants-card">
        <div className="platform-package-grid">
          {KELOMPOK_PAKET.flatMap((group) => group.plans.map((plan) => (
            <article className="platform-package" key={plan.id}>
              <p>{group.label}</p>
              <h2>{plan.name}</h2>
              <strong>{formatRupiah(plan.annualPrice)}<small> / tahun</small></strong>
              <span>{formatRupiah(hargaEkuivalenBulanan(plan.annualPrice))} / bulan, ekuivalen katalog tahunan</span>
              <a href={tautanWhatsApp(plan.name)} target="_blank" rel="noopener noreferrer">
                Tanya melalui WhatsApp (+{NOMOR_WHATSAPP_OWNER})
              </a>
            </article>
          )))}
        </div>
        <p className="platform-ops-note">Harga bulanan merupakan ekuivalen katalog tahunan dibagi 10, bukan opsi penagihan.</p>
      </section>
    </>
  );
}

function DaftarPeran({ mode }) {
  const semuaGrup = MENU_SUPERADMIN;
  const matriks = PERAN_MENU.map(([label, role]) => ({
    label,
    role,
    grup: menuUntukPeran(role),
  }));
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedMenuRole, setSelectedMenuRole] = useState('');
  const [disabledKeys, setDisabledKeys] = useState(() => new Set());
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingRestrictions, setLoadingRestrictions] = useState(false);
  const [savingRestrictions, setSavingRestrictions] = useState(false);
  const [menuError, setMenuError] = useState('');
  const [menuNotice, setMenuNotice] = useState('');

  useEffect(() => {
    if (mode !== 'menu') return undefined;
    let current = true;
    setLoadingUsers(true);
    setMenuError('');
    loadManageableUsers()
      .then((rows) => {
        if (!current) return;
        setUsers(rows);
        setSelectedUserId((selected) =>
          rows.some((user) => user.id === selected) ? selected : (rows[0]?.id || ''));
      })
      .catch((error) => {
        console.error('[platform-menu] Gagal memuat daftar akun:', error);
        if (current) setMenuError(error?.message || 'Daftar akun tidak dapat dimuat.');
      })
      .finally(() => { if (current) setLoadingUsers(false); });
    return () => { current = false; };
  }, [mode]);

  useEffect(() => {
    if (mode !== 'menu' || !selectedUserId) {
      setDisabledKeys(new Set());
      return undefined;
    }
    let current = true;
    setLoadingRestrictions(true);
    setDisabledKeys(new Set());
    setMenuError('');
    setMenuNotice('');
    loadUserMenuRestrictions(selectedUserId)
      .then((keys) => { if (current) setDisabledKeys(keys); })
      .catch((error) => {
        console.error('[platform-menu] Gagal memuat pembatasan akun:', error);
        if (current) {
          setDisabledKeys(new Set());
          setMenuError(error?.message || 'Pembatasan menu tidak dapat dimuat.');
        }
      })
      .finally(() => { if (current) setLoadingRestrictions(false); });
    return () => { current = false; };
  }, [mode, selectedUserId]);

  const selectedUser = users.find((user) => user.id === selectedUserId);
  const assignedRoles = selectedUser?.roles?.length
    ? selectedUser.roles
    : (selectedUser?.role ? [selectedUser.role] : []);
  const activeMenuRole = assignedRoles.includes(selectedMenuRole)
    ? selectedMenuRole
    : (assignedRoles[0] || '');
  const userMenuGroups = activeMenuRole ? menuUntukPeran(activeMenuRole) : [];

  useEffect(() => {
    setSelectedMenuRole(assignedRoles[0] || '');
  }, [selectedUserId, users]);

  function setMenuDisabled(key, disabled) {
    setDisabledKeys((current) => {
      const next = new Set(current);
      if (disabled) next.add(key);
      else next.delete(key);
      return next;
    });
    setMenuNotice('');
  }

  async function saveRestrictions() {
    if (!selectedUserId || savingRestrictions) return;
    setSavingRestrictions(true);
    setMenuError('');
    setMenuNotice('');
    try {
      await saveUserMenuRestrictions(selectedUserId, [...disabledKeys]);
      setMenuNotice('Pembatasan menu berhasil disimpan dan dicatat di audit platform.');
    } catch (error) {
      console.error('[platform-menu] Gagal menyimpan pembatasan akun:', error);
      setMenuError(error?.message || 'Pembatasan menu gagal disimpan.');
    } finally {
      setSavingRestrictions(false);
    }
  }

  return (
    <>
      <header className="platform-tenants-heading">
        <p className="platform-tenants-kicker">Kontrol akses · katalog aplikasi</p>
        <h1>{mode === 'menu' ? 'Katalog menu platform' : 'Matriks menu dan peran'}</h1>
        <p>
          {mode === 'menu'
            ? 'Daftar menu superadmin yang berasal dari katalog navigasi aplikasi.'
            : 'Matriks ini menampilkan grup menu yang disediakan frontend menurut peran. Supabase Auth dan RLS tetap menjadi sumber otorisasi.'}
        </p>
      </header>
      <section className="platform-tenants-card">
        {mode === 'menu' ? (
          <>
            <div className="platform-ops-menu-list">
              {semuaGrup.map((group) => (
                <article key={group.id}>
                  <h2>{group.label}</h2>
                  <ul>{group.item.map((item) => <li key={`${item.path}${item.search || ''}`}><a href={`#${item.path}${item.search || ''}`}>{item.label}</a></li>)}</ul>
                </article>
              ))}
            </div>
            <section aria-labelledby="platform-menu-account-heading">
              <h2 id="platform-menu-account-heading">Pembatasan menu per akun</h2>
              <p>Pilih akun dan peran aktif akun tersebut, lalu batasi grup atau submenu. Pembatasan diterapkan ke navigasi dan akses URL langsung.</p>
              {loadingUsers ? <p role="status">Memuat akun…</p> : (
                <label>
                  Akun pengguna
                  <select
                    value={selectedUserId}
                    onChange={(event) => setSelectedUserId(event.target.value)}
                    disabled={!users.length || loadingRestrictions || savingRestrictions}
                  >
                    {!users.length && <option value="">Tidak ada akun aktif yang dapat dikelola</option>}
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.nama || user.email || user.id} · {user.role}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {menuError && <p role="alert">{menuError}</p>}
              {menuNotice && <p role="status">{menuNotice}</p>}
              {loadingRestrictions ? <p role="status">Memuat konfigurasi menu akun…</p> : selectedUser && (
                <>
                  {assignedRoles.length > 1 && (
                    <label>
                      Peran yang diatur
                      <select
                        aria-label="Peran untuk pembatasan menu"
                        value={activeMenuRole}
                        onChange={(event) => setSelectedMenuRole(event.target.value)}
                        disabled={savingRestrictions}
                      >
                        {assignedRoles.map((role) => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="platform-ops-menu-list">
                    {userMenuGroups.map((group) => (
                      <article key={group.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={disabledKeys.has(`group:${group.id}`)}
                            onChange={(event) => setMenuDisabled(`group:${group.id}`, event.target.checked)}
                            disabled={savingRestrictions}
                          />
                          Batasi seluruh grup: {group.label}
                        </label>
                        <ul>
                          {group.item.map((item) => (
                            <li key={`${item.path}${item.search || ''}`}>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={disabledKeys.has(`path:${item.path}`)}
                                  onChange={(event) => setMenuDisabled(`path:${item.path}`, event.target.checked)}
                                  disabled={savingRestrictions}
                                />
                                Batasi submenu: {item.label}
                              </label>
                            </li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                </>
              )}
              {selectedUser && (
                <button
                  type="button"
                  onClick={() => void saveRestrictions()}
                  disabled={loadingRestrictions || savingRestrictions || Boolean(menuError)}
                >
                  {savingRestrictions ? 'Menyimpan…' : 'Simpan pembatasan menu'}
                </button>
              )}
            </section>
          </>
        ) : (
          <div className="platform-tenants-table-wrap">
            <table className="platform-tenants-table">
              <thead><tr><th scope="col">Peran</th><th scope="col">Grup menu</th><th scope="col">Tautan</th></tr></thead>
              <tbody>
                {matriks.map(({ label, role, grup }) => (
                  <tr key={role}>
                    <th scope="row">{label}</th>
                    <td>{grup.map((section) => section.label).join(' · ')}</td>
                    <td>{grup.reduce((total, section) => total + section.item.length, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {mode === 'peran' && (
          <p className="platform-ops-note">
            {GRUP_MENU.length + MENU_ADMIN_SEKOLAH.length} grup guru dan admin sekolah didefinisikan terpisah dari {MENU_SUPERADMIN.length} grup superadmin.
            Perubahan hak akses global membutuhkan perubahan claim dan Security Rules yang teruji.
          </p>
        )}
      </section>
    </>
  );
}

function KontrolToggle({ label, description, enabled, setting, danger = false }) {
  const [draft, setDraft] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const dirty = draft !== enabled;

  useEffect(() => {
    setDraft(enabled);
  }, [enabled]);

  async function simpan() {
    if (!dirty || busy) return;
    if (danger && draft && !window.confirm(
      'Aktifkan mode pemeliharaan? Pengguna selain superadmin akan kehilangan akses ke aplikasi.',
    )) return;

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await setPlatformControl(setting(draft));
      setNotice(result.changed ? 'Perubahan tersimpan dan tercatat di audit.' : 'Kontrol sudah memiliki nilai tersebut; tidak ada perubahan baru.');
    } catch (err) {
      console.error('[platform-controls] Gagal menyimpan kontrol:', err);
      setError(err?.code === '42501'
        ? 'Supabase menolak perubahan. Pastikan akun memiliki izin superadmin.'
        : 'Kontrol gagal disimpan. Periksa koneksi dan coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`platform-control-row${danger ? ' is-danger' : ''}`}>
      <div>
        <h2>{label}</h2>
        <p>{description}</p>
        <span className={`platform-tenants-status ${enabled ? (danger ? 'is-inactive' : 'is-active') : 'is-unknown'}`}>
          {enabled ? 'Aktif' : 'Nonaktif'}
        </span>
      </div>
      <label className="platform-control-switch">
        <input
          aria-label={label}
          type="checkbox"
          checked={draft}
          disabled={busy}
          onChange={(event) => { setDraft(event.target.checked); setError(''); setNotice(''); }}
        />
        <span>{draft ? 'Aktif' : 'Nonaktif'}</span>
      </label>
      <button className="platform-tenants-button" type="button" disabled={!dirty || busy} onClick={() => void simpan()}>
        {busy ? 'Menyimpan…' : 'Simpan perubahan'}
      </button>
      {error && <p className="platform-tenants-error" role="alert">{error}</p>}
      {notice && <p className="platform-ops-note" role="status">{notice}</p>}
    </article>
  );
}

function KontrolPlatform({ maintenance = false }) {
  const controls = usePlatformControls();
  const maintenanceAktif = controls.maintenance;

  return (
    <>
      <header className="platform-tenants-heading">
        <p className="platform-tenants-kicker">{maintenance ? 'Pengaturan platform · kontrol akses' : 'Manajemen fitur · kontrol server'}</p>
        <h1>{maintenance ? 'Mode Pemeliharaan' : 'Feature Flags'}</h1>
        <p>{maintenance
          ? 'Tutup akses antarmuka bagi seluruh peran selain superadmin dan hentikan endpoint AI.'
          : 'Aktif/nonaktifkan kemampuan AI yang diperiksa kembali oleh backend Supabase. Perubahan dicatat di audit.'}</p>
      </header>
      {controls.error && <p className="platform-tenants-error" role="alert">{controls.error}</p>}
      <section className="platform-tenants-card">
        {maintenance ? (
          <KontrolToggle
            label="Mode pemeliharaan global"
            description="Pengguna selain superadmin dialihkan ke halaman pemeliharaan. Endpoint AI juga menolak permintaan baru."
            enabled={maintenanceAktif}
            danger
            setting={(enabled) => ({ setting: 'maintenance', enabled })}
          />
        ) : (
          <>
            <KontrolToggle
              label="Asisten AI"
              description="Mengizinkan atau menolak callable percakapan Asisten AI."
              enabled={controls.features.aiAssistant}
              setting={(enabled) => ({ setting: 'feature', feature: 'aiAssistant', enabled })}
            />
            <KontrolToggle
              label="Generator perangkat ajar AI"
              description="Mengizinkan atau menolak callable pembuatan ATP, KKTP, dan modul ajar."
              enabled={controls.features.aiGeneration}
              setting={(enabled) => ({ setting: 'feature', feature: 'aiGeneration', enabled })}
            />
          </>
        )}
        <p className="platform-ops-note">
          Perubahan dilakukan melalui RPC Supabase terproteksi untuk superadmin.
          Tabel audit mencatat aktor, kontrol, nilai sebelum/sesudah, dan waktu server; klien tidak dapat menulis audit secara langsung.
          Mode pemeliharaan membatasi antarmuka dan endpoint terkait, bukan akses database yang diberikan oleh RLS.
        </p>
      </section>
    </>
  );
}

function labelKontrol(target) {
  if (target === 'maintenance') return 'Mode pemeliharaan';
  if (target === 'features.aiAssistant') return 'Asisten AI';
  if (target === 'features.aiGeneration') return 'Generator perangkat ajar AI';
  return target || 'Kontrol platform';
}

function nilaiAudit(value) {
  if (typeof value === 'boolean') return value ? 'Aktif' : 'Nonaktif';
  return String(value ?? '—');
}

export function aktivitasAudit(data) {
  if (data.action === 'platform.user.created') return 'Akun pengguna dibuat';
  if (data.action === 'platform.user.provisioned') return 'Akses pengguna diprovisikan';
  return labelKontrol(data.target);
}

export function rincianAudit(data) {
  if (data.action === 'platform.user.created') {
    const role = PERAN_MENU.find(([, id]) => id === data.role)?.[0] || data.role || 'Peran tidak diketahui';
    return `${role} · tenant ${data.tenantId || '—'} · UID ${data.target || '—'}`;
  }
  if (data.action === 'platform.user.provisioned') {
    const profile = data.after_value || {};
    const role = PERAN_MENU.find(([, id]) => id === (data.role || profile.role))?.[0]
      || data.role || profile.role || 'Peran tidak diketahui';
    return `${role} · tenant ${data.tenantId || profile.tenant_id || '—'} · ${data.target || profile.email || '—'}`;
  }
  return `${nilaiAudit(data.before_value ?? data.before)} → ${nilaiAudit(data.after_value ?? data.after)}`;
}

function DaftarAudit() {
  const [entries, setEntries] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    supabase
      .from('platform_audit')
      .select('id, actor_id, action, target, before_value, after_value, created_at')
      .order('created_at', { ascending: false })
      .range(cursor || 0, (cursor || 0) + 25)
      .then(({ data, error: queryError }) => {
      if (queryError) throw queryError;
      if (!active) return;
      const rows = data || [];
      const page = rows.slice(0, 25);
      setEntries((current) => cursor ? [...current, ...page] : page);
      setHasMore(rows.length > 25);
    }).catch((err) => {
      console.error('[platform-audit] Gagal memuat audit platform:', err);
      if (active) setError(err?.code === '42501'
        ? 'Akses log audit ditolak. Pastikan sesi superadmin masih aktif.'
        : 'Log audit tidak dapat dimuat. Periksa koneksi lalu coba lagi.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [cursor, reload]);

  function muatUlang() {
    setEntries([]);
    setCursor(null);
    setHasMore(false);
    setReload((value) => value + 1);
  }

  return (
    <>
      <header className="platform-tenants-heading">
        <p className="platform-tenants-kicker">Keamanan dan audit · kontrol platform</p>
        <h1>Audit Log</h1>
        <p>Perubahan kontrol dan provisioning akun yang tercatat oleh layanan backend Supabase. Daftar ini bukan audit atas seluruh aktivitas pengguna.</p>
      </header>
      <section className="platform-tenants-card">
        <div className="platform-tenants-toolbar">
          <div><h2>Aktivitas platform terbaru</h2><p>{entries.length} entri dimuat · maksimal 25 per halaman</p></div>
          <button className="platform-tenants-button secondary" type="button" onClick={muatUlang} disabled={loading}>
            {loading && !entries.length ? 'Memuat…' : 'Muat ulang'}
          </button>
        </div>
        {error && <p className="platform-tenants-error" role="alert">{error}</p>}
        {loading && !entries.length ? (
          <p className="platform-tenants-empty" role="status">Memuat log audit…</p>
        ) : !error && !entries.length ? (
          <p className="platform-tenants-empty">Belum ada perubahan kontrol yang tercatat.</p>
        ) : entries.length > 0 && (
          <div className="platform-tenants-table-wrap">
            <table className="platform-tenants-table">
              <thead><tr><th scope="col">Waktu</th><th scope="col">Admin UID</th><th scope="col">Aktivitas</th><th scope="col">Rincian</th></tr></thead>
              <tbody>
                {entries.map((entry) => {
                  const waktu = new Date(entry.created_at);
                  return (
                    <tr key={entry.id}>
                      <td>{Number.isNaN(waktu.getTime()) ? 'Waktu tidak valid' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(waktu)}</td>
                      <td>{entry.actor_id || '—'}</td>
                      <td>{aktivitasAudit(entry)}</td>
                      <td>{rincianAudit(entry)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {hasMore && (
          <div className="platform-tenants-more">
            <button className="platform-tenants-button" type="button" disabled={loading} onClick={() => setCursor((value) => (value || 0) + 25)}>
              {loading ? 'Memuat…' : 'Muat entri berikutnya'}
            </button>
          </div>
        )}
      </section>
    </>
  );
}

function RingkasanPenggunaan({ role, judul = 'Penggunaan Platform' }) {
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ulang, setUlang] = useState(0);

  useEffect(() => {
    if (role !== 'superadmin') return undefined;
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      supabase.from('tenants').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin_sekolah'),
      supabase.from('user_allowlist').select('*', { count: 'exact', head: true }).eq('active', true),
    ]).then(([tenants, users, admins, allowlist]) => {
      const failed = [tenants, users, admins, allowlist].find((result) => result.error);
      if (failed?.error) throw failed.error;
      if (active) setCounts({
        tenants: tenants.count || 0,
        users: users.count || 0,
        admins: admins.count || 0,
        allowlist: allowlist.count || 0,
      });
    }).catch((err) => {
      console.error('[platform-usage] Gagal memuat agregat:', err);
      if (active) setError(err?.code === '42501'
        ? 'Akses agregat lintas tenant ditolak. Pastikan sesi superadmin masih aktif.'
        : 'Snapshot penggunaan tidak dapat dimuat. Coba lagi nanti.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [role, ulang]);

  return (
    <>
      <header className="platform-tenants-heading">
        <p className="platform-tenants-kicker">{judul === 'Statistik Global' ? 'Dashboard superadmin · snapshot' : 'Laporan dan analitik · snapshot'}</p>
        <h1>{judul}</h1>
        <p>Jumlah baris Supabase saat ini; bukan pengguna aktif, penggunaan historis, atau laporan biaya.</p>
      </header>
      <section className="platform-tenants-card">
        {error && <p className="platform-tenants-error" role="alert">{error}</p>}
        {loading && <p role="status">Menghitung snapshot Supabase…</p>}
        {counts && (
          <div className="platform-ops-counts">
            <article><span>Tenant sekolah</span><strong>{counts.tenants.toLocaleString('id-ID')}</strong></article>
            <article><span>Profil pengguna</span><strong>{counts.users.toLocaleString('id-ID')}</strong></article>
            <article><span>Admin sekolah</span><strong>{counts.admins.toLocaleString('id-ID')}</strong></article>
            <article><span>Allowlist aktif</span><strong>{counts.allowlist.toLocaleString('id-ID')}</strong></article>
          </div>
        )}
        <button className="platform-tenants-button secondary" type="button" disabled={loading} onClick={() => setUlang((n) => n + 1)}>
          {loading ? 'Memuat…' : 'Muat ulang snapshot'}
        </button>
        <p className="platform-ops-note">Angka agregat adalah snapshot saat ini. Untuk tren, biaya, dan akun Auth aktif diperlukan telemetry backend.</p>
      </section>
    </>
  );
}

export default function PlatformOperationsPage() {
  const { pathname } = useLocation();
  const { role: baseRole, activeRole } = useAuth();
  const role = activeRole || baseRole;
  const info = INFO_MODUL[pathname];
  const mode = pathname === '/platform/tenant/paket' ? 'paket'
    : pathname === '/platform/pengguna/peran' || pathname === '/platform/fitur/izin' ? 'peran'
      : pathname === '/platform/fitur/menu' ? 'menu' : '';
  if (role !== 'superadmin') {
    return <main className="platform-tenants"><section className="platform-tenants-card" role="alert"><h1>Akses platform dibatasi</h1><p>Modul platform hanya tersedia untuk superadmin.</p></section></main>;
  }

  return (
    <main className="platform-tenants">
      {pathname === '/platform/laporan/penggunaan' || pathname === '/platform/dashboard/statistik'
        ? <RingkasanPenggunaan
          role={role}
          judul={pathname === '/platform/dashboard/statistik' ? 'Statistik Global' : 'Penggunaan Platform'}
        />
        : pathname === '/platform/fitur/flags'
          ? <KontrolPlatform />
          : pathname === '/platform/pengaturan/pemeliharaan'
            ? <KontrolPlatform maintenance />
            : pathname === '/platform/dashboard/aktivitas' || pathname === '/platform/keamanan/audit'
              ? <DaftarAudit />
        : mode === 'paket'
          ? <DaftarPaket />
          : mode === 'menu' || mode === 'peran'
            ? <DaftarPeran mode={mode} />
            : info
              ? <KartuInfo info={info} />
              : (
                <section className="platform-tenants-card" role="alert">
                  <h1>Modul platform tidak tersedia</h1>
                  <p>Rute ini belum terdaftar pada katalog menu platform.</p>
                </section>
              )}
    </main>
  );
}
