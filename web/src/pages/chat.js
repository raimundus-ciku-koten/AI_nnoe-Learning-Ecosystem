// web/src/pages/chat.js
/**
 * halamanChat — entry point rute /chat/*.
 *
 *   /chat            → Percakapan (individu)
 *   /chat/grup       → Grup
 *   /chat/kontak     → Kontak (kontak, permintaan, cari orang)
 *   /chat/baru       → Buat grup baru
 *   /chat/:chatId    → buka sebuah percakapan (individu atau grup)
 *
 * Shell (sidebar + topbar) dibangun router; halaman ini hanya mengisi `wadah`.
 * WAJIB mengembalikan cleanup agar listener realtime tidak terus berjalan.
 */
import '../styles/chat.css';
import { rtdb } from '../firebase/index.js';
import { tampilkanChat }     from '../views/chat/chatPage.js';
import { tampilkanChatBaru } from '../views/chat/newChat.js';
import { tampilkanKontak }   from '../views/chat/contactsPage.js';

const RESERVED = new Set(['baru', 'kontak', 'grup']);
const kosong = () => {};

export async function halamanChat(wadah, ctx = {}) {
  if (!rtdb) {
    wadah.innerHTML = `
      <section class="card empty-state" style="max-width:520px;margin:2rem auto">
        <h1>Chat belum aktif</h1>
        <p>Realtime Database belum dikonfigurasi. Isi <code>VITE_FIREBASE_DATABASE_URL</code>
           di <code>.env.local</code>, lalu restart <code>npm run dev</code>.</p>
        <a class="btn btn-outline" href="#/dashboard">Kembali ke Dashboard</a>
      </section>`;
    return () => {};
  }

  const path   = (ctx.path || '').replace(/\/+$/, '');
  const param  = ctx.params?.chatId;
  const chatId = RESERVED.has(param) ? undefined : param;

  if (path === '/chat/baru')   return (await tampilkanChatBaru(wadah)) || kosong;
  if (path === '/chat/kontak') return (await tampilkanKontak(wadah)) || kosong;
  if (path === '/chat/grup')   return (await tampilkanChat(wadah, { jenis: 'group' })) || kosong;

  return (await tampilkanChat(wadah, { chatId })) || kosong;
}
