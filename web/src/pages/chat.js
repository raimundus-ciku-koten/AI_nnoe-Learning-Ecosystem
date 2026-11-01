// web/src/pages/chat.js
/**
 * halamanChat — entry point rute /chat/*.
 *
 *   /chat            → Percakapan (individu)
 *   /chat/grup       → Grup
 *   /chat/kontak     → Kontak (kontak, permintaan, cari orang)
 *   /chat/telepon    → Riwayat panggilan
 *   /chat/video      → Mulai panggilan video
 *   /chat/baru       → Buat grup baru
 *   /chat/:chatId    → buka sebuah percakapan (individu atau grup)
 *
 * Shell (sidebar + topbar) dibangun router; halaman ini hanya mengisi `wadah`.
 * WAJIB mengembalikan cleanup agar listener realtime tidak terus berjalan.
 */
import '../styles/chat.css';
import { tampilkanChat }     from '../views/chat/chatPage.js';
import { tampilkanChatBaru } from '../views/chat/newChat.js';
import { tampilkanKontak }   from '../views/chat/contactsPage.js';
import { tampilkanHubKomunikasi } from '../views/chat/communicationHub.js';

const RESERVED = new Set(['baru', 'kontak', 'grup', 'telepon', 'video']);
const kosong = () => {};

export async function halamanChat(wadah, ctx = {}) {
  const path   = (ctx.path || '').replace(/\/+$/, '');
  const param  = ctx.params?.chatId;
  const chatId = RESERVED.has(param) ? undefined : param;

  if (path === '/chat/baru')   return (await tampilkanChatBaru(wadah)) || kosong;
  if (path === '/chat/kontak') return (await tampilkanKontak(wadah)) || kosong;
  if (path === '/chat/grup')   return (await tampilkanChat(wadah, { jenis: 'group' })) || kosong;
  if (path === '/chat/telepon') return (await tampilkanHubKomunikasi(wadah, 'telepon')) || kosong;
  if (path === '/chat/video') return (await tampilkanHubKomunikasi(wadah, 'video')) || kosong;

  const callKind = new URLSearchParams(ctx.search || '').get('call');
  return (await tampilkanChat(wadah, {
    chatId,
    callKind: callKind === 'audio' || callKind === 'video' ? callKind : null,
  })) || kosong;
}
