// web/src/pages/scan/halamanScan.js
/**
 * Halaman pindai absensi — rute `#/scan` dan `#/scan/<kode>`.
 * ---------------------------------------------------------------------------
 * Tiga cara memasukkan kode:
 *   1. Dari URL  (#/scan/<kode>)          → diproses otomatis saat halaman dibuka.
 *   2. Scanner USB/Bluetooth ("keyboard") → mengetik kode + Enter ke kolom input.
 *   3. Kamera                              → BarcodeDetector (Chrome/Edge Android,
 *      Safari/Chrome macOS). Tombol hanya muncul bila browser mendukung Code128.
 *
 * Pencatatan idempoten (lihat absensiRepo.js): memindai ulang hari yang sama
 * hanya menampilkan "sudah tercatat".
 *
 * Integrasi router: daftarkan `halamanScan(el, ctx)` untuk pola `#/scan(/:kode)`.
 * Bila ctx.params.kode tidak tersedia, kode dibaca langsung dari location.hash.
 */
import { getAuth } from 'firebase/auth';
import { esc } from '../../lib/teks.js';
import { cariSiswaDariKode, catatHadir, tanggalHariIni } from '../../firebase/absensiRepo.js';
import { db as firestoreDb } from '../../firebase/core/firestore.js';

const JEDA_ULANG_MS = 3000; // abaikan kode yang sama berturut-turut (kamera memindai terus-menerus)

function kodeDariHash(ctx) {
  const dariCtx = ctx?.params?.kode;
  if (dariCtx) return String(dariCtx);
  const m = location.hash.match(/^#\/scan\/([^/?#]+)/);
  if (!m) return '';
  try { return decodeURIComponent(m[1]); } catch { return ''; }
}

const jam = (d) => (d instanceof Date
  ? d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  : '');

async function kameraDidukung() {
  try {
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) return false;
    const format = await window.BarcodeDetector.getSupportedFormats();
    return format.includes('code_128');
  } catch {
    return false;
  }
}

export async function halamanScan(el, ctx = {}) {
  const auth = ctx.auth ?? getAuth();
  const db = ctx.db ?? firestoreDb;

  el.innerHTML = `
    <section class="dd-kartu-utama dd-kartu-utama--teal" data-tab="scan">
      <header class="dd-kartu-utama__kepala">
        <h2 class="dd-kartu-utama__judul">Pindai Absensi</h2>
        <span class="dd-chip dd-chip--admin" id="scTanggal">${esc(tanggalHariIni())}</span>
      </header>

      <div class="dd-toolbar">
        <div class="dd-field">
          <label for="scKode">Kode siswa</label>
          <input id="scKode" class="dd-input" type="text" autocomplete="off" autocapitalize="characters"
                 spellcheck="false" inputmode="text" placeholder="Pindai atau ketik kode, lalu Enter">
        </div>
        <div class="dd-toolbar-aksi">
          <button type="button" class="dd-btn dd-btn--utama" id="scCatat">Catat hadir</button>
          <button type="button" class="dd-btn" id="scKamera" hidden>Buka kamera</button>
        </div>
      </div>

      <video id="scVideo" playsinline muted hidden style="width:100%;max-width:420px;border-radius:12px"></video>
      <p class="dd-info-teks" id="scHasil" role="status" aria-live="polite">Siap memindai.</p>
    </section>`;

  const q = (s) => el.querySelector(s);
  const input = q('#scKode');
  const hasil = q('#scHasil');
  const video = q('#scVideo');
  const tombolKamera = q('#scKamera');

  let sibuk = false;
  let kodeTerakhir = '';
  let waktuTerakhir = 0;
  let aliran = null;
  let pewaktuKamera = 0;

  const tampil = (html, peran = 'status') => {
    hasil.setAttribute('role', peran);
    hasil.innerHTML = html;
  };

  async function proses(mentah) {
    const kode = String(mentah ?? '').trim();
    if (!kode || sibuk) return;
    const sekarang = Date.now();
    if (kode === kodeTerakhir && sekarang - waktuTerakhir < JEDA_ULANG_MS) return;
    kodeTerakhir = kode;
    waktuTerakhir = sekarang;

    const uid = auth.currentUser?.uid;
    if (!uid) { tampil('Anda belum masuk. Silakan login terlebih dahulu.', 'alert'); return; }

    sibuk = true;
    tampil('Memeriksa kode…');
    try {
      const siswa = await cariSiswaDariKode(kode, db);
      if (!siswa) { tampil(`Kode <b>${esc(kode)}</b> tidak dikenali.`, 'alert'); return; }

      const r = await catatHadir(siswa, uid, { db });
      const identitas = `<b>${esc(siswa.nama)}</b> (${esc(siswa.kelas)})`;
      tampil(r.baru
        ? `✔ ${identitas} tercatat <b>hadir</b>.`
        : `${identitas} sudah tercatat hadir hari ini${r.waktu ? ` pukul ${esc(jam(r.waktu))}` : ''}.`);
    } catch (err) {
      console.error('[halamanScan]', err);
      const pesan = err?.code === 'permission-denied'
        ? 'Akun Anda tidak memiliki izin mencatat absensi.'
        : (err?.message || 'Terjadi kesalahan. Coba lagi.');
      tampil(esc(pesan), 'alert');
    } finally {
      sibuk = false;
      input.value = '';
      input.focus();
    }
  }

  /* ---------------- Kamera ---------------- */

  function hentikanKamera() {
    clearInterval(pewaktuKamera);
    pewaktuKamera = 0;
    aliran?.getTracks().forEach((t) => t.stop());
    aliran = null;
    video.srcObject = null;
    video.hidden = true;
    tombolKamera.textContent = 'Buka kamera';
  }

  async function bukaKamera() {
    try {
      const detektor = new window.BarcodeDetector({ formats: ['code_128'] });
      aliran = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      video.srcObject = aliran;
      video.hidden = false;
      await video.play();
      tombolKamera.textContent = 'Tutup kamera';

      pewaktuKamera = setInterval(async () => {
        if (sibuk || video.readyState < 2) return;
        try {
          const temuan = await detektor.detect(video);
          if (temuan[0]?.rawValue) proses(temuan[0].rawValue);
        } catch { /* frame gagal dibaca — lanjut frame berikutnya */ }
      }, 250);
    } catch (err) {
      hentikanKamera();
      tampil(err?.name === 'NotAllowedError'
        ? 'Izin kamera ditolak. Izinkan kamera di pengaturan browser, atau gunakan scanner/ketik kode.'
        : 'Kamera tidak dapat dibuka di perangkat ini.', 'alert');
    }
  }

  /* ---------------- Event ---------------- */

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); proses(input.value); }
  });
  q('#scCatat').addEventListener('click', () => proses(input.value));
  tombolKamera.addEventListener('click', () => (aliran ? hentikanKamera() : bukaKamera()));

  // Lepas kamera saat pindah halaman / tab ditutup.
  window.addEventListener('hashchange', hentikanKamera, { once: true });
  window.addEventListener('pagehide', hentikanKamera, { once: true });

  if (await kameraDidukung()) tombolKamera.hidden = false;

  input.focus();
  const dariUrl = kodeDariHash(ctx);
  if (dariUrl) proses(dariUrl);
}
