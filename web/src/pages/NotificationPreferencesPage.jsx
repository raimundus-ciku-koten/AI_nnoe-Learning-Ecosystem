import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { aktifkanNotifikasi, lepaskanPerangkat, muatStatusNotifikasi } from '../services/messaging.js';
import { isTeacherRole } from '../services/roleAccess.js';
import '../styles/notification-preferences.css';

function pesanIzin(status) {
  if (!status?.supported) return 'Browser atau perangkat ini belum mendukung Web Push.';
  if (!status.configured) return 'Web Push belum dikonfigurasi oleh aplikasi. Hubungi administrator; jangan memasukkan kunci pada halaman ini.';
  if (status.permission === 'granted') return 'Izin browser diberikan.';
  if (status.permission === 'denied') return 'Izin diblokir di browser. Ubah izin situs melalui pengaturan browser sebelum mengaktifkan.';
  return 'Izin browser belum diminta.';
}

export default function NotificationPreferencesPage() {
  const { user, role, activeRole } = useAuth();
  const currentRole = activeRole || role;
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setStatus(await muatStatusNotifikasi(user?.uid));
    } catch (cause) {
      console.error('[notification-preferences] Gagal memeriksa langganan perangkat:', cause);
      setError('Status notifikasi tidak dapat diperiksa. Periksa koneksi dan akses layanan, lalu coba lagi.');
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function changeSubscription() {
    if (!user?.uid || busy || !status?.supported) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (status.subscribed) {
        await lepaskanPerangkat(user.uid);
        setNotice('Notifikasi Web Push dinonaktifkan pada perangkat ini.');
      } else {
        await aktifkanNotifikasi(user.uid);
        setNotice('Notifikasi Web Push berhasil diaktifkan pada perangkat ini.');
      }
      await refresh();
    } catch (cause) {
      console.error('[notification-preferences] Gagal memperbarui langganan perangkat:', cause);
      setError(cause instanceof Error
        ? cause.message
        : 'Pengaturan notifikasi gagal diperbarui. Periksa koneksi dan izin browser.');
    } finally {
      setBusy(false);
    }
  }

  if (!isTeacherRole(currentRole)) {
    return (
      <section className="ale-notification-settings" role="alert">
        <h2>Akses pengaturan dibatasi</h2>
        <p>Halaman pengaturan notifikasi guru tidak tersedia untuk peran aktif ini.</p>
      </section>
    );
  }

  return (
    <section className="ale-notification-settings" aria-labelledby="notification-settings-heading">
      <header>
        <p className="ale-submenu-kicker">Pengaturan · perangkat</p>
        <h2 id="notification-settings-heading">Notifikasi Web Push</h2>
        <p>Kelola langganan notifikasi chat pada browser dan perangkat yang sedang digunakan.</p>
      </header>

      <div className="ale-notification-settings-card">
        <div>
          <h3>Status perangkat ini</h3>
          <p>{loading ? 'Memeriksa izin dan langganan perangkat…' : pesanIzin(status)}</p>
          <span className={`ale-notification-settings-status${status?.subscribed ? ' is-enabled' : ''}`}>
            {loading ? 'Memeriksa' : status?.subscribed ? 'Aktif di perangkat ini' : 'Tidak aktif di perangkat ini'}
          </span>
        </div>
        <button
          className="ale-notification-settings-button"
          type="button"
          onClick={() => void changeSubscription()}
          disabled={loading || busy || !status?.supported || (!status?.configured && !status?.subscribed)}
        >
          {busy ? 'Menyimpan…' : status?.subscribed ? 'Nonaktifkan di perangkat ini' : 'Aktifkan di perangkat ini'}
        </button>
      </div>

      <p className="ale-notification-settings-note">
        Status ini hanya berlaku untuk perangkat/browser ini, bukan preferensi lintas perangkat atau riwayat pengiriman.
        Menolak izin browser harus diubah dari pengaturan situs browser. Notifikasi tetap bergantung pada koneksi,
        izin perangkat, dan layanan push.
      </p>
      {error && <p className="ale-notification-settings-message is-error" role="alert">{error}</p>}
      {notice && <p className="ale-notification-settings-message" role="status">{notice}</p>}
      <button
        className="ale-notification-settings-button secondary"
        type="button"
        onClick={() => void refresh()}
        disabled={loading || busy}
      >
        Muat ulang status
      </button>
    </section>
  );
}
