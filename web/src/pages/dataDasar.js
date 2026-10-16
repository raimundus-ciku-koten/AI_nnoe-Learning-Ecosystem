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
import { db } from '../firebase/index.js';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getState } from '../state.js';
import { bacaRute, navigate } from '../router.js';
import { perbaruiHeader } from '../components/sidebar.js';
import { esc, LABEL_PERAN, namaDariUser, ambilProfil } from '../ui.js';
import { bersih, galat, ik, muatPenugasan, toast } from './dataDasar/umum.js';
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
    kelas: [], mapel: [], mapelKelas: [],
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
          ctx.mapelKelas = p.mapelKelas;
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
      promiseConfig = getDoc(doc(db, 'tenants', tenantId))
        .then((s) => (s.exists() ? s.data() : {}))
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
      await lanjut(tabSiswa, panelEl, ctx, muatPenugasanSekali);
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
      rinci: 'Akun ini belum diizinkan membaca data tersebut. Periksa Firestore Security Rules untuk koleksi yang dibuka halaman ini.',
    };
  }
  if (kode.includes('unauthenticated')) {
    return { judul: 'Sesi berakhir', rinci: 'Silakan keluar lalu masuk kembali.' };
  }
  if (kode.includes('unavailable') || kode.includes('network')) {
    return {
      judul: 'Tidak dapat terhubung ke Firestore',
      rinci: 'Periksa koneksi internet. Bila memakai emulator, pastikan "firebase emulators:start" berjalan. '
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
      <form id="formProfil" class="ale-form" novalidate>
        <div class="ale-form-grid">
          <div class="field">
            <label for="inNama">Nama instansi / sekolah</label>
            <input type="text" id="inNama" class="input" maxlength="150"
                   ${o.kunci} value="${esc(d.nama || '')}">
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

  pasangUlang(el, o.ulang);
  if (!o.bisaEdit) return;

  el.querySelector('#formProfil').onsubmit = async (e) => {
    e.preventDefault();
    const tombol = e.submitter || el.querySelector('button[type="submit"]');
    tombol.disabled = true;
    try {
      const nama = bersih(el.querySelector('#inNama').value, 150);
      if (!o.tenantId) throw new Error('Akun belum terhubung ke sekolah.');
      await setDoc(doc(db, 'tenants', o.tenantId), {
        nama,
        npsn:           bersih(el.querySelector('#inNpsn').value, 12).replace(/\D/g, ''),
        kepalaSekolah:  bersih(el.querySelector('#inKepsek').value, 150),
        nipKepalaSekolah: bersih(el.querySelector('#inNip').value, 25).replace(/[^\d\s]/g, ''),
        diperbaruiOleh: o.user.uid,
        waktuUbah:      serverTimestamp(),
      }, { merge: true });

      o.invalidateConfig();
      toast('Profil sekolah berhasil diperbarui.', 'ok');
    } catch (err) {
      galat(err, 'Gagal menyimpan profil sekolah');
    } finally {
      tombol.disabled = false;
    }
  };
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
      await setDoc(doc(db, 'tenants', o.tenantId), {
        tahunAjaran:    ta,
        semester,
        diperbaruiOleh: o.user.uid,
        waktuUbah:      serverTimestamp(),
      }, { merge: true });

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
    p = { mapelKelas: [] };
  }

  el.innerHTML = `
    ${gagal ? bannerGalat(gagal) : ''}
    <section class="ale-kartu card">
      <div class="ale-kartu-kepala">
        <h2 class="ale-kartu-judul">${ik('buku')} Penugasan Mata Pelajaran & Rombel</h2>
        <span class="ale-chip ale-chip-admin">${p.mapelKelas.length} penugasan</span>
      </div>
      ${p.mapelKelas.length
        ? `<div class="ale-grid-mapel">${p.mapelKelas.map((i) => `
            <div class="ale-card-item">
              <strong>${esc(i.mapel)}</strong>
              <span>Kelas / Rombel: ${esc(i.kelas)}</span>
            </div>`).join('')}</div>`
        : `<p class="ale-kosong">${gagal
            ? 'Penugasan belum dapat dimuat.'
            : 'Belum ada penugasan kelas atau mata pelajaran. Penugasan diatur oleh administrator.'}</p>`}
    </section>`;

  pasangUlang(el, o.ulang);
}