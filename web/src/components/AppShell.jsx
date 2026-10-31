// web/src/components/AppShell.jsx
/**
 * Kerangka dashboard: topbar + sidebar (offcanvas di mobile) + area konten.
 * Markup mengikuti dashboard.css bagian 3–6 & 21.
 */
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import '../styles/dashboard.css';
import { useAuth } from '../context/AuthContext.jsx';
import { useMenuAccess } from '../context/MenuAccessContext.jsx';
import { menuUntukPeran, cariMenu } from '../navigasi.js';
import { NAMA_APLIKASI, WEB_PUSH_PUBLIC_KEY } from '../config.js';
import { LABEL_PERAN, inisial, sideTutupTersimpan, terapkanSideTutup, toast } from '../ui.js';
import Ikon from './Ikon.jsx';
import { urlFotoAman } from '../services/protectedMedia.js';
import { isEconomyMode } from '../services/economyMode.js';
import { filterMenuSearch } from '../utils/menuSearch.js';
import { muatPercakapanTerbaruDasbor } from '../services/dashboard.js';
import { muatPengumumanSekolah } from '../services/schoolAnnouncements.js';
import { getState, subscribe } from '../state.js';
import '../styles/economy-mode.css';

const MQ_DESKTOP = '(min-width: 961px)';
const hitungPesanBelumDibaca = () => Number(getState().unreadChats) || 0;

function formatWaktuAktivitas(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function useDesktop() {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window.matchMedia !== 'function') return () => { };
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

export default function AppShell({ path, search = '', judulHalaman, menuAccessError = '', children }) {
  const { user, profile, role, activeRole, roles = [], tenantId, logout, switchRole } = useAuth();
  const { disabledMenuKeys } = useMenuAccess();
  const peranAktif = activeRole || role;
  const hematData = isEconomyMode();
  const desktop = useDesktop();
  const pesanBelumDibaca = useSyncExternalStore(subscribe, hitungPesanBelumDibaca, () => 0);
  const daftarMenu = menuUntukPeran(peranAktif, disabledMenuKeys);
  const adaMenuPath = (target) => daftarMenu.some((group) =>
    group.item.some((item) => item.path === target));
  const menu = cariMenu(path, search, peranAktif, disabledMenuKeys);
  const judulAktif = judulHalaman || menu?.item.label || 'Halaman';

  const [sideTutup, setSideTutup] = useState(sideTutupTersimpan);
  const [mobileBuka, setMobileBuka] = useState(false);
  const [profilBuka, setProfilBuka] = useState(false);
  const [pencarianBuka, setPencarianBuka] = useState(false);
  const [kueriMenu, setKueriMenu] = useState('');
  const [aktivitasBuka, setAktivitasBuka] = useState(false);
  const [aktivitas, setAktivitas] = useState({ loading: false, chats: [], announcements: [], chatError: '', announcementError: '' });
  const [keluar, setKeluar] = useState(false);
  const [menggantiPeran, setMenggantiPeran] = useState(false);
  const [aksiProfil, setAksiProfil] = useState('');
  const [grupBuka, setGrupBuka] = useState(() => new Set([menu?.grup.id || 'beranda']));
  const profilRef = useRef(null);
  const profilBtnRef = useRef(null);
  const pencarianRef = useRef(null);
  const pencarianBtnRef = useRef(null);
  const pencarianInputRef = useRef(null);
  const aktivitasRef = useRef(null);
  const aktivitasBtnRef = useRef(null);
  const avatarRef = useRef(null);
  const hasilPencarian = filterMenuSearch(daftarMenu, kueriMenu);

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
  useEffect(() => {
    setMobileBuka(false);
    setProfilBuka(false);
    setPencarianBuka(false);
    setKueriMenu('');
    setAktivitasBuka(false);
  }, [path]);
  useEffect(() => {
    if (menu?.grup.id) setGrupBuka((groups) => new Set(groups).add(menu.grup.id));
  }, [menu?.grup.id]);
  // Pindah ke desktop → pastikan offcanvas tertutup.
  useEffect(() => { if (desktop) setMobileBuka(false); }, [desktop]);

  // Escape + klik di luar popover.
  useEffect(() => {
    if (!profilBuka && !mobileBuka && !pencarianBuka && !aktivitasBuka) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (pencarianBuka) { setPencarianBuka(false); setKueriMenu(''); pencarianBtnRef.current?.focus(); }
      else if (aktivitasBuka) { setAktivitasBuka(false); aktivitasBtnRef.current?.focus(); }
      else if (profilBuka) { setProfilBuka(false); profilBtnRef.current?.focus(); }
      else setMobileBuka(false);
    };
    const onKlik = (e) => {
      if (profilBuka && profilRef.current && !profilRef.current.contains(e.target)) setProfilBuka(false);
      if (pencarianBuka && pencarianRef.current && !pencarianRef.current.contains(e.target)) {
        setPencarianBuka(false);
        setKueriMenu('');
      }
      if (aktivitasBuka && aktivitasRef.current && !aktivitasRef.current.contains(e.target)) {
        setAktivitasBuka(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onKlik);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onKlik);
    };
  }, [profilBuka, mobileBuka, pencarianBuka, aktivitasBuka]);

  useEffect(() => {
    if (pencarianBuka) {
      setKueriMenu('');
      pencarianInputRef.current?.focus();
    }
  }, [pencarianBuka]);

  useEffect(() => {
    const onShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setProfilBuka(false);
        setPencarianBuka(true);
      }
    };
    document.addEventListener('keydown', onShortcut);
    return () => document.removeEventListener('keydown', onShortcut);
  }, []);

  useEffect(() => {
    if (!aktivitasBuka) return undefined;
    let aktif = true;
    setAktivitas({ loading: true, chats: [], announcements: [], chatError: '', announcementError: '' });
    Promise.all([
      muatPercakapanTerbaruDasbor()
        .then((chats) => ({ chats, error: '' }))
        .catch(() => ({ chats: [], error: 'Pesan belum dapat dimuat.' })),
      tenantId
        ? muatPengumumanSekolah(tenantId)
          .then((announcements) => ({ announcements, error: '' }))
          .catch(() => ({ announcements: [], error: 'Pengumuman belum dapat dimuat.' }))
        : Promise.resolve({ announcements: [], error: '' }),
    ]).then(([chatResult, announcementResult]) => {
      if (!aktif) return;
      setAktivitas({
        loading: false,
        chats: chatResult.chats,
        announcements: announcementResult.announcements.slice(0, 4),
        chatError: chatResult.error,
        announcementError: announcementResult.error,
      });
    });
    return () => { aktif = false; };
  }, [aktivitasBuka, tenantId]);

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
      toast(error?.message || 'Menu profil gagal dijalankan. Coba lagi.', 'error');
    } finally {
      setAksiProfil('');
    }
  }

  const nama = user?.displayName || 'Pengguna';
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

            <div className="ale-menu-wrap ale-pencarian-wrap" ref={pencarianRef}>
              <button type="button" ref={pencarianBtnRef} className="ale-ikon-btn"
                aria-label="Cari menu" title="Cari menu (Ctrl/Cmd+K)"
                aria-haspopup="dialog" aria-expanded={pencarianBuka} aria-controls="ale-pencarian-menu"
                onClick={() => { setProfilBuka(false); setAktivitasBuka(false); setPencarianBuka((open) => !open); }}>
                <Ikon nama="search" />
              </button>
              <div id="ale-pencarian-menu" className="ale-pop ale-pop-search" role="dialog"
                aria-label="Cari menu" hidden={!pencarianBuka}>
                <label className="ale-pencarian-label" htmlFor="ale-pencarian-input">Cari menu</label>
                <input id="ale-pencarian-input" ref={pencarianInputRef} className="ale-pencarian-input"
                  type="search" autoComplete="off" placeholder="Nama menu atau bagian…"
                  value={kueriMenu} onChange={(event) => setKueriMenu(event.target.value)} />
                <div className="ale-pencarian-hasil" role="list" aria-label="Hasil pencarian menu">
                  {kueriMenu.trim() ? hasilPencarian.map(({ groupLabel, item }) => (
                    <a key={`${item.path}${item.search || ''}`} className="ale-pencarian-item"
                      href={`#${item.path}${item.search || ''}`} role="listitem"
                      onClick={() => { setPencarianBuka(false); setKueriMenu(''); }}>
                      <span className="ale-pencarian-ikon"><Ikon nama={item.ikon} /></span>
                      <span className="ale-pencarian-teks"><strong>{item.label}</strong><small>{groupLabel}</small></span>
                      <Ikon nama="external" className="ale-pencarian-panah" />
                    </a>
                  )) : <p className="ale-pencarian-kosong">Ketik untuk mencari menu yang tersedia bagi peran Anda.</p>}
                  {kueriMenu.trim() && hasilPencarian.length === 0 && (
                    <p className="ale-pencarian-kosong" role="status">Tidak ada menu yang cocok.</p>
                  )}
                </div>
                <p className="ale-pencarian-bantuan"><kbd>Esc</kbd> untuk menutup</p>
              </div>
            </div>

            <div className="ale-menu-wrap ale-aktivitas-wrap" ref={aktivitasRef}>
              <button type="button" ref={aktivitasBtnRef} className="ale-ikon-btn ale-aktivitas-btn"
                aria-label={`Aktivitas${pesanBelumDibaca ? `, ${pesanBelumDibaca} pesan belum dibaca` : ''}`}
                title="Aktivitas dan notifikasi" aria-haspopup="dialog" aria-expanded={aktivitasBuka}
                aria-controls="ale-panel-aktivitas"
                onClick={() => { setProfilBuka(false); setPencarianBuka(false); setKueriMenu(''); setAktivitasBuka((open) => !open); }}>
                <Ikon nama="bell" />
                {pesanBelumDibaca > 0 && <span className="ale-aktivitas-badge" aria-hidden="true">{pesanBelumDibaca > 99 ? '99+' : pesanBelumDibaca}</span>}
              </button>
              <section id="ale-panel-aktivitas" className="ale-pop ale-pop-activity" role="dialog"
                aria-label="Aktivitas terbaru" hidden={!aktivitasBuka}>
                <header className="ale-activity-heading">
                  <div><p>Ruang kerja</p><h2>Aktivitas terbaru</h2></div>
                  {pesanBelumDibaca > 0 && <span className="ale-activity-count">{pesanBelumDibaca} belum dibaca</span>}
                </header>
                {aktivitas.loading ? <p className="ale-activity-state" role="status">Memuat aktivitas…</p> : (
                  <>
                    <section className="ale-activity-section" aria-labelledby="activity-chat-title">
                      <div className="ale-activity-section-head">
                        <h3 id="activity-chat-title">Pesan belum dibaca</h3>
                        <a href="#/chat" onClick={() => setAktivitasBuka(false)}>Buka chat</a>
                      </div>
                      {aktivitas.chatError ? <p className="ale-activity-state" role="status">{aktivitas.chatError}</p>
                        : aktivitas.chats.filter((chat) => chat.unread > 0).length ? (
                          <ul className="ale-activity-list">
                            {aktivitas.chats.filter((chat) => chat.unread > 0).slice(0, 4).map((chat) => (
                              <li key={chat.id}><a href={`#/chat/${encodeURIComponent(chat.id)}`} onClick={() => setAktivitasBuka(false)}>
                                <span><strong>{chat.title}</strong><small>{chat.lastMessage || 'Pesan baru'}</small></span>
                                <b>{chat.unread > 99 ? '99+' : chat.unread}</b>
                              </a></li>
                            ))}
                          </ul>
                        ) : <p className="ale-activity-state">Tidak ada pesan yang belum dibaca.</p>}
                    </section>
                    <section className="ale-activity-section" aria-labelledby="activity-announcement-title">
                      <div className="ale-activity-section-head">
                        <h3 id="activity-announcement-title">Pengumuman terbaru</h3>
                        {tenantId && <a href="#/pengumuman" onClick={() => setAktivitasBuka(false)}>Semua</a>}
                      </div>
                      {aktivitas.announcementError ? <p className="ale-activity-state" role="status">{aktivitas.announcementError}</p>
                        : aktivitas.announcements.length ? (
                          <ul className="ale-activity-list ale-activity-announcements">
                            {aktivitas.announcements.map((announcement) => (
                              <li key={announcement.id}><a href="#/pengumuman" onClick={() => setAktivitasBuka(false)}>
                                <span><strong>{announcement.title}</strong><small>{announcement.body}</small></span>
                                <time>{formatWaktuAktivitas(announcement.created_at)}</time>
                              </a></li>
                            ))}
                          </ul>
                        ) : <p className="ale-activity-state">Belum ada pengumuman terbaru.</p>}
                    </section>
                  </>
                )}
              </section>
            </div>

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
                {adaMenuPath('/pengaturan/akun') && (
                  <a className="ale-pop-item ale-pw-sky" href="#/pengaturan/akun"
                    onClick={() => setProfilBuka(false)}>
                    <Ikon nama="settings" /> Akun &amp; Keamanan
                  </a>
                )}
                {adaMenuPath('/datadasar/kelas') && (
                  <a className="ale-pop-item ale-pw-sky" href="#/datadasar/kelas"
                    onClick={() => setProfilBuka(false)}>
                    <Ikon nama="school" /> Kelas &amp; mapel saya
                  </a>
                )}
                {adaMenuPath('/pengaturan/api-ai') && (
                  <a className="ale-pop-item ale-pw-cyan" href="#/pengaturan/api-ai"
                    onClick={() => setProfilBuka(false)}>
                    <Ikon nama="settings" /> AI &amp; Layanan
                  </a>
                )}
                {adaMenuPath('/pengaturan/google') && (
                  <a className="ale-pop-item ale-pw-indigo" href="#/pengaturan/google"
                    onClick={() => setProfilBuka(false)}>
                    <Ikon nama="external" /> Hubungkan Google
                  </a>
                )}
                {WEB_PUSH_PUBLIC_KEY && typeof Notification !== 'undefined' && (
                  <button type="button" className="ale-pop-item ale-pw-amber"
                    onClick={() => handleAksiProfil('notif')} disabled={!!aksiProfil}>
                    <Ikon nama="badge" /> Aktifkan notifikasi
                  </button>
                )}
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
                  {grup.item.length === 1 ? (
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
                              <span key={it.label} className="ale-sub is-soon" aria-disabled="true">
                                <span className="ale-sub-teks">{it.label}</span>
                                <span className="ale-tag">Segera</span>
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
          {menuAccessError && <p className="platform-control-warning" role="status">{menuAccessError}</p>}
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
