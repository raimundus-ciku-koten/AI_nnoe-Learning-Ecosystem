// web/src/views/chat/chatTabs.js
/**
 * Tab navigasi antar-bagian chat: Percakapan | Grup | Kontak.
 * Lencana (belum dibaca, permintaan masuk) diperbarui realtime dari state.
 *
 * @param {'direct'|'group'|'kontak'} aktif
 * @returns {{ el: HTMLElement, berhenti: () => void }}
 */
import { h } from '../../utils/dom.js';
import { getState, subscribe } from '../../state.js';
import { jenisChat } from './chatList.js';

const TAB = [
  { id: 'direct', label: 'Percakapan', href: '#/chat',        ikon: 'bi-chat-dots' },
  { id: 'group',  label: 'Grup',       href: '#/chat/grup',   ikon: 'bi-people' },
  { id: 'kontak', label: 'Kontak',     href: '#/chat/kontak', ikon: 'bi-person-lines-fill' }
];

function hitung(state) {
  const chats = state.chats || [];
  const unread = (j) => chats.filter((c) => jenisChat(c) === j)
    .reduce((n, c) => n + (Number(c.unread) || 0), 0);
  return { direct: unread('direct'), group: unread('group'), kontak: state.permintaanMasuk || 0 };
}

export function buatTabChat(aktif) {
  const lencana = {};
  const el = h('nav', { class: 'chat-tab', 'aria-label': 'Bagian chat' },
    TAB.map((t) => {
      const b = h('span', { class: 'chat-lencana', hidden: true });
      lencana[t.id] = b;
      return h('a', {
        href: t.href,
        class: `chat-tab__item${t.id === aktif ? ' aktif' : ''}`,
        'aria-current': t.id === aktif ? 'page' : null
      }, h('i', { class: `bi ${t.ikon}`, 'aria-hidden': 'true' }), h('span', {}, t.label), b);
    })
  );

  const terapkan = (state) => {
    const n = hitung(state);
    for (const id of Object.keys(lencana)) {
      const jumlah = n[id];
      lencana[id].hidden = jumlah <= 0;
      lencana[id].textContent = jumlah > 99 ? '99+' : String(jumlah);
    }
  };
  terapkan(getState());
  const berhenti = subscribe(terapkan);
  return { el, berhenti };
}
