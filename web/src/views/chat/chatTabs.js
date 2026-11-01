// web/src/views/chat/chatTabs.js
/**
 * Tab navigasi antar-bagian komunikasi.
 * Lencana (belum dibaca, permintaan masuk) diperbarui realtime dari state.
 *
 * @param {'direct'|'chat'|'group'|'telepon'|'video'|'kontak'} aktif
 * @returns {{ el: HTMLElement, berhenti: () => void }}
 */
import { h } from '../../utils/dom.js';
import { getState, subscribe } from '../../state.js';
import { jenisChat } from './chatList.js';

export const CHAT_TABS = Object.freeze([
  { id: 'chat', label: 'Chat', href: '#/chat', ikon: 'bi-chat-dots' },
  { id: 'group', label: 'Grup', href: '#/chat/grup', ikon: 'bi-people' },
  { id: 'telepon', label: 'Telepon', href: '#/chat/telepon', ikon: 'bi-telephone' },
  { id: 'video', label: 'Video Call', href: '#/chat/video', ikon: 'bi-camera-video' },
  { id: 'kontak', label: 'Kontak', href: '#/chat/kontak', ikon: 'bi-person-lines-fill' },
]);

const TAB_ALIAS = { direct: 'chat' };

export function hitungLencanaTab(state) {
  const chats = state.chats || [];
  const unread = (j) => chats.filter((c) => jenisChat(c) === j)
    .reduce((n, c) => n + (Number(c.unread) || 0), 0);
  return { chat: unread('direct'), group: unread('group'), kontak: state.permintaanMasuk || 0 };
}

export function buatTabChat(aktif) {
  const aktifId = TAB_ALIAS[aktif] || aktif;
  const lencana = {};
  const el = h('nav', { class: 'chat-tab', 'aria-label': 'Navigasi komunikasi' },
    CHAT_TABS.map((t) => {
      const b = h('span', { class: 'chat-lencana', hidden: true });
      lencana[t.id] = b;
      return h('a', {
        href: t.href,
        class: `chat-tab__item${t.id === aktifId ? ' aktif' : ''}`,
        'aria-current': t.id === aktifId ? 'page' : null
      }, h('i', { class: `bi ${t.ikon}`, 'aria-hidden': 'true' }), h('span', {}, t.label), b);
    })
  );

  const terapkan = (state) => {
    const n = hitungLencanaTab(state);
    for (const id of Object.keys(lencana)) {
      const jumlah = Number(n[id]) || 0;
      lencana[id].hidden = jumlah <= 0;
      lencana[id].textContent = jumlah > 99 ? '99+' : String(jumlah);
    }
  };
  terapkan(getState());
  const berhenti = subscribe(terapkan);
  return { el, berhenti };
}
