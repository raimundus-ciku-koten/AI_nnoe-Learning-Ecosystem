// web/src/components/AppShell.jsx
/**
 * Kerangka dashboard: topbar + sidebar (offcanvas di mobile) + area konten.
 * Markup mengikuti dashboard.css bagian 3–6 & 21.
 */
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import '../styles/dashboard.css';
import { useAuth } from '../context/AuthContext.jsx';
import { menuUntukPeran, cariMenu } from '../navigasi.js';
import { NAMA_APLIKASI } from '../config.js';
import { LABEL_PERAN, inisial, sideTutupTersimpan, terapkanSideTutup, toast } from '../ui.js';
import Ikon from './Ikon.jsx';
import { urlFotoAman } from '../services/protectedMedia.js';
import { isEconomyMode } from '../services/economyMode.js';
import '../styles/economy-mode.css';

const MQ_DESKTOP = '(min-width: 961px)';

function useDesktop() {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const mq = window.matchMedia(MQ_DESKTOP);
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', cb);
        return () => mq.removeEventListener('change', cb);
      }
      mq.addListener(cb);
      return () => mq.removeListener(cb);
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(MQ_DESKTOP).matches,
    () => true,
  );
}

export default function AppShell({ path, search = '', judulHalaman, children }) {
  const { user, profile, role, activeRole, roles = [], logout, switchRole } = useAuth();
  const hematData = isEconomyMode();
  const desktop = useDesktop();
  const daftarMenu = menuUntukPeran(role);
  const menu = cariMenu(path, search, role);
  const judulAktif = judulHalaman || menu?.item.label || 'Halaman';
  const grupChat = daftarMenu.find((grup) => grup.item.some((item) => item.disabled));

  const [sideTutup, setSideTutup] = useState(sideTutupTersimpan);
  const [mobileBuka, setMobileBuka] = useState(false);
  const [profilBuka, setProfilBuka] = useState(false);
  const [keluar, setKeluar] = useState(false);
  const [menggantiPeran, setMenggantiPeran] = useState(false);
  const [aksiProfil, setAksiProfil] = useState('');
  const [grupBuka, setGrupBuka] = useState(() =>
    new Set([menu?.grup.id || 'beranda', grupChat?.id].filter(Boolean)));
  const profilRef = useRef(null);
  const profilBtnRef = useRef(null);
  const avatarRef = useRef(null);

  useEffect(() => {
    const judulSebelumnya = document.title;
    document.title = `${judulAktif} · AI_nnoe Learning Ecosystem`;
    return () => { document.title = judulSebelumnya; };
  }, [judulAktif]);

  useEffect(() => {
    const image = avatarRef.current;
    if (!image) return undefined;
    if (hematData || !urlFotoAman(user?.photoURL)) {
      image.removeAttribute('src');
      return undefined;
    }
    image.src = user.photoURL;
    return undefined;
  }, [hematData, user?.uid, user?.photoURL]);

  // Tutup panel mobile & popover saat pindah halaman.
  useEffect(() => { setMobileBuka(false); setProfilBuka(false); }, [path]);
  useEffect(() => {
    if (menu?.grup.id) setGrupBuka((groups) => new Set(groups).add(menu.grup.id));
  }, [menu?.grup.id]);
  useEffect(() => {
    if (grupChat?.id) setGrupBuka((groups) => new Set(groups).add(grupChat.id));
  }, [grupChat?.id]);
  // Pindah ke desktop → pastikan offcanvas tertutup.
  useEffect(() => { if (desktop) setMobileBuka(false); }, [desktop]);

  // Escape + klik di luar popover.
  useEffect(() => {
    if (!profilBuka && !mobileBuka) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (profilBuka) { setProfilBuka(false); profilBtnRef.current?.focus(); }
      else setMobileBuka(false);
    };
    const onKlik = (e) => {
      if (profilBuka && profilRef.current && !profilRef.current.contains(e.target)) setProfilBuka(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onKlik);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onKlik);
    };
  }, [profilBuka, mobileBuka]);

  const toggleMenu = useCallback(() => {
    if (desktop) {
      const baru = !sideTutup;
      setSideTutup(baru);
      terapkanSideTutup(baru);
    } else {
      setMobileBuka((v) => !v);
    }
  }, [desktop, sideTutup]);

  const toggleGrup = (id) =>
    setGrupBuka((lama) => {
      const baru = new Set(lama);
      if (baru.has(id)) baru.delete(id); else baru.add(id);
      return baru;
    });

  async function handleKeluar() {
    if (keluar) return;
    setKeluar(true);
    try {
      await logout();
    } catch {
      toast('Gagal keluar. Coba lagi.', 'error');
      setKeluar(false);
    }
  }

  async function handleGantiPeran(event) {
    const nextRole = event.target.value;
    if (!nextRole || nextRole === activeRole || menggantiPeran) return;
    setMenggantiPeran(true);
    try {
      await switchRole(nextRole);
      setProfilBuka(false);
      window.location.hash = '#/dashboard';
    } catch (error) {
      console.error('[auth] Gagal mengganti peran aktif:', error);
      toast(error?.message || 'Peran tidak dapat diganti. Coba lagi.', 'error');
      event.target.value = activeRole || role || '';
    } finally {
      setMenggantiPeran(false);
    }
  }

  async function handleAksiProfil(aksi) {
    if (aksiProfil) return;
    setAksiProfil(aksi);
    setProfilBuka(false);
    try {
      const { jalankanAksi } = await import('./profilaksi.js');
      await jalankanAksi(aksi);
    } catch (error) {
      console.error(`[profil] Gagal menjalankan aksi ${aksi}:`, error);
      toast('Menu profil gagal dijalankan. Muat ulang halaman lalu coba lagi.', 'error');
    } finally {
      setAksiProfil('');
    }
  }

  const nama = user?.displayName || 'Pengguna';
  const peranAktif = activeRole || role;
  const peran = LABEL_PERAN[peranAktif] || (peranAktif ? peranAktif : 'Pengguna');
  const subNama = profile?.sekolah || peran;
  const menuTerbuka = desktop ? !sideTutup : mobileBuka;

  return (
    <div className="ale-shell">
      <a className="ale-lewati" href="#ale-konten"
         onClick={(e) => { e.preventDefault(); document.getElementById('ale-konten')?.focus(); }}>
        Lewati ke konten
      </a>

      {/* ============ TOPBAR ============ */}
      <header className="site-header ale-topbar">
        <div className="ale-topbar-inner">
          <div className="ale-topbar-kiri">
            <button type="button" className="ale-menu-btn" onClick={toggleMenu}
                    aria-label={menuTerbuka ? 'Sembunyikan menu' : 'Tampilkan menu'}
                    aria-controls="ale-side" aria-expanded={menuTerbuka}>
              <svg className="ale-menu-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
                <rect className="ale-menu-panel" x="3" y="4" width="6" height="16" rx="1.5" fill="currentColor" stroke="none" />
                <path d="M13 8h8M13 12h8M13 16h8" />
              </svg>
            </button>
            <a className="ale-topbar-brand" href="#/dashboard" aria-label={`${NAMA_APLIKASI} — ke dashboard`}>
              <img className="ale-topbar-brand-logo" src="/logo-ale-mark.png"
                   alt="" width="52" height="36" />
              <span className="ale-topbar-brand-teks">
                <strong>AI_nnoe</strong>
                <small>Learning Ecosystem</small>
              </span>
            </a>
          </div>

          <div className="ale-topbar-judul">
            <span className="ale-judul-induk">{menu?.grup.label || 'ALE'}</span>
            <h1 className="ale-judul-teks">{judulAktif}</h1>
          </div>

          <div className="ale-topbar-aksi">
            {profile?.langganan && (
              <span className="ale-langganan">
                <Ikon nama="badge" /> Langganan aktif
              </span>
            )}
            {!hematData && profile?.logoSekolah && (
              <img className="ale-logo-sekolah" src={profile.logoSekolah} alt="Logo sekolah"
                   referrerPolicy="no-referrer" width="40" height="40" />
            )}

            <div className="ale-menu-wrap" ref={profilRef}>
              <button type="button" ref={profilBtnRef} className="ale-akun"
                      aria-label={`Menu profil ${nama}`}
                      onClick={() => setProfilBuka((v) => !v)}
                      aria-haspopup="true" aria-expanded={profilBuka} aria-controls="ale-pop-profil">
                {!hematData && urlFotoAman(user?.photoURL) ? (
                  <img className="ale-avatar" ref={avatarRef} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="ale-avatar" aria-hidden="true">{inisial(nama)}</span>
                )}
                <span className="ale-akun-teks">
                  <strong>{nama}</strong>
                  <span>{subNama}</span>
                </span>
                <Ikon nama="chevron" className="ale-chev" />
              </button>

              <div id="ale-pop-profil" className="ale-pop ale-pop-profil" role="dialog"
                   aria-label="Menu profil" hidden={!profilBuka}>
                <p className="ale-pop-judul" role="presentation">Profil</p>
                <div style={{ padding: '0 .75rem .25rem', overflowWrap: 'anywhere', fontSize: '.88rem', color: 'var(--ale-muted)' }}>
                  {user?.email}
                </div>
                {roles.length > 1 && (
                  <label style={{ display: 'grid', gap: '.35rem', padding: '.5rem .75rem', fontSize: '.88rem' }}>
                    <span>Masuk sebagai</span>
                    <select value={peranAktif || ''} onChange={handleGantiPeran} disabled={menggantiPeran}
                            aria-label="Pilih peran aktif">
                      {roles.map((availableRole) => (
                        <option key={availableRole} value={availableRole}>
                          {LABEL_PERAN[availableRole] || availableRole}
                        </option>
                      ))}
                    </select>
                    {menggantiPeran && <span role="status">Memvalidasi peran…</span>}
                  </label>
                )}
                <hr className="ale-pop-sekat" />
                <button type="button" className="ale-pop-item ale-pw-sky"
                        onClick={() => handleAksiProfil('foto-tambah')} disabled={!!aksiProfil}>
                  <Ikon nama="user" /> Ubah foto profil
                </button>
                <button type="button" className="ale-pop-item ale-pw-amber"
                        onClick={() => handleAksiProfil('notif')} disabled={!!aksiProfil}>
                  <Ikon nama="badge" /> Aktifkan notifikasi
                </button>
                <button type="button" className="ale-pop-item ale-pw-rose"
                        onClick={() => handleAksiProfil('foto-hapus')} disabled={!!aksiProfil}>
                  <Ikon nama="user" /> Hapus foto profil
                </button>
                <hr className="ale-pop-sekat" />
                <a className="ale-pop-item ale-pw-sky" href="#/datadasar/kelas"
                   onClick={() => setProfilBuka(false)}>
                  <Ikon nama="school" /> Kelas &amp; mapel saya
                </a>
                <button type="button" className="ale-pop-item ale-pw-cyan"
                        onClick={() => handleAksiProfil('api-key')} disabled={!!aksiProfil}>
                  <Ikon nama="settings" /> AI &amp; Layanan
                </button>
                <button type="button" className="ale-pop-item ale-pw-indigo"
                        onClick={() => handleAksiProfil('google')} disabled={!!aksiProfil}>
                  <Ikon nama="external" /> Hubungkan Google
                </button>
                <hr className="ale-pop-sekat" />
                <button type="button" className="ale-pop-item ale-pw-sky"
                        onClick={() => setProfilBuka(false)}>
                  <Ikon nama="chevron" /> Tutup
                </button>
                <hr className="ale-pop-sekat" />
                <button type="button" className="ale-pop-item ale-pw-rose" onClick={handleKeluar} disabled={keluar}>
                  <Ikon nama="logout" />
                  {keluar ? 'Keluar…' : 'Keluar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ============ SIDEBAR + KONTEN ============ */}
      <div className="app">
        <aside id="ale-side" className={`ale-side${mobileBuka ? ' is-open' : ''}`} aria-label="Menu utama">
          <nav className="ale-nav" aria-label="Navigasi">
            {daftarMenu.map((grup) => {
              const terbuka = grupBuka.has(grup.id);
              const aktif = menu?.grup.id === grup.id;
              const idPanel = `ale-panel-${grup.id}`;
              return (
                <div key={grup.id} className={`ale-grup-menu${aktif ? ' has-aktif' : ''}`}>
                  {grup.item.length === 1 && grup.item[0].path && !grup.item[0].disabled ? (
                    <a className="ale-grup-btn ale-grup-link"
                       href={`#${grup.item[0].path}${grup.item[0].search || ''}`}
                       aria-current={menu?.item === grup.item[0] ? 'page' : undefined}>
                      <Ikon nama={grup.ikon} />
                      <span className="ale-grup-teks">{grup.label}</span>
                    </a>
                  ) : (
                    <>
                      <button type="button" className="ale-grup-btn" data-grup={grup.id}
                              aria-expanded={terbuka} aria-controls={idPanel}
                              onClick={() => toggleGrup(grup.id)}>
                        <Ikon nama={grup.ikon} />
                        <span className="ale-grup-teks">{grup.label}</span>
                        <Ikon nama="chevron" className="ale-ikon ale-chev" />
                      </button>
                      {terbuka && (
                        <div className="ale-panel" id={idPanel}>
                      {grup.item.map((it) => {
                        if (it.href) {
                          return (
                            <a key={it.label} className="ale-sub ale-sub-luar" href={it.href}
                               target="_blank" rel="noopener noreferrer">
                              <span className="ale-sub-teks">{it.label}</span>
                              <Ikon nama="external" className="ale-ikon" label="(tab baru)" />
                            </a>
                          );
                        }
                        if (it.path) {
                          return (
                            <a key={it.label} className="ale-sub" href={`#${it.path}${it.search || ''}`}
                               aria-current={menu?.item === it ? 'page' : undefined}>
                              <span className="ale-sub-teks">{it.label}</span>
                            </a>
                          );
                        }
                        return (
                          <span key={it.label} className="ale-sub is-soon" aria-disabled="true"
                                title={it.availabilityMessage}>
                            <span className="ale-sub-teks">{it.label}</span>
                            <span className="ale-tag">{it.statusLabel || 'Segera'}</span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                    </>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="ale-side-foot" style={{ display: 'flex', alignItems: 'center', gap: '.7rem' }}>
            <span className="ale-foot-avatar" aria-hidden="true">{inisial(nama)}</span>
            <div className="ale-foot-teks">
              <small>Masuk sebagai</small>
              <strong>{nama}</strong>
              <div id="sidebarUserRole">{peran}</div>
            </div>
          </div>
        </aside>

        <div className="ale-tirai" hidden={!mobileBuka} onClick={() => setMobileBuka(false)} aria-hidden="true" />

        <main id="ale-konten" className="ale-main" tabIndex={-1}>
          {hematData && (
            <p className="ale-economy-notice" role="status">
              Mode hemat data aktif. Gambar profil eksternal dimatikan dan aktivitas online diperbarui lebih jarang.
            </p>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
