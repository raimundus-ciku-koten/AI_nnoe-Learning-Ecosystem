import { beforeEach, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  user: { uid: 'user-1' },
  enableNotifications: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('../state.js', () => ({
  getState: () => ({ user: dependencies.user }),
}));
vi.mock('../services/messaging.js', () => ({
  aktifkanNotifikasi: dependencies.enableNotifications,
}));
vi.mock('./toast.js', () => ({
  toast: dependencies.toast,
}));

import { jalankanAksi } from './profilaksi.js';

beforeEach(() => {
  dependencies.user = { uid: 'user-1' };
  dependencies.enableNotifications.mockReset();
  dependencies.toast.mockReset();
});

it('mengaktifkan notifikasi dan memberi konfirmasi hanya setelah berhasil', async () => {
  dependencies.enableNotifications.mockResolvedValue({});

  await jalankanAksi('notif');

  expect(dependencies.enableNotifications).toHaveBeenCalledWith('user-1');
  expect(dependencies.toast).toHaveBeenCalledWith('Notifikasi Web Push berhasil diaktifkan.', 'success');
});

it('menampilkan error aktivasi notifikasi kepada pemanggil', async () => {
  dependencies.enableNotifications.mockRejectedValue(new Error('VAPID belum tersedia'));

  await expect(jalankanAksi('notif')).rejects.toThrow('VAPID belum tersedia');
  expect(dependencies.toast).not.toHaveBeenCalled();
});

it('menolak aksi profil yang tidak terdaftar, bukan diam-diam mengabaikannya', async () => {
  await expect(jalankanAksi('foto-tambah')).rejects.toThrow('belum tersedia');
});
