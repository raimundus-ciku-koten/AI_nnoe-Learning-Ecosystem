// web/src/pages/perencanaan.js
import './perencanaan/perencanaan.css';
/**
 * @file Halaman "Perencanaan Pembelajaran": daftar paket (hub) atau detail satu paket.
 *
 * Rute: '/perencanaan/:id?/:jenis?'
 * Mengembalikan fungsi pembersih (router memanggilnya saat berpindah halaman).
 *
 * Post-migrasi shell:
 *   - Router memasang sidebar + topbar dan menyediakan #slot-halaman
 *     yang SUDAH dikosongkan sebelum handler ini dipanggil.
 *   - Halaman hanya mengisi `wadah` dan mengembalikan cleanup.
 *   - Tidak perlu `kosongkan(wadah)` lagi (dilakukan router).
 *   - Tidak perlu `kerangka()` — sebelumnya fungsi itu membangun sidebar +
 *     topbar; sekarang keduanya sudah di shell.
 */
import { getState } from '../state.js';
import { h, toast, konfirmasi } from './perencanaan/ui/dom.js';
import { t } from './perencanaan/i18n/index.js';
import { KONTEKS_BAWAAN, bukaFormPaket } from './perencanaan/ui/form-paket.js';
import { halamanDetail } from './perencanaan/ui/halaman-detail.js';
import { buatPaket, dengarDaftarPaket, hapusPaket } from './perencanaan/services/repository.js';
import { daftarGuruPerencanaan } from './perencanaan/services/directory.js';
import { BATAS, JENIS } from './perencanaan/constants.js';

const PERAN_BOLEH = new Set(['guru', 'admin_sekolah', 'superadmin']);
const PERAN_ADMIN = new Set(['admin_sekolah', 'superadmin']);

// ============================================================================
// FALLBACK — bila modul perencanaan belum siap
// ============================================================================
function halamanPlaceholder(wadah) {
  wadah.innerHTML = `
    <section class="card empty-state">
      <h1>Perencanaan</h1>
      <p>Halaman perencanaan sedang dikembangkan.</p>
    </section>`;
  return () => {};
}

function modulSiap() {
  return typeof h === 'function'
      && typeof bukaFormPaket === 'function'
      && typeof halamanDetail === 'function'
      && typeof dengarDaftarPaket === 'function'
      && typeof buatPaket === 'function'
      && typeof hapusPaket === 'function'
      && typeof BATAS === 'object';
}

// ============================================================================
// HALAMAN UTAMA
// ============================================================================
/**
 * @param {HTMLElement} wadah  #slot-halaman (sudah dikosongkan router).
 * @param {{id?:string, jenis?:string, search?:string, params?:{id?:string, jenis?:string}}} [arg]
 *        Menerima ctx router baru ({ params: {...} }) maupun arg langsung
 *        ({ id, jenis }). Untuk fleksibilitas, kedua bentuk didukung.
 * @returns {() => void} fungsi pembersih
 */
export function halamanPerencanaan(wadah, arg = {}) {
  const params = arg.params || arg;
  const jenisQuery = new URLSearchParams(arg.search || '').get('jenis');

  if (!modulSiap()) {
    return halamanPlaceholder(wadah);
  }

  const { user, role, tenantId } = getState();

  // Guard peran/tenant
  if (!PERAN_BOLEH.has(role) || (role !== 'superadmin' && !tenantId) || !user?.uid) {
    wadah.append(
      h('p', { class: 'kotak kotak-galat', role: 'alert' }, t('hub.peranTidakBoleh'))
    );
    return () => {};
  }

  if (PERAN_ADMIN.has(role)) {
    return halamanPerencanaanAdmin(wadah, arg, { role, tenantId });
  }

  return halamanHub(wadah, arg, {
    uid: user.uid,
    tenantId,
    admin: false,
    guruNama: user.displayName ?? '',
    baseRoute: '#/perencanaan',
    jenisQuery,
  });
}

function halamanPerencanaanAdmin(wadah, arg, { role, tenantId }) {
  let aktif = true;
  let cleanup = () => {};
  const params = arg.params || {};
  const guruUid = new URLSearchParams(arg.search || '').get('guru') || '';
  const baseRoute = '#/admin/perencanaan/paket';
  wadah.append(h('p', { class: 'memuat', role: 'status' }, t('umum.memuat')));

  daftarGuruPerencanaan(role === 'admin_sekolah' ? tenantId : '').then((guru) => {
    if (!aktif) return;
    if (!guruUid) {
      const daftar = h('ul', { class: 'grid daftar-paket', role: 'list' },
        guru.map((akun) => h('li', { class: 'kartu kartu-paket' },
          h('h3', null, akun.nama || t('hub.guruTanpaNama')),
          h('p', { class: 'meta' }, akun.tenantId || ''),
          h('a', {
            class: 'tombol',
            href: `${baseRoute}?guru=${encodeURIComponent(akun.uid)}`,
          }, t('hub.kelolaPaket')))));
      wadah.replaceChildren(
        h('div', { class: 'hub-kepala' }, h('h2', null, t('hub.pilihGuru'))),
        h('p', { class: 'meta' }, t('hub.pilihGuruDeskripsi')),
        guru.length ? daftar : h('p', { class: 'kosong-besar' }, t('hub.tidakAdaGuru'))
      );
      return;
    }

    const akun = guru.find((item) => item.uid === guruUid);
    if (!akun) {
      wadah.replaceChildren(
        h('p', { class: 'kotak kotak-galat', role: 'alert' }, t('hub.guruTidakDitemukan')),
        h('a', { href: baseRoute, class: 'tombol tombol-sekunder' }, t('hub.pilihGuru'))
      );
      return;
    }

    const jenisQuery = new URLSearchParams(arg.search || '').get('jenis');
    wadah.replaceChildren();
    cleanup = halamanHub(wadah, arg, {
      uid: akun.uid,
      tenantId: akun.tenantId,
      admin: true,
      guruNama: akun.nama || akun.uid,
      baseRoute,
      guruUid,
      jenisQuery,
      params,
    });
  }).catch((error) => {
    if (!aktif) return;
    console.error('[perencanaan] Gagal memuat direktori guru:', error);
    wadah.replaceChildren(h('p', { class: 'kotak kotak-galat', role: 'alert' }, t('galat.AKSES_DITOLAK')));
  });

  return () => {
    aktif = false;
    cleanup();
  };
}

function halamanHub(wadah, arg, { uid, tenantId, admin, guruNama, baseRoute, guruUid = '', jenisQuery = '', params = arg.params || arg }) {
  const queryGuru = guruUid ? `?guru=${encodeURIComponent(guruUid)}` : '';
  const jenisPilihan = Object.values(JENIS).includes(jenisQuery) ? jenisQuery : '';
  const tautanPaket = (id = '', jenis = '') =>
    `${baseRoute}${id ? `/${id}${jenis ? `/${jenis}` : ''}` : ''}${queryGuru}`;

  // Detail paket
  if (params.id) {
    return halamanDetail(wadah, {
      uid,
      tenantId,
      paketId: params.id,
      jenis: params.jenis,
      search: arg.search,
      canEditPackage: admin,
      canGenerateDocuments: !admin,
      routeBase: baseRoute,
      guruUid,
    });
  }

  // --------------------------------------------------------------------------
  // Hub: daftar paket
  // --------------------------------------------------------------------------
  let daftar = null;
  const isi = h('div', null);

  const baru = () => bukaFormPaket({
    judul: t('hub.paketBaru'),
    awal: {
      ...KONTEKS_BAWAAN,
      identitas: { ...KONTEKS_BAWAAN.identitas, guru: guruNama },
    },
    onSimpan: async (konteks) => {
      const id = await buatPaket({
        uid,
        tenantId,
        konteks,
        jumlahPaketSaatIni: daftar?.length ?? 0,
      });
      location.hash = tautanPaket(id, jenisPilihan).slice(1);
    },
  });

  const kartu = (p) => h('li', { class: 'kartu kartu-paket' },
    h('h3', null, p.mapel),
    h('p', { class: 'meta' },
      `${t('umum.kelas')} ${p.kelas} · ${t('umum.fase')} ${p.fase} · ${p.tahunAjaran}`),
    h('div', { class: 'bilah-aksi' },
      h('a', {
        class: 'tombol',
        href: tautanPaket(p.id, jenisPilihan),
        'aria-label': t('hub.bukaPaket', { nama: p.mapel }),
      }, t('umum.buka')),
      admin ? h('button', {
        type: 'button',
        class: 'tombol tombol-bahaya tombol-sekunder',
        'aria-label': t('hub.hapusPaket', { nama: p.mapel }),
        onClick: async () => {
          const yakin = await konfirmasi(
            t('hub.konfirmasiHapus', { nama: p.mapel }),
            { ya: t('umum.hapus'), bahaya: true }
          );
          if (!yakin) return;
          try {
            await hapusPaket(uid, tenantId, p.id);
            toast(t('hub.terhapus'), 'sukses');
          } catch {
            toast(t('galat.UMUM'), 'galat');
          }
        },
      }, t('umum.hapus')) : null
    )
  );

  const gambar = () => {
    isi.replaceChildren();
    if (daftar === null) {
      isi.append(h('p', { class: 'memuat', role: 'status' }, t('umum.memuat')));
      return;
    }
    if (!daftar.length) {
      isi.append(
        h('div', { class: 'kosong-besar' },
          h('p', null, t(admin ? 'hub.kosong' : 'hub.kosongGuru')),
          admin ? h('button', { type: 'button', class: 'tombol', onClick: baru }, t('hub.paketBaru')) : null
        )
      );
      return;
    }
    isi.append(
      h('ul', { class: 'grid daftar-paket', role: 'list' }, daftar.map(kartu))
    );
  };

  wadah.append(
    h('div', { class: 'hub-kepala' },
      h('h2', null, admin ? t('hub.judulUntukGuru', { nama: guruNama }) : t('hub.judul')),
      admin ? h('button', {
        type: 'button',
        class: 'tombol',
        disabled: (daftar?.length ?? 0) >= BATAS.PAKET_MAKS_PER_GURU,
        onClick: baru,
      }, t('hub.paketBaru')) : null
    ),
    admin ? h('a', { class: 'tautan-kembali', href: baseRoute }, `← ${t('hub.pilihGuru')}`) : null,
    h('p', { class: admin ? 'meta' : 'kotak kotak-info', role: admin ? null : 'note' },
      admin ? t('hub.deskripsi') : t('hub.paketTerkunci')),
    isi
  );
  gambar();

  // Listener realtime daftar paket — kembalikan unsubscribe-nya sebagai cleanup.
  const berhenti = dengarDaftarPaket(
    uid,
    tenantId,
    (d) => { daftar = d; gambar(); },
    (e) => {
      toast(
        t(e?.code === 'permission-denied' ? 'galat.AKSES_DITOLAK' : 'galat.UMUM'),
        'galat'
      );
    }
  );

  return berhenti;
}