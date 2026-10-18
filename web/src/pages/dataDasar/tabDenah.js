// web/src/pages/dataDasar/tabDenah.js
// Denah duduk interaktif + pembagian kelompok acak, per kelas.
// Gaya: tabDenah.css (lihat petunjuk pemasangan). Logika murni: denahLogika.js.
import { esc } from '../../ui.js';
import { ambilSiswa, galat, ik, toast, urutNama, urutUnik } from './umum.js';
import {
  hubungkanGoogleDriveUntukPengguna,
  sesiGoogleWorkspacePerPengguna,
} from '../../services/googleWorkspaceAuth.js';
import { identitasEnkripsiDriveDalamSesi } from '../../services/driveEncryption.js';
import {
  muatDenahGuruDrive,
  simpanDenahGuruDrive,
} from '../../services/teacherSeatingDrive.js';
import {
  MAKS_KELOMPOK,
  MAKS_UKURAN,
  MIN_KELOMPOK,
  acakKursi,
  bacaKunciKursi,
  bagiKelompok,
  batas,
  buatCsv,
  kunciKursi,
  namaBerkas,
  pindahkan,
  ubahUkuran,
} from './denahLogika.js';

const MAKS_RIWAYAT = 30;
const PETUNJUK_AWAL =
  'Pilih nama siswa, lalu klik kursi kosong. Klik kursi terisi untuk memegang siswa, lalu klik kursi lain untuk memindahkan atau menukar.';

// Satu pemasangan aktif per elemen: memanggil tabDenah() lagi pada elemen yang sama
// otomatis melepas listener (klik, keyboard, beforeunload) milik pemasangan sebelumnya.
const pemasangan = new WeakMap();

const salin = (s) => ({
  baris: s.baris,
  kolom: s.kolom,
  jumlahKelompok: s.jumlahKelompok,
  kursi: { ...s.kursi },
  kelompok: { ...s.kelompok },
});

function unduhTeks(isi, namaBerkasUnduh, jenis = 'text/csv;charset=utf-8') {
  // BOM UTF-8 agar Excel membaca huruf non-ASCII dengan benar.
  const blob = new Blob(['\uFEFF', isi], { type: jenis });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = namaBerkasUnduh;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * @returns {Promise<() => void>} fungsi pembersih (melepas semua listener). Boleh diabaikan
 *   oleh pemanggil; bila tab dirender ulang pada elemen yang sama, pembersihan dilakukan otomatis.
 */
export async function tabDenah(el, ctx) {
  pemasangan.get(el)?.abort();
  const ac = new AbortController();
  pemasangan.set(el, ac);
  const { signal } = ac;
  const dispose = () => ac.abort();
  if (!ctx?.user?.uid) {
    el.innerHTML = '<section class="ale-kartu ale-aksen-grape dd" role="alert"><p class="ale-kosong">Sesi pengguna tidak ditemukan. Muat ulang halaman lalu masuk kembali.</p></section>';
    return dispose;
  }

  const semua = await ambilSiswa(ctx, true);
  if (signal.aborted) return dispose; // tab dirender ulang selagi data siswa dimuat

  const daftarKelas = urutUnik([...(Array.isArray(ctx.kelas) ? ctx.kelas : []), ...semua.map((s) => s.kelas)]);

  if (!daftarKelas.length) {
    el.innerHTML = `
      <section class="ale-kartu ale-aksen-grape dd">
        <div class="ale-kartu-kepala"><h2 class="ale-kartu-judul">${ik('layout')}Denah Duduk & Kelompok Belajar</h2></div>
        <p class="ale-kosong">Belum ada kelas. Tambahkan siswa pada tab <strong>Data Siswa</strong> terlebih dahulu.</p>
      </section>`;
    return dispose;
  }

  const koneksi = sesiGoogleWorkspacePerPengguna(ctx.user.uid);
  const token = koneksi?.expiresAt > Date.now() ? koneksi.accessToken : '';
  const identity = identitasEnkripsiDriveDalamSesi(ctx.user.uid);
  if (!token || !identity) {
    el.innerHTML = `
      <section class="ale-kartu ale-aksen-grape dd" role="status">
        <h2 class="ale-kartu-judul">${ik('shield')}Denah terenkripsi di Google Drive</h2>
        <p class="ale-info-teks">Hubungkan Google Drive dan buka kunci vault untuk membaca atau mengubah denah. Denah Firestore lama belum diimpor dan tidak ditampilkan sebagai denah kosong.</p>
        <p><a class="btn btn-outline" href="#/pengaturan/google">Buka pengaturan Google Workspace untuk membuat atau memulihkan kunci vault</a></p>
        ${!token ? '<button type="button" class="btn btn-primary" id="dnDriveConnect">Hubungkan Google Drive</button>' : ''}
      </section>`;
    el.querySelector('#dnDriveConnect')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await hubungkanGoogleDriveUntukPengguna(ctx.user);
        if (signal.aborted) return;
        await tabDenah(el, ctx);
      } catch (err) {
        if (signal.aborted) return;
        galat(err, 'Gagal menghubungkan Google Drive');
        el.innerHTML = `<section class="ale-kartu ale-aksen-grape dd" role="alert"><p class="ale-kosong">${esc(err?.message || 'Google Drive belum dapat dihubungkan.')}</p><a class="btn btn-outline" href="#/pengaturan/google">Buka pengaturan Google Workspace</a></section>`;
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    }, { signal });
    return dispose;
  }

  let kelas = daftarKelas[0];
  let st = null;        // {baris, kolom, kursi, kelompok, jumlahKelompok}; null selama memuat / gagal memuat
  let dipilih = null;   // id siswa yang sedang dipegang
  let kotor = false;
  let versi = 0;        // naik setiap perubahan; dipakai agar simpan yang lambat tidak menimpa status "kotor"
  let tokenMuat = 0;    // menolak respons lama bila kelas diganti cepat-cepat
  let menyimpan = false;
  let ciphertextSha256 = null;
  const riwayat = [];   // tumpukan snapshot untuk "Urungkan"

  el.innerHTML = `
    <section class="ale-kartu ale-aksen-grape dd">
      <div class="ale-kartu-kepala">
        <h2 class="ale-kartu-judul">${ik('layout')}Denah Duduk & Kelompok Belajar</h2>
        <span class="ale-chip ale-chip-admin dd-tanpa-cetak" id="dnStatus" role="status" aria-live="polite">Tersimpan</span>
      </div>
      <p class="ale-peringatan dd-tanpa-cetak" role="note">Denah lama di Firestore belum diimpor. Denah yang tampil di sini hanya data yang sudah tersimpan di vault Google Drive akun ini.</p>
      <p class="dd-cetak-judul" id="dnCetakJudul"></p>

      <div class="ale-toolbar dd-tanpa-cetak">
        <div class="field">
          <label for="dnKelas">Kelas</label>
          <select id="dnKelas" class="input">${daftarKelas.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label for="dnBaris">Baris (1–${MAKS_UKURAN})</label>
          <input type="number" id="dnBaris" class="input" min="1" max="${MAKS_UKURAN}" inputmode="numeric">
        </div>
        <div class="field">
          <label for="dnKolom">Kolom (1–${MAKS_UKURAN})</label>
          <input type="number" id="dnKolom" class="input" min="1" max="${MAKS_UKURAN}" inputmode="numeric">
        </div>
        <div class="ale-toolbar-aksi">
          <button type="button" class="btn btn-outline" data-aksi="ukuran">Terapkan Ukuran</button>
          <button type="button" class="btn btn-outline" data-aksi="acak">Acak Posisi</button>
          <button type="button" class="btn btn-outline" data-aksi="kosong">Kosongkan</button>
          <button type="button" class="btn btn-outline" data-aksi="urung" id="dnUrung" title="Urungkan (Ctrl+Z)" disabled>Urungkan</button>
          <button type="button" class="btn btn-primary" data-aksi="simpan" id="dnSimpan" title="Simpan (Ctrl+S)">Simpan Denah</button>
        </div>
      </div>

      <p class="ale-info-teks dd-tanpa-cetak" id="dnPetunjuk" aria-live="polite">${PETUNJUK_AWAL}</p>
      <p class="ale-info-teks dd-ringkas" id="dnRingkas"></p>

      <div class="ale-denah-tata">
        <aside class="ale-denah-samping dd-tanpa-cetak" aria-label="Siswa belum duduk">
          <h3 class="ale-sub-judul">Belum duduk</h3>
          <ul class="ale-siswa-daftar" id="dnBelum"></ul>
        </aside>
        <div class="ale-denah-papan">
          <div class="ale-papan-tulis">Papan Tulis / Meja Guru</div>
          <div class="ale-kursi-grid" id="dnGrid" role="group" aria-label="Denah kursi"></div>
        </div>
      </div>

      <div class="ale-kelompok-bar dd-tanpa-cetak">
        <div class="field">
          <label for="dnJmlKel">Jumlah kelompok (${MIN_KELOMPOK}–${MAKS_KELOMPOK})</label>
          <input type="number" id="dnJmlKel" class="input" min="${MIN_KELOMPOK}" max="${MAKS_KELOMPOK}" inputmode="numeric">
        </div>
        <button type="button" class="btn btn-outline" data-aksi="kelompok">Bagi Kelompok Acak</button>
        <button type="button" class="btn btn-outline" data-aksi="reset-kelompok">Hapus Kelompok</button>
        <span class="dd-spasi"></span>
        <button type="button" class="btn btn-outline" data-aksi="csv">Unduh CSV</button>
        <button type="button" class="btn btn-outline" data-aksi="cetak">Cetak</button>
      </div>
      <div class="ale-kelompok-ringkas" id="dnKelompok"></div>
    </section>`;

  const root = el.querySelector('.dd');
  const q = (s) => root.querySelector(s);
  const siswaKelas = () => semua.filter((s) => s.kelas === kelas).sort(urutNama);

  // ---------- status & util ----------

  function tandaiKotor(nilai) {
    kotor = nilai;
    const chip = q('#dnStatus');
    chip.textContent = nilai ? 'Belum disimpan' : 'Tersimpan';
    chip.className = `ale-chip ${nilai ? 'ale-chip-kunci' : 'ale-chip-admin'} dd-tanpa-cetak`;
  }

  function setSibuk(sibuk) {
    root.setAttribute('aria-busy', String(sibuk));
    root.classList.toggle('dd-sibuk', sibuk);
    q('#dnKelas').disabled = sibuk;
  }

  function sinkronInput() {
    q('#dnBaris').value = st.baris;
    q('#dnKolom').value = st.kolom;
    q('#dnJmlKel').value = st.jumlahKelompok;
  }

  /** Semua perubahan data melewati sini: simpan snapshot untuk Urungkan, tandai kotor, gambar ulang. */
  function ubah(mutator) {
    riwayat.push(salin(st));
    if (riwayat.length > MAKS_RIWAYAT) riwayat.shift();
    mutator();
    versi += 1;
    tandaiKotor(true);
    gambar();
  }

  function urungkan() {
    const sebelum = riwayat.pop();
    if (!st || !sebelum) return;
    st = sebelum;
    dipilih = null;
    versi += 1;
    sinkronInput();
    tandaiKotor(true);
    gambar();
  }

  // ---------- render ----------

  function gambar() {
    const anggota = siswaKelas();
    const peta = new Map(anggota.map((s) => [s.id, s]));
    const duduk = new Set(Object.values(st.kursi));
    const belum = anggota.filter((s) => !duduk.has(s.id));
    const pemegang = dipilih ? peta.get(dipilih) : null;
    if (dipilih && !pemegang) dipilih = null;
    const kursiPemegang = pemegang ? Object.keys(st.kursi).find((k) => st.kursi[k] === pemegang.id) ?? null : null;

    q('#dnCetakJudul').textContent = `Denah Duduk — Kelas ${kelas}`;
    q('#dnUrung').disabled = !riwayat.length;

    q('#dnPetunjuk').textContent = pemegang
      ? `Memegang ${pemegang.nama}. Klik kursi tujuan (${kursiPemegang
        ? 'kursi terisi akan bertukar posisi'
        : 'penghuni kursi terisi akan kembali ke daftar Belum duduk'}), atau tekan Esc untuk membatalkan.`
      : PETUNJUK_AWAL;

    const jumlahKursi = st.baris * st.kolom;
    const kurang = anggota.length - jumlahKursi;
    q('#dnRingkas').textContent = `${duduk.size} dari ${anggota.length} siswa sudah duduk · ${jumlahKursi} kursi tersedia${kurang > 0 ? ` · kurang ${kurang} kursi` : ''}`;

    q('#dnBelum').innerHTML = belum.length
      ? belum.map((s) => `
        <li><button type="button" class="ale-siswa-chip${dipilih === s.id ? ' dipilih' : ''}" data-aksi="pilih" data-id="${esc(s.id)}" aria-pressed="${dipilih === s.id}">${esc(s.nama)}</button></li>`).join('')
      : `<li class="ale-kosong">${anggota.length ? 'Semua siswa sudah duduk.' : 'Kelas ini belum punya siswa.'}</li>`;

    let html = '';
    for (let r = 0; r < st.baris; r += 1) {
      for (let c = 0; c < st.kolom; c += 1) {
        const k = kunciKursi(r, c);
        const s = st.kursi[k] ? peta.get(st.kursi[k]) : null;
        const kel = s ? st.kelompok[s.id] : 0;
        const label = `Baris ${r + 1}, kolom ${c + 1}: ${s ? s.nama : 'kosong'}${kel ? `, kelompok ${kel}` : ''}`;
        const kelasCss = [
          'ale-kursi',
          s ? 'terisi' : '',
          pemegang && !s ? 'siap' : '',
          pemegang && s && s.id !== pemegang.id ? 'tukar' : '',
          kursiPemegang === k ? 'diangkat' : '',
          kel ? `ale-kel-${(kel - 1) % 8}` : '',
        ].filter(Boolean).join(' ');
        html += `
          <button type="button" class="${kelasCss}" data-aksi="kursi" data-key="${k}" aria-label="${esc(label)}" title="${esc(label)}"${kursiPemegang === k ? ' aria-pressed="true"' : ''}>
            ${s ? `<span class="ale-kursi-nama">${esc(s.nama)}</span>${kel ? `<span class="ale-kursi-kel">K${kel}</span>` : ''}` : '<span class="ale-kursi-kosong" aria-hidden="true">+</span>'}
          </button>`;
      }
    }
    const grid = q('#dnGrid');
    grid.style.gridTemplateColumns = `repeat(${st.kolom}, minmax(76px, 1fr))`;
    grid.innerHTML = html;

    const adaKelompok = anggota.some((s) => st.kelompok[s.id]);
    q('#dnKelompok').innerHTML = adaKelompok
      ? Array.from({ length: st.jumlahKelompok }, (_, i) => {
        const n = i + 1;
        const isi = anggota.filter((s) => st.kelompok[s.id] === n);
        return `
          <div class="ale-kelompok-kartu ale-kel-${(n - 1) % 8}">
            <h4>Kelompok ${n} <small>(${isi.length})</small></h4>
            <ul>${isi.map((s) => `<li>${esc(s.nama)}</li>`).join('') || '<li class="ale-kosong">-</li>'}</ul>
          </div>`;
      }).join('')
      : '<p class="ale-kosong">Belum ada pembagian kelompok.</p>';
  }

  // ---------- muat & simpan ----------

  async function muatDenah() {
    const token = ++tokenMuat;
    const kelasDimuat = kelas;
    st = null;
    dipilih = null;
    riwayat.length = 0;
    tandaiKotor(false);
    setSibuk(true);
    try {
      const idsSiswa = semua.filter((s) => s.kelas === kelasDimuat).map((s) => s.id);
      const vault = await muatDenahGuruDrive(token, identity, kelasDimuat, idsSiswa);
      if (signal.aborted || token !== tokenMuat) return; // respons usang
      ciphertextSha256 = vault.ciphertextSha256;
      st = vault.data;
      sinkronInput();
      gambar();
    } catch (err) {
      if (signal.aborted || token !== tokenMuat) return;
      st = null;
      q('#dnGrid').innerHTML = '';
      q('#dnBelum').innerHTML = '';
      q('#dnKelompok').innerHTML = '';
      q('#dnRingkas').textContent = '';
      q('#dnPetunjuk').textContent = 'Denah gagal dimuat. Pilih kelas lain atau muat ulang halaman.';
      galat(err, 'Gagal memuat denah');
    } finally {
      if (token === tokenMuat && !signal.aborted) setSibuk(false);
    }
  }

  async function simpan() {
    if (!st || menyimpan) return;
    menyimpan = true;
    const tombol = q('#dnSimpan');
    tombol.disabled = true;
    // Potret data saat tombol ditekan; perubahan selama proses simpan tidak ikut tersimpan
    // dan tetap ditandai "Belum disimpan".
    const versiSaat = versi;
    const kelasSaat = kelas;
    const data = {
      kelas: kelasSaat,
      baris: st.baris,
      kolom: st.kolom,
      kursi: { ...st.kursi },
      kelompok: { ...st.kelompok },
      jumlahKelompok: st.jumlahKelompok,
      diperbarui: new Date().toISOString(),
    };
    q('#dnKelas').disabled = true;
    try {
      const saved = await simpanDenahGuruDrive(
        token,
        ctx.user.uid,
        identity,
        data,
        ciphertextSha256,
      );
      if (signal.aborted) return;
      ciphertextSha256 = saved.ciphertextSha256;
      if (!signal.aborted && kelasSaat === kelas && versiSaat === versi) tandaiKotor(false);
      toast('Denah disimpan.', 'ok');
    } catch (err) {
      if (signal.aborted) return;
      galat(err, 'Gagal menyimpan denah');
    } finally {
      menyimpan = false;
      tombol.disabled = false;
      if (!signal.aborted) q('#dnKelas').disabled = false;
    }
  }

  // ---------- aksi ----------

  function klikKursi(k) {
    const penghuni = st.kursi[k];
    if (!dipilih) {
      if (penghuni) { dipilih = penghuni; gambar(); } // angkat; data belum berubah sampai dijatuhkan
      return;
    }
    if (penghuni === dipilih) { dipilih = null; gambar(); return; } // klik kursi sendiri = batal
    const id = dipilih;
    ubah(() => {
      st.kursi = pindahkan(st.kursi, id, k);
      dipilih = null;
    });
  }

  function terapkanUkuran() {
    const baris = batas(q('#dnBaris').value, 1, MAKS_UKURAN, st.baris);
    const kolom = batas(q('#dnKolom').value, 1, MAKS_UKURAN, st.kolom);
    if (baris === st.baris && kolom === st.kolom) { sinkronInput(); return; }
    const { kursi, terlepas } = ubahUkuran(st.kursi, baris, kolom);
    ubah(() => {
      st.baris = baris;
      st.kolom = kolom;
      st.kursi = kursi;
      dipilih = null;
    });
    sinkronInput();
    if (terlepas.length) {
      toast(`${terlepas.length} siswa kehilangan kursi karena ukuran dikecilkan. Tekan Urungkan untuk membatalkan.`, 'info');
    }
  }

  function acakPosisi() {
    const ids = siswaKelas().map((s) => s.id);
    if (!ids.length) { toast('Kelas ini belum memiliki siswa.', 'info'); return; }
    const { kursi, tidakMuat } = acakKursi(ids, st.baris, st.kolom);
    ubah(() => { st.kursi = kursi; dipilih = null; });
    if (tidakMuat.length) {
      toast(`${tidakMuat.length} siswa belum kebagian kursi. Perbesar ukuran denah.`, 'info');
    }
  }

  function kosongkan() {
    if (!Object.keys(st.kursi).length) return;
    if (!confirm('Kosongkan semua kursi pada denah ini?')) return;
    ubah(() => { st.kursi = {}; dipilih = null; });
  }

  function bagiAcak() {
    const ids = siswaKelas().map((s) => s.id);
    if (!ids.length) { toast('Kelas ini belum memiliki siswa.', 'info'); return; }
    const n = batas(q('#dnJmlKel').value, MIN_KELOMPOK, MAKS_KELOMPOK, st.jumlahKelompok);
    q('#dnJmlKel').value = n;
    ubah(() => {
      st.jumlahKelompok = n;
      st.kelompok = bagiKelompok(ids, n);
    });
    if (n > ids.length) {
      toast(`Jumlah kelompok (${n}) melebihi jumlah siswa (${ids.length}); sebagian kelompok akan kosong.`, 'info');
    }
  }

  function hapusKelompok() {
    if (!Object.keys(st.kelompok).length) return;
    ubah(() => { st.kelompok = {}; });
  }

  function unduhCsv() {
    const posisi = new Map(Object.entries(st.kursi).map(([k, id]) => [id, bacaKunciKursi(k)]));
    const baris = siswaKelas().map((s) => {
      const p = posisi.get(s.id);
      return [kelas, s.nama, p ? p.r + 1 : '', p ? p.c + 1 : '', st.kelompok[s.id] ?? ''];
    });
    unduhTeks(buatCsv(['Kelas', 'Nama', 'Baris', 'Kolom', 'Kelompok'], baris), `denah-${namaBerkas(kelas)}.csv`);
  }

  function cetak() {
    dipilih = null;
    gambar();
    window.print();
  }

  // ---------- listener (semua terikat ke `signal`) ----------

  root.addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('[data-aksi]') : null;
    if (!btn || !st) return;
    switch (btn.dataset.aksi) {
      case 'pilih': dipilih = dipilih === btn.dataset.id ? null : btn.dataset.id; gambar(); break;
      case 'kursi': klikKursi(btn.dataset.key); break;
      case 'ukuran': terapkanUkuran(); break;
      case 'acak': acakPosisi(); break;
      case 'kosong': kosongkan(); break;
      case 'urung': urungkan(); break;
      case 'kelompok': bagiAcak(); break;
      case 'reset-kelompok': hapusKelompok(); break;
      case 'csv': unduhCsv(); break;
      case 'cetak': cetak(); break;
      case 'simpan': simpan(); break;
      default: break;
    }
  }, { signal });

  document.addEventListener('keydown', (e) => {
    if (!st || !root.isConnected || root.getClientRects().length === 0) return; // tab tidak tampil
    const mod = e.ctrlKey || e.metaKey;
    const tombol = e.key.toLowerCase();
    const sedangMengetik = e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]');
    if (mod && tombol === 's') {
      e.preventDefault();
      if (kotor) simpan();
    } else if (mod && !e.shiftKey && tombol === 'z' && !sedangMengetik) {
      e.preventDefault();
      urungkan();
    } else if (tombol === 'escape' && dipilih) {
      dipilih = null;
      gambar();
    }
  }, { signal });

  window.addEventListener('beforeunload', (e) => {
    if (kotor && root.isConnected) {
      e.preventDefault();
      e.returnValue = ''; // diperlukan sebagian peramban agar dialog konfirmasi muncul
    }
  }, { signal });

  q('#dnKelas').addEventListener('change', async (e) => {
    if (kotor && !confirm('Perubahan denah belum disimpan. Pindah kelas dan buang perubahan?')) {
      e.target.value = kelas;
      return;
    }
    kelas = e.target.value;
    await muatDenah();
  }, { signal });

  await muatDenah();
  return dispose;
}
