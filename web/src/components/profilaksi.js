import { toast } from './toast.js';
import { aktifkanNotifikasi } from '../services/messaging.js';

export { toast };

export async function jalankanAksi(nama, {
  userId,
  aktifkan = aktifkanNotifikasi,
} = {}) {
  if (nama !== 'notif') {
    throw new Error(`Aksi profil tidak didukung: ${nama}`);
  }
  if (!userId) {
    throw new Error('Sesi pengguna tidak tersedia. Muat ulang halaman lalu coba lagi.');
  }

  await aktifkan(userId);
  toast('Notifikasi berhasil diaktifkan pada perangkat ini.', 'success');
}
