// web/src/views/chat/chatList.js
/**
 * chatList.js — Daftar percakapan (kolom kiri).
 * Berlangganan ke store; tidak punya listener database sendiri.
 *
 * jenis = 'direct' → Semua Percakapan (hanya individu)
 * jenis = 'group'  → Grup
 */
import { h, clear, initials } from '../../utils/dom.js';
import { getState, subscribe } from '../../state.js';
import { waktuDaftar } from '../../utils/chatUtil.js';

/** Jenis sebuah chat. Cadangan: id berawalan "d_" = percakapan pribadi. */
export const jenisChat = (c) =>
  c.type || (String(c.id).startsWith('d_') ? 'direct' : 'group');

const KONFIG = {
  direct: {
    judul: 'Percakapan', href: '#/chat/kontak', tombol: 'Baru',
    cari: 'Cari percakapan…', namaCadangan: 'Percakapan',
    kosong: 'Belum ada percakapan. Pilih orang dari Kontak untuk mulai chat.',
    tidakCocok: 'Tidak ada percakapan yang cocok.'
  },
  group: {
    judul: 'Grup', href: '#/chat/baru', tombol: 'Buat grup',
    cari: 'Cari grup…', namaCadangan: 'Grup',
    kosong: 'Belum ada grup. Buat grup baru dengan tombol di atas.',
    tidakCocok: 'Tidak ada grup yang cocok.'
  }
};

export function gambarDaftar(panel, aktifId, jenis = 'direct') {
  const state0 = getState();
  if (!state0.user) return () => {};
  const saya = state0.user.uid;
  const k = KONFIG[jenis] || KONFIG.direct;

  let kata = '';
  let chatsTerakhir = null;

  const daftar = h('div', { class: 'chat-daftar-isi', role: 'list' });
  const cari = h('input', {
    type: 'search', class: 'form-control form-control-sm',
    placeholder: k.cari, 'aria-label': k.cari, autocomplete: 'off',
    oninput: () => { kata = cari.value.trim().toLowerCase(); isi(getState(), true); }
  });

  function isi(state, paksa = false) {
    // subscribe() dipanggil untuk SETIAP setState (route, dll.). Gambar ulang hanya bila daftar berubah.
    if (!paksa && state.chats === chatsTerakhir) return;
    chatsTerakhir = state.chats;

    const tampil = (state.chats || []).filter((c) =>
      jenisChat(c) === jenis &&
      (!kata || `${c.name || ''} ${c.lastText || ''}`.toLowerCase().includes(kata))
    );

    clear(daftar);
    if (tampil.length === 0) {
      daftar.append(h('p', { class: 'empty-state' }, kata ? k.tidakCocok : k.kosong));
      return;
    }

    for (const c of tampil) {
      const prefiks = c.lastSender === saya ? 'Anda: ' : '';
      const aktif = c.id === aktifId;
      daftar.append(
        h('a', {
          href: `#/chat/${encodeURIComponent(c.id)}`,
          role: 'listitem',
          class: `chat-item${aktif ? ' aktif' : ''}${c.unread ? ' belum-dibaca' : ''}`,
          'aria-current': aktif ? 'true' : null
        },
          h('span', { class: 'avatar' },
            jenis === 'group' ? h('i', { class: 'bi bi-people-fill', 'aria-hidden': 'true' }) : initials(c.name)),
          h('span', { class: 'chat-item-teks' },
            h('strong', {}, c.name || k.namaCadangan),
            h('small', {}, c.lastText ? `${prefiks}${c.lastText}` : 'Belum ada pesan')),
          h('span', { class: 'chat-item-meta' },
            h('small', {}, waktuDaftar(c.lastTs)),
            c.unread
              ? h('span', { class: 'chat-lencana', 'aria-label': `${c.unread} belum dibaca` },
                  c.unread > 99 ? '99+' : String(c.unread))
              : null))
      );
    }
  }

  panel.append(
    h('div', { class: 'chat-daftar-kepala' },
      h('h1', { class: 'h5 mb-0' }, k.judul),
      h('a', { href: k.href, class: 'btn btn-sm btn-ale' },
        h('i', { class: 'bi bi-plus-lg', 'aria-hidden': 'true' }), ` ${k.tombol}`)),
    h('div', { class: 'p-2' }, cari),
    daftar
  );

  isi(getState(), true);
  return subscribe((s) => isi(s));
}
