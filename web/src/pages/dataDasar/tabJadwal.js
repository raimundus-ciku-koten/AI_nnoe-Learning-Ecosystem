// web/src/pages/dataDasar/tabJadwal.js
// Jadwal Mengajar pekanan (Senin-Sabtu) dengan deteksi bentrok jam.
// Isi jadwal dienkripsi di browser dan disimpan sebagai satu berkas Google Drive per pengguna.
import { esc } from '../../ui.js';
import { HARI, bersih, buatId, galat, ik, toast, urutUnik } from './umum.js';
import {
  hubungkanGoogleDriveUntukPengguna,
  sesiGoogleWorkspacePerPengguna,
} from '../../services/googleWorkspaceAuth.js';
import { identitasEnkripsiDriveDalamSesi } from '../../services/driveEncryption.js';
import { muatJadwalGuruDrive, ubahJadwalGuruDrive } from '../../services/teacherScheduleDrive.js';
import {
  MAKS_KELAS, MAKS_MAPEL, cariBentrok, formatDurasi, idBentrokDalamHari, kelompokPerHari,
  normalisasiEntri, pesanBentrok, sarankanJamBerikutnya, terapkanOperasi, totalMenit,
} from './jadwalUtil.js';
import './tabJadwal.css';

const JAM_MULAI_AWAL = '07:00';
const JAM_SELESAI_AWAL = '07:40';
const pemasangan = new WeakMap();

// Nama field pada jadwalUtil -> id elemen form
const ID_FIELD = { hari: 'jdHari', mulai: 'jdMulai', selesai: 'jdSelesai', kelas: 'jdKelas', mapel: 'jdMapel' };

const adalahGalatJadwal = (err) => err?.name === 'GalatJadwal';

function tampilkanGalatMuat(el, pesan, ulangi) {
  el.innerHTML = `
    <section class="ale-kartu ale-aksen-teal dd" role="alert">
      <p class="ale-kosong">${esc(pesan)}</p>
      ${ulangi ? '<button type="button" class="btn btn-outline" id="jdUlang">Coba lagi</button>' : ''}
    </section>`;
  if (ulangi) el.querySelector('#jdUlang').onclick = ulangi;
}

export async function tabJadwal(el, ctx) {
  const pemasanganAktif = {};
  pemasangan.set(el, pemasanganAktif);
  const masihAktif = () => el.isConnected && pemasangan.get(el) === pemasanganAktif;
  const uid = ctx?.user?.uid;
  if (!uid) {
    tampilkanGalatMuat(el, 'Sesi pengguna tidak ditemukan. Muat ulang halaman lalu masuk kembali.', null);
    return;
  }

  if (!ctx.tenantId || !['admin_sekolah', 'operator', 'guru'].includes(ctx.role)) {
    tampilkanGalatMuat(el, 'Jadwal hanya tersedia bagi anggota sekolah yang terhubung ke tenant.', null);
    return;
  }
  const koneksi = sesiGoogleWorkspacePerPengguna(uid);
  const token = koneksi?.expiresAt > Date.now() ? koneksi.accessToken : '';
  const identity = identitasEnkripsiDriveDalamSesi(uid);
  if (!token || !identity) {
    el.innerHTML = `
      <section class="ale-kartu ale-aksen-teal dd" role="status">
        <h2 class="ale-kartu-judul">${ik('shield')}Jadwal terenkripsi di Google Drive</h2>
        <p class="ale-info-teks">Hubungkan Google Drive dan buka kunci vault untuk membaca atau mengubah jadwal. Catatan jadwal lama di Firestore belum diimpor dan tidak ditampilkan sebagai jadwal kosong.</p>
        <p><a class="btn btn-outline" href="#/pengaturan/google">Buka pengaturan Google Workspace untuk membuat atau memulihkan kunci vault</a></p>
        <button type="button" class="btn btn-primary" id="jdDriveConnect">Hubungkan Google Drive</button>
      </section>`;
    el.querySelector('#jdDriveConnect').onclick = async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await hubungkanGoogleDriveUntukPengguna(ctx.user);
        if (!masihAktif()) return;
        await tabJadwal(el, ctx);
      } catch (err) {
        if (!masihAktif()) return;
        galat(err, 'Gagal menghubungkan Google Drive');
        tampilkanGalatMuat(el, err?.message || 'Google Drive belum dapat dihubungkan.', () => tabJadwal(el, ctx));
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    };
    return;
  }
  const namaHari = HARI.slice(1);
  const kelasCtx = Array.isArray(ctx.kelas) ? ctx.kelas : [];
  const mapelCtx = Array.isArray(ctx.mapel) ? ctx.mapel : [];

  el.innerHTML = '<section class="ale-kartu ale-aksen-teal dd" aria-busy="true"><p class="ale-kosong">Memuat jadwal…</p></section>';

  // ---------- Muat data awal ----------
  let entri;
  let dibuangAwal = 0;
  let jadwalTersimpan;
  try {
    jadwalTersimpan = await muatJadwalGuruDrive(token, identity);
    if (!masihAktif()) return;
    const hasil = normalisasiEntri(jadwalTersimpan.entries, bersih);
    entri = hasil.entri;
    dibuangAwal = hasil.dibuang;
  } catch (err) {
    if (!masihAktif()) return;
    galat(err, 'Gagal memuat jadwal');
    tampilkanGalatMuat(el, err?.message || 'Jadwal terenkripsi belum bisa dimuat. Periksa koneksi Drive dan kunci vault.', () => tabJadwal(el, ctx));
    return;
  }
  if (!masihAktif()) return;

  let editId = null;
  let sibuk = false; // mencegah dua operasi tulis berjalan bersamaan

  // ---------- Kerangka ----------
  el.innerHTML = `
    <section class="ale-kartu ale-aksen-teal dd">
      <div class="ale-kartu-kepala">
        <h2 class="ale-kartu-judul">${ik('jam')}Jadwal Mengajar Pekanan</h2>
        <span class="ale-chip ale-chip-admin" id="jdTotal" role="status">0 sesi</span>
      </div>
      <p class="ale-peringatan" role="note">Data jadwal lama di Firestore belum diimpor. Jadwal yang tampil di sini hanya data yang sudah tersimpan di vault Google Drive akun ini.</p>

      <form id="jdForm" class="ale-panel-form" novalidate>
        <h3 class="ale-sub-judul" id="jdFormJudul">Tambah Sesi Mengajar</h3>
        <div class="ale-form-grid">
          <div class="field">
            <label for="jdHari">Hari</label>
            <select id="jdHari" class="input">
              ${namaHari.map((h, i) => `<option value="${i + 1}">${esc(h)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="jdMulai">Jam mulai</label>
            <input type="time" id="jdMulai" class="input" required value="${JAM_MULAI_AWAL}" aria-describedby="jdPeringatan">
          </div>
          <div class="field">
            <label for="jdSelesai">Jam selesai</label>
            <input type="time" id="jdSelesai" class="input" required value="${JAM_SELESAI_AWAL}" aria-describedby="jdPeringatan">
          </div>
          <div class="field">
            <label for="jdKelas">Kelas / Rombel</label>
            <input type="text" id="jdKelas" class="input" maxlength="${MAKS_KELAS}" list="jdKelasList" autocomplete="off" required>
            <datalist id="jdKelasList"></datalist>
          </div>
          <div class="field">
            <label for="jdMapel">Mata pelajaran</label>
            <input type="text" id="jdMapel" class="input" maxlength="${MAKS_MAPEL}" list="jdMapelList" autocomplete="off" required>
            <datalist id="jdMapelList"></datalist>
          </div>
        </div>
        <p class="ale-peringatan" id="jdPeringatan" role="status" hidden></p>
        <div class="ale-form-aksi">
          <button type="submit" class="btn btn-primary" id="jdSimpan">Tambah ke Jadwal</button>
          <button type="button" class="btn btn-outline" id="jdBatal" hidden>Batal ubah</button>
        </div>
      </form>

      <div class="ale-jadwal-grid" id="jdGrid" tabindex="-1"></div>
    </section>`;

  const q = (s) => el.querySelector(s);

  // ---------- Tampilan ----------
  function renderDatalist() {
    const opsi = (daftar) => urutUnik(daftar).map((v) => `<option value="${esc(v)}"></option>`).join('');
    q('#jdKelasList').innerHTML = opsi([...kelasCtx, ...entri.map((e) => e.kelas)]);
    q('#jdMapelList').innerHTML = opsi([...mapelCtx, ...entri.map((e) => e.mapel)]);
  }

  function gambar() {
    const hariIni = new Date().getDay();
    const perHari = kelompokPerHari(entri);

    q('#jdTotal').textContent = entri.length
      ? `${entri.length} sesi · ${formatDurasi(totalMenit(entri))}/pekan`
      : '0 sesi';

    q('#jdGrid').innerHTML = namaHari.map((nama, i) => {
      const h = i + 1;
      const sesi = perHari.get(h);
      const bentrok = idBentrokDalamHari(sesi);
      return `
        <div class="ale-jadwal-hari${hariIni === h ? ' hari-ini' : ''}"${hariIni === h ? ' aria-current="date"' : ''}>
          <h3>${esc(nama)}${hariIni === h ? ' <span class="ale-chip ale-chip-admin">Hari ini</span>' : ''}</h3>
          ${sesi.length ? `<ul>${sesi.map((e) => `
            <li class="ale-jadwal-item${e.id === editId ? ' sedang-diubah' : ''}${bentrok.has(e.id) ? ' bentrok' : ''}">
              <div>
                <strong>${esc(e.mulai)}–${esc(e.selesai)}</strong>
                <span>${esc(e.mapel)} · ${esc(e.kelas)}</span>
                ${bentrok.has(e.id) ? '<span class="ale-penanda-bentrok">Bentrok</span>' : ''}
              </div>
              <div class="ale-tabel-aksi">
                <button type="button" class="btn btn-sm btn-outline" data-aksi="ubah" data-id="${esc(e.id)}" aria-label="Ubah sesi ${esc(e.mapel)} ${esc(e.kelas)} hari ${esc(nama)}">Ubah</button>
                <button type="button" class="btn btn-sm btn-outline ale-btn-bahaya" data-aksi="hapus" data-id="${esc(e.id)}" aria-label="Hapus sesi ${esc(e.mapel)} ${esc(e.kelas)} hari ${esc(nama)}">Hapus</button>
              </div>
            </li>`).join('')}</ul>` : '<p class="ale-kosong">Tidak ada jadwal.</p>'}
        </div>`;
    }).join('');
  }

  // Peringatan bentrok langsung saat hari/jam diubah, sebelum tombol simpan ditekan.
  function perbaruiPeringatan() {
    const kotak = q('#jdPeringatan');
    const b = cariBentrok(entri, {
      hari: parseInt(q('#jdHari').value, 10),
      mulai: q('#jdMulai').value,
      selesai: q('#jdSelesai').value,
    }, editId);
    kotak.hidden = !b;
    kotak.textContent = b ? pesanBentrok(b) : '';
  }

  function bacaForm() {
    return {
      hari: parseInt(q('#jdHari').value, 10),
      mulai: q('#jdMulai').value,
      selesai: q('#jdSelesai').value,
      kelas: bersih(q('#jdKelas').value, MAKS_KELAS),
      mapel: bersih(q('#jdMapel').value, MAKS_MAPEL),
    };
  }

  function bersihkanTanda() {
    el.querySelectorAll('[aria-invalid]').forEach((n) => n.removeAttribute('aria-invalid'));
  }

  // Menampilkan galat domain (validasi/bentrok) di toast dan menandai field terkait.
  function tampilkanGalatForm(err) {
    if (!adalahGalatJadwal(err)) return false;
    toast(err.message, 'galat');
    const field = err.kode === 'TIDAK_VALID' ? err.rincian?.field : err.kode === 'BENTROK' ? 'mulai' : null;
    const n = field && ID_FIELD[field] ? q(`#${ID_FIELD[field]}`) : null;
    if (n) { n.setAttribute('aria-invalid', 'true'); n.focus(); }
    return true;
  }

  function resetForm(lanjutDari = null) {
    editId = null;
    q('#jdFormJudul').textContent = 'Tambah Sesi Mengajar';
    q('#jdSimpan').textContent = 'Tambah ke Jadwal';
    q('#jdBatal').hidden = true;
    q('#jdKelas').value = '';
    q('#jdMapel').value = '';
    // Setelah menambah sesi, jam diusulkan melanjutkan sesi tadi (memudahkan input satu hari penuh).
    const saran = lanjutDari ? sarankanJamBerikutnya(lanjutDari.mulai, lanjutDari.selesai) : null;
    q('#jdMulai').value = saran?.mulai ?? JAM_MULAI_AWAL;
    q('#jdSelesai').value = saran?.selesai ?? JAM_SELESAI_AWAL;
    bersihkanTanda();
    perbaruiPeringatan();
    gambar();
  }

  // ---------- Penyimpanan dengan pemeriksaan revisi ----------
  async function jalankan(op) {
    sibuk = true;
    try {
      jadwalTersimpan = await ubahJadwalGuruDrive(
        token,
        ctx.tenantId,
        uid,
        ctx.role,
        identity,
        op,
        jadwalTersimpan.ciphertextSha256,
      );
      if (!masihAktif()) return;
      entri = jadwalTersimpan.entries;
      renderDatalist();
    } finally {
      sibuk = false;
    }
  }

  // Sinkronkan tampilan dengan data terbaru (dipakai setelah penolakan akibat perubahan dari tempat lain).
  async function segarkan() {
    try {
      jadwalTersimpan = await muatJadwalGuruDrive(token, identity);
      if (!masihAktif()) return;
      entri = normalisasiEntri(jadwalTersimpan.entries, bersih).entri;
      renderDatalist();
      if (editId && !entri.some((x) => x.id === editId)) resetForm();
      else { gambar(); perbaruiPeringatan(); }
    } catch (err) {
      if (!masihAktif()) return;
      galat(err, 'Gagal menyegarkan jadwal');
    }
  }

  // ---------- Interaksi ----------
  q('#jdBatal').onclick = () => resetForm();

  q('#jdForm').oninput = (e) => {
    if (e.target instanceof Element) e.target.removeAttribute('aria-invalid');
    perbaruiPeringatan();
  };

  q('#jdForm').onsubmit = async (e) => {
    e.preventDefault();
    if (sibuk) return;

    const f = bacaForm();
    const sedangUbah = editId !== null;
    const op = sedangUbah
      ? { jenis: 'ubah', sesi: { ...f, id: editId } }
      : { jenis: 'tambah', sesi: { ...f, id: buatId() } };

    // Pra-validasi lokal (cepat, tanpa jaringan); layanan memvalidasi ulang jadwal terbaru.
    try {
      terapkanOperasi(entri, op);
    } catch (err) {
      if (!tampilkanGalatForm(err)) galat(err, 'Gagal memeriksa jadwal');
      return;
    }

    const tombol = q('#jdSimpan');
    tombol.disabled = true;
    try {
      await jalankan(op);
      if (!masihAktif()) return;
      toast(sedangUbah ? 'Sesi diperbarui.' : 'Sesi ditambahkan.', 'ok');
      resetForm(sedangUbah ? null : f);
    } catch (err) {
      if (!masihAktif()) return;
      // Konflik revisi berarti data di Drive berubah sejak dimuat: sinkronkan sebelum pengguna mencoba lagi.
      if (tampilkanGalatForm(err)) segarkan();
      else galat(err, 'Gagal menyimpan jadwal');
    } finally {
      tombol.disabled = false;
    }
  };

  q('#jdGrid').onclick = async (e) => {
    const btn = e.target instanceof Element ? e.target.closest('[data-aksi]') : null;
    if (!btn || sibuk) return;
    const sesi = entri.find((x) => x.id === btn.dataset.id);
    if (!sesi) return;

    if (btn.dataset.aksi === 'ubah') {
      editId = sesi.id;
      q('#jdFormJudul').textContent = 'Ubah Sesi Mengajar';
      q('#jdSimpan').textContent = 'Simpan Perubahan';
      q('#jdBatal').hidden = false;
      q('#jdHari').value = String(sesi.hari);
      q('#jdMulai').value = sesi.mulai;
      q('#jdSelesai').value = sesi.selesai;
      q('#jdKelas').value = sesi.kelas;
      q('#jdMapel').value = sesi.mapel;
      bersihkanTanda();
      perbaruiPeringatan();
      gambar(); // menandai sesi yang sedang diubah
      q('#jdForm').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      q('#jdKelas').focus();
      return;
    }

    if (btn.dataset.aksi === 'hapus') {
      if (!confirm(`Hapus sesi ${sesi.mapel} ${sesi.kelas} (${sesi.mulai}–${sesi.selesai})?`)) return;
      btn.disabled = true;
      try {
        await jalankan({ jenis: 'hapus', id: sesi.id });
        if (!masihAktif()) return;
        toast('Sesi dihapus.', 'ok');
        if (editId === sesi.id) resetForm();
        else { gambar(); perbaruiPeringatan(); }
        q('#jdGrid').focus(); // tombol yang diklik sudah hilang; jaga fokus keyboard
      } catch (err) {
        if (!masihAktif()) return;
        btn.disabled = false;
        galat(err, 'Gagal menghapus sesi');
      }
    }
  };

  renderDatalist();
  gambar();
  if (dibuangAwal) {
    toast(`${dibuangAwal} entri jadwal tidak valid diabaikan dan akan dibersihkan pada penyimpanan berikutnya.`, 'galat');
  }
}
