// web/src/pages/dataDasar/tabSiswa.js
/**
 * Data Siswa
 * ---------------------------------------------------------------------------
 * Fitur
 *   - Tambah / ubah / hapus siswa, cari (nama · NISN · kode), filter kelas.
 *   - Validasi inline per kolom + deteksi NISN ganda (lintas kelas).
 *   - Impor dari Excel/CSV dengan PRATINJAU: tiap baris diberi status
 *     Siap / Periksa / Dilewati beserta alasannya sebelum ditulis.
 *   - Pilih banyak siswa → hapus sekaligus (dikonfirmasi lewat <dialog>).
 *   - Ekspor daftar yang tampil ke CSV (aman dari formula injection).
 *   - Pendeteksian data legacy tanpa kode unik sebelum fitur barcode dipakai.
 *
 * Data tersimpan pada Supabase `students` dengan owner/tenant RLS.
 * `kode_unik` dibuat saat insert dan immutable; URL scan dibangun saat dibaca.
 *
 * Struktur modul
 *   siswa/impor.js  parser impor (murni, teruji unit)
 *   siswa/csv.js    ekspor CSV
 *   siswa/tulis.js  batas waktu tunggu penulisan
 *   siswa/gaya.js   stylesheet (CSP-safe, dipasang sekali)
 *
 * Ketahanan
 *   - Kerangka & form SELALU ter-render; gagal memuat hanya menampilkan
 *     peringatan + tombol "Coba lagi".
 *   - Penulisan dibatasi waktu (BATAS_TUNGGU_MS). Bila lewat, UI dilepas,
 *     perubahan ditampilkan sementara sambil menunggu konfirmasi server.
 *   - Form tetap terbuka sampai penulisan diterima/tertunda, sehingga isian
 *     tidak hilang saat ditolak server (mis. aturan keamanan).
 *   - Pemuatan ulang bertingkat dilindungi nomor urut (hasil lama tidak
 *     menimpa hasil baru) dan batas waktu.
 *   - Callback async tidak menyentuh DOM bila tab sudah ditinggalkan.
 *
 * Keamanan
 *   - Seluruh teks dinamis di-escape (esc). `esc` WAJIB meng-escape & < > " '.
 *   - Tanpa <style>/style="" inline → kompatibel dengan CSP `style-src 'self'`.
 *   - Penegakan ada di Supabase RLS dan batasan tabel `students`.
 */
import { esc } from '../../ui.js';
import {
  tambahBanyakSiswa, tambahSiswa, ubahSiswa, hapusBanyakSiswa,
} from '../../services/students.js';
import {
  ambilSiswa, bekukanKodeSiswa, bersih, buatKodeSiswa, urlScanKode,
  galat, ik, toast, urutUnik,
} from './umum.js';
import { uraiImpor as uraiImporMurni, hitungStatus, normal } from './siswa/impor.js';
import {
  BOM, bangunCsvSiswa, namaAman, stempelTanggal, unduhBerkas,
} from './siswa/csv.js';
import { denganBatas, tungguTulis } from './siswa/tulis.js';
import { pasangGaya } from './siswa/gaya.js';

/** Kompatibel dengan versi lama: `uraiImpor(teks, { kelas, nisnAda, namaDiKelas })`. */
export const uraiImpor = (teks, konteks) => uraiImporMurni(teks, { bersih, ...konteks });

const MAKS_IMPOR = 200;
const MAKS_BERKAS = 1_000_000;   // 1 MB — cukup untuk ribuan baris teks
const BATAS_MUAT_MS = 15_000;    // memuat daftar lebih lama dari ini → tampilkan peringatan

function idUuidSiswa() {
  if (!globalThis.crypto?.randomUUID) throw new Error('Peramban tidak mendukung pembuatan ID siswa yang aman.');
  return globalThis.crypto.randomUUID();
}

const kolasiKelas = new Intl.Collator('id', { numeric: true });
const kolasiNama = new Intl.Collator('id', { sensitivity: 'base' });
const urutSiswa = (a, b) =>
  kolasiKelas.compare(String(a.kelas || ''), String(b.kelas || '')) ||
  kolasiNama.compare(String(a.nama || ''), String(b.nama || ''));

/** Kunci pencarian dihitung sekali per objek siswa (bukan tiap ketikan). */
const kunciCari = new WeakMap();
function kunciSiswa(s) {
  let k = kunciCari.get(s);
  if (k === undefined) {
    k = normal([s.nama, s.nisn, s.kodeUnik].filter(Boolean).join(' '));
    kunciCari.set(s, k);
  }
  return k;
}

/* ---------------------------------------------------------------------
 * Penjaga penutupan halaman selama ada penulisan tertunda (lintas tab)
 * ------------------------------------------------------------------- */
let penulisanTertunda = 0;
let penjagaTerpasang = false;

function catatTertunda(selisih) {
  penulisanTertunda = Math.max(0, penulisanTertunda + selisih);
  if (penjagaTerpasang || typeof window === 'undefined') return;
  penjagaTerpasang = true;
  window.addEventListener('beforeunload', (e) => {
    if (penulisanTertunda > 0) { e.preventDefault(); e.returnValue = ''; }
  });
}

const KOLOM_FORM = ['sisNama', 'sisNisn', 'sisJk', 'sisKelas'];
const LABEL_STATUS = { ok: 'Siap', periksa: 'Periksa', lewati: 'Dilewati' };
const KET_KODE_BARU = 'Dibuat otomatis dari kelas, nama, dan NISN.';

export async function tabSiswa(el, ctx) {
  const uid = ctx?.user?.uid;
  if (!uid) {
    el.innerHTML = `
      <section class="ale-kartu ale-aksen-amber dd">
        <div class="ale-kartu-kepala">
          <h2 class="ale-kartu-judul">${ik('pengguna')} Data Peserta Didik</h2>
        </div>
        <p class="ale-kosong" role="alert">
          Sesi login tidak ditemukan. Muat ulang halaman atau masuk kembali.
        </p>
      </section>`;
    return;
  }

  pasangGaya();
  const kelasCtx = () => (Array.isArray(ctx.kelas) ? ctx.kelas : []);

  /* ---------------- Status ---------------- */
  let daftar = [];
  let indeks = new Map();       // id → siswa (pencarian O(1))
  let cari = '';
  let filter = '';
  let editId = null;
  let idSementara = null;
  let kodeSementara = null;
  let pratinjau = null;         // { baris, siap, kelas, teks } | null
  let idTampil = [];            // id siswa yang sedang tampil (untuk "pilih semua")
  let pemicu = null;            // elemen pembuka form (untuk mengembalikan fokus)
  let generasi = 0;             // naik tiap form/impor dibuka-ditutup (cegah penutupan salah sasaran)
  let sedangKirim = false;
  let urutanMuat = 0;
  const pilih = new Set();
  const tertunda = new Map();   // id → { jenis: 'set' | 'hapus', data? }  (belum dikonfirmasi server)

  const setDaftar = (arr) => { daftar = arr; indeks = new Map(arr.map((s) => [s.id, s])); };

  /* ---------------- Render kerangka LEBIH DULU ---------------- */
  el.innerHTML = `
    <section class="ale-kartu ale-aksen-amber dd sis">
      <div class="ale-kartu-kepala">
        <h2 class="ale-kartu-judul">${ik('pengguna')} Data Peserta Didik</h2>
        <span class="ale-chip ale-chip-admin" id="sisJumlah" aria-live="polite">0 siswa</span>
      </div>

      <div id="sisPeringatan" hidden class="alert alert-info sis-peringatan" role="status">
        <div>
          <strong>Data lama belum dapat dimuat.</strong>
          <span>Anda tetap bisa menambah siswa baru — data dikirim begitu koneksi pulih.</span>
          <button type="button" class="btn btn-sm btn-outline" id="sisUlang">Coba lagi</button>
        </div>
      </div>

      <div id="sisLegacy" hidden class="alert alert-info sis-peringatan" role="status">
        <div>
          <strong id="sisLegacyTeks"></strong>
          <button type="button" class="btn btn-sm btn-outline" id="sisLengkapi">Lengkapi kode</button>
        </div>
      </div>

      <div class="ale-toolbar">
        <div class="field">
          <label for="sisCari">Cari nama / NISN / kode</label>
          <input type="search" id="sisCari" class="input" placeholder="Ketik untuk mencari…" autocomplete="off">
        </div>
        <div class="field">
          <label for="sisFilter">Kelas</label>
          <select id="sisFilter" class="input"></select>
        </div>
        <div class="ale-toolbar-aksi">
          <button type="button" class="btn btn-primary" id="sisTambah">Tambah Siswa</button>
          <button type="button" class="btn btn-outline" id="sisImpor">Impor dari Excel</button>
          <button type="button" class="btn btn-outline" id="sisEkspor">Ekspor CSV</button>
          <a class="btn btn-outline" href="#/datadasar/barcode">Cetak Kartu Barcode</a>
        </div>
      </div>

      <form id="sisForm" class="ale-panel-form" hidden novalidate>
        <h3 class="ale-sub-judul" id="sisFormJudul">Tambah Siswa</h3>
        <div class="ale-form-grid">
          <div class="field">
            <label for="sisNama">Nama lengkap</label>
            <input type="text" id="sisNama" class="input" maxlength="100" required
                   autocomplete="off" aria-describedby="sisNamaGalat">
            <small class="sis-galat" id="sisNamaGalat" hidden></small>
          </div>
          <div class="field">
            <label for="sisNisn">NISN (opsional)</label>
            <input type="text" id="sisNisn" class="input" inputmode="numeric" maxlength="20"
                   autocomplete="off" aria-describedby="sisNisnKet sisNisnGalat">
            <small class="ale-info-teks" id="sisNisnKet"></small>
            <small class="sis-galat" id="sisNisnGalat" hidden></small>
          </div>
          <div class="field">
            <label for="sisJk">Jenis kelamin</label>
            <select id="sisJk" class="input" aria-describedby="sisJkGalat">
              <option value="">-</option>
              <option value="L">Laki-laki</option>
              <option value="P">Perempuan</option>
            </select>
            <small class="sis-galat" id="sisJkGalat" hidden></small>
          </div>
          <div class="field">
            <label for="sisKelas">Kelas / Rombel</label>
            <input type="text" id="sisKelas" class="input" maxlength="30" list="sisKelasList"
                   required autocomplete="off" aria-describedby="sisKelasGalat">
            <datalist id="sisKelasList"></datalist>
            <small class="sis-galat" id="sisKelasGalat" hidden></small>
          </div>
          <div class="field">
            <label for="sisKode">Kode unik</label>
            <input type="text" id="sisKode" class="input" readonly>
            <small class="ale-info-teks" id="sisKodeKet">${KET_KODE_BARU}</small>
          </div>
        </div>
        <div class="ale-form-aksi">
          <button type="submit" class="btn btn-primary">Simpan</button>
          <button type="button" class="btn btn-outline" id="sisBatal">Batal</button>
        </div>
      </form>

      <form id="sisImporForm" class="ale-panel-form" hidden novalidate>
        <h3 class="ale-sub-judul">Impor Banyak Siswa</h3>
        <p class="ale-info-teks">
          Salin kolom dari Excel lalu tempel di bawah, atau pilih berkas CSV/TXT.
          Urutan kolom: <strong>Nama</strong>, <strong>NISN</strong>, <strong>L/P</strong>
          (dipisah tab, titik koma, atau koma). Baris judul (Nama, NISN, L/P) dikenali otomatis,
          urutan kolomnya boleh berbeda. Maksimal ${MAKS_IMPOR} baris sekali impor.
          Format kolom NISN sebagai <em>Teks</em> di Excel agar angka nol di depan tidak hilang.
        </p>
        <div class="field">
          <label for="impKelas">Kelas tujuan</label>
          <input type="text" id="impKelas" class="input" maxlength="30" list="sisKelasList" required autocomplete="off">
        </div>
        <div class="field">
          <label for="impBerkas">Berkas CSV/TXT (opsional)</label>
          <input type="file" id="impBerkas" class="input" accept=".csv,.tsv,.txt,text/csv,text/plain">
        </div>
        <div class="field">
          <label for="impTeks">Data siswa</label>
          <textarea id="impTeks" class="input" rows="7"
                    placeholder="Ahmad Fauzi&#9;0123456789&#9;L"></textarea>
        </div>

        <div id="impPratinjau" class="sis-pratinjau" hidden></div>

        <div class="ale-form-aksi">
          <button type="submit" class="btn btn-primary" id="impAksi">Periksa data</button>
          <button type="button" class="btn btn-outline" id="impBatal">Batal</button>
        </div>
      </form>

      <div class="sis-bar-pilih" id="sisBarPilih" hidden>
        <span id="sisPilihJumlah" aria-live="polite"></span>
        <button type="button" class="btn btn-sm btn-outline ale-btn-bahaya" id="sisHapusPilih">Hapus terpilih</button>
        <button type="button" class="btn btn-sm btn-outline" id="sisBatalPilih">Batal pilih</button>
      </div>

      <div class="ale-tabel-wrap" tabindex="0" role="region" aria-label="Tabel data siswa">
        <table class="ale-tabel">
          <thead>
            <tr>
              <th scope="col">
                <input type="checkbox" id="sisPilihSemua" aria-label="Pilih semua siswa yang tampil">
              </th>
              <th scope="col">No</th>
              <th scope="col">Nama</th>
              <th scope="col">NISN</th>
              <th scope="col">L/P</th>
              <th scope="col">Kelas</th>
              <th scope="col">Kode Unik</th>
              <th scope="col"><span class="sr-only">Aksi</span></th>
            </tr>
          </thead>
          <tbody id="sisBody">
            <tr><td colspan="8" class="ale-kosong" role="status">Memuat…</td></tr>
          </tbody>
        </table>
      </div>

      <dialog class="sis-dialog" id="sisDialog" aria-labelledby="sisDialogJudul" aria-describedby="sisDialogPesan">
        <form method="dialog">
          <h3 id="sisDialogJudul"></h3>
          <p id="sisDialogPesan"></p>
          <div class="sis-dialog-aksi">
            <button type="submit" value="batal" class="btn btn-outline" autofocus>Batal</button>
            <button type="submit" value="ya" class="btn btn-primary" id="sisDialogYa">Hapus</button>
          </div>
        </form>
      </dialog>
    </section>`;

  const akar = el.querySelector(':scope > section.sis');
  const q = (s) => akar.querySelector(s);
  /** False bila tab sudah ditinggalkan (el diisi ulang oleh router). */
  const hidup = () => akar.isConnected;
  const semuaKelas = () => urutUnik([...kelasCtx(), ...daftar.map((s) => s.kelas)]);

  /* ---------------- Dialog konfirmasi ---------------- */
  function konfirmasi({ judul, pesan, aksi = 'Hapus', bahaya = true }) {
    const dlg = q('#sisDialog');
    if (typeof dlg.showModal !== 'function') {
      return Promise.resolve(window.confirm(`${judul}\n\n${pesan}`));
    }
    q('#sisDialogJudul').textContent = judul;
    q('#sisDialogPesan').textContent = pesan;
    const ya = q('#sisDialogYa');
    ya.textContent = aksi;
    ya.classList.toggle('ale-btn-bahaya', bahaya);
    dlg.returnValue = '';
    return new Promise((selesai) => {
      dlg.addEventListener('close', () => selesai(dlg.returnValue === 'ya'), { once: true });
      dlg.showModal();
    });
  }

  /* ---------------- Opsi kelas ---------------- */
  function isiOpsiKelas() {
    const kelas = semuaKelas();
    q('#sisFilter').innerHTML =
      `<option value="">Semua kelas</option>` +
      kelas.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
    q('#sisFilter').value = kelas.includes(filter) ? filter : '';
    filter = q('#sisFilter').value;
    q('#sisKelasList').innerHTML = kelas.map((k) => `<option value="${esc(k)}"></option>`).join('');
  }

  /* ---------------- Tabel ---------------- */
  function siswaTampil() {
    const kata = normal(cari);
    return daftar
      .filter((s) => (!filter || s.kelas === filter) && (!kata || kunciSiswa(s).includes(kata)))
      .sort(urutSiswa);
  }

  function perbaruiBarPilih() {
    for (const id of [...pilih]) if (!indeks.has(id)) pilih.delete(id);

    q('#sisBarPilih').hidden = pilih.size === 0;
    q('#sisPilihJumlah').textContent = `${pilih.size} siswa dipilih`;

    const semua = q('#sisPilihSemua');
    const terpilihDiTampil = idTampil.filter((id) => pilih.has(id)).length;
    semua.checked = idTampil.length > 0 && terpilihDiTampil === idTampil.length;
    semua.indeterminate = terpilihDiTampil > 0 && terpilihDiTampil < idTampil.length;
    semua.disabled = idTampil.length === 0;
  }

  function gambar() {
    const tampil = siswaTampil();
    idTampil = tampil.map((s) => s.id);

    q('#sisJumlah').textContent = (filter || cari)
      ? `${tampil.length} dari ${daftar.length} siswa`
      : `${daftar.length} siswa`;

    const lama = daftar.filter((s) => !s.kodeUnik).length;
    q('#sisLegacy').hidden = lama === 0;
    q('#sisLegacyTeks').textContent =
      `${lama} siswa belum memiliki kode unik. Data ini perlu direkonsiliasi sebelum dapat digunakan.`;

    q('#sisBody').innerHTML = tampil.length
      ? tampil.map((s, i) => `
        <tr>
          <td data-label="Pilih">
            <input type="checkbox" data-pilih="${esc(s.id)}" ${pilih.has(s.id) ? 'checked' : ''}
                   aria-label="Pilih ${esc(s.nama)}">
          </td>
          <td data-label="No">${i + 1}</td>
          <td data-label="Nama">${esc(s.nama)}${s._menunggu ? '<span class="sis-badge">Menunggu konfirmasi</span>' : ''}</td>
          <td data-label="NISN">${esc(s.nisn || '-')}</td>
          <td data-label="L/P">${esc(s.jk || '-')}</td>
          <td data-label="Kelas">${esc(s.kelas || '-')}</td>
          <td data-label="Kode Unik">
            ${s.kodeUnik
              ? `<code class="dd-kode" title="${esc(s.kodeUnik)}">${esc(s.kodeUnik)}</code>`
              : '<span class="ale-info-teks">—</span>'}
          </td>
          <td class="ale-tabel-aksi">
            <button type="button" class="btn btn-sm btn-outline"
                    data-aksi="ubah" data-id="${esc(s.id)}"
                    aria-label="Ubah data ${esc(s.nama)}">Ubah</button>
            <button type="button" class="btn btn-sm btn-outline ale-btn-bahaya"
                    data-aksi="hapus" data-id="${esc(s.id)}"
                    aria-label="Hapus ${esc(s.nama)}">Hapus</button>
          </td>
        </tr>`).join('')
      : `<tr><td colspan="8" class="ale-kosong">${
          daftar.length
            ? 'Tidak ada siswa yang cocok.'
            : 'Belum ada data siswa. Klik "Tambah Siswa" atau "Impor dari Excel".'
        }</td></tr>`;

    perbaruiBarPilih();
  }

  /* ---------------- Pemuatan ---------------- */

  /** Tempelkan perubahan yang belum dikonfirmasi server di atas data hasil muat. */
  function terapkanTertunda(basis) {
    if (!tertunda.size) return basis;
    const peta = new Map(basis.map((s) => [s.id, s]));
    for (const [id, t] of tertunda) {
      if (t.jenis === 'hapus') peta.delete(id);
      else peta.set(id, { ...(peta.get(id) || {}), ...t.data, _menunggu: true });
    }
    return [...peta.values()];
  }

  /**
   * Muat ulang daftar dari Supabase. Tidak melempar galat — hanya mengubah
   * visibilitas peringatan. `true` bila sukses, `false` bila gagal.
   * Hasil yang kedaluwarsa (ada muatan yang lebih baru) dibuang.
   */
  async function segarkan() {
    const nomor = ++urutanMuat;
    let sukses = true;
    try {
      const baru = await denganBatas(ambilSiswa(ctx, true), BATAS_MUAT_MS, 'Memuat data terlalu lama');
      if (!hidup() || nomor !== urutanMuat) return true;
      setDaftar(terapkanTertunda(Array.isArray(baru) ? baru : []));
      q('#sisPeringatan').hidden = true;
    } catch (err) {
      console.warn('[tabSiswa] gagal memuat data:', err);
      if (!hidup() || nomor !== urutanMuat) return false;
      q('#sisPeringatan').hidden = false;
      sukses = false; // `daftar` dibiarkan (kosong atau data lama/sementara)
    }
    isiOpsiKelas();
    gambar();
    return sukses;
  }

  const segarkanDiLatarBelakang = () => {
    segarkan().catch((err) => console.error('[tabSiswa] segarkan', err));
  };

  /* ---------------- Penulisan: tunggu / tunda / lokal ---------------- */
  const gabung = (lama, baru, menunggu) => {
    const hasil = { ...lama, ...baru };
    if (menunggu) hasil._menunggu = true; else delete hasil._menunggu;
    return hasil;
  };

  /**
   * Cerminkan perubahan ke daftar lokal.
   * menunggu=true → disimpan di `tertunda` (bertahan melewati muat ulang).
   * Objek selalu dibuat baru; larik/objek bersama (cache umum.js) tidak dimutasi.
   */
  function terapkanLokal({ simpan = [], hapus = [] }, menunggu) {
    if (!hidup()) return;
    hapus.forEach((id) => pilih.delete(id));
    if (menunggu) {
      simpan.forEach((s) => tertunda.set(s.id, { jenis: 'set', data: s }));
      hapus.forEach((id) => tertunda.set(id, { jenis: 'hapus' }));
      setDaftar(terapkanTertunda(daftar));
    } else {
      const peta = new Map(daftar.map((s) => [s.id, s]));
      simpan.forEach((s) => peta.set(s.id, gabung(peta.get(s.id), s, false)));
      hapus.forEach((id) => peta.delete(id));
      setDaftar([...peta.values()]);
    }
    isiOpsiKelas();
    gambar();
  }

  function lepasTertunda({ simpan = [], hapus = [] }) {
    simpan.forEach((s) => tertunda.delete(s.id));
    hapus.forEach((id) => tertunda.delete(id));
  }

  /**
   * Menyelesaikan satu penulisan.
   *  - Selesai tepat waktu → cerminkan lokal, toast sukses, muat ulang di latar.
   *  - Terlambat → tampilkan sementara, lalu laporkan hasil akhirnya.
   *  - Gagal cepat → melempar galat (ditangkap pemanggil; UI tidak berubah).
   * `sesudahTulis` dipanggil begitu hasilnya diketahui ('ok' | 'tunda').
   */
  async function selesaikan(janji, { pesanOk, judulGalat, lokal, sesudahTulis }) {
    const status = await tungguTulis(janji);
    sesudahTulis?.(status);

    if (status === 'ok') {
      terapkanLokal(lokal, false);
      toast(pesanOk, 'ok');
      segarkanDiLatarBelakang();
      return 'ok';
    }

    terapkanLokal(lokal, true);
    toast('Koneksi lambat. Perubahan ditampilkan sementara sambil menunggu konfirmasi server.', 'info');
    catatTertunda(+1);
    janji
      .then(
        () => { lepasTertunda(lokal); toast(pesanOk, 'ok'); },
        (err) => { lepasTertunda(lokal); galat(err, judulGalat); },
      )
      .finally(() => { catatTertunda(-1); segarkanDiLatarBelakang(); })
      .catch((err) => console.error('[tabSiswa] penyelesaian tertunda', err));
    return 'tunda';
  }

  /** Judul galat yang menyebut berapa operasi sempat tersimpan (batch parsial). */
  const judulSebagian = (judul, err, total) =>
    (err?.jumlahTertulis > 0 ? `${judul} (${err.jumlahTertulis} dari ${total} sempat tersimpan)` : judul);

  /* ---------------- Form tambah/ubah ---------------- */
  function tampilkanGalat(peta) {
    let pertama = null;
    KOLOM_FORM.forEach((id) => {
      const input = q(`#${id}`);
      const pesan = q(`#${id}Galat`);
      const teks = peta[id] || '';
      pesan.textContent = teks;
      pesan.hidden = !teks;
      if (teks) {
        input.setAttribute('aria-invalid', 'true');
        if (!pertama) pertama = input;
      } else {
        input.removeAttribute('aria-invalid');
      }
    });
    if (pertama) pertama.focus();
  }

  const bersihkanGalat = (id) => {
    q(`#${id}`).removeAttribute('aria-invalid');
    q(`#${id}Galat`).hidden = true;
  };

  function tutupForm({ kembaliFokus = true } = {}) {
    generasi += 1;
    editId = null;
    idSementara = null;
    kodeSementara = null;
    const f = q('#sisForm');
    f.hidden = true;
    f.reset();
    tampilkanGalat({});
    q('#sisKode').value = '';
    q('#sisNisnKet').textContent = '';
    q('#sisKodeKet').textContent = KET_KODE_BARU;
    if (kembaliFokus && pemicu && pemicu.isConnected) pemicu.focus();
    pemicu = null;
  }

  function perbaruiPreviewKode() {
    if (editId) return;
    if (!idSementara) idSementara = idUuidSiswa();
    if (!kodeSementara) kodeSementara = buatKodeSiswa({});
    q('#sisKode').value = kodeSementara;
  }

  function perbaruiKeteranganNisn() {
    const digit = q('#sisNisn').value.replace(/\D/g, '');
    q('#sisNisnKet').textContent = digit && digit.length !== 10
      ? `NISN biasanya 10 digit (terisi ${digit.length}).`
      : '';
  }

  function bukaForm(s, pembuka) {
    generasi += 1;
    q('#sisImporForm').hidden = true;
    pemicu = pembuka || q('#sisTambah');
    editId = s ? s.id : null;
    idSementara = s ? null : idUuidSiswa();

    q('#sisFormJudul').textContent = s ? 'Ubah Data Siswa' : 'Tambah Siswa';
    q('#sisNama').value = s ? (s.nama || '') : '';
    q('#sisNisn').value = s ? (s.nisn || '') : '';
    q('#sisJk').value = s ? (s.jk || '') : '';
    q('#sisKelas').value = s ? (s.kelas || '') : (filter || kelasCtx()[0] || '');
    tampilkanGalat({});
    perbaruiKeteranganNisn();

    if (s) {
      q('#sisKode').value = s.kodeUnik || '—';
      q('#sisKodeKet').textContent = s.kodeUnik
        ? 'Kode ini tidak berubah walau data diedit. Cetak ulang hanya jika diperlukan.'
        : 'Siswa ini dibuat sebelum fitur kode unik. Simpan untuk membuat kode baru.';
    } else {
      q('#sisKodeKet').textContent = KET_KODE_BARU;
      perbaruiPreviewKode();
    }

    q('#sisForm').hidden = false;
    q('#sisNama').focus();
  }

  ['#sisNama', '#sisNisn', '#sisKelas'].forEach((sel) =>
    q(sel).addEventListener('input', perbaruiPreviewKode));
  q('#sisNisn').addEventListener('input', perbaruiKeteranganNisn);
  KOLOM_FORM.forEach((id) => {
    q(`#${id}`).addEventListener('input', () => bersihkanGalat(id));
    q(`#${id}`).addEventListener('change', () => bersihkanGalat(id));
  });
  q('#sisForm').addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sedangKirim) tutupForm();
  });

  /* ---------------- Impor: pratinjau ---------------- */
  function resetPratinjau() {
    pratinjau = null;
    const kotak = q('#impPratinjau');
    kotak.hidden = true;
    kotak.innerHTML = '';
    q('#impAksi').textContent = 'Periksa data';
  }

  const konteksImpor = (kelas) => ({
    kelas,
    nisnAda: new Map(daftar.filter((s) => s.nisn).map((s) => [s.nisn, s])),
    namaDiKelas: new Set(daftar.filter((s) => s.kelas === kelas).map((s) => normal(s.nama))),
  });

  const tandaStatus = (baris) => baris.map((b) => b.status[0]).join('');

  function tampilkanPratinjau(baris, kelas, teks) {
    const { siap, periksa, lewati } = hitungStatus(baris);
    pratinjau = { baris, siap, kelas, teks };

    q('#impPratinjau').innerHTML = `
      <p class="ale-info-teks" role="status">
        <strong>${siap}</strong> baris siap diimpor ke kelas <strong>${esc(kelas)}</strong>${
          periksa ? `, ${periksa} perlu diperiksa` : ''}${
          lewati ? `, ${lewati} akan dilewati` : ''}.
      </p>
      <div class="ale-tabel-wrap sis-pratinjau-wrap" tabindex="0" role="region" aria-label="Pratinjau impor">
        <table class="ale-tabel">
          <thead>
            <tr>
              <th scope="col">Baris</th><th scope="col">Nama</th><th scope="col">NISN</th>
              <th scope="col">L/P</th><th scope="col">Status</th><th scope="col">Catatan</th>
            </tr>
          </thead>
          <tbody>
            ${baris.map((b) => `
              <tr>
                <td data-label="Baris">${b.no}</td>
                <td data-label="Nama">${esc(b.nama || '-')}</td>
                <td data-label="NISN">${esc(b.nisn || '-')}</td>
                <td data-label="L/P">${esc(b.jk || '-')}</td>
                <td data-label="Status"><span class="sis-status sis-status-${b.status}">${LABEL_STATUS[b.status]}</span></td>
                <td data-label="Catatan">${esc(b.catatan || '')}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    q('#impPratinjau').hidden = false;
    q('#impAksi').textContent = siap ? `Impor ${siap} siswa` : 'Periksa ulang';
    q('#impAksi').focus();
  }

  function buatPratinjau() {
    const kelas = bersih(q('#impKelas').value, 30);
    if (!kelas) { toast('Isi kelas tujuan impor.', 'galat'); q('#impKelas').focus(); return; }

    const teks = q('#impTeks').value;
    if (!teks.trim()) { toast('Tempel data siswa atau pilih berkas terlebih dahulu.', 'galat'); q('#impTeks').focus(); return; }

    const baris = uraiImpor(teks, konteksImpor(kelas));
    if (!baris.length) { toast('Tidak ada baris data yang terbaca.', 'galat'); return; }
    if (baris.length > MAKS_IMPOR) {
      toast(`Maksimal ${MAKS_IMPOR} baris sekali impor (terbaca ${baris.length}).`, 'galat');
      return;
    }
    tampilkanPratinjau(baris, kelas, teks);
  }

  ['#impTeks', '#impKelas'].forEach((sel) => q(sel).addEventListener('input', resetPratinjau));

  q('#impBerkas').addEventListener('change', async (e) => {
    const berkas = e.target.files?.[0];
    if (!berkas) return;
    if (berkas.size > MAKS_BERKAS) {
      toast('Berkas terlalu besar (maksimal 1 MB).', 'galat');
      e.target.value = '';
      return;
    }
    try {
      const isi = (await berkas.text()).replace(/^\uFEFF/, '');
      if (!hidup()) return;
      q('#impTeks').value = isi;
      resetPratinjau();
    } catch (err) {
      console.error('[tabSiswa] gagal membaca berkas', err);
      toast('Berkas tidak dapat dibaca.', 'galat');
    }
  });

  /* ---------------- Event umum ---------------- */
  let pewaktuCari = 0;
  q('#sisCari').oninput = (e) => {
    const nilai = e.target.value.trim();
    clearTimeout(pewaktuCari);
    pewaktuCari = setTimeout(() => { if (hidup()) { cari = nilai; gambar(); } }, 120);
  };
  q('#sisFilter').onchange = (e) => { filter = e.target.value; gambar(); };
  q('#sisTambah').onclick = (e) => bukaForm(null, e.currentTarget);
  q('#sisBatal').onclick = () => tutupForm();
  q('#sisUlang').onclick = async (e) => {
    const tombol = e.currentTarget;
    tombol.disabled = true;
    await segarkan();
    if (hidup()) tombol.disabled = false;
  };

  q('#sisImpor').onclick = (e) => {
    tutupForm({ kembaliFokus: false });
    pemicu = e.currentTarget;
    resetPratinjau();
    q('#impKelas').value = filter || kelasCtx()[0] || '';
    q('#sisImporForm').hidden = false;
    q('#impTeks').focus();
  };
  const tutupImpor = () => {
    generasi += 1;
    q('#sisImporForm').hidden = true;
    q('#sisImporForm').reset();
    resetPratinjau();
    if (pemicu && pemicu.isConnected) pemicu.focus();
    pemicu = null;
  };
  q('#impBatal').onclick = tutupImpor;
  q('#sisImporForm').addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sedangKirim) tutupImpor();
  });

  q('#sisEkspor').onclick = () => {
    const tampil = siswaTampil();
    if (!tampil.length) { toast('Tidak ada data untuk diekspor.', 'galat'); return; }
    unduhBerkas(
      `data-siswa-${namaAman(filter || 'semua-kelas')}-${stempelTanggal()}.csv`,
      BOM + bangunCsvSiswa(tampil),
      'text/csv',
    );
    toast(`${tampil.length} siswa diekspor.`, 'ok');
  };

  /* ---------------- Submit tambah/ubah ---------------- */
  q('#sisForm').onsubmit = async (e) => {
    e.preventDefault();
    if (sedangKirim) return;

    const nama = bersih(q('#sisNama').value, 100);
    const kelas = bersih(q('#sisKelas').value, 30);
    const nisn = q('#sisNisn').value.replace(/\s+/g, '');
    const jk = q('#sisJk').value;

    const peta = {};
    if (!nama) peta.sisNama = 'Nama wajib diisi.';
    if (!kelas) peta.sisKelas = 'Kelas wajib diisi.';
    if (nisn && !/^\d+$/.test(nisn)) {
      peta.sisNisn = 'NISN hanya boleh berisi angka.';
    } else if (nisn) {
      const ganda = daftar.find((x) => x.id !== editId && x.nisn === nisn);
      if (ganda) peta.sisNisn = `NISN sudah dipakai ${ganda.nama} (${ganda.kelas || '-'}).`;
    }
    if (!['', 'L', 'P'].includes(jk)) peta.sisJk = 'Jenis kelamin tidak valid.';

    tampilkanGalat(peta);
    if (Object.keys(peta).length) return;

    const idEdit = editId;
    const lama = idEdit ? indeks.get(idEdit) : null;
    if (idEdit && !lama) {
      toast('Data siswa tidak ditemukan — mungkin sudah dihapus. Daftar dimuat ulang.', 'galat');
      tutupForm();
      await segarkan();
      return;
    }
    if (idEdit && !lama.kodeUnik) {
      toast('Siswa legacy tanpa kode unik harus direkonsiliasi sebelum dapat diubah.', 'galat');
      return;
    }

    const tombol = e.submitter || q('#sisForm button[type="submit"]');
    const g = generasi;
    sedangKirim = true;
    tombol.disabled = true;
    tombol.setAttribute('aria-busy', 'true');

    try {
      const id = idEdit || idSementara || idUuidSiswa();
      const kodeUnik = lama?.kodeUnik || kodeSementara || buatKodeSiswa({});
      const berubahKode = !lama?.kodeUnik;
      const urlScan = berubahKode || !lama?.urlScan ? urlScanKode(kodeUnik) : lama.urlScan;

      const lokal = { id, nama, nisn, jk, kelas, kodeUnik };
      if (idEdit) {
        lokal.urlScan = urlScan;
        await selesaikan(ubahSiswa(uid, id, { nama, nisn, jk, kelas }), {
          pesanOk: 'Data siswa diperbarui.',
          judulGalat: 'Gagal menyimpan siswa',
          lokal: { simpan: [lokal] },
          sesudahTulis: () => {
            if (g !== generasi) return;
            tutupForm();
            filter = kelas;
          },
        });
      } else {
        lokal.urlScan = urlScan;
        const janji = tambahSiswa({
          ...lokal,
          tenantId: ctx.tenantId,
          ownerId: uid,
        }).then((saved) => {
          lokal.id = saved.id;
          lokal.urlScan = saved.urlScan;
          return saved;
        });
        await selesaikan(janji, {
          pesanOk: `Siswa ditambahkan · ${kodeUnik}`,
          judulGalat: 'Gagal menyimpan siswa',
          lokal: { simpan: [lokal] },
          sesudahTulis: () => {
            if (g !== generasi) return;
            tutupForm();
            filter = kelas;
          },
        });
      }
    } catch (err) {
      // Form sengaja dibiarkan terbuka: isian tidak hilang.
      galat(err, 'Gagal menyimpan siswa');
    } finally {
      sedangKirim = false;
      if (hidup()) { tombol.disabled = false; tombol.removeAttribute('aria-busy'); }
    }
  };

  /* ---------------- Submit impor ke Supabase (dua langkah) ---------------- */
  q('#sisImporForm').onsubmit = async (e) => {
    e.preventDefault();
    if (sedangKirim) return;

    // Langkah 1: tampilkan pratinjau. Langkah 2: simpan ke Supabase.
    if (!pratinjau || !pratinjau.siap) { buatPratinjau(); return; }

    const { kelas, teks } = pratinjau;

    // Data lokal bisa berubah sejak pratinjau (sinkron tertunda, tab lain) → periksa ulang.
    const segar = uraiImpor(teks, konteksImpor(kelas));
    if (tandaStatus(segar) !== tandaStatus(pratinjau.baris)) {
      tampilkanPratinjau(segar, kelas, teks);
      toast('Data berubah sejak pemeriksaan. Periksa pratinjau sekali lagi.', 'info');
      return;
    }

    const baru = segar.filter((b) => b.status !== 'lewati').map((b) => {
      const id = idUuidSiswa();
      const kodeUnik = buatKodeSiswa({ id, nama: b.nama, nisn: b.nisn, kelas });
      return {
        id, ownerId: uid, tenantId: ctx.tenantId,
        nama: b.nama, nisn: b.nisn, jk: b.jk, kelas, kodeUnik,
        urlScan: urlScanKode(kodeUnik),
      };
    });
    const dilewati = segar.length - baru.length;

    const tombol = e.submitter || q('#impAksi');
    const g = generasi;
    sedangKirim = true;
    tombol.disabled = true;
    tombol.setAttribute('aria-busy', 'true');

    try {
      const lokalBaru = [];
      const janji = tambahBanyakSiswa(baru).then((saved) => {
        const sumber = new Map(baru.map((student) => [student.kodeUnik, student]));
        lokalBaru.splice(0, lokalBaru.length, ...saved.map((student) => ({
          ...sumber.get(student.kodeUnik),
          id: student.id,
          urlScan: student.urlScan,
        })));
        return saved;
      });
      await selesaikan(janji, {
        pesanOk: `${baru.length} siswa diimpor${dilewati ? `, ${dilewati} baris dilewati` : ''}.`,
        judulGalat: 'Gagal mengimpor siswa',
        lokal: { simpan: lokalBaru },
        sesudahTulis: () => {
          if (g !== generasi) return;
          filter = kelas;
          tutupImpor();
        },
      });
    } catch (err) {
      galat(err, judulSebagian('Gagal mengimpor siswa', err, baru.length));
      if (err?.jumlahTertulis > 0) await segarkan();
    } finally {
      sedangKirim = false;
      if (hidup()) { tombol.disabled = false; tombol.removeAttribute('aria-busy'); }
    }
  };

  /* ---------------- Lengkapi kode siswa lama ---------------- */
  q('#sisLengkapi').onclick = async (e) => {
    const tombol = e.currentTarget;
    const lama = daftar.filter((s) => !s.kodeUnik);
    if (!lama.length) return;

    tombol.disabled = true;
    try {
      const jumlah = await bekukanKodeSiswa(ctx, daftar);
      if (jumlah) toast(`${jumlah} kode unik dibuat.`, 'ok');
    } catch (err) {
      galat(err, 'Gagal melengkapi kode unik');
    } finally {
      if (hidup()) tombol.disabled = false;
    }
  };

  /* ---------------- Pilihan & aksi per baris ---------------- */
  q('#sisBody').addEventListener('change', (e) => {
    const kotak = e.target instanceof Element ? e.target.closest('[data-pilih]') : null;
    if (!kotak) return;
    if (kotak.checked) pilih.add(kotak.dataset.pilih); else pilih.delete(kotak.dataset.pilih);
    perbaruiBarPilih();
  });

  q('#sisPilihSemua').addEventListener('change', (e) => {
    idTampil.forEach((id) => (e.target.checked ? pilih.add(id) : pilih.delete(id)));
    gambar();
  });

  q('#sisBatalPilih').onclick = () => { pilih.clear(); gambar(); };

  q('#sisHapusPilih').onclick = async (e) => {
    const tombol = e.currentTarget;
    const daftarId = [...pilih].filter((id) => indeks.has(id));
    if (!daftarId.length) return;

    const ya = await konfirmasi({
      judul: `Hapus ${daftarId.length} siswa?`,
      pesan: `${daftarId.length} data siswa akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`,
      aksi: `Hapus ${daftarId.length} siswa`,
    });
    if (!ya || !hidup()) return;

    tombol.disabled = true;
    try {
      await selesaikan(hapusBanyakSiswa(uid, daftarId), {
        pesanOk: `${daftarId.length} siswa dihapus.`,
        judulGalat: 'Gagal menghapus siswa',
        lokal: { hapus: daftarId },
      });
    } catch (err) {
      galat(err, judulSebagian('Gagal menghapus siswa', err, daftarId.length));
      if (err?.jumlahTertulis > 0) await segarkan();
    } finally {
      if (hidup()) tombol.disabled = false;
    }
  };

  q('#sisBody').addEventListener('click', async (e) => {
    const tombol = e.target instanceof Element ? e.target.closest('[data-aksi]') : null;
    if (!tombol) return;
    const s = indeks.get(tombol.dataset.id);
    if (!s) return;

    if (tombol.dataset.aksi === 'ubah') { bukaForm(s, tombol); return; }

    if (tombol.dataset.aksi === 'hapus') {
      const ya = await konfirmasi({
        judul: 'Hapus siswa?',
        pesan: `"${s.nama}" akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`,
      });
      if (!ya || !hidup()) return;

      tombol.disabled = true;
      try {
        await selesaikan(hapusBanyakSiswa(uid, [s.id]), {
          pesanOk: 'Siswa dihapus.',
          judulGalat: 'Gagal menghapus siswa',
          lokal: { hapus: [s.id] },
        });
      } catch (err) {
        if (hidup()) tombol.disabled = false;
        galat(err, 'Gagal menghapus siswa');
      }
    }
  });

  /* ---------------- Mulai ---------------- */
  isiOpsiKelas();
  gambar();
  await segarkan();
}
