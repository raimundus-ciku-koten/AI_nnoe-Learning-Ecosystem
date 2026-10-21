// web/src/komponen/bannerStatus.js
/**
 * Pil status koneksi. Muncul saat offline, berubah "Tersambung kembali"
 * 3 detik lalu hilang. Tidak menggeser tata letak (lihat .banner-status).
 *
 *   import { pasangBannerKoneksi } from './komponen/bannerStatus.js';
 *   const lepas = pasangBannerKoneksi();   // panggil sekali saat aplikasi mulai
 */
import { subscribe, getState } from '../state.js';
import { ikon, esc } from '../ui.js';

const TEKS = {
  offline: 'Anda sedang offline. Perubahan dikirim saat koneksi kembali.',
  pulih:   'Tersambung kembali.',
};

export function pasangBannerKoneksi() {
  const el = document.createElement('div');
  el.className = 'banner-status';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  document.body.appendChild(el);

  let waktu = 0;
  let pernahOffline = false;

  function tampil(jenis) {
    clearTimeout(waktu);
    el.dataset.jenis = jenis;
    el.innerHTML = `${ikon(jenis === 'offline' ? 'offline' : 'centang')}<span>${esc(TEKS[jenis])}</span>`;
    el.classList.add('show');
    if (jenis === 'pulih') waktu = setTimeout(() => el.classList.remove('show'), 3000);
  }

  function terapkan(online) {
    if (!online) { pernahOffline = true; tampil('offline'); }
    else if (pernahOffline) { pernahOffline = false; tampil('pulih'); }
  }

  terapkan(getState().online);
  const berhenti = subscribe((s) => terapkan(s.online), ['online']);

  return () => { berhenti(); clearTimeout(waktu); el.remove(); };
}
