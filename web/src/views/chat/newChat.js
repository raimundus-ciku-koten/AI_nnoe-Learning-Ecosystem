// web/src/views/chat/newChat.js
/**
 * newChat.js — Buat grup baru (rute /chat/baru).
 * Chat pribadi TIDAK dibuat di sini: harus lewat Kontak (permintaan → persetujuan).
 */
import { h, clear, initials } from '../../utils/dom.js';
import { getState } from '../../state.js';
import { navigate } from '../../router.js';
import { toast } from '../../utils/toast.js';
import { buatGrup } from '../../services/chat.js';
import { muatDirektori } from '../../services/contacts.js';
import { MAKS_ANGGOTA_GRUP, MAKS_JUDUL, pesanGalatChat } from '../../utils/chatUtil.js';
import { LABEL_PERAN } from '../../ui.js';
import { buatTabChat } from './chatTabs.js';

export async function tampilkanChatBaru(outlet) {
  const { user, profile } = getState();
  if (!user) { navigate('/login'); return () => {}; }
  const saya = { uid: user.uid, nama: profile?.nama || user.displayName || user.email || 'Pengguna' };

  const dipilih = new Map(); // uid → { uid, nama }
  let semua = [];
  let kata = '';
  let sedangMembuat = false;

  const tab = buatTabChat('group');
  const penghitung = h('small', { class: 'text-muted', 'aria-live': 'polite' });
  const daftar = h('div', { class: 'list-group chat-pilih-anggota' });
  const namaGrup = h('input', {
    class: 'form-control mb-2', placeholder: 'Nama grup, mis. Wali Kelas X',
    maxlength: MAKS_JUDUL, 'aria-label': 'Nama grup'
  });
  const cari = h('input', {
    class: 'form-control', type: 'search', placeholder: 'Cari nama…', autocomplete: 'off',
    'aria-label': 'Cari anggota',
    oninput: () => { kata = cari.value.trim().toLowerCase(); isi(); }
  });
  const tombolBuat = h('button', { class: 'btn btn-ale', type: 'button', onclick: buat }, 'Buat grup');

  function perbaruiPenghitung() {
    penghitung.textContent = `${dipilih.size} dipilih (maks. ${MAKS_ANGGOTA_GRUP - 1} anggota selain Anda)`;
  }

  async function buat() {
    if (sedangMembuat) return;
    const nama = namaGrup.value.trim();
    if (!nama) { toast('Isi nama grup.', 'error'); namaGrup.focus(); return; }
    if (dipilih.size < 1) { toast('Pilih minimal satu anggota.', 'error'); return; }
    sedangMembuat = true;
    tombolBuat.disabled = true;
    try {
      const id = await buatGrup(saya, nama, [...dipilih.values()]);
      navigate(`/chat/${id}`);
    } catch (error) {
      console.error('[chat] buat grup gagal:', error);
      toast(error.message && !error.code ? error.message : pesanGalatChat(error), 'error');
      sedangMembuat = false;
      tombolBuat.disabled = false;
    }
  }

  function isi() {
    clear(daftar);
    const tampil = semua.filter((o) => !kata || o.nama.toLowerCase().includes(kata));
    if (tampil.length === 0) {
      daftar.append(h('p', { class: 'empty-state' }, 'Tidak ada pengguna yang cocok.'));
      return;
    }
    for (const o of tampil) {
      const cek = h('input', {
        type: 'checkbox', class: 'form-check-input m-0',
        checked: dipilih.has(o.uid),
        onchange: (e) => {
          if (e.target.checked) {
            if (dipilih.size >= MAKS_ANGGOTA_GRUP - 1) {
              e.target.checked = false;
              toast(`Grup maksimal ${MAKS_ANGGOTA_GRUP} anggota.`, 'error');
              return;
            }
            dipilih.set(o.uid, { uid: o.uid, nama: o.nama });
          } else dipilih.delete(o.uid);
          perbaruiPenghitung();
        }
      });
      daftar.append(h('label', { class: 'list-group-item d-flex align-items-center gap-2' },
        cek,
        h('span', { class: 'avatar avatar-sm' }, initials(o.nama)),
        o.nama,
        h('small', { class: 'ms-auto text-muted' }, LABEL_PERAN[o.role] ?? o.role ?? '')));
    }
  }

  const isiKartu = h('div', { class: 'mt-2' }, h('p', { class: 'text-muted small' }, 'Memuat daftar pengguna…'));

  outlet.append(h('div', { class: 'chat-halaman-sempit' },
    tab.el,
    h('div', { class: 'card-ale', style: 'max-width:640px;margin:0 auto' },
      h('div', { class: 'd-flex align-items-center gap-2 mb-3' },
        h('a', { href: '#/chat/grup', class: 'btn btn-sm btn-light', 'aria-label': 'Kembali' },
          h('i', { class: 'bi bi-arrow-left', 'aria-hidden': 'true' })),
        h('h1', { class: 'h5 mb-0' }, 'Buat grup baru')),
      namaGrup, cari, penghitung, isiKartu,
      h('div', { class: 'mt-3' }, tombolBuat))));
  perbaruiPenghitung();

  let aktif = true;
  try {
    semua = await muatDirektori();
    if (aktif) { isiKartu.replaceWith(daftar); isi(); }
  } catch (error) {
    console.error('[chat] direktori gagal dimuat:', error);
    isiKartu.replaceChildren(h('p', { class: 'text-danger small' }, 'Gagal memuat daftar pengguna. Muat ulang halaman.'));
  }
  return () => { aktif = false; try { tab.berhenti(); } catch { /* abaikan */ } };
}
