import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { WEB_PUSH_PUBLIC_KEY } from '../config.js';
import { aktifkanNotifikasi, lepaskanPerangkat, statusNotifikasi } from '../services/messaging.js';
import Ikon from '../components/Ikon.jsx';
import '../styles/notification-settings.css';

export default function NotificationSettingsPage() {
    const { user } = useAuth();
    const didukung = typeof Notification !== 'undefined'
        && 'serviceWorker' in navigator
        && 'PushManager' in window;
    const [izin, setIzin] = useState(statusNotifikasi());
    const [aktif, setAktif] = useState(false);
    const [sibuk, setSibuk] = useState(false);
    const [pesan, setPesan] = useState('');
    const [galat, setGalat] = useState('');

    useEffect(() => {
        let terpasang = true;
        if (!didukung || izin !== 'granted') return () => { terpasang = false; };
        navigator.serviceWorker.getRegistration('/push-service-worker.js')
            .then((registration) => registration?.pushManager.getSubscription())
            .then((subscription) => { if (terpasang) setAktif(Boolean(subscription)); })
            .catch(() => { if (terpasang) setGalat('Status langganan belum dapat diperiksa. Coba muat ulang halaman.'); });
        return () => { terpasang = false; };
    }, [didukung, izin]);

    async function ubahLangganan() {
        if (!user?.uid || sibuk) return;
        setSibuk(true);
        setGalat('');
        setPesan('');
        try {
            if (aktif) {
                await lepaskanPerangkat(user.uid);
                setAktif(false);
                setPesan('Notifikasi pada perangkat ini dinonaktifkan.');
            } else {
                await aktifkanNotifikasi(user.uid);
                setIzin(statusNotifikasi());
                setAktif(true);
                setPesan('Notifikasi pesan berhasil diaktifkan pada perangkat ini.');
            }
        } catch (error) {
            setIzin(statusNotifikasi());
            setGalat(error?.message || 'Pengaturan notifikasi tidak berhasil. Coba lagi.');
        } finally {
            setSibuk(false);
        }
    }

    const status = !didukung ? 'Tidak didukung peramban ini'
        : !WEB_PUSH_PUBLIC_KEY ? 'Belum dikonfigurasi'
            : izin === 'denied' ? 'Diblokir di peramban'
                : aktif ? 'Aktif pada perangkat ini'
                    : izin === 'granted' ? 'Izin tersedia'
                        : 'Belum diaktifkan';

    return (
        <main className="notification-settings" aria-labelledby="notification-settings-title">
            <header className="notification-settings__header">
                <p><Ikon nama="bell" /> Preferensi perangkat</p>
                <h1 id="notification-settings-title">Notifikasi</h1>
                <span>Atur pemberitahuan Web Push untuk pesan chat pada perangkat ini.</span>
            </header>

            <section className="notification-settings__section" aria-labelledby="notification-push-title">
                <div className="notification-settings__icon"><Ikon nama="chat" /></div>
                <div className="notification-settings__content">
                    <div className="notification-settings__title-row">
                        <h2 id="notification-push-title">Pesan chat</h2>
                        <span className={`notification-settings__status${aktif ? ' is-active' : ''}`}>{status}</span>
                    </div>
                    <p>Notifikasi dikirim melalui layanan Web Push dan hanya untuk akun yang sedang masuk. Preferensi ini berlaku untuk perangkat dan peramban saat ini.</p>
                    {!WEB_PUSH_PUBLIC_KEY && <p className="notification-settings__note">Admin perlu mengatur kunci publik VAPID sebelum notifikasi dapat diaktifkan.</p>}
                    {izin === 'denied' && <p className="notification-settings__note">Izin diblokir oleh peramban. Ubah izin situs dari pengaturan peramban, lalu muat ulang halaman.</p>}
                    {galat && <p className="notification-settings__error" role="alert">{galat}</p>}
                    {pesan && <p className="notification-settings__notice" role="status">{pesan}</p>}
                    <button type="button" className={`notification-settings__button${aktif ? ' is-secondary' : ''}`}
                        onClick={ubahLangganan} disabled={!didukung || !WEB_PUSH_PUBLIC_KEY || sibuk || (izin === 'denied' && !aktif)}>
                        {sibuk ? 'Memproses…' : aktif ? 'Nonaktifkan di perangkat ini' : 'Aktifkan notifikasi'}
                    </button>
                </div>
            </section>
            <p className="notification-settings__footnote">Menonaktifkan Web Push tidak menghapus riwayat percakapan atau pengumuman.</p>
        </main>
    );
}