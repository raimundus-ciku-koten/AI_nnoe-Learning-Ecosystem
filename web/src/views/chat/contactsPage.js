// web/src/views/chat/contactsPage.js
/**
 * contactsPage.js — Rute /chat/kontak. Tiga tab:
 *   Kontak     → kontak yang sudah disetujui (klik = buka chat)
 *   Permintaan → masuk (Terima/Tolak) dan terkirim (Batalkan)
 *   Cari Orang → direktori sekolah; kirim permintaan kontak
 *
 * Sumber data:
 *   - Kontak & permintaan: state.kontak (satu listener global di chatSync.js)
 *   - Orang: direktori profil Supabase (dibatasi tenant; tanpa email/data privat)
 *
 * Mengembalikan cleanup → dilepas router.
 */
import { h, clear, initials } from '../../utils/dom.js';
import { getState, subscribe } from '../../state.js';
import { navigate } from '../../router.js';
import { toast } from '../../utils/toast.js';
import { LABEL_PERAN } from '../../ui.js';
import { pesanGalatChat } from '../../utils/chatUtil.js';
import { mulaiChatPribadi } from '../../services/chat.js';
import { urlFotoAman } from '../../services/protectedMedia.js';
import {
  kirimPermintaan, terimaPermintaan, hapusKontak, muatDirektori
} from '../../services/contacts.js';
import { buatTabChat } from './chatTabs.js';

const FILTER = [
  { id: 'semua', label: 'Semua' },
  { id: 'guru', label: 'Guru' },
  { id: 'siswa', label: 'Siswa' },
  { id: 'ortu', label: 'Orang Tua' },
  { id: 'operator', label: 'Operator' },
  { id: 'admin', label: 'Admin' }
];
const ROLE_ADMIN = ['admin', 'admin_sekolah', 'superadmin'];
const ROLE_ORTU = ['ortu', 'orang_tua'];
const LABEL_CARI_ROLE = {
  admin: 'Admin Sekolah dan Super Admin',
  admin_sekolah: 'Admin Sekolah',
  orang_tua: 'Orang Tua',
  ortu: 'Orang Tua',
};
const TAB = [
  { id: 'kontak', label: 'Kontak' },
  { id: 'permintaan', label: 'Permintaan' },
  { id: 'cari', label: 'Cari Orang' }
];

export async function tampilkanKontak(wadah) {
  const { user, profile } = getState();
  if (!user) { navigate('/login'); return () => {}; }
  const saya = { uid: user.uid, nama: profile?.nama || user.displayName || user.email || 'Pengguna' };

  let tabAktif = 'kontak';
  let filterAktif = 'semua';
  let kata = '';
  let orang = [];
  let orangSiap = false;
  let orangGalat = '';
  let debounce;
  let aktif = true;
  let kontakTerakhir = null;
  const sibuk = new Set(); // id/uid yang sedang diproses (cegah klik ganda)

  const tabChat = buatTabChat('kontak');
  const petunjukKontak = getState().role === 'superadmin'
    ? 'Superadmin dapat langsung chat, telepon, dan video call pengguna aktif di semua instansi.'
    : 'Pengguna satu instansi dapat langsung chat. Untuk lintas instansi, kirim permintaan kontak terlebih dahulu.';
  const panelTab = h('div', { class: 'chat-subtab', role: 'tablist' });
  const kepalaCari = h('div', { class: 'chat-contacts__alat' });
  const isi = h('div', { class: 'chat-contacts__list', 'aria-live': 'polite' });

  const cariEl = h('input', {
    type: 'search', class: 'chat-contacts__search', placeholder: 'Cari nama atau peran…',
    autocomplete: 'off', 'aria-label': 'Cari orang',
    oninput: (e) => {
      clearTimeout(debounce);
      const v = e.target.value;
      debounce = setTimeout(() => { kata = v.toLowerCase().trim(); gambar(); }, 150);
    }
  });
  const chipEl = h('div', { class: 'chat-contacts__filter' },
    FILTER.map((f) => h('button', {
      type: 'button', class: `chip${f.id === filterAktif ? ' chip--aktif' : ''}`, 'data-filter': f.id,
      onclick: () => {
        filterAktif = f.id;
        chipEl.querySelectorAll('.chip').forEach((c) => c.classList.toggle('chip--aktif', c.dataset.filter === f.id));
        gambar();
      }
    }, f.label)));
  kepalaCari.append(cariEl, chipEl);

  wadah.append(h('section', { class: 'chat-contacts' },
    tabChat.el,
    h('header', { class: 'chat-contacts__head' },
      h('div', {}, h('h2', {}, 'Kontak'),
      h('p', { class: 'muted' }, petunjukKontak))),
    panelTab, kepalaCari, isi));

  /* ---------- helper data ---------- */
  const kontak = () => getState().kontak || [];
  const statusDengan = (uid) => kontak().find((k) => k.peerUid === uid);
  const cocokFilter = (u) => {
    if (filterAktif === 'semua') return true;
    const r = u.role || 'guru';
    if (filterAktif === 'admin') return ROLE_ADMIN.includes(r);
    if (filterAktif === 'ortu') return ROLE_ORTU.includes(r);
    return r === filterAktif;
  };

  async function jalankan(kunci, fn, pesanSukses) {
    if (sibuk.has(kunci)) return;
    sibuk.add(kunci);
    gambar();
    try {
      await fn();
      if (pesanSukses) toast(pesanSukses, 'success');
    } catch (e) {
      console.error('[kontak] aksi gagal:', e);
      toast(pesanGalatChat(e), 'error');
    } finally {
      sibuk.delete(kunci);
      if (aktif) gambar();
    }
  }

  async function bukaChat(peerUid, nama) {
    await jalankan(`chat:${peerUid}`, async () => {
      const id = await mulaiChatPribadi(saya, { uid: peerUid, nama });
      navigate(`/chat/${id}`);
    });
  }

  /* ---------- komponen baris ---------- */
  function avatar(nama, foto) {
    const image = urlFotoAman(foto)
      ? h('img', {
        src: foto,
        alt: '',
        loading: 'lazy',
        referrerpolicy: 'no-referrer',
      })
      : null;
    return h('span', { class: 'avatar' },
      image
        ? image
        : initials(nama));
  }

  function baris({ nama, sub, role, foto, aksi, onKlik }) {
    const kiri = [
      avatar(nama, foto),
      h('span', { class: 'meta' }, h('span', { class: 'nama' }, nama), sub ? h('span', { class: 'sub muted' }, sub) : null),
      role ? h('span', { class: `chat-peran chat-peran--${role}` }, LABEL_PERAN[role] || role) : null
    ];
    const el = h('div', { class: 'chat-contact-item' },
      onKlik
        ? h('button', { type: 'button', class: 'chat-contact-item__utama', onclick: onKlik }, kiri)
        : h('div', { class: 'chat-contact-item__utama' }, kiri),
      h('span', { class: 'chat-contact-item__aksi' }, aksi || []));
    return el;
  }

  const tombol = (label, kelas, onclick, nonaktif = false) =>
    h('button', { type: 'button', class: `btn btn-sm ${kelas}`, onclick, disabled: nonaktif }, label);

  /* ---------- tab ---------- */
  function gambarTab() {
    const masuk = kontak().filter((k) => k.status === 'pending' && k.arah === 'masuk').length;
    panelTab.replaceChildren(...TAB.map((t) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': t.id === tabAktif ? 'true' : 'false',
      class: `chat-subtab__item${t.id === tabAktif ? ' aktif' : ''}`,
      onclick: () => { tabAktif = t.id; gambar(); }
    }, t.label, t.id === 'permintaan' && masuk > 0 ? h('span', { class: 'chat-lencana' }, String(masuk)) : null)));
    kepalaCari.hidden = tabAktif !== 'cari';
  }

  function tabKontak() {
    const terlihat = new Map(kontak()
      .filter((k) => k.status === 'accepted')
      .map((k) => [k.peerUid, {
        uid: k.peerUid,
        nama: k.name,
        contact: k,
        sameInstansi: false,
      }]));
    orang
      .filter((person) => person.sameInstansi || getState().role === 'superadmin')
      .forEach((person) => {
        terlihat.set(person.uid, { ...person, contact: statusDengan(person.uid) });
      });
    const aksi = [...terlihat.values()]
      .sort((a, b) => (a.nama || '').localeCompare(b.nama || '', 'id'));
    if (!aksi.length) return [h('p', { class: 'muted' }, 'Belum ada kontak. Buka tab "Cari Orang" untuk mengirim permintaan.')];
    return aksi.map((person) => {
      const relation = person.contact;
      const peerUid = person.uid;
      const nama = person.nama || 'Pengguna';
      const tindakan = [
        tombol('Chat', 'btn-ale', () => bukaChat(peerUid, nama), sibuk.has(`chat:${peerUid}`)),
      ];
      if (relation?.status === 'accepted' && !person.sameInstansi && getState().role !== 'superadmin') {
        tindakan.push(tombol('Hapus', 'btn-outline-danger', () => {
          if (window.confirm(`Hapus ${nama} dari kontak? Riwayat chat tetap ada.`)) {
            jalankan(`hapus:${relation.id}`, () => hapusKontak(saya, relation.id), 'Kontak dihapus.');
          }
        }, sibuk.has(`hapus:${relation.id}`)));
      }
      return baris({
        nama,
        sub: person.sameInstansi
          ? 'Instansi Anda'
          : getState().role === 'superadmin' ? 'Semua instansi' : 'Kontak lintas instansi',
        role: person.role,
        foto: person.photoUrl,
        onKlik: () => bukaChat(peerUid, nama),
        aksi: tindakan,
      });
    });
  }

  function tabPermintaan() {
    const pending = kontak().filter((k) => k.status === 'pending');
    const masuk = pending.filter((k) => k.arah === 'masuk');
    const keluar = pending.filter((k) => k.arah === 'keluar');
    const hasil = [];
    hasil.push(h('h3', { class: 'chat-contacts__judul' }, `Masuk (${masuk.length})`));
    if (!masuk.length) hasil.push(h('p', { class: 'muted' }, 'Tidak ada permintaan masuk.'));
    masuk.forEach((k) => hasil.push(baris({
      nama: k.name || 'Pengguna',
      aksi: [
        tombol('Terima', 'btn-ale', () => jalankan(`terima:${k.id}`, async () => {
          await terimaPermintaan(saya, k.id);
          await mulaiChatPribadi(saya, { uid: k.peerUid, nama: k.name });
        }, 'Permintaan diterima.'), sibuk.has(`terima:${k.id}`)),
        tombol('Tolak', 'btn-outline-secondary', () =>
          jalankan(`tolak:${k.id}`, () => hapusKontak(saya, k.id), 'Permintaan ditolak.'), sibuk.has(`tolak:${k.id}`))
      ]
    })));
    hasil.push(h('h3', { class: 'chat-contacts__judul' }, `Terkirim (${keluar.length})`));
    if (!keluar.length) hasil.push(h('p', { class: 'muted' }, 'Tidak ada permintaan terkirim.'));
    keluar.forEach((k) => hasil.push(baris({
      nama: k.name || 'Pengguna', sub: 'Menunggu persetujuan',
      aksi: [tombol('Batalkan', 'btn-outline-secondary', () =>
        jalankan(`batal:${k.id}`, () => hapusKontak(saya, k.id), 'Permintaan dibatalkan.'), sibuk.has(`batal:${k.id}`))]
    })));
    return hasil;
  }

  function tabCari() {
    if (orangGalat) return [h('div', { class: 'chat-contacts__error' }, h('p', {}, orangGalat))];
    if (!orangSiap) return [h('p', { class: 'muted' }, 'Memuat daftar pengguna…')];
    if (!orang.length) return [h('p', { class: 'muted' },
      'Belum ada pengguna lain pada direktori. Pastikan akun telah diberi peran dan sekolah oleh administrator.')];

    const cocok = orang.filter((u) => cocokFilter(u) &&
      (!kata || `${u.nama} ${LABEL_CARI_ROLE[u.role] || LABEL_PERAN[u.role] || u.role || ''}`.toLowerCase().includes(kata)));
    if (!cocok.length) return [h('p', { class: 'muted' }, 'Tidak ada pengguna yang cocok.')];

    return cocok.map((u) => {
      const st = statusDengan(u.uid);
      const id = st?.id;
      let aksi;
      if (st?.status === 'accepted' || u.sameInstansi || getState().role === 'superadmin') {
        aksi = [tombol('Chat', 'btn-ale', () => bukaChat(u.uid, u.nama), sibuk.has(`chat:${u.uid}`))];
      } else if (st?.status === 'pending' && st.arah === 'keluar') {
        aksi = [tombol('Menunggu', 'btn-light', () => {}, true)];
      } else if (st?.status === 'pending' && st.arah === 'masuk') {
        aksi = [tombol('Terima', 'btn-ale', () => jalankan(`terima:${id}`, async () => {
          await terimaPermintaan(saya, id);
          await mulaiChatPribadi(saya, { uid: u.uid, nama: u.nama });
        }, 'Permintaan diterima.'), sibuk.has(`terima:${id}`))];
      } else {
        aksi = [tombol('Tambah kontak', 'btn-outline-primary', () =>
          jalankan(`kirim:${u.uid}`, () => kirimPermintaan(saya, { uid: u.uid, nama: u.nama }), 'Permintaan terkirim.'),
          sibuk.has(`kirim:${u.uid}`))];
      }
      return baris({ nama: u.nama, role: u.role, foto: u.photoUrl, aksi });
    });
  }

  function gambar() {
    if (!aktif) return;
    gambarTab();
    const bagian = tabAktif === 'kontak' ? tabKontak() : tabAktif === 'permintaan' ? tabPermintaan() : tabCari();
    clear(isi);
    isi.append(...bagian);
  }

  /* ---------- muat seluruh direktori terdaftar (di latar; cache 5 menit) ---------- */
  async function muatOrang() {
    try {
      orang = await muatDirektori();
      orangGalat = '';
    } catch (e) {
      console.error('[kontak] direktori gagal dimuat:', e);
      orangGalat = e?.code === 'permission-denied'
        ? 'Akses ke direktori ditolak. Pastikan akun Anda terhubung ke sekolah dan kebijakan akses terbaru sudah diterapkan.'
        : 'Gagal memuat daftar pengguna. Periksa koneksi lalu muat ulang halaman.';
    }
    orangSiap = true;
    gambar();
  }
  muatOrang();

  gambar();
  const berhenti = subscribe((s) => {
    if (s.kontak === kontakTerakhir) return; // abaikan setState lain
    kontakTerakhir = s.kontak;
    gambar();
  });

  return () => {
    aktif = false;
    berhenti();
    clearTimeout(debounce);
    try { tabChat.berhenti(); } catch { /* abaikan */ }
  };
}
