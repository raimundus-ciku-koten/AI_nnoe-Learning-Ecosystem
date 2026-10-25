// web/src/pages/dashboard.js
/**
 * dashboard.js — Halaman dasbor utama.
 *
 * Struktur konten (post-migrasi shell):
 *   Hero → Jadwal hari ini (timeline) → Akses cepat → Grid 2 kolom:
 *     kiri  : Ringkasan status, Riwayat terbaru
 *     kanan : Percakapan dan tugas terbaru
 *
 * Shell (sidebar + topbar + #slot-halaman) dibangun oleh router.js;
 * halaman ini hanya mengisi `wadah` (#slot-halaman) dan mengembalikan
 * cleanup (di sini no-op karena tidak ada listener global).
 */
import {
  muatDaftarRuangKelas,
  muatHasilKuisGuru,
  muatTugasUntukDasbor,
  ringkasNilaiKuis,
} from '../services/learningClassrooms.js';
import { muatPercakapanTerbaruDasbor } from '../services/dashboard.js';
import { sesiGoogleWorkspacePerPengguna } from '../services/googleWorkspaceAuth.js';
import { identitasEnkripsiDriveDalamSesi } from '../services/driveEncryption.js';
import { muatJadwalGuruDrive } from '../services/teacherScheduleDrive.js';
import { muatCatatanGuruDrive } from '../services/teacherWorkspaceDrive.js';
import { getState } from '../state.js';
import { perbaruiHeader } from '../components/sidebar.js';
import { LINK_PERENCANAAN } from '../config.js';
import { menuUntukPeran } from '../navigasi.js';
import { sesiUntukHari } from './dataDasar/jadwalUtil.js';
import {
  esc, ikon, inisial, namaDariUser, sapaanWaktu, formatWaktu,
  ambilProfil, linkLuarAman, LABEL_PERAN, SUBJUDUL_PERAN,
} from '../ui.js';

const SKELETON =
  '<div class="ale-skel" aria-hidden="true"><span></span><span></span><span></span></div>' +
  '<span class="sr-only">Memuat…</span>';

function escapeAttr(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
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
    linkLuarAman(LINK_PERENCANAAN)
      ? {
        href: LINK_PERENCANAAN, luar: true, ikon: 'buku', warna: 'indigo',
        judul: 'Perencanaan pembelajaran', ket: 'ATP, Prota, Prosem, dan Modul Ajar',
      }
      : {
        href: '#/perencanaan', ikon: 'buku', warna: 'indigo',
        judul: 'Perencanaan pembelajaran', ket: 'ATP, Prota, Prosem, dan Modul Ajar',
      },
    { href: '#/asesmen/ujian-online', ikon: 'ujian', warna: 'amber',
      judul: 'Ujian online', ket: 'Buat dan kelola asesmen' },
    { href: '#/asesmen/bank-soal', ikon: 'otomatis', warna: 'sky',
      judul: 'Bank soal', ket: 'Kelola kumpulan soal' },
  ].filter(Boolean);

  return item.map((a) => {
    const isi = `
      <span class="ale-aksi-ikon">${ikon(a.ikon)}</span>
      <span class="ale-aksi-teks">
        <strong>${esc(a.judul)}</strong><small>${esc(a.ket)}</small>
      </span>`;

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
             id="aleKartuJadwal" aria-labelledby="hJadwal">
      <div class="ale-kartu-kepala">
        <h2 class="ale-kartu-judul" id="hJadwal">${ikon('kalender')}Jadwal hari ini</h2>
        <span class="ale-chip" id="aleChipJadwal" hidden></span>
      </div>
      <div data-isi><p class="ale-kosong">Ringkasan jadwal belum tersedia di dasbor.</p></div>
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
            ${tileStat('aleStTugas',   'ale-stat-grape', 'tugas',    'Tugas terbaru',    false)}
            ${tileStat('aleStProgres', 'ale-stat-mint',  'progres',  'Nilai kuis', true)}
          </div>
        </section>

        <section class="ale-kartu ale-aksen-amber" id="aleKartuRiwayat" aria-labelledby="hRiwayat">
          <div class="ale-kartu-kepala">
            <h2 class="ale-kartu-judul" id="hRiwayat">${ikon('folder')}Riwayat terbaru</h2>
            <a class="ale-chip ale-chip-aksi" href="#/hasil">${ikon('panah')}Semua</a>
          </div>
          <div data-isi><p class="ale-kosong">Riwayat dokumen menunggu migrasi terenkripsi.</p></div>
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

        <section class="ale-kartu ale-aksen-emerald" id="aleKartuTugas" aria-labelledby="hTugas">
          <div class="ale-kartu-kepala">
            <h2 class="ale-kartu-judul" id="hTugas">${ikon('tugas')}Tugas terbaru</h2>
          </div>
          <div data-isi><p class="ale-kosong">Memuat tugas terbaru dari Ruang Kelas…</p></div>
        </section>

      </div>
    </div>`;
}

export const AKSI_ADMIN_SEKOLAH = [
  {
    href: '#/admin/pengguna/guru', ikon: 'pengguna', judul: 'Pengguna sekolah',
    ket: 'Tinjau akun guru, siswa, dan orang tua dalam tenant',
  },
  {
    href: '#/ruang-kelas', ikon: 'buku', judul: 'Ruang Kelas',
    ket: 'Kelola kelas belajar dan aktivitas LMS',
  },
  {
    href: '#/laporan/arsip-perencanaan', ikon: 'berkas', judul: 'Arsip perencanaan',
    ket: 'Buka dokumen perencanaan yang tersimpan',
  },
  {
    href: '#/asesmen/bank-soal', ikon: 'ujian', judul: 'Bank soal',
    ket: 'Tinjau kumpulan soal tenant sekolah',
  },
  {
    href: '#/chat', ikon: 'chat', judul: 'Komunikasi sekolah',
    ket: 'Buka percakapan dan grup sekolah',
  },
];

export const AKSI_SUPERADMIN = [
  {
    href: '#/platform/tenant/sekolah', ikon: 'gedung', judul: 'Daftar tenant',
    ket: 'Tinjau daftar sekolah dan status tenant',
  },
  {
    href: '#/platform/fitur/flags', ikon: 'saklar', judul: 'Fitur platform',
    ket: 'Feature flags, menu, dan izin peran',
  },
  {
    href: '#/platform/tenant/paket', ikon: 'badge', judul: 'Harga paket',
    ket: 'Tinjau katalog harga informatif tanpa transaksi',
  },
  {
    href: '#/platform/supabase-users', ikon: 'database', judul: 'Pengguna Supabase',
    ket: 'Identitas, tenant, dan peran terverifikasi',
  },
  {
    href: '#/platform/keamanan/audit', ikon: 'perisai', judul: 'Audit platform',
    ket: 'Tinjau perubahan kontrol yang dicatat server',
  },
  {
    href: '#/platform/dashboard/statistik', ikon: 'progres', judul: 'Statistik global',
    ket: 'Tinjau snapshot agregat platform yang tersedia',
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
            ? `<p><strong>Direktori platform.</strong> Tinjau sekolah dan admin sekolah secara baca-saja; perubahan tenant dan peran harus melalui backend tepercaya.</p>
               <p><strong>Rahasia dan infrastruktur.</strong> API key AI dikelola di server. Jangan memasukkan rahasia layanan ke aplikasi browser.</p>
               <p><strong>Statistik dan audit.</strong> Gunakan laporan sesuai sumber dan rentang data; ringkasan bukan telemetry historis atau metrik biaya.</p>`
            : `<p><strong>Akun sesuai kewenangan.</strong> Kelola guru, siswa, dan orang tua dalam tenant sekolah; persetujuan serta perubahan akun mengikuti alur resmi.</p>
               <p><strong>Dokumen dan asesmen.</strong> Tinjau arsip perencanaan dan bank soal sesuai akses sekolah.</p>
               <p><strong>Privasi komunikasi.</strong> Gunakan ringkasan agregat dan laporan; isi percakapan pribadi bukan untuk dipantau bebas.</p>`}
        </div>
      </section>
    </div>`;
}

export function tampilanPortal({ role, nama }) {
  const peran = LABEL_PERAN[role] || role || 'Pengguna';
  const ringkasan = role === 'siswa'
    ? 'Akses jadwal, materi, ujian, nilai, dan komunikasi yang disediakan sekolah untuk akun Anda.'
    : ['ortu', 'orang_tua'].includes(role)
      ? 'Tinjau informasi anak yang telah ditautkan sekolah dan gunakan kanal komunikasi resmi.'
      : role === 'operator'
        ? 'Buka area kerja operasional sesuai peran dan ruang lingkup sekolah Anda.'
        : 'Pilih menu yang tersedia untuk akun Anda. Setiap tautan membuka halaman sesuai peran.';
  const catatan = role === 'siswa'
    ? 'Jadwal yang diterbitkan guru, materi, tugas, kuis, presensi, ujian, dan nilai tersedia sesuai kelas serta data yang ditautkan sekolah. Jadwal pribadi guru tidak dibagikan ke siswa.'
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

// ============================================================================
// LOGIKA INSIALISASI
// ============================================================================
export async function halamanDashboard(wadah) {
  const { user, role, profile } = getState();
  if (!user) return () => {};
  const uid = user.uid;

  const sekarang   = new Date();
  const profilAwal = ambilProfil(uid);
  const namaAwal   = (profilAwal && profilAwal.nama) || namaDariUser(user);
  if (profile || profilAwal) perbaruiHeader(profile || profilAwal);

  const peran = String(role || '').toLowerCase().trim();
  if (peran === 'admin_sekolah' || peran === 'admin' || peran === 'superadmin') {
    const roleDashboard = peran === 'admin' ? 'admin_sekolah' : peran;
    wadah.innerHTML = tampilanAdmin({
      role: roleDashboard,
      nama: namaAwal,
      sekolah: profile?.sekolah || profilAwal?.sekolah || '',
    });
    document.title = `${LABEL_PERAN[roleDashboard]} · AI_nnoe Learning Ecosystem`;

    const profil = profile || profilAwal;
    if (profil && wadah.isConnected) {
      if (profil.nama) wadah.querySelector('#aleNamaHero').textContent = profil.nama;
      if (roleDashboard === 'admin_sekolah' && profil.sekolah) {
        wadah.querySelector('#aleAdminSekolah').textContent = profil.sekolah;
      }
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
  // Jadwal dibaca dari vault Drive hanya jika sesi Google dan kunci vault sudah aktif.
  // ------------------------------------------------------------------------
  const pemuat = {
    async jadwal() {
      const sesiGoogle = sesiGoogleWorkspacePerPengguna(uid);
      const identitas = identitasEnkripsiDriveDalamSesi(uid);
      if (!sesiGoogle || !identitas) {
        isiStat(st.jadwal, '—', 'vault belum dibuka');
        if (chipJadwal) chipJadwal.hidden = true;
        kosong(
          isi.jadwal,
          'Hubungkan Google Drive dan buka kunci vault untuk melihat jadwal terenkripsi.',
        );
        isi.jadwal.insertAdjacentHTML(
          'beforeend',
          '<p><a class="ale-tautan" href="#/pengaturan/google">Buka Google Workspace</a></p>',
        );
        return;
      }

      const jadwal = await muatJadwalGuruDrive(sesiGoogle.accessToken, identitas);
      const hariIni = new Date().getDay();
      const sesiHariIni = sesiUntukHari(jadwal.entries, hariIni);
      isiStat(st.jadwal, String(sesiHariIni.length), 'sesi hari ini');
      if (chipJadwal) {
        chipJadwal.hidden = sesiHariIni.length === 0;
        chipJadwal.textContent = `${sesiHariIni.length} sesi`;
      }
      if (!sesiHariIni.length) {
        kosong(isi.jadwal, 'Tidak ada sesi pada jadwal terenkripsi untuk hari ini.');
      } else {
        const items = sesiHariIni.map((sesi) => `
          <li>
            <span class="ale-chat-isi">
              <strong>${esc(sesi.mulai)}–${esc(sesi.selesai)}</strong>
              <span>${esc(sesi.mapel)} · ${esc(sesi.kelas)}</span>
            </span>
          </li>
        `).join('');
        isi.jadwal.innerHTML = `
          <ul class="ale-daftar">${items}</ul>
          <p class="ale-kosong">Jadwal legacy Firestore belum diimpor dan tidak ditampilkan.</p>
          <a class="ale-tautan" href="#/datadasar/jadwal">Kelola jadwal${ikon('panah')}</a>
        `;
      }
    },

    async tugas() {
      const { tenantId } = getState();
      if (!tenantId) {
        isiStat(st.tugas, '—', 'sekolah belum terhubung');
        kosong(isi.tugas, 'Akun belum terhubung ke sekolah aktif.');
        return;
      }
      const rooms = await muatDaftarRuangKelas(tenantId);
      const roomNames = new Map(rooms.map((room) => [room.id, room.nama]));
      const assignments = (await muatTugasUntukDasbor(
        tenantId,
        rooms.map((room) => room.id),
      )).map((assignment) => ({
        ...assignment,
        namaKelas: roomNames.get(assignment.classroomId) || 'Ruang Kelas',
      }));
      isiStat(st.tugas, String(assignments.length), 'tugas terbaru');
      if (!assignments.length) {
        kosong(isi.tugas, 'Belum ada tugas di kelas yang ditetapkan kepada Anda.');
        isi.tugas.insertAdjacentHTML(
          'beforeend',
          '<p><a class="ale-tautan" href="#/ruang-kelas">Buka Ruang Kelas</a></p>',
        );
        return;
      }
      isi.tugas.innerHTML = `
        <ul class="ale-daftar">${assignments.map((assignment) => `
          <li>
            <a class="ale-chat-baris" href="#/ruang-kelas?kelas=${encodeURIComponent(assignment.classroomId)}&tugas=${encodeURIComponent(assignment.id)}">
              <span class="ale-chat-isi">
                <strong>${esc(assignment.judul)}</strong>
                <span>${esc(assignment.namaKelas)} · tenggat ${esc(assignment.tenggat
                  ? new Intl.DateTimeFormat('id-ID', {
                    dateStyle: 'medium', timeStyle: 'short',
                  }).format(new Date(assignment.tenggat))
                  : 'tanpa tenggat')}</span>
              </span>
            </a>
          </li>`).join('')}
        </ul>
        <a class="ale-tautan" href="#/ruang-kelas">Lihat semua tugas${ikon('panah')}</a>`;
    },

    async progres() {
      const { tenantId } = getState();
      if (!tenantId) {
        isiStat(st.progres, '—', 'sekolah belum terhubung');
        isiBar(st.progres, null);
        return;
      }
      const rooms = await muatDaftarRuangKelas(tenantId);
      const sampledRooms = rooms.slice(0, 5);
      const resultsByRoom = await Promise.all(
        sampledRooms.map((room) => muatHasilKuisGuru(room.id)),
      );
      const summary = ringkasNilaiKuis(resultsByRoom.flat());
      if (summary.rataRata === null) {
        isiStat(st.progres, '—', 'belum ada hasil kuis');
        isiBar(st.progres, null);
        return;
      }
      const roomScope = rooms.length > sampledRooms.length
        ? `${sampledRooms.length} kelas terbaru`
        : `${sampledRooms.length} kelas`;
      isiStat(
        st.progres,
        String(summary.rataRata),
        `rata-rata ${summary.jumlahHasil} hasil · ${roomScope}`,
      );
      isiBar(st.progres, summary.rataRata);
    },

    async chat() {
      const daftar = await muatPercakapanTerbaruDasbor();
      if (chipChat) {
        chipChat.hidden = daftar.length === 0;
        chipChat.textContent = `${daftar.length}${daftar.length === 20 ? '+' : ''} percakapan terbaru`;
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
      if (peran !== 'guru') {
        kosong(isi.riwayat, 'Riwayat catatan kerja tersedia pada dasbor akun guru.');
        return;
      }
      const sesiGoogle = sesiGoogleWorkspacePerPengguna(uid);
      const identitas = identitasEnkripsiDriveDalamSesi(uid);
      if (!sesiGoogle || !identitas) {
        kosong(isi.riwayat, 'Hubungkan Google Drive dan buka kunci vault untuk melihat catatan terbaru.');
        isi.riwayat.insertAdjacentHTML(
          'beforeend',
          '<p><a class="ale-tautan" href="#/pengaturan/google">Buka Google Workspace</a></p>',
        );
        return;
      }

      const { entries } = await muatCatatanGuruDrive(
        sesiGoogle.accessToken,
        identitas,
        '',
        5,
      );
      const terbaru = entries
        .slice()
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      if (!terbaru.length) {
        kosong(isi.riwayat, 'Belum ada catatan kerja terenkripsi yang tersimpan.');
        isi.riwayat.insertAdjacentHTML(
          'beforeend',
          '<p><a class="ale-tautan" href="#/refleksi/pembelajaran">Buat catatan kerja</a></p>',
        );
        return;
      }

      isi.riwayat.innerHTML = `
        <ul class="ale-daftar">${terbaru.map((entry) => `
          <li>
            <a class="ale-chat-baris" href="#${escapeAttr(entry.modulePath)}">
              <span class="ale-chat-isi">
                <strong>${esc(entry.judul)}</strong>
                <span>${esc(entry.moduleLabel)} · diperbarui ${esc(formatWaktu(Date.parse(entry.updatedAt)))}</span>
              </span>
            </a>
          </li>`).join('')}
        </ul>
        <p><a class="ale-tautan" href="#/pengaturan/google">Kelola catatan terenkripsi di ruang kerja modul</a></p>`;
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
           <span>${esc(pesan)}</span>
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

  await muatSemua();

  // Cleanup: halaman ini tidak memasang listener global, jadi no-op.
  return () => {};
}