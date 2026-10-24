import { beforeEach, describe, expect, it, vi } from 'vitest';

const { aktifkanNotifikasi, toast } = vi.hoisted(() => ({
  aktifkanNotifikasi: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('../services/messaging.js', () => ({ aktifkanNotifikasi }));
vi.mock('./toast.js', () => ({ toast }));

import { jalankanAksi } from './profilaksi.js';

describe('aksi menu profil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aktifkanNotifikasi.mockResolvedValue({});
  });

  it('mengaktifkan notifikasi untuk pengguna saat ini dan mengonfirmasi sukses', async () => {
    await jalankanAksi('notif', { userId: 'user-1' });

    expect(aktifkanNotifikasi).toHaveBeenCalledWith('user-1');
    expect(toast).toHaveBeenCalledWith(
      'Notifikasi berhasil diaktifkan pada perangkat ini.',
      'success',
    );
  });

  it('menolak aksi notifikasi tanpa sesi pengguna', async () => {
    await expect(jalankanAksi('notif')).rejects.toThrow('Sesi pengguna tidak tersedia');
    expect(aktifkanNotifikasi).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('menolak aksi profil yang tidak didukung daripada diam-diam berhasil', async () => {
    await expect(jalankanAksi('aksi-tidak-dikenal', { userId: 'user-1' }))
      .rejects.toThrow('Aksi profil tidak didukung');
    expect(aktifkanNotifikasi).not.toHaveBeenCalled();
  });

  it('meneruskan kegagalan layanan notifikasi kepada pemanggil', async () => {
    const failure = new Error('VAPID belum dikonfigurasi');
    const aktifkan = vi.fn().mockRejectedValue(failure);

    await expect(jalankanAksi('notif', { userId: 'user-1', aktifkan }))
      .rejects.toBe(failure);
    expect(toast).not.toHaveBeenCalled();
  });
});
