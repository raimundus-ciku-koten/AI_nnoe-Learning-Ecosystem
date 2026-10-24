import { toast } from './toast.js';
import { getState } from '../state.js';
import { aktifkanNotifikasi } from '../services/messaging.js';

export { toast };

const RUTE_AKSI = Object.freeze({
  'kelas-mapel': '/datadasar/kelas',
  'api-key': '/pengaturan/api-ai',
  google: '/pengaturan/google',
});

export async function jalankanAksi(nama) {
  if (nama === 'notif') {
    const userId = getState().user?.uid;
    if (!userId) throw new Error('Sesi pengguna tidak tersedia untuk mengaktifkan notifikasi.');
    await aktifkanNotifikasi(userId);
    toast('Notifikasi Web Push berhasil diaktifkan.', 'success');
    return;
  }

  const route = RUTE_AKSI[nama];
  if (route) {
    window.location.hash = `#${route}`;
    return;
  }

  throw new Error(`Tindakan profil "${nama}" belum tersedia.`);
}
