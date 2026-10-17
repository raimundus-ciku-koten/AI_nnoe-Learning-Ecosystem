// web/src/pages/dashboard.js
/**
 * dashboard.js — Halaman dasbor utama.
 *
 * Struktur konten (post-migrasi shell):
 *   Hero → Jadwal hari ini (timeline) → Akses cepat → Grid 2 kolom:
 *     kiri  : Ringkasan status, Riwayat terbaru
 *     kanan : Percakapan terbaru, Tugas tertunda
 *
 * Shell (sidebar + topbar + #slot-halaman) dibangun oleh router.js;
 * halaman ini hanya mengisi `wadah` (#slot-halaman) dan mengembalikan
 * cleanup (di sini no-op karena tidak ada listener global).
 */
import { db, rtdb } from '../firebase/index.js';
import { collection, doc, getDoc, getDocs, query, limit, orderBy, where } from 'firebase/firestore';
import { ref, get } from 'firebase/database';
import { getState } from '../state.js';
import { perbaruiHeader } from '../components/sidebar.js';
import { LINK_PERENCANAAN } from '../config.js';
import { menuUntukPeran } from '../navigasi.js';
import {
  esc, ikon, inisial, namaDariUser, sapaanWaktu, formatWaktu,
  simpanProfil, ambilProfil, linkLuarAman, LABEL_PERAN, SUBJUDUL_PERAN,
} from '../ui.js';

// ============================================================================
// KONSTANTA & HELPER
// ============================================================================
const BATAS_DAFTAR  = 20;
const BATAS_RIWAYAT = 10;

const SKELETON =
  '<div class="ale-skel" aria-hidden="true"><span></span><span></span><span></span></div>' +
  '<span class="sr-only">Memuat…</span>';

const LABEL_JENIS = {
  rpe: 'RPE', atp: 'ATP', prota: 'Prota', prosem: 'Prosem',
  kktp: 'KKTP', modul: 'Modul Ajar', cover: 'Cover',
};

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

function waktuRelatif(ts) {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const selisih = Math.floor((Date.now() - d.getTime()) / 1000);
  if (selisih < 60) return 'baru saja';
  if (selisih < 3600) return `${Math.floor(selisih / 60)} menit lalu`;
  if (selisih < 86400) return `${Math.floor(selisih / 3600)} jam lalu`;
  if (selisih < 604800) return `${Math.floor(selisih / 86400)} hari lalu`;
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(d);
}

function cetakDokumen(judul, htmlContent) {
  const win = window.open('', '_blank');
  if (!win) return;

  const docTitle = escapeHtml(judul || 'Dokumen');
  const cetakHtml = [
    '<!doctype html>',
    '<html>',
    '<head>',
    `  <title>${docTitle}</title>`,
    '  <style>',
    "    body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.5; padding: 0; margin: 0; }",
    '    table { border-collapse: collapse; width: 100%; }',
    '    th, td { border: 0.5pt solid #333; padding: 4pt 6pt; }',
    '    th { background: #f3ebe0; text-align: center; }',
    '    h1, h2, h3 { page-break-after: avoid; }',
    '  </style>',
    '</head>',
    '<body>',
    htmlContent,
    '</body>',
    '</html>',
  ].join('\n');

  win.document.open();
  win.document.write(cetakHtml);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 250);
}

function tileStat(id, kelas, ikonNama, label, denganBar) {
  return `
    <div class="ale-stat ${kelas}" id="${id}">
      <span class="ale-stat-ikon">${ikon(ikonNama)}</span>
      <span class="ale-stat-label">${label}</span>
      <strong class="ale-stat-nilai">–</strong>
      <span class="ale-stat-foot">Memuat…</span>
      ${denganBar
        ? `<div class="ale-bar" role="progressbar" aria-label="${label}"
                aria-valuemin="0" aria-valuemax="100" hidden><span></span></div>`
        : ''}
    </div>`;
}

function aksiCepat() {
  const item = [
    { href: '#/chat', ikon: 'chat', warna: 'teal', judul: 'Chat',
      ket: 'Percakapan realtime dengan guru dan orang tua' },
    linkLuarAman(LINK_PERENCANAAN) && {
      href: LINK_PERENCANAAN, luar: true, ikon: 'buku', warna: 'indigo',
      judul: 'Perencanaan pembelajaran', ket: 'ATP, Prota, Prosem, dan Modul Ajar',
    },
    { segera: true, ikon: 'ujian',    judul: 'Ujian online',      ket: 'Segera hadir' },
    { segera: true, ikon: 'otomatis', judul: 'Generator soal AI', ket: 'Segera hadir' },
  ].filter(Boolean);

  return item.map((a) => {
    const isi = `
      <span class="ale-aksi-ikon">${ikon(a.ikon)}</span>
      <span class="ale-aksi-teks">
        <strong>${esc(a.judul)}</strong><small>${esc(a.ket)}</small>
      </span>`;

    if (a.segera) {
      return `<div class="ale-aksi is-soon" aria-disabled="true">${isi}</div>`;
    }
    return a.luar
      ? `<a class="ale-aksi ale-aksi-${a.warna}" href="${esc(a.href)}"
             target="_blank" rel="noopener noreferrer">${isi}
           <span class="sr-only">(buka di tab baru)</span></a>`
      : `<a class="ale-aksi ale-aksi-${a.warna}" href="${a.href}">${isi}</a>`;
  }).join('');
}

// ============================================================================
// STRUKTUR MARKUP — hanya isi <main>, tanpa shell
// ============================================================================
function tampilan({ sapa, nama, peran, subjudul, sekarang }) {
  const hari  = new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(sekarang);
  const bulan = new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric' }).format(sekarang);
  const penuh = new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(sekarang);

  return `
    <section class="ale-hero" aria-labelledby="aleSapa">
      <div class="ale-hero-teks">
        <span class="ale-kicker">${ikon('dasbor')}Dasbor ${esc(peran)}</span>
        <h1 id="aleSapa">${esc(sapa)}, <span class="ale-nama" id="aleNamaHero">${esc(nama)}</span></h1>
        <p>${esc(subjudul)}</p>
      </div>
      <div class="ale-tanggal">
        <span class="sr-only">Hari ini ${esc(penuh)}</span>
        <span aria-hidden="true">${esc(hari)}</span>
        <strong aria-hidden="true">${sekarang.getDate()}</strong>
        <span aria-hidden="true">${esc(bulan)}</span>
      </div>
    </section>

    <section class="ale-kartu ale-aksen-indigo ale-jadwal-utama"
             id="aleKartuJadwal" aria-labelledby="hJadwal" aria-busy="true">
      <div class="ale-kartu-kepala">
        <h2 class="ale-kartu-judul" id="hJadwal">${ikon('kalender')}Jadwal hari ini</h2>
        <span class="ale-chip" id="aleChipJadwal" hidden></span>
      </div>
      <div data-isi>${SKELETON}</div>
      <a class="ale-tautan" href="#/datadasar/jadwal">
        Kelola jadwal mengajar${ikon('panah')}
      </a>
    </section>

    <section class="ale-kartu ale-aksen-amber ale-akses" id="aleKartuAkses" aria-labelledby="hAksi">
      <div class="ale-kartu-kepala">
        <h2 class="ale-kartu-judul" id="hAksi">${ikon('otomatis')}Akses cepat</h2>
      </div>
      <div class="ale-aksi-grid">${aksiCepat()}</div>
    </section>

    <div class="ale-grid">
      <div class="ale-kolom">

        <section class="ale-kartu ale-aksen-sky" id="aleKartuStatus" aria-labelledby="hStatus">
          <div class="ale-kartu-kepala">
            <h2 class="ale-kartu-judul" id="hStatus">${ikon('progres')}Ringkasan status</h2>
            <button type="button" class="ale-chip ale-chip-aksi" id="aleMuatUlang" data-ulang="semua">
              ${ikon('muat')}Muat ulang
            </button>
          </div>
          <div class="ale-stat-grid">
            ${tileStat('aleStJadwal',  'ale-stat-sky',   'kalender', 'Jadwal hari ini',  false)}
            ${tileStat('aleStTugas',   'ale-stat-grape', 'tugas',    'Tugas tertunda',   false)}
            ${tileStat('aleStProgres', 'ale-stat-mint',  'progres',  'Progres semester', true)}
          </div>
        </section>

        <section class="ale-kartu ale-aksen-amber" id="aleKartuRiwayat" aria-labelledby="hRiwayat" aria-busy="true">
          <div class="ale-kartu-kepala">
            <h2 class="ale-kartu-judul" id="hRiwayat">${ikon('folder')}Riwayat terbaru</h2>
            <a class="ale-chip ale-chip-aksi" href="#/hasil">${ikon('panah')}Semua</a>
          </div>
          <div data-isi>${SKELETON}</div>
        </section>

      </div>
      <div class="ale-kolom">

        <section class="ale-kartu ale-aksen-teal" id="aleKartuChat" aria-labelledby="hChat" aria-busy="true">
          <div class="ale-kartu-kepala">
            <h2 class="ale-kartu-judul" id="hChat">${ikon('chat')}Percakapan terbaru</h2>
            <span class="ale-chip" id="aleChipChat" hidden></span>
          </div>
          <div data-isi>${SKELETON}</div>
          <a class="ale-tautan" href="#/chat">Buka chat${ikon('panah')}</a>
        </section>

        <section class="ale-kartu ale-aksen-emerald" id="aleKartuTugas" aria-labelledby="hTugas" aria-busy="true">
          <div class="ale-kartu-kepala">
            <h2 class="ale-kartu-judul" id="hTugas">${ikon('tugas')}Tugas tertunda</h2>
          </div>
          <div data-isi>${SKELETON}</div>
        </section>

      </div>
    </div>`;
}

const AKSI_ADMIN_SEKOLAH = [
  {
    href: '#/admin/pengguna/guru', ikon: 'pengguna', judul: 'Pengguna sekolah',
    ket: 'Guru, siswa, orang tua, dan persetujuan akun',
  },
  {
    href: '#/admin/akademik/kelas', ikon: 'buku', judul: 'Akademik',
    ket: 'Kelas, mata pelajaran, jadwal, dan penugasan',
  },
  {
    href: '#/admin/perencanaan/monitoring', ikon: 'berkas', judul: 'Perangkat ajar',
    ket: 'Pantau dokumen guru dan alur persetujuan',
  },
  {
    href: '#/admin/asesmen/monitoring', ikon: 'ujian', judul: 'Asesmen sekolah',
    ket: 'Paket ujian, status peserta, dan analisis',
  },
  {
    href: '#/admin/komunikasi/pengumuman', ikon: 'chat', judul: 'Komunikasi resmi',
    ket: 'Pengumuman, kanal, dan broadcast sekolah',
  },
  {
    href: '#/admin/laporan/akademik', ikon: 'progres', judul: 'Laporan sekolah',
    ket: 'Analitik akademik, keuangan, dan kinerja',
  },
];

const AKSI_SUPERADMIN = [
  {
    href: '#/platform/tenant/sekolah', ikon: 'gedung', judul: 'Tenant dan langganan',
    ket: 'Sekolah, paket, dan status layanan',
  },
  {
    href: '#/platform/fitur/flags', ikon: 'saklar', judul: 'Fitur platform',
    ket: 'Feature flags, menu, dan izin peran',
  },
  {
    href: '#/platform/ai/monitoring', ikon: 'otomatis', judul: 'AI global',
    ket: 'Template prompt dan pemantauan pemakaian',
  },
  {
    href: '#/platform/firebase/firestore', ikon: 'database', judul: 'Layanan Firebase',
    ket: 'Firestore, Storage, Functions, Auth, dan FCM',
  },
  {
    href: '#/platform/keamanan/audit', ikon: 'perisai', judul: 'Keamanan dan audit',
    ket: 'Audit log, Security Rules, dan App Check',
  },
  {
    href: '#/platform/laporan/biaya', ikon: 'progres', judul: 'Analitik global',
    ket: 'Penggunaan, performa, dan biaya platform',
  },
];

function aksiAdmin(items) {
  return items.map((item) => `
    <a class="ale-admin-aksi" href="${item.href}">
      <span class="ale-admin-aksi-ikon">${ikon(item.ikon)}</span>
      <span class="ale-admin-aksi-teks">
        <strong>${esc(item.judul)}</strong>
        <small>${esc(item.ket)}</small>
      </span>
      <span class="ale-admin-aksi-panah" aria-hidden="true">${ikon('panah')}</span>
    </a>`).join('');
}

function tampilanAdmin({ role, nama, sekolah }) {
  const superadmin = role === 'superadmin';
  const peran = LABEL_PERAN[role] || 'Administrator';
  const aksi = superadmin ? AKSI_SUPERADMIN : AKSI_ADMIN_SEKOLAH;
  const judul = superadmin ? 'Kelola ekosistem pembelajaran' : 'Operasikan sekolah dengan terarah';
  const ringkasan = superadmin
    ? 'Pantau tenant, layanan, dan kontrol platform dari satu pusat kendali.'
    : 'Kelola pengguna, kegiatan akademik, perangkat ajar, dan komunikasi dalam lingkup sekolah.';
  const cakupan = superadmin
    ? 'Seluruh tenant · layanan platform'
    : sekolah || 'Sekolah sesuai tenant akun';

  return `
    <div class="ale-admin-dashboard${superadmin ? ' is-superadmin' : ' is-admin-sekolah'}">
      <section class="ale-hero ale-admin-hero" aria-labelledby="aleSapa">
        <div class="ale-hero-teks">
          <span class="ale-kicker">${ikon(superadmin ? 'gedung' : 'pengguna')}${esc(peran)} · Pusat kendali</span>
          <h1 id="aleSapa">Selamat datang, <span class="ale-nama" id="aleNamaHero">${esc(nama)}</span></h1>
          <p>${esc(ringkasan)}</p>
        </div>
        <div class="ale-admin-cakupan">
          <span>Ruang lingkup</span>
          <strong id="aleAdminSekolah">${esc(cakupan)}</strong>
        </div>
      </section>

      <section class="ale-kartu ale-admin-modul" aria-labelledby="aleAdminModul">
        <div class="ale-kartu-kepala">
          <div>
            <p class="ale-admin-kicker">${superadmin ? 'Operasional global' : 'Operasional sekolah'}</p>
            <h2 class="ale-kartu-judul" id="aleAdminModul">
              ${ikon(superadmin ? 'pengaturan' : 'berkas')}
              ${superadmin ? 'Area pengelolaan platform' : 'Area pengelolaan sekolah'}
            </h2>
          </div>
          <span class="ale-admin-pill">${superadmin ? 'Lintas tenant' : 'Tenant terbatas'}</span>
        </div>
        <div class="ale-admin-aksi-grid">${aksiAdmin(aksi)}</div>
      </section>

      <section class="ale-kartu ale-admin-prinsip" aria-labelledby="aleAdminPrinsip">
        <div class="ale-kartu-kepala">
          <h2 class="ale-kartu-judul" id="aleAdminPrinsip">
            ${ikon('perisai')}${superadmin ? 'Kontrol platform' : 'Pengelolaan yang aman'}
          </h2>
        </div>
        <div class="ale-admin-prinsip-grid">
          ${superadmin
            ? `<p><strong>Direktori platform.</strong> Tinjau sekolah dan admin sekolah secara baca-saja; perubahan langganan dan peran harus melalui backend tepercaya.</p>
               <p><strong>Rahasia dan infrastruktur.</strong> API key AI dikelola di server. Gunakan konsol Firebase untuk status layanan operasional.</p>
               <p><strong>Statistik dan audit.</strong> Snapshot Firestore bukan telemetry historis, audit aplikasi, metrik biaya, atau status kesehatan layanan.</p>`
            : `<p><strong>Akun sesuai kewenangan.</strong> Kelola guru, siswa, dan orang tua dalam tenant sekolah; persetujuan serta perubahan akun mengikuti alur resmi.</p>
               <p><strong>Dokumen dan asesmen.</strong> Tinjau status perangkat ajar yang diunggah serta monitoring ujian untuk kebutuhan operasional sekolah.</p>
               <p><strong>Privasi komunikasi.</strong> Gunakan ringkasan agregat dan laporan; isi percakapan pribadi bukan untuk dipantau bebas.</p>`}
        </div>
      </section>
    </div>`;
}

function tampilanPortal({ role, nama }) {
  const peran = LABEL_PERAN[role] || role || 'Pengguna';
  const ringkasan = role === 'siswa'
    ? 'Akses jadwal, materi, ujian, nilai, dan komunikasi yang disediakan sekolah untuk akun Anda.'
    : ['ortu', 'orang_tua'].includes(role)
      ? 'Tinjau informasi anak yang telah ditautkan sekolah dan gunakan kanal komunikasi resmi.'
      : role === 'operator'
        ? 'Buka area kerja operasional sesuai peran dan ruang lingkup sekolah Anda.'
        : 'Pilih menu yang tersedia untuk akun Anda. Setiap tautan membuka halaman sesuai peran.';
  const catatan = role === 'siswa'
    ? 'Jadwal, materi, tugas, ujian, dan nilai akan tampil setelah sekolah menautkan data akademik ke akun Anda. Halaman yang belum terhubung hanya menampilkan panduan.'
    : ['ortu', 'orang_tua'].includes(role)
      ? 'Informasi anak hanya dapat ditampilkan setelah sekolah menautkan akun orang tua secara resmi. Halaman yang belum terhubung hanya menampilkan panduan.'
      : role === 'operator'
        ? 'Akses operator dibatasi oleh peran dan tenant sekolah. Halaman panduan tidak mengubah data; gunakan hanya modul yang memang tersedia untuk akun Anda.'
        : 'Beberapa modul akademik masih menunggu integrasi data sekolah. Halaman tetap menampilkan statusnya dengan jelas dan tidak mengubah data sebelum fitur tersebut tersedia.';
  const grup = menuUntukPeran(role);
  const daftarMenu = grup.map((bagian) => `
    <section class="ale-kartu ale-aksen-sky" aria-labelledby="portal-${escapeAttr(bagian.id)}">
      <div class="ale-kartu-kepala">
        <h2 class="ale-kartu-judul" id="portal-${escapeAttr(bagian.id)}">
          ${ikon(bagian.ikon)}${esc(bagian.label)}
        </h2>
      </div>
      <nav class="ale-aksi-grid" aria-label="${escapeAttr(bagian.label)}">
        ${bagian.item.map((item) => `
          <a class="ale-aksi ale-aksi-teal" href="#${escapeAttr(item.path)}${escapeAttr(item.search || '')}">
            <span class="ale-aksi-ikon">${ikon(item.ikon)}</span>
            <span class="ale-aksi-teks"><strong>${esc(item.label)}</strong><small>Buka menu</small></span>
          </a>`).join('')}
      </nav>
    </section>`).join('');

  return `
    <section class="ale-hero" aria-labelledby="portal-judul">
      <div class="ale-hero-teks">
        <span class="ale-kicker">${ikon('dasbor')}Ruang kerja ${esc(peran)}</span>
        <h1 id="portal-judul">Selamat datang, <span class="ale-nama">${esc(nama)}</span></h1>
        <p>${esc(ringkasan)}</p>
      </div>
    </section>
    <p class="ale-kosong" role="note">
      ${esc(catatan)}
    </p>
    <div class="ale-grid">${daftarMenu}</div>`;
}

async function muatProfilDashboard(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;

    const d = snap.data();
    const profil = {
      nama:        typeof d.nama        === 'string' ? d.nama.trim()        : '',
      sekolah:     typeof d.sekolah     === 'string' ? d.sekolah.trim()     : '',
      langganan:   d.langganan === true || d.langganan === 'aktif',
      logoSekolah: typeof d.logoSekolah === 'string' ? d.logoSekolah.trim() : '',
    };

    simpanProfil(uid, profil);
    return profil;
  } catch (err) {
    console.warn('[dashboard] profil tidak terbaca:', err);
    return null;
  }
}

// ============================================================================
// LOGIKA INSIALISASI
// ============================================================================
export async function halamanDashboard(wadah) {
  const { user, role, tenantId, profile } = getState();
  if (!user) return () => {};
  const uid = user.uid;

  const sekarang   = new Date();
  const profilAwal = ambilProfil(uid);
  const namaAwal   = (profilAwal && profilAwal.nama) || namaDariUser(user);

  const peran = String(role || '').toLowerCase().trim();
  if (peran === 'admin_sekolah' || peran === 'admin' || peran === 'superadmin') {
    const roleDashboard = peran === 'admin' ? 'admin_sekolah' : peran;
    wadah.innerHTML = tampilanAdmin({
      role: roleDashboard,
      nama: namaAwal,
      sekolah: profile?.sekolah || profilAwal?.sekolah || '',
    });
    document.title = `${LABEL_PERAN[roleDashboard]} · AI_nnoe Learning Ecosystem`;

    const profil = await muatProfilDashboard(uid);
    if (profil && wadah.isConnected) {
      if (profil.nama) wadah.querySelector('#aleNamaHero').textContent = profil.nama;
      if (roleDashboard === 'admin_sekolah' && profil.sekolah) {
        wadah.querySelector('#aleAdminSekolah').textContent = profil.sekolah;
      }
      perbaruiHeader(profil);
    }
    return () => {};
  }

  if (peran === 'operator' || peran === 'siswa' || peran === 'ortu' || peran === 'orang_tua' ||
      !['guru', 'operator', 'demo'].includes(peran)) {
    wadah.innerHTML = tampilanPortal({ role, nama: namaAwal });
    document.title = `${LABEL_PERAN[role] || 'Ruang kerja'} · AI_nnoe Learning Ecosystem`;
    return () => {};
  }

  wadah.innerHTML = tampilan({
    sapa:     sapaanWaktu(sekarang),
    nama:     namaAwal,
    peran:    LABEL_PERAN[role] || 'Pengguna',
    subjudul: SUBJUDUL_PERAN[role] || 'Ringkasan aktivitas Anda hari ini.',
    sekarang,
  });
  document.title = 'Dasbor · AI_nnoe Learning Ecosystem';

  // `wadah` = #slot-halaman (di-render router). Tidak ada shell di sini.
  const utama       = wadah;
  const namaHero    = utama.querySelector('#aleNamaHero');
  const tombolUlang = utama.querySelector('#aleMuatUlang');

  const st = {
    jadwal:  utama.querySelector('#aleStJadwal'),
    tugas:   utama.querySelector('#aleStTugas'),
    progres: utama.querySelector('#aleStProgres'),
  };
  const kartu = {
    jadwal:  utama.querySelector('#aleKartuJadwal'),
    tugas:   utama.querySelector('#aleKartuTugas'),
    chat:    utama.querySelector('#aleKartuChat'),
    progres: utama.querySelector('#aleKartuStatus'),
    riwayat: utama.querySelector('#aleKartuRiwayat'),
  };
  const isi = {
    jadwal:  kartu.jadwal.querySelector('[data-isi]'),
    tugas:   kartu.tugas.querySelector('[data-isi]'),
    chat:    kartu.chat.querySelector('[data-isi]'),
    riwayat: kartu.riwayat.querySelector('[data-isi]'),
  };
  const chipChat   = utama.querySelector('#aleChipChat');
  const chipJadwal = utama.querySelector('#aleChipJadwal');

  const isiStat = (el, nilai, foot) => {
    if (!el) return;
    el.querySelector('.ale-stat-nilai').textContent = nilai;
    el.querySelector('.ale-stat-foot').textContent  = foot;
  };
  const isiBar = (el, persen) => {
    if (!el) return;
    const bar = el.querySelector('.ale-bar');
    if (!bar) return;
    bar.hidden = persen == null;
    if (persen == null) return;
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.setAttribute('aria-valuenow', String(persen));
    bar.firstElementChild.style.width = persen + '%';
  };
  const kosong = (el, teks) => {
    el.innerHTML = `<p class="ale-kosong">${ikon('kosong')}<span>${esc(teks)}</span></p>`;
  };

  // ------------------------------------------------------------------------
  // Pemuat data
  // ------------------------------------------------------------------------
  const pemuat = {
    async jadwal() {
      const snap = await getDoc(doc(db, 'guru', uid, 'pengaturan', 'jadwal'));
      const semua = snap.exists() && Array.isArray(snap.data().entri) ? snap.data().entri : [];
      const hariIni = new Date().getDay();

      if (hariIni === 0) {
        isiStat(st.jadwal, '0', 'hari Minggu');
        if (chipJadwal) {
          chipJadwal.hidden = false;
          chipJadwal.textContent = 'Hari Minggu';
        }
        return kosong(isi.jadwal, 'Hari ini Minggu, tidak ada jadwal mengajar.');
      }

      const daftar = semua
        .filter((e) => e && e.hari === hariIni)
        .sort((a, b) => String(a.mulai || '').localeCompare(String(b.mulai || '')));

      isiStat(st.jadwal, String(daftar.length),
        daftar.length ? 'sesi mengajar' : 'belum ada sesi');

      if (chipJadwal) {
        chipJadwal.hidden = false;
        chipJadwal.textContent = daftar.length ? `${daftar.length} sesi` : 'Belum ada sesi';
      }

      if (!daftar.length) {
        return kosong(isi.jadwal, semua.length
          ? 'Tidak ada sesi mengajar untuk hari ini.'
          : 'Jadwal mengajar belum diisi. Tambahkan di Data Dasar → Jadwal Mengajar.');
      }

      // Status tiap sesi: selesai / sekarang / akan-datang
      const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
      const keMenit = (t) => {
        const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/);
        return m ? Number(m[1]) * 60 + Number(m[2]) : null;
      };

      const itemsHtml = daftar.map((d) => {
        const m1 = keMenit(d.mulai);
        const m2 = keMenit(d.selesai);
        let status = 'akan-datang';
        if (m1 != null && m2 != null) {
          if (nowMin >= m2) status = 'selesai';
          else if (nowMin >= m1) status = 'sekarang';
        }
        const label = status === 'sekarang'  ? 'Berlangsung'
                    : status === 'selesai'   ? 'Selesai'
                    :                          'Berikutnya';

        return `
          <li class="ale-timeline-item ${status}">
            <div class="ale-timeline-waktu">
              <strong>${esc(d.mulai || '–')}</strong>
              <span>${esc(d.selesai || '–')}</span>
            </div>
            <span class="ale-timeline-dot" aria-hidden="true"></span>
            <div class="ale-timeline-isi">
              <strong class="ale-timeline-judul">${esc(d.mapel || 'Tanpa judul')}</strong>
              <span class="ale-timeline-kelas">Kelas ${esc(d.kelas || '-')}</span>
            </div>
            <span class="ale-timeline-status">${label}</span>
          </li>`;
      }).join('');

      isi.jadwal.innerHTML = `<ol class="ale-timeline">${itemsHtml}</ol>`;
    },

    async tugas() {
      const snap = await getDocs(
        query(collection(db, 'dashboard', uid, 'tugas'), limit(BATAS_DAFTAR))
      );
      const tertunda = snap.docs.map((d) => d.data()).filter((d) => d.selesai !== true);
      const penuh    = snap.size >= BATAS_DAFTAR;

      isiStat(st.tugas, tertunda.length + (penuh ? '+' : ''),
        tertunda.length ? 'belum selesai' : 'tidak ada yang tertunda');

      if (!tertunda.length) return kosong(isi.tugas, 'Tidak ada tugas tertunda.');

      const itemsHtml = tertunda.map((d) =>
        `<li>
          <span class="ale-cek" aria-hidden="true"></span>
          <span>${esc(d.judul || 'Tanpa judul')}</span>
        </li>`
      ).join('');

      isi.tugas.innerHTML = `<ul class="ale-daftar">${itemsHtml}</ul>`;
    },

    async progres() {
      const snap   = await getDoc(doc(db, 'dashboard', uid, 'ringkasan', 'progres'));
      const mentah = snap.exists() ? Number(snap.data().persen) : NaN;

      if (!Number.isFinite(mentah)) {
        isiStat(st.progres, '–', 'belum ada data');
        return isiBar(st.progres, null);
      }
      const persen = Math.max(0, Math.min(100, Math.round(mentah)));
      isiStat(st.progres, persen + '%', 'capaian semester ini');
      isiBar(st.progres, persen);
    },

    async chat() {
      const snap   = await get(ref(rtdb, `userChats/${uid}`));
      const daftar = [];
      snap.forEach((c) => { daftar.push({ id: c.key, ...c.val() }); });
      daftar.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));

      const belumDibaca = daftar.reduce((n, c) => n + (Number(c.unread) || 0), 0);
      if (chipChat) {
        chipChat.hidden      = belumDibaca === 0;
        chipChat.textContent = `${belumDibaca} belum dibaca`;
      }

      if (!daftar.length) {
        return kosong(isi.chat, 'Belum ada percakapan. Mulai chat dari menu Chat.');
      }

      const itemsHtml = daftar.slice(0, 5).map((c) =>
        `<li>
          <a class="ale-chat-baris" href="#/chat">
            <span class="ale-avatar-kecil" aria-hidden="true">${esc(inisial(c.title))}</span>
            <span class="ale-chat-isi">
              <strong>${esc(c.title || 'Percakapan')}</strong>
              <span>${esc(c.lastMessage || 'Belum ada pesan')}</span>
            </span>
            <span class="ale-chat-meta">
              <time>${esc(formatWaktu(c.lastAt))}</time>${Number(c.unread) > 0
                ? `<span class="ale-badge">${esc(c.unread)}</span>`
                : ''}
            </span>
          </a>
        </li>`
      ).join('');

      isi.chat.innerHTML = `<ul class="ale-daftar">${itemsHtml}</ul>`;
    },

    async riwayat() {
      if (!tenantId) {
        return kosong(isi.riwayat, 'Tenant belum diset. Hubungi admin sekolah Anda.');
      }

      let snap;
      try {
        const q = query(
          collection(db, 'tenants', tenantId, 'perencanaan'),
          where('uid', '==', uid),
          orderBy('createdAt', 'desc'),
          limit(BATAS_RIWAYAT)
        );
        snap = await getDocs(q);
      } catch (err) {
        // Fallback: kalau orderBy butuh composite index yang belum dibuat
        const q2 = query(
          collection(db, 'tenants', tenantId, 'perencanaan'),
          where('uid', '==', uid),
          limit(BATAS_RIWAYAT * 2)
        );
        snap = await getDocs(q2);
      }

      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        .slice(0, BATAS_RIWAYAT);

      if (!list.length) {
        return kosong(isi.riwayat, 'Belum ada dokumen. Mulai dari menu Perencanaan.');
      }

      const itemDaftar = list.map((d) => {
        const labelJenis   = LABEL_JENIS[d.jenis] || d.jenis || '?';
        const inisialHuruf = esc(labelJenis.charAt(0));
        const judulDok     = escapeHtml(d.judul || '(Tanpa judul)');
        const teksJenis    = esc(labelJenis);
        const teksKelas    = d.kelas ? ` · ${escapeHtml(d.kelas)}` : '';
        const teksWaktu    = escapeHtml(waktuRelatif(d.createdAt));
        const idDok        = escapeAttr(d.id);

        return `
          <li>
            <a class="ale-chat-baris" href="#" data-buka="${idDok}">
              <span class="ale-avatar-kecil" aria-hidden="true">${inisialHuruf}</span>
              <span class="ale-chat-isi">
                <strong>${judulDok}</strong>
                <span>${teksJenis}${teksKelas}</span>
              </span>
              <span class="ale-chat-meta">
                <time>${teksWaktu}</time>
              </span>
            </a>
          </li>`;
      }).join('');

      isi.riwayat.innerHTML = `
        <ul class="ale-daftar">${itemDaftar}</ul>
        <div class="ale-tautan-kanan">
          <a class="ale-tautan" href="#/hasil">Lihat semua${ikon('panah')}</a>
        </div>`;

      isi.riwayat.querySelectorAll('[data-buka]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          const id = el.dataset.buka;
          const item = list.find((x) => x.id === id);
          if (item) tampilkanModal(item);
        });
      });
    },
  };

  function tampilGalat(nama, err) {
    const kode    = err && err.code ? String(err.code) : '';
    const ditolak = /permission[-_]denied/i.test(kode);
    const pesan   = ditolak
      ? 'Akses ke data ini belum diizinkan. Hubungi admin sekolah Anda.'
      : 'Data tidak dapat dimuat. Periksa koneksi internet Anda.';

    if (st[nama]) { isiStat(st[nama], '–', 'Gagal dimuat'); isiBar(st[nama], null); }
    if (isi[nama]) {
      isi[nama].innerHTML =
        `<div class="ale-galat" role="alert">
           <span>${escapeHtml(pesan)}</span>
           <button type="button" class="ale-ulang" data-ulang="${escapeAttr(nama)}">
             Coba lagi
           </button>
         </div>`;
    }
  }

  async function jalankan(nama) {
    const k = kartu[nama];
    k?.setAttribute('aria-busy', 'true');
    try {
      await pemuat[nama]();
    } catch (err) {
      console.error(`[dashboard] gagal memuat "${nama}":`, err);
      tampilGalat(nama, err);
    } finally {
      k?.removeAttribute('aria-busy');
    }
  }

  function siapkanUlang(nama) {
    if (isi[nama]) isi[nama].innerHTML = SKELETON;
    if (st[nama])  { isiStat(st[nama], '–', 'Memuat…'); isiBar(st[nama], null); }
  }

  async function muatSemua() {
    if (tombolUlang) tombolUlang.disabled = true;
    const nama = Object.keys(pemuat);
    nama.forEach(siapkanUlang);
    await Promise.allSettled(nama.map(jalankan));
    if (tombolUlang) tombolUlang.disabled = false;
  }

  utama.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target.closest('[data-ulang]') : null;
    if (!t) return;
    const nama = t.dataset.ulang;
    if (nama === 'semua') { muatSemua(); return; }
    if (pemuat[nama]) { siapkanUlang(nama); jalankan(nama); }
  });

  async function muatProfil() {
    const profil = await muatProfilDashboard(uid);
    if (!profil) return;
    if (profil.nama && namaHero) namaHero.textContent = profil.nama;
    perbaruiHeader(profil);
  }

  function tampilkanModal(dataDokumen) {
    document.getElementById('modal-dokumen')?.remove();
    const pemicu = document.activeElement;

    const judul = escapeHtml(dataDokumen.judul || 'Dokumen');
    const meta = [
      LABEL_JENIS[dataDokumen.jenis] || dataDokumen.jenis,
      dataDokumen.mapel, dataDokumen.kelas, dataDokumen.tahunAjaran,
    ].filter(Boolean).map(escapeHtml).join(' · ');
    const htmlIsi = dataDokumen.html || '<p>Dokumen kosong.</p>';

    const modal = document.createElement('div');
    modal.id = 'modal-dokumen';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="md-judul">
        <div class="modal-head">
          <div>
            <h3 id="md-judul">${judul}</h3>
            ${meta ? `<p>${meta}</p>` : ''}
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline btn-sm" id="md-print">Cetak</button>
            <button type="button" class="btn btn-primary btn-sm" id="md-close">Tutup</button>
          </div>
        </div>
        <div class="doc-preview" tabindex="0">${htmlIsi}</div>
      </div>`;
    document.body.appendChild(modal);

    const tutup = () => {
      modal.remove();
      document.removeEventListener('keydown', saatTombol);
      if (pemicu && typeof pemicu.focus === 'function') pemicu.focus();
    };
    const saatTombol = (e) => {
      if (e.key === 'Escape') { tutup(); return; }
      if (e.key !== 'Tab') return;
      const bisaFokus = modal.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])');
      if (!bisaFokus.length) return;
      const awal  = bisaFokus[0];
      const akhir = bisaFokus[bisaFokus.length - 1];
      if (e.shiftKey && document.activeElement === awal)  { e.preventDefault(); akhir.focus(); }
      else if (!e.shiftKey && document.activeElement === akhir) { e.preventDefault(); awal.focus(); }
    };

    modal.querySelector('#md-close').onclick = tutup;
    modal.querySelector('#md-print').onclick = () => {
      cetakDokumen(dataDokumen.judul, modal.querySelector('.doc-preview').innerHTML);
    };
    modal.addEventListener('click', (e) => { if (e.target === modal) tutup(); });
    document.addEventListener('keydown', saatTombol);
    modal.querySelector('#md-close').focus();
  }

  await Promise.allSettled([muatProfil(), muatSemua()]);

  // Cleanup: halaman ini tidak memasang listener global, jadi no-op.
  return () => {};
}