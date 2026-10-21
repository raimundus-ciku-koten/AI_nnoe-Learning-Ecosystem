// web/src/pages/dataDasar/tabBarcode.js
/**
 * Barcode & Kartu Absensi
 * ---------------------------------------------------------------------------
 * Alur pengguna
 *   1. Pilih kelas (opsional: cari nama / NISN).
 *   2. Kartu siswa tampil: nama, NISN, barcode Code128, kode unik, URL scan.
 *   3. Cetak semua kartu yang tampil, atau satu kartu saja (10 kartu / A4, CR80).
 *   4. Unduh CSV kode (Excel-safe) atau barcode per siswa sebagai SVG.
 *
 * Keputusan desain
 *   - `umum.js` dan `ui.js` diimpor sebagai namespace (`import * as`). Bila ada
 *     helper yang belum diekspor, modul TETAP termuat dan memakai cadangan lokal.
 *   - Logika berat dipisah ke lib/ (code128, kodeSiswa, berkas) dan kartuCetak.js
 *     sehingga bisa diuji tanpa DOM.
 *   - Semua teks dinamis di-escape; SVG barcode dibangun dari angka saja dan
 *     SVG dari luar divalidasi; CSV kebal formula injection.
 *
 * Kelas CSS (semua dd-*, sudah ada di styles.css):
 *   .dd-kartu-utama(--teal|__kepala|__judul) .dd-chip(--admin) .dd-toolbar
 *   .dd-toolbar-aksi .dd-field .dd-input .dd-info-teks .dd-kosong
 *   .dd-kartu-grid .dd-kartu .dd-kartu-{kepala,brand,kelas,isi,nama,nisn,
 *   barcode,url,kaki} .dd-kode .dd-btn(--sm|--utama)
 */
import * as UI from '../../ui.js';
import * as UMUM from './umum.js';
import { svgCode128 } from '../../lib/code128.js';
import { esc, normal, namaAman } from '../../lib/teks.js';
import { csvEscape, buatCsv, unduhBerkas, salinTeks } from '../../lib/berkas.js';
import {
  kelasDari, kodeTersimpan, kodeUntuk, urlScan as buatUrlScan, cariKodeGanda,
} from '../../lib/kodeSiswa.js';
import { cetakKartu } from './kartuCetak.js';

const OPSI_BARCODE = { tinggi: 42, lebarModul: 1.4 };
const JEDA_CARI_MS = 150;
const KUNCI_KELAS = 'dd:barcode:kelas';

/* =====================================================================
 * 1. Adapter ke helper bersama (dengan cadangan lokal)
 * =================================================================== */

function toast(pesan, jenis = 'ok') {
  if (typeof UMUM.toast === 'function') UMUM.toast(pesan, jenis);
  else if (typeof UI.toast === 'function') UI.toast(pesan, jenis);
  else console[jenis === 'galat' ? 'error' : 'info'](pesan);
}

/** Ikon aman: tidak pernah melempar galat, selalu mengembalikan string. */
function ikon(nama) {
  try {
    return typeof UMUM.ik === 'function' ? String(UMUM.ik(nama) ?? '') : '';
  } catch {
    return '';
  }
}

async function ambilDataSiswa(ctx) {
  if (typeof UMUM.ambilSiswa === 'function') {
    const hasil = await UMUM.ambilSiswa(ctx, true);
    return Array.isArray(hasil) ? hasil : [];
  }
  if (Array.isArray(ctx?.siswa)) return ctx.siswa;
  throw new Error('Fungsi ambilSiswa() tidak ditemukan di umum.js.');
}

function urutkanUnik(daftar) {
  if (typeof UMUM.urutUnik === 'function') {
    try {
      const hasil = UMUM.urutUnik(daftar);
      if (Array.isArray(hasil)) return hasil;
    } catch { /* pakai cadangan */ }
  }
  return [...new Set(daftar.map((x) => String(x ?? '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
}

const pembuatKode = typeof UMUM.buatKodeSiswa === 'function' ? UMUM.buatKodeSiswa : null;
const pembuatUrl = typeof UMUM.urlScanKode === 'function' ? UMUM.urlScanKode : null;
const kodeSiswa = (s) => kodeUntuk(s, pembuatKode);
const urlScan = (kode) => buatUrlScan(kode, pembuatUrl);

const BERBAHAYA = /<script|<foreignObject|\son\w+\s*=|javascript:/i;

/** SVG barcode: pakai milik aplikasi bila ada & aman, selain itu encoder lokal. */
function barcodeSvg(kode) {
  if (typeof UMUM.barcodeCode128SVG === 'function') {
    try {
      const svg = UMUM.barcodeCode128SVG(kode, OPSI_BARCODE);
      if (typeof svg === 'string' && /^\s*<svg[\s>]/i.test(svg) && !BERBAHAYA.test(svg)) return svg;
    } catch { /* pakai encoder lokal */ }
  }
  return svgCode128(kode, OPSI_BARCODE);
}

function ingatKelas(kelas) {
  try { sessionStorage.setItem(KUNCI_KELAS, kelas); } catch { /* mode privat */ }
}
function kelasTerakhir() {
  try { return sessionStorage.getItem(KUNCI_KELAS) || ''; } catch { return ''; }
}

/* =====================================================================
 * 2. Tampilan: memuat / galat
 * =================================================================== */

const kepala = () => `
  <header class="dd-kartu-utama__kepala">
    <h2 class="dd-kartu-utama__judul">${ikon('qr')} Barcode &amp; Kartu Absensi</h2>
  </header>`;

function tampilkanMemuat(el) {
  el.innerHTML = `
    <section class="dd-kartu-utama dd-kartu-utama--teal" aria-busy="true">
      ${kepala()}
      <p class="dd-info-teks" role="status">Memuat data siswa…</p>
    </section>`;
}

function tampilkanGalat(el, err, ulangi) {
  el.innerHTML = `
    <section class="dd-kartu-utama dd-kartu-utama--teal">
      ${kepala()}
      <p class="dd-kosong" role="alert">
        Data siswa belum bisa dimuat. Periksa koneksi internet lalu coba lagi.
        <br><small>${esc(err?.message || 'Kesalahan tidak diketahui')}</small>
      </p>
      <div class="dd-toolbar-aksi">
        <button type="button" class="dd-btn dd-btn--utama" data-aksi="ulangi">Coba lagi</button>
      </div>
    </section>`;
  el.querySelector('[data-aksi="ulangi"]')?.addEventListener('click', ulangi);
}

/* =====================================================================
 * 3. Tab utama
 * =================================================================== */

export async function tabBarcode(el, ctx) {
  tampilkanMemuat(el);

  let semua;
  try {
    semua = await ambilDataSiswa(ctx);
  } catch (err) {
    console.error('[tabBarcode] gagal memuat siswa', err);
    tampilkanGalat(el, err, () => tabBarcode(el, ctx));
    return;
  }

  semua = semua.filter((s) => s && typeof s === 'object');
  const kelasCtx = (Array.isArray(ctx?.kelas) ? ctx.kelas : [])
    .map((k) => (typeof k === 'string' ? k : (k?.nama ?? k?.kelas ?? '')));
  const daftarKelas = urutkanUnik([...kelasCtx, ...semua.map(kelasDari)]);

  if (!daftarKelas.length) {
    el.innerHTML = `
      <section class="dd-kartu-utama dd-kartu-utama--teal">
        ${kepala()}
        <p class="dd-kosong">
          Belum ada kelas. Tambahkan siswa di
          <a href="#/datadasar/siswa">Data Siswa</a> terlebih dahulu.
        </p>
      </section>`;
    return;
  }

  let kelasAktif = daftarKelas.includes(kelasTerakhir()) ? kelasTerakhir() : daftarKelas[0];
  let kataKunci = '';
  let tampil = [];            // siswa yang sedang ditampilkan
  const cacheSvg = new Map(); // kode → svg (hindari render ulang tiap ketikan)

  el.innerHTML = `
    <section class="dd-kartu-utama dd-kartu-utama--teal" data-tab="barcode">
      <header class="dd-kartu-utama__kepala">
        <h2 class="dd-kartu-utama__judul">${ikon('qr')} Barcode &amp; Kartu Absensi</h2>
        <span class="dd-chip dd-chip--admin" id="bcJumlah" aria-live="polite">0 kartu</span>
      </header>

      <div class="dd-toolbar">
        <div class="dd-field">
          <label for="bcKelas">Kelas</label>
          <select id="bcKelas" class="dd-input">
            ${daftarKelas.map((k) => `<option value="${esc(k)}"${k === kelasAktif ? ' selected' : ''}>${esc(k)}</option>`).join('')}
          </select>
        </div>
        <div class="dd-field">
          <label for="bcCari">Cari siswa</label>
          <input id="bcCari" class="dd-input" type="search" placeholder="Nama atau NISN"
                 autocomplete="off" inputmode="search">
        </div>
        <div class="dd-toolbar-aksi">
          <button type="button" class="dd-btn dd-btn--utama" id="bcCetak">
            ${ikon('cetak')} Cetak Kartu
          </button>
          <button type="button" class="dd-btn" id="bcUnduh">
            ${ikon('unduh')} Unduh CSV Kode
          </button>
        </div>
      </div>

      <p class="dd-info-teks">
        Setiap siswa memiliki kode unik <code class="dd-kode">ALE-KELAS-HASH-IDENT</code>.
        Barcode Code128 dapat dipindai untuk absensi
        (rute <code class="dd-kode">#/scan/&lt;kode&gt;</code>).
        Cetak dan CSV mengikuti daftar kartu yang sedang tampil.
      </p>
      <p class="dd-info-teks" id="bcPeringatan" hidden></p>
      <p class="dd-info-teks" id="bcGanda" role="alert" hidden></p>
      <div class="dd-kartu-grid" id="bcGrid"></div>
    </section>`;

  const q = (s) => el.querySelector(s);
  const grid = q('#bcGrid');

  /* ---------------- Data turunan ---------------- */

  /** Siswa pada kelas aktif, terurut nama, disaring kata kunci. */
  function anggotaTampil() {
    const kunci = normal(kataKunci);
    return semua
      .filter((s) => kelasDari(s) === kelasAktif)
      .filter((s) => !kunci || normal(s.nama).includes(kunci) || normal(s.nisn).includes(kunci))
      .sort((a, b) => String(a.nama ?? '').localeCompare(String(b.nama ?? ''), 'id', { sensitivity: 'base' }));
  }

  function svgUntuk(kode) {
    let svg = cacheSvg.get(kode);
    if (!svg) { svg = barcodeSvg(kode); cacheSvg.set(kode, svg); }
    return svg;
  }

  const jadikanKartu = (s) => {
    const kode = kodeSiswa(s);
    return { nama: String(s.nama ?? ''), nisn: String(s.nisn ?? ''), kelas: kelasDari(s), kode, svg: svgUntuk(kode) };
  };

  /* ---------------- Render ---------------- */

  function render() {
    tampil = anggotaTampil();
    const kelasIni = semua.filter((s) => kelasDari(s) === kelasAktif);
    const belumTersimpan = kelasIni.filter((s) => !kodeTersimpan(s)).length;

    // Kode yang dipakai >1 siswa membuat absensi salah sasaran — beri peringatan keras.
    const ganda = cariKodeGanda(semua.map(kodeSiswa));
    const gandaDiKelas = kelasIni.filter((s) => ganda.has(kodeSiswa(s))).length;

    q('#bcJumlah').textContent = `${tampil.length} kartu`;
    q('#bcCetak').disabled = !tampil.length;
    q('#bcUnduh').disabled = !tampil.length;

    const peringatan = q('#bcPeringatan');
    peringatan.hidden = !belumTersimpan;
    peringatan.textContent = belumTersimpan
      ? `${belumTersimpan} siswa di kelas ini belum memiliki kode unik permanen. ` +
        'Rekonsiliasi data siswa terlebih dahulu sebelum menggunakan kartu untuk absensi.'
      : '';

    const peringatanGanda = q('#bcGanda');
    peringatanGanda.hidden = !gandaDiKelas;
    peringatanGanda.textContent = gandaDiKelas
      ? `Perhatian: ${gandaDiKelas} siswa di kelas ini memakai kode yang sama dengan siswa lain. ` +
        'Periksa data siswa (nama/NISN ganda) sebelum mencetak kartu.'
      : '';

    if (!tampil.length) {
      grid.innerHTML = kataKunci
        ? `<p class="dd-kosong">Tidak ada siswa di kelas ${esc(kelasAktif)} yang cocok dengan “${esc(kataKunci)}”.</p>`
        : `<p class="dd-kosong">Belum ada siswa di kelas ${esc(kelasAktif)}.</p>`;
      return;
    }

    grid.innerHTML = tampil.map((s) => {
      const kode = kodeSiswa(s);
      return `
        <article class="dd-kartu" data-kode="${esc(kode)}" aria-label="Kartu ${esc(s.nama)}">
          <header class="dd-kartu-kepala">
            <span class="dd-kartu-brand">AI-NNOE</span>
            <span class="dd-kartu-kelas">${esc(kelasDari(s))}</span>
          </header>

          <div class="dd-kartu-isi">
            <h3 class="dd-kartu-nama">${esc(s.nama)}</h3>
            <p class="dd-kartu-nisn">NISN: ${esc(s.nisn || '-')}</p>
            <div class="dd-kartu-barcode">${svgUntuk(kode)}</div>
            <p class="dd-kartu-url"><code class="dd-kode">${esc(urlScan(kode))}</code></p>
          </div>

          <footer class="dd-kartu-kaki">
            <button type="button" class="dd-btn dd-btn--sm" data-aksi="salin" data-kode="${esc(kode)}">Salin kode</button>
            <button type="button" class="dd-btn dd-btn--sm" data-aksi="unduh" data-kode="${esc(kode)}">Unduh SVG</button>
            <button type="button" class="dd-btn dd-btn--sm" data-aksi="cetak" data-kode="${esc(kode)}">Cetak</button>
          </footer>
        </article>`;
    }).join('');
  }

  /* ---------------- Aksi ---------------- */

  function cetak(daftar, judul) {
    cetakKartu(daftar.map(jadikanKartu), { judul, onGalat: (m) => toast(m, 'galat') });
  }

  function unduhCsv() {
    const baris = [['nama', 'nisn', 'jenis_kelamin', 'kelas', 'kode_unik', 'url_scan']];
    tampil.forEach((s) => {
      const kode = kodeSiswa(s);
      baris.push([
        csvEscape(s.nama),
        csvEscape(s.nisn || '', { teksExcel: true }),
        csvEscape(s.jk || ''),
        csvEscape(kelasDari(s)),
        csvEscape(kode),
        csvEscape(urlScan(kode)),
      ]);
    });
    unduhBerkas(`kode-absensi-${namaAman(kelasAktif)}.csv`, buatCsv(baris), 'text/csv');
    toast(`${tampil.length} kode diunduh.`, 'ok');
  }

  /* ---------------- Event ---------------- */

  q('#bcKelas').addEventListener('change', (e) => {
    kelasAktif = e.target.value;
    ingatKelas(kelasAktif);
    render();
  });

  let pewaktuCari = 0;
  q('#bcCari').addEventListener('input', (e) => {
    clearTimeout(pewaktuCari);
    const nilai = e.target.value;
    pewaktuCari = setTimeout(() => { kataKunci = nilai.trim(); render(); }, JEDA_CARI_MS);
  });

  q('#bcCetak').addEventListener('click', () => {
    if (!tampil.length) { toast('Tidak ada kartu untuk dicetak.', 'galat'); return; }
    cetak(tampil, `Kartu Absensi ${kelasAktif}`);
  });

  q('#bcUnduh').addEventListener('click', () => {
    if (!tampil.length) { toast('Tidak ada data untuk diunduh.', 'galat'); return; }
    unduhCsv();
  });

  grid.addEventListener('click', async (e) => {
    const tombol = e.target instanceof Element ? e.target.closest('[data-aksi]') : null;
    if (!tombol) return;
    const { aksi, kode } = tombol.dataset;

    if (aksi === 'salin') {
      const ok = await salinTeks(kode);
      toast(ok ? `Kode ${kode} disalin.` : 'Gagal menyalin — browser menolak akses clipboard.', ok ? 'ok' : 'galat');
    } else if (aksi === 'unduh') {
      const svg = tombol.closest('.dd-kartu')?.querySelector('.dd-kartu-barcode svg');
      if (!svg) return;
      // XMLSerializer menjamin atribut xmlns ada sehingga SVG bisa dibuka mandiri.
      const isi = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`;
      unduhBerkas(`${namaAman(kode)}.svg`, isi, 'image/svg+xml');
    } else if (aksi === 'cetak') {
      const siswa = tampil.find((s) => kodeSiswa(s) === kode);
      if (siswa) cetak([siswa], `Kartu ${siswa.nama ?? kode}`);
    }
  });

  render();
}
