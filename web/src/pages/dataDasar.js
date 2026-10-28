// web/src/pages/dataDasar.js
/**
 * Halaman Data Dasar — route-driven.
 *
 * Sub-rute (semua di-handle oleh halaman ini):
 *   /datadasar            → redirect ke /datadasar/profil
 *   /datadasar/profil     → Profil Guru & Sekolah
 *   /datadasar/ta         → Tahun Ajaran & Semester
 *   /datadasar/kelas      → Kelas & Mapel Saya
 *   /datadasar/siswa      → Data Siswa
 *   /datadasar/barcode    → Barcode & Kartu Absensi (opsional)
 *   /datadasar/jadwal     → Jadwal Mengajar
 *   /datadasar/denah      → Kelompok & Denah Duduk
 *
 * Navigasi antar sub-halaman diambil alih oleh sidebar (menu.js).
 * Judul halaman ada di topbar, jadi konten langsung dimulai dari kartu
 * (tanpa kicker/judul/subjudul dan tanpa sub-nav).
 *
 * Shell (sidebar + topbar) dibangun router; halaman hanya mengisi
 * #slot-halaman.
 *
 * CSS — dashboard.css sekarang dimuat di main.js (single source).
 * Yang diimpor di sini hanya yang benar-benar spesifik halaman Data Dasar:
 *   import '../styles/dataDasar-page.css';
 *   import '../dataDasar.tema.css';
 *   import '../styles/dataDasar-screens.css';   // kelas ale-* semua sub-menu
 */
import { getState } from '../state.js';
import { bacaRute, navigate } from '../router.js';
import { perbaruiHeader } from '../components/sidebar.js';
import { esc, LABEL_PERAN, namaDariUser, ambilProfil } from '../ui.js';
import { bersih, galat, ik, muatPenugasan, toast } from './dataDasar/umum.js';
import { muatPengaturanTenant, simpanProfilTenant, simpanSiklusTenant } from '../services/tenantSettings.js';
import { hapusKopSekolah, muatKopSekolah, simpanKopSekolah } from '../services/schoolLetterhead.js';
import { muatTenantRuangKelas } from '../services/learningClassrooms.js';
import { tabSiswa }  from './dataDasar/tabSiswa.js';
import { tabJadwal } from './dataDasar/tabJadwal.js';
import { tabDenah }  from './dataDasar/tabDenah.js';

// CSS — hanya yang spesifik halaman ini.
// Gaya halaman dikelompokkan di ../styles/.
import '../styles/dataDasar-page.css';
import '../styles/dataDasar-theme.css';
import '../styles/dataDasar-screens.css';

const PERAN_EDIT = ['superadmin', 'admin_sekolah'];

// Daftar sub yang valid + metadata judul
const SUB = {
  profil:  { label: 'Profil Guru & Sekolah',   ket: 'Identitas & kepala sekolah', ikon: 'gedung'   },
  ta:      { label: 'Tahun Ajaran & Semester', ket: 'Siklus akademik aktif',       ikon: 'kalender' },
  kelas:   { label: 'Kelas & Mapel Saya',      ket: 'Penugasan mengajar',          ikon: 'buku'     },
  siswa:   { label: 'Data Siswa',              ket: 'Peserta didik per kelas',     ikon: 'pengguna' },
  barcode: { label: 'Barcode & Kartu Absensi', ket: 'Cetak kartu scan siswa',      ikon: 'qr'       },
  jadwal:  { label: 'Jadwal Mengajar',         ket: 'Sesi per pekan',              ikon: 'jam'      },
  denah:   { label: 'Kelompok & Denah Duduk',  ket: 'Posisi dan kelompok',         ikon: 'layout'   },
};

/**
 * Ambil sub-rute dari URL:
 *   /datadasar/siswa       → 'siswa'
 *   /datadasar?tab=siswa   → 'siswa' (legacy, kompat. bookmark lama)
 *   /datadasar             → null (redirect ke default)
 */
function subDariUrl() {
  const { path, query } = bacaRute();
  const seg = String(path || '').replace(/\/+$/, '').split('/').filter(Boolean);
  let id = seg[1];                            // ['datadasar', 'siswa']
  if (!id) {
    const legacy = query.get('tab');          // kompat. URL lama
    if (legacy && SUB[legacy]) id = legacy;
  }
  return SUB[id] ? id : null;
}

export async function halamanDataDasar(wadah) {
  const { user, role, tenantId } = getState();
  if (!user) return () => {};

  // Belum ada sub-rute → alihkan ke default.
  const sub = subDariUrl();
  if (!sub) {
    navigate('/datadasar/profil');
    return () => {};
  }

  const bisaEdit = PERAN_EDIT.includes(role);
  const ctx = {
    user, role, tenantId, bisaEdit,
    cache: { siswa: null },
    kelas: [], mapel: [],
  };

  // Cache lazy + invalidator
  let promisePenugasan = null;
  let promiseConfig = null;

  const muatPenugasanSekali = () => {
    if (!promisePenugasan) {
      promisePenugasan = muatPenugasan(user.uid)
        .then((p) => {
          ctx.kelas = p.kelas;
          ctx.mapel = p.mapel;
          return p;
        })
        .catch((e) => { promisePenugasan = null; throw e; });
    }
    return promisePenugasan;
  };

  const muatConfigSekali = () => {
    if (!promiseConfig) {
      if (!tenantId) {
        throw new Error('Akun belum terhubung ke sekolah.');
      }
      promiseConfig = muatPengaturanTenant(tenantId)
        .catch((e) => { promiseConfig = null; throw e; });
    }
    return promiseConfig;
  };

  const invalidateConfig = () => { promiseConfig = null; };

  const meta = SUB[sub];
  const chipAkses = bisaEdit
    ? '<span class="ale-chip ale-chip-admin">Akses ubah</span>'
    : '<span class="ale-chip ale-chip-kunci">Hanya baca</span>';
  const kunci = bisaEdit ? '' : 'disabled';

  // ---------- Kerangka halaman (TANPA sub-nav) ----------
  wadah.innerHTML = `
    <div class="dd-page">
      <!-- Judul tampil di topbar; h1 ini hanya untuk pembaca layar. -->
      <h1 class="sr-only">${esc(meta.label)} · Data Dasar</h1>

      <div class="dd-panel" id="ddPanel" aria-live="polite">
        <p class="ale-kosong ale-memuat">Memuat…</p>
      </div>
    </div>`;

  document.title = `${meta.label} · Data Dasar · AI_nnoe`;

  const profilTersimpan = ambilProfil(user.uid);
  if (profilTersimpan) perbaruiHeader(profilTersimpan);

  const panelEl = wadah.querySelector('#ddPanel');

  const o = {
    user, role, tenantId, bisaEdit, chipAkses, kunci,
    muatConfigSekali, invalidateConfig, muatPenugasanSekali,
    ulang: () => halamanDataDasar(wadah),
  };

  // ---------- Dispatch ke sub-halaman ----------
  try {
    if (sub === 'profil') {
      await tabProfil(panelEl, o);
    } else if (sub === 'ta') {
      await tabTA(panelEl, o);
    } else if (sub === 'kelas') {
      await tabKelas(panelEl, o);
    } else if (sub === 'siswa') {
      if (role === 'superadmin') await tabSiswa(panelEl, ctx);
      else await lanjut(tabSiswa, panelEl, ctx, muatPenugasanSekali);
    } else if (sub === 'jadwal') {
      await lanjut(tabJadwal, panelEl, ctx, muatPenugasanSekali);
    } else if (sub === 'denah') {
      await lanjut(tabDenah, panelEl, ctx, muatPenugasanSekali);
    } else if (sub === 'barcode') {
      await tabBarcodeOpsional(panelEl, ctx, muatPenugasanSekali);
    }
  } catch (err) {
    galat(err, 'Gagal memuat halaman');
    panelEl.innerHTML = `
      <section class="ale-kartu card">
        ${bannerGalat(err)}
      </section>`;
    pasangUlang(panelEl, o.ulang);
  }

  return () => {};
}

/* =====================================================================
 * Helper
 * =================================================================== */

/** Pesan galat yang menjelaskan penyebab, bukan sekadar "gagal". */
function pesanGalat(err) {
  const kode = String((err && err.code) || '');
  if (kode.includes('permission-denied')) {
    return {
      judul: 'Akses data ditolak',
      rinci: 'Akun ini belum diizinkan membaca data tersebut. Periksa akses dan kebijakan Supabase untuk data sekolah.',
    };
  }
  if (kode.includes('unauthenticated')) {
    return { judul: 'Sesi berakhir', rinci: 'Silakan keluar lalu masuk kembali.' };
  }
  if (kode.includes('unavailable') || kode.includes('network')) {
    return {
      judul: 'Tidak dapat terhubung ke Supabase',
      rinci: 'Periksa koneksi internet dan konfigurasi layanan Supabase. '
           + 'Pemblokir iklan, antivirus, atau VPN juga dapat memutus koneksi.',
    };
  }
  return { judul: 'Data tidak dapat dimuat', rinci: 'Coba muat ulang. Rincian galat ada di konsol browser.' };
}

/** Banner galat + tombol "Coba lagi" (kelas .dd-banner di dataDasarLayar.css). */
function bannerGalat(err) {
  const { judul, rinci } = pesanGalat(err);
  return `
    <div class="dd-banner" role="alert">
      <div class="dd-banner-teks">
        <strong>${esc(judul)}</strong>
        <span>${esc(rinci)}</span>
      </div>
      <button type="button" class="btn btn-sm btn-outline" data-ulang>Coba lagi</button>
    </div>`;
}

function pasangUlang(el, ulang) {
  el.querySelectorAll('[data-ulang]').forEach((b) => b.addEventListener('click', ulang));
}

/** Muat config sekolah tanpa memblokir tampilan bila gagal. */
async function muatConfigAman(o) {
  try {
    return { d: await o.muatConfigSekali(), gagal: null };
  } catch (err) {
    console.error('[DataDasar] config sekolah:', err);
    return { d: {}, gagal: err };
  }
}

async function lanjut(fn, panelEl, ctx, muatPenugasanSekali) {
  await muatPenugasanSekali();
  await fn(panelEl, ctx);
}

/**
 * Barcode opsional — dynamic import supaya app tetap jalan walau
 * tabBarcode.js belum ada.
 */
async function tabBarcodeOpsional(panelEl, ctx, muatPenugasanSekali) {
  try {
    const mod = await import('./dataDasar/tabBarcode.js');
    if (typeof mod?.tabBarcode !== 'function') {
      throw new Error('Ekspor tabBarcode tidak ditemukan.');
    }
    await muatPenugasanSekali();
    await mod.tabBarcode(panelEl, ctx);
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[dataDasar] tabBarcode tidak dimuat:', err);
    panelEl.innerHTML = `
      <section class="ale-kartu card">
        <div class="ale-kartu-kepala">
          <h2 class="ale-kartu-judul">${ik('qr')} Barcode & Kartu Absensi</h2>
        </div>
        <p class="ale-info-teks">
          Fitur ini belum tersedia. Buat file
          <code class="dd-kode">src/pages/dataDasar/tabBarcode.js</code> yang mengekspor
          <code class="dd-kode">tabBarcode(el, ctx)</code>.
        </p>
      </section>`;
  }
}

/* =====================================================================
 * SUB: Profil Guru & Sekolah
 * =================================================================== */
async function tabProfil(el, o) {
  let tenantIdKop = o.tenantId || '';
  let daftarTenant = [];
  let d = {};
  let gagal = null;
  if (o.role === 'superadmin') {
    try {
      daftarTenant = await muatTenantRuangKelas();
      if (tenantIdKop && !daftarTenant.some((tenant) => tenant.id === tenantIdKop)) tenantIdKop = '';
      if (!tenantIdKop) tenantIdKop = daftarTenant[0]?.id || '';
      if (tenantIdKop) d = await muatPengaturanTenant(tenantIdKop);
    } catch (err) {
      console.error('[DataDasar] profil sekolah superadmin:', err);
      gagal = err;
    }
  } else {
    const hasil = await muatConfigAman(o);
    d = hasil.d;
    gagal = hasil.gagal;
  }
  if (gagal) {
    o = {
      ...o, bisaEdit: false, kunci: 'disabled',
      chipAkses: '<span class="ale-chip ale-chip-kunci">Tidak terhubung</span>',
    };
  }

  el.innerHTML = `
    ${gagal ? bannerGalat(gagal) : ''}
    <section class="ale-kartu card">
      <div class="ale-kartu-kepala">
        <h2 class="ale-kartu-judul">${ik('pengguna')} Akun Saya</h2>
      </div>
      <dl class="ale-dl">
        <div><dt>Nama</dt><dd>${esc(namaDariUser(o.user))}</dd></div>
        <div><dt>Email</dt><dd>${esc(o.user.email || '-')}</dd></div>
        <div><dt>Peran</dt><dd>${esc(LABEL_PERAN[o.role] || 'Pengguna')}</dd></div>
      </dl>
    </section>

    <section class="ale-kartu card" style="margin-top:1rem">
      <div class="ale-kartu-kepala">
        <h2 class="ale-kartu-judul">${ik('gedung')} Profil Instansi & Kepala Sekolah</h2>
        ${o.chipAkses}
      </div>
      ${o.role === 'superadmin' ? `
        <div class="field">
          <label for="profilTenant">Sekolah yang dikelola</label>
          <select id="profilTenant" class="input">
            <option value="">Pilih sekolah</option>
            ${daftarTenant.map((tenant) => `<option value="${esc(tenant.id)}" ${tenant.id === tenantIdKop ? 'selected' : ''}>${esc(tenant.nama)}</option>`).join('')}
          </select>
        </div>` : ''}
      <form id="formProfil" class="ale-form" novalidate>
        <div class="ale-form-grid">
          <div class="field">
            <label for="inNama">Nama instansi / sekolah</label>
            <input type="text" id="inNama" class="input" maxlength="150"
                   ${o.kunci} value="${esc(d.nama || '')}">
          </div>
          <div class="field">
            <label for="inAlamat">Alamat instansi / sekolah</label>
            <input type="text" id="inAlamat" class="input" maxlength="500"
                   ${o.kunci} value="${esc(d.alamat || '')}">
          </div>
          <div class="field">
            <label for="inJenjang">Jenjang pendidikan</label>
            <select id="inJenjang" class="input" ${o.kunci}>
              <option value="">Pilih jenjang</option>
              <option value="tk" ${d.jenjang === 'tk' ? 'selected' : ''}>TK / PAUD</option>
              <option value="sd" ${d.jenjang === 'sd' ? 'selected' : ''}>SD</option>
              <option value="smp" ${d.jenjang === 'smp' ? 'selected' : ''}>SMP</option>
              <option value="sma" ${d.jenjang === 'sma' ? 'selected' : ''}>SMA</option>
            </select>
          </div>
          <div class="field">
            <label for="inNpsn">NPSN</label>
            <input type="text" id="inNpsn" class="input" inputmode="numeric"
                   maxlength="12" ${o.kunci} value="${esc(d.npsn || '')}">
          </div>
          <div class="field">
            <label for="inKepsek">Nama kepala sekolah & gelar</label>
            <input type="text" id="inKepsek" class="input" maxlength="150"
                   ${o.kunci} value="${esc(d.kepalaSekolah || '')}">
          </div>
          <div class="field">
            <label for="inNip">NIP kepala sekolah</label>
            <input type="text" id="inNip" class="input" inputmode="numeric"
                   maxlength="25" ${o.kunci} value="${esc(d.nipKepalaSekolah || '')}">
          </div>
        </div>
        ${o.bisaEdit
          ? '<div class="ale-form-aksi"><button type="submit" class="btn btn-primary">Simpan Profil Sekolah</button></div>'
          : '<p class="ale-info-teks">Profil instansi dikelola oleh administrator.</p>'}
      </form>
    </section>`;

  const bolehUnggahKop = [
    'superadmin', 'admin', 'admin_sekolah', 'operator', 'guru',
    'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler',
  ].includes(o.role);
  el.insertAdjacentHTML('beforeend', `
    <section class="ale-kartu card" style="margin-top:1rem">
      <div class="ale-kartu-kepala">
        <h2 class="ale-kartu-judul">${ik('file')} Kop Sekolah untuk Dokumen</h2>
      </div>
      <p class="ale-info-teks">Unggah gambar kop yang akan tampil pada RPE, CP, ATP, Prota, Prosem, KKTP, dan Modul Ajar. Format PNG, JPG, atau WebP; gambar akan disesuaikan otomatis.</p>
      <img id="kopSekolahPreview" alt="Pratinjau kop sekolah" hidden>
      ${bolehUnggahKop ? `
        <div class="field">
          <label for="kopSekolahBerkas">Gambar kop sekolah</label>
          <input type="file" id="kopSekolahBerkas" class="input" accept="image/png,image/jpeg,image/webp">
        </div>
        <div class="ale-form-aksi">
          <button type="button" class="btn btn-primary" id="kopSekolahSimpan" disabled>Simpan Kop Sekolah</button>
          <button type="button" class="btn btn-outline" id="kopSekolahHapus" hidden>Hapus Kop Sekolah</button>
        </div>` : '<p class="ale-info-teks">Unggah kop sekolah dikelola oleh guru dan administrator sekolah.</p>'}
      <p id="kopSekolahStatus" class="ale-info-teks" role="status" aria-live="polite"></p>
    </section>`);

  pasangUlang(el, o.ulang);

  const previewKop = el.querySelector('#kopSekolahPreview');
  const statusKop = el.querySelector('#kopSekolahStatus');
  const tombolSimpanKop = el.querySelector('#kopSekolahSimpan');
  const tombolHapusKop = el.querySelector('#kopSekolahHapus');
  let kopBerkasTerpilih = null;
  const tampilkanKop = (dataUrl) => {
    previewKop.src = dataUrl || '';
    previewKop.hidden = !dataUrl;
    if (tombolHapusKop) tombolHapusKop.hidden = !dataUrl;
  };
  const muatKopAktif = async () => {
    if (!tenantIdKop) {
      tampilkanKop('');
      statusKop.textContent = 'Pilih sekolah untuk mengelola kop.';
      return;
    }
    try {
      tampilkanKop(await muatKopSekolah(tenantIdKop));
      statusKop.textContent = '';
    } catch (err) {
      console.error('[DataDasar] gagal memuat kop sekolah:', err);
      statusKop.textContent = 'Kop sekolah belum dapat dimuat. Pastikan migrasi kop sekolah sudah diterapkan dan coba lagi.';
    }
  };
  if (bolehUnggahKop) void muatKopAktif();

  const pilihanTenant = el.querySelector('#profilTenant');
  if (pilihanTenant) {
    pilihanTenant.addEventListener('change', async () => {
      tenantIdKop = pilihanTenant.value;
      kopBerkasTerpilih = null;
      if (tombolSimpanKop) tombolSimpanKop.disabled = true;
      try {
        d = tenantIdKop ? await muatPengaturanTenant(tenantIdKop) : {};
        el.querySelector('#inNama').value = d.nama || '';
        el.querySelector('#inAlamat').value = d.alamat || '';
        el.querySelector('#inJenjang').value = d.jenjang || '';
        el.querySelector('#inNpsn').value = d.npsn || '';
        el.querySelector('#inKepsek').value = d.kepalaSekolah || '';
        el.querySelector('#inNip').value = d.nipKepalaSekolah || '';
        await muatKopAktif();
      } catch (err) {
        console.error('[DataDasar] gagal memuat sekolah terpilih:', err);
        galat(err, 'Gagal memuat sekolah terpilih');
      }
    });
  }

  if (tombolSimpanKop) {
    const inputKop = el.querySelector('#kopSekolahBerkas');
    inputKop.addEventListener('change', () => {
      kopBerkasTerpilih = inputKop.files?.[0] || null;
      tombolSimpanKop.disabled = !kopBerkasTerpilih || !tenantIdKop;
      statusKop.textContent = kopBerkasTerpilih ? `Siap diproses: ${kopBerkasTerpilih.name}` : '';
    });
    tombolSimpanKop.addEventListener('click', async () => {
      if (!kopBerkasTerpilih || !tenantIdKop) return;
      tombolSimpanKop.disabled = true;
      statusKop.textContent = 'Memproses dan menyimpan gambar kop…';
      try {
        const imageDataUrl = await buatDataKopSekolah(kopBerkasTerpilih);
        tampilkanKop(await simpanKopSekolah(tenantIdKop, o.user.id || o.user.uid, imageDataUrl));
        statusKop.textContent = 'Kop sekolah tersimpan dan siap digunakan pada dokumen perencanaan.';
        kopBerkasTerpilih = null;
        inputKop.value = '';
      } catch (err) {
        console.error('[DataDasar] gagal menyimpan kop sekolah:', err);
        statusKop.textContent = err.message || 'Kop sekolah gagal disimpan.';
        galat(err, 'Gagal menyimpan kop sekolah');
      } finally {
        tombolSimpanKop.disabled = !kopBerkasTerpilih;
      }
    });
    tombolHapusKop.addEventListener('click', async () => {
      if (!tenantIdKop || !window.confirm('Hapus kop sekolah ini dari dokumen perencanaan?')) return;
      tombolHapusKop.disabled = true;
      try {
        await hapusKopSekolah(tenantIdKop);
        tampilkanKop('');
        statusKop.textContent = 'Kop sekolah berhasil dihapus.';
      } catch (err) {
        console.error('[DataDasar] gagal menghapus kop sekolah:', err);
        galat(err, 'Gagal menghapus kop sekolah');
      } finally {
        tombolHapusKop.disabled = false;
      }
    });
  }

  if (!o.bisaEdit) return;

  el.querySelector('#formProfil').onsubmit = async (e) => {
    e.preventDefault();
    const tombol = e.submitter || el.querySelector('button[type="submit"]');
    tombol.disabled = true;
    try {
      const nama = bersih(el.querySelector('#inNama').value, 150);
      if (!tenantIdKop) throw new Error('Akun belum terhubung ke sekolah.');
      await simpanProfilTenant(tenantIdKop, o.user.id || o.user.uid, {
        nama,
        alamat: bersih(el.querySelector('#inAlamat').value, 500),
        jenjang: el.querySelector('#inJenjang').value,
        npsn: bersih(el.querySelector('#inNpsn').value, 12).replace(/\D/g, ''),
        kepalaSekolah: bersih(el.querySelector('#inKepsek').value, 150),
        nipKepalaSekolah: bersih(el.querySelector('#inNip').value, 25).replace(/[^\d\s]/g, ''),
      });

      o.invalidateConfig();
      toast('Profil sekolah berhasil diperbarui.', 'ok');
    } catch (err) {
      galat(err, 'Gagal menyimpan profil sekolah');
    } finally {
      tombol.disabled = false;
    }
  };
}

async function buatDataKopSekolah(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Pilih gambar PNG, JPG, atau WebP.');
  }
  if (file.size > 5_000_000) throw new Error('Gambar sumber maksimal 5 MB.');
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / image.width, 420 / image.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Peramban tidak dapat memproses gambar kop.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86));
    if (!blob) throw new Error('Gambar kop tidak dapat dikonversi.');
    if (blob.size > 350_000) throw new Error('Hasil gambar kop melebihi 350 KB.');
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Gambar kop tidak dapat dibaca.'));
      reader.readAsDataURL(blob);
    });
  } finally {
    image.close();
  }
}

/* =====================================================================
 * SUB: Tahun Ajaran & Semester
 * =================================================================== */
async function tabTA(el, o) {
  const { d, gagal } = await muatConfigAman(o);
  if (gagal) {
    o = {
      ...o, bisaEdit: false, kunci: 'disabled',
      chipAkses: '<span class="ale-chip ale-chip-kunci">Tidak terhubung</span>',
    };
  }

  el.innerHTML = `
    ${gagal ? bannerGalat(gagal) : ''}
    <section class="ale-kartu card">
      <div class="ale-kartu-kepala">
        <h2 class="ale-kartu-judul">${ik('kalender')} Siklus Akademik Aktif</h2>
        ${o.chipAkses}
      </div>
      <form id="formTA" class="ale-form" novalidate>
        <div class="ale-form-grid">
          <div class="field">
            <label for="inTA">Tahun ajaran aktif</label>
            <input type="text" id="inTA" class="input"
                   placeholder="Contoh: 2026/2027" maxlength="9"
                   ${o.kunci} value="${esc(d.tahunAjaran || '')}">
          </div>
          <div class="field">
            <label for="inSem">Semester berjalan</label>
            <select id="inSem" class="input" ${o.kunci}>
              <option value="Ganjil">Ganjil</option>
              <option value="Genap">Genap</option>
            </select>
          </div>
        </div>
        ${o.bisaEdit
          ? '<div class="ale-form-aksi"><button type="submit" class="btn btn-primary">Simpan Siklus Akademik</button></div>'
          : '<p class="ale-info-teks">Perubahan tahun ajaran diatur administrator.</p>'}
      </form>
    </section>`;

  el.querySelector('#inSem').value = d.semester === 'Genap' ? 'Genap' : 'Ganjil';

  pasangUlang(el, o.ulang);
  if (!o.bisaEdit) return;

  el.querySelector('#formTA').onsubmit = async (e) => {
    e.preventDefault();
    const ta = bersih(el.querySelector('#inTA').value, 9);
    const m = /^(\d{4})\/(\d{4})$/.exec(ta);
    if (!m || Number(m[2]) !== Number(m[1]) + 1) {
      toast('Format tahun ajaran harus seperti 2026/2027.', 'galat');
      return;
    }

    const tombol = e.submitter || el.querySelector('button[type="submit"]');
    tombol.disabled = true;
    try {
      const semester = el.querySelector('#inSem').value === 'Genap' ? 'Genap' : 'Ganjil';
      if (!o.tenantId) throw new Error('Akun belum terhubung ke sekolah.');
      await simpanSiklusTenant(o.tenantId, o.user.id || o.user.uid, {
        tahunAjaran: ta,
        semester,
      });

      o.invalidateConfig();
      toast('Siklus akademik diperbarui.', 'ok');
    } catch (err) {
      galat(err, 'Gagal menyimpan tahun ajaran');
    } finally {
      tombol.disabled = false;
    }
  };
}

/* =====================================================================
 * SUB: Kelas & Mapel Saya
 * =================================================================== */
async function tabKelas(el, o) {
  let p;
  let gagal = null;
  try {
    p = await o.muatPenugasanSekali();
  } catch (err) {
    console.error('[DataDasar] penugasan:', err);
    gagal = err;
    p = { kelas: [], mapel: [] };
  }

  el.innerHTML = `
    ${gagal ? bannerGalat(gagal) : ''}
    <section class="ale-kartu card">
      <div class="ale-kartu-kepala">
        <h2 class="ale-kartu-judul">${ik('buku')} Penugasan Mata Pelajaran & Rombel</h2>
        <span class="ale-chip ale-chip-admin">${p.kelas.length + p.mapel.length} daftar</span>
      </div>
      ${p.kelas.length || p.mapel.length
        ? `<div class="ale-grid-mapel">
            <div class="ale-card-item">
              <strong>Mata pelajaran</strong>
              <span>${p.mapel.length ? p.mapel.map(esc).join(', ') : 'Belum ditetapkan'}</span>
            </div>
            <div class="ale-card-item">
              <strong>Kelas / rombel</strong>
              <span>${p.kelas.length ? p.kelas.map(esc).join(', ') : 'Belum ditetapkan'}</span>
            </div>
          </div>`
        : `<p class="ale-kosong">${gagal
            ? 'Penugasan belum dapat dimuat.'
            : 'Belum ada daftar kelas atau mata pelajaran. Penugasan dikelola oleh administrator.'}</p>`}
    </section>`;

  pasangUlang(el, o.ulang);
}