// web/src/views/chat/chatPage.js
/**
 * chatPage.js — Tab navigasi + layout 2 kolom: daftar (kiri) dan ruang pesan (kanan).
 * Dipanggil oleh pages/chat.js. Mengembalikan cleanup → dilepas router.
 *
 * params.jenis: 'direct' | 'group'. Bila kosong, diturunkan dari chat yang dibuka.
 */
import { h } from '../../utils/dom.js';
import { gambarDaftar, jenisChat } from './chatList.js';
import { tampilkanRuang } from './chatRoom.js';
import { buatTabChat } from './chatTabs.js';
import { aktifkanNotifikasi, statusNotifikasi } from '../../services/messaging.js';
import { getState, subscribe } from '../../state.js';
import { toast } from '../../utils/toast.js';

function jenisUntuk(chatId) {
  if (!chatId) return 'direct';
  const c = (getState().chats || []).find((x) => x.id === chatId);
  return jenisChat(c || { id: chatId });
}

export async function tampilkanChat(outlet, params = {}) {
  const chatId = params?.chatId;
  const jenis = params?.jenis || jenisUntuk(chatId);

  const tab = buatTabChat(jenis);
  const daftarPanel = h('aside', { class: 'chat-daftar', 'aria-label': 'Daftar percakapan' });
  const ruangPanel  = h('section', { class: 'chat-ruang', 'aria-label': 'Ruang percakapan' });

  // Ajakan aktifkan notifikasi — hanya bila izin belum diberikan & belum ditolak.
  let ajakan = null;
  if (statusNotifikasi() === 'default') {
    ajakan = h('div', { class: 'chat-ajakan' },
      h('small', {}, 'Aktifkan notifikasi agar tidak ketinggalan pesan.'),
      h('button', {
        class: 'btn btn-sm btn-outline-secondary', type: 'button',
        onclick: async (e) => {
          const tombol = e.currentTarget;
          tombol.disabled = true;
          try {
            await aktifkanNotifikasi(getState().user.uid);
            ajakan.remove();
            toast('Notifikasi diaktifkan.', 'success');
          } catch (error) {
            tombol.disabled = false;
            toast(error.message || 'Notifikasi tidak dapat diaktifkan.', 'error');
          }
        }
      }, 'Aktifkan'));
    daftarPanel.append(ajakan);
  }

  // Banner permintaan kontak masuk (Percakapan saja) — dari state global, tanpa listener baru.
  let berhentiBanner = () => {};
  if (jenis === 'direct') {
    const banner = h('a', { href: '#/chat/kontak', class: 'chat-banner-permintaan', hidden: true });
    daftarPanel.append(banner);
    const terapkan = (s) => {
      const n = s.permintaanMasuk || 0;
      banner.hidden = n === 0;
      banner.textContent = `${n} permintaan kontak menunggu persetujuan`;
    };
    terapkan(getState());
    berhentiBanner = subscribe(terapkan);
  }

  outlet.append(
    h('div', { class: `chat-halaman${chatId ? ' ada-ruang' : ''}` },
      tab.el,
      h('div', { class: `chat-layout${chatId ? ' ada-ruang' : ''}` }, daftarPanel, ruangPanel))
  );

  const berhentiDaftar = gambarDaftar(daftarPanel, chatId, jenis);

  let berhentiRuang = () => {};
  if (chatId) {
    berhentiRuang = (await tampilkanRuang(ruangPanel, chatId)) || (() => {});
  } else {
    ruangPanel.append(
      h('div', { class: 'empty-state m-auto' },
        h('i', { class: 'bi bi-chat-dots display-4', 'aria-hidden': 'true' }),
        h('p', { class: 'mt-2' }, jenis === 'group'
          ? 'Pilih grup untuk membaca pesan.'
          : 'Pilih percakapan atau buka Kontak untuk memulai yang baru.'))
    );
  }

  return () => {
    for (const fn of [berhentiDaftar, berhentiBanner, berhentiRuang, tab.berhenti]) {
      try { fn(); } catch { /* abaikan */ }
    }
  };
}
