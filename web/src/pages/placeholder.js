// web/src/pages/placeholder.js
// Halaman sementara untuk menu yang belum jadi.
//
// Post-migrasi shell:
//   - Router sudah memasang sidebar + topbar dan menyediakan #slot-halaman.
//   - Router juga memanggil terapkanGulir() & perbaruiHeader() sendiri
//     (lihat router.js → .finally() dan shell build). Placeholder TIDAK
//     perlu memanggilnya lagi.
//   - Tidak ada listener global → cleanup no-op.
import { esc, ikon } from '../ui.js';

/**
 * Buat fungsi halaman placeholder (dipakai oleh rute yang belum jadi).
 *
 * @param {string} judul       Judul halaman.
 * @param {string} [keterangan] Teks penjelas.
 * @param {string} [ikonNama]  Nama ikon (bootstrap-icons alias, lihat ui.js).
 * @returns {(wadah: HTMLElement) => () => void}
 */
export function halamanPlaceholder(
  judul,
  keterangan = 'Halaman ini sedang dalam pengembangan.',
  ikonNama = 'kosong'
) {
  return (wadah) => {
    if (wadah) {
      wadah.innerHTML = `
        <section class="card empty-state" aria-labelledby="hPlaceholder">
          <span class="empty-state__ikon">${ikon(ikonNama)}</span>
          <h1 id="hPlaceholder">${esc(judul)}</h1>
          <p>${esc(keterangan)}</p>
          <a class="btn btn-outline" href="#/dashboard">Kembali ke dasbor</a>
        </section>`;
    }

    document.title = `${judul} · AI_nnoe Learning Ecosystem`;

    // Tidak ada listener / resource → cleanup no-op.
    return () => {};
  };
}