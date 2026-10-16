// src/core/toast.js
/**
 * toast.js — Notifikasi kecil di layar (bottom center).
 * Dipakai oleh chatPage.js dan chatRoom.js.
 */
export function toast(pesan, jenis = 'info', durasi = 4000) {
  let host = document.getElementById('ale-toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'ale-toast-host';
    host.className = 'ale-toast-host';
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }

  const item = document.createElement('div');
  item.className = 'ale-toast';
  item.dataset.jenis = jenis === 'success' ? 'ok' : jenis === 'error' ? 'galat' : 'info';
  item.textContent = String(pesan ?? '');
  host.appendChild(item);

  requestAnimationFrame(() => item.classList.add('tampil'));

  setTimeout(() => {
    item.classList.remove('tampil');
    setTimeout(() => item.remove(), 250);
  }, durasi);
}

export default toast;