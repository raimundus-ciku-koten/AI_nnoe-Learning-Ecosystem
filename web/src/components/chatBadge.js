// web/src/components/chatBadge.js
/**
 * Lencana "belum dibaca" di sidebar TANPA mengubah sidebar.js / menu.js.
 *
 *   - Tautan #/chat dan header grup menu "x-chat" → jumlah pesan belum dibaca
 *   - Tautan #/chat/kontak                        → permintaan kontak masuk
 *
 * Sidebar dirender ulang (innerHTML) setiap navigasi, jadi lencana dipasang
 * ulang lewat MutationObserver yang di-throttle dengan requestAnimationFrame.
 * Operasi idempoten: hanya menyentuh DOM bila teks lencana berubah.
 */
import { getState, subscribe } from '../state.js';

const SEL_CHAT   = 'a[href="#/chat"], [data-grup="x-chat"]';
const SEL_KONTAK = 'a[href="#/chat/kontak"]';

function pasang(el, jenis, jumlah) {
  let b = el.querySelector(`:scope > .chat-lencana[data-jenis="${jenis}"]`);
  if (jumlah <= 0) { if (b) b.remove(); return; }
  const teks = jumlah > 99 ? '99+' : String(jumlah);
  if (!b) {
    b = document.createElement('span');
    b.className = 'chat-lencana chat-lencana--sidebar';
    b.dataset.jenis = jenis;
    el.append(b);
  }
  if (b.textContent !== teks) {
    b.textContent = teks;
    b.setAttribute('aria-label', jenis === 'kontak' ? `${jumlah} permintaan kontak` : `${jumlah} pesan belum dibaca`);
  }
}

export function terapkanLencanaChat() {
  const s = getState();
  document.querySelectorAll(SEL_CHAT).forEach((el) => pasang(el, 'pesan', s.unreadChats || 0));
  document.querySelectorAll(SEL_KONTAK).forEach((el) => pasang(el, 'kontak', s.permintaanMasuk || 0));
}

let terpasang = false;

/** Panggil sekali dari main.js. */
export function pasangLencanaChat() {
  if (terpasang) return;
  terpasang = true;

  let jadwal = 0;
  const tunda = () => {
    if (jadwal) return;
    jadwal = requestAnimationFrame(() => { jadwal = 0; terapkanLencanaChat(); });
  };
  subscribe(tunda);
  new MutationObserver(tunda).observe(document.body, { childList: true, subtree: true });
  tunda();
}
