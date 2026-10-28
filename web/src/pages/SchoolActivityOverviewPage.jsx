import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { isSchoolAdminRole } from '../services/roleAccess.js';
import {
  muatAktivitasTerbaruSekolah,
  muatRingkasanChatSekolah,
} from '../services/schoolActivityOverview.js';
import '../styles/online-assessments.css';

const CHAT_LABELS = {
  conversations_created_30d: 'Percakapan dibuat · 30 hari',
  messages_7d: 'Pesan dikirim · 7 hari',
  active_senders_30d: 'Akun pengirim aktif · 30 hari',
};

function isChatRoute(path) {
  return path === '/admin/dashboard/chat';
}

function formatTanggal(value) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function SchoolActivityOverviewPage() {
  const { role, activeRole, tenantId } = useAuth();
  const location = useLocation();
  const allowed = isSchoolAdminRole(activeRole || role);
  const chatView = isChatRoute(location.pathname);
  const [activity, setActivity] = useState([]);
  const [chat, setChat] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!tenantId) throw new Error('Sesi admin sekolah tidak memiliki tenant aktif.');
      if (chatView) {
        setChat(await muatRingkasanChatSekolah());
      } else {
        setActivity(await muatAktivitasTerbaruSekolah());
      }
    } finally {
      setLoading(false);
    }
  }, [chatView, tenantId]);

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return undefined;
    }
    let current = true;
    refresh().catch((cause) => {
      console.error('[school-activity-overview] Gagal memuat monitoring sekolah:', cause);
      if (current) setError('Data monitoring tidak dapat dimuat. Periksa sesi admin, tenant, dan izin server.');
    });
    return () => { current = false; };
  }, [allowed, refresh]);

  if (!allowed) {
    return (
      <section className="ale-exam-card" role="alert">
        <h1>Monitoring sekolah</h1>
        <p>Halaman ini hanya tersedia bagi admin sekolah yang berwenang.</p>
      </section>
    );
  }

  return (
    <main className="ale-exam-card" aria-labelledby="school-monitoring-title">
      <p className="ale-exam-kicker">Monitoring · tenant sekolah</p>
      <h1 id="school-monitoring-title">{chatView ? 'Monitoring Chat' : 'Aktivitas Terbaru'}</h1>
      <p className="ale-exam-intro">
        {chatView
          ? 'Ringkasan ini hanya menampilkan jumlah agregat percakapan dan pesan pada tenant. Isi chat, identitas peserta, dan status online tidak ditampilkan.'
          : 'Linimasa ini merangkum aktivitas yang memang tercatat oleh modul sekolah. Judul, isi pengumuman, identitas siswa, dan konten pribadi tidak ditampilkan.'}
      </p>
      <p className="ale-exam-notice">
        {chatView
          ? 'Metrik menggunakan jendela 7 dan 30 hari sesuai label; bukan alat moderasi atau pemantauan percakapan.'
          : 'Linimasa terbatas pada 100 peristiwa tercatat dalam 30 hari terakhir, bukan audit log lengkap atau bukti seluruh aktivitas pengguna.'}
      </p>
      {error && <p className="ale-exam-error" role="alert">{error}</p>}
      <button
        className="ale-exam-secondary"
        type="button"
        disabled={loading}
        onClick={() => refresh().catch((cause) => {
          console.error('[school-activity-overview] Gagal memuat ulang monitoring:', cause);
          setError('Data terbaru tidak dapat dimuat. Periksa koneksi dan izin tenant.');
        })}
      >
        {loading ? 'Memuat…' : 'Muat ulang'}
      </button>
      {loading && <p role="status">Memuat ringkasan tenant…</p>}
      {chatView ? (
        <dl className="school-assessment-summary" aria-label="Ringkasan chat tenant">
          {Object.entries(CHAT_LABELS).map(([key, label]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{chat?.[key] ?? '—'}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <section aria-labelledby="school-activity-list-title">
          <h2 id="school-activity-list-title">Aktivitas tercatat · 30 hari</h2>
          {!loading && !error && !activity.length && (
            <p>Belum ada aktivitas dari sumber yang tercatat pada periode ini.</p>
          )}
          <ol className="ale-exam-list">
            {activity.map((event, index) => (
              <li key={`${event.event_key}-${event.occurred_at}-${index}`}>
                <div>
                  <strong>{event.event_label}</strong>
                  <span>{formatTanggal(event.occurred_at)}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
