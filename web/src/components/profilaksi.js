import { toast } from './toast.js';
import { getState } from '../state.js';
import { cariMenu } from '../navigasi.js';

export { toast };

const ROUTE_ACTIONS = {
  'kelas-mapel': '/datadasar/kelas',
  'api-key': '/pengaturan/api-ai',
  google: '/pengaturan/google',
  ulasan: '/testimoni',
};

export async function jalankanAksi(nama) {
  if (nama === 'notif') {
    const uid = getState().user?.uid;
    if (!uid) {
      toast('Masuk kembali sebelum mengaktifkan notifikasi.', 'error');
      return false;
    }
    try {
      const { aktifkanNotifikasi } = await import('../services/messaging.js');
      await aktifkanNotifikasi(uid);
      toast('Notifikasi berhasil diaktifkan pada perangkat ini.', 'success');
      return true;
    } catch (error) {
      toast(error?.message || 'Notifikasi tidak dapat diaktifkan.', 'error');
      return false;
    }
  }

  const path = ROUTE_ACTIONS[nama];
  if (!path) return false;
  const state = getState();
  const role = state.activeRole || state.role;
  if (!cariMenu(path, '', role)) {
    toast('Menu ini tidak tersedia pada peran aktif.', 'error');
    return false;
  }
  window.location.hash = `#${path}`;
  return true;
}
