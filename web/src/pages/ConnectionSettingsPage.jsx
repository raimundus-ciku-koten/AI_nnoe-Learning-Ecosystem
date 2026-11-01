import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Ikon from '../components/Ikon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  beginGoogleConnection,
  disconnectGoogleService,
  getConnectionStatus,
  resolveSyncConflict,
  syncGoogleService,
} from '../services/connectionApi.js';
import { routeAiRequest } from '../services/aiProviders.js';
import { hapusMutasiAntreanItem } from '../services/offlineSync.js';
import '../styles/connection-settings.css';

const SERVICES = [
  {
    id: 'drive',
    name: 'Google Drive',
    scope: 'drive.file',
    detail: 'Metadata file yang dibuat/dipilih aplikasi; isi berkas tidak diindeks pada tahap ini.',
  },
  {
    id: 'tasks',
    name: 'Google Tasks',
    scope: 'tasks',
    detail: 'Daftar tugas default: baca, buat, ubah, dan hapus.',
  },
  {
    id: 'calendar',
    name: 'Google Calendar',
    scope: 'calendar.events.owned',
    detail: 'Event pada kalender utama milik akun ini; kalender yang hanya dibagikan tidak diminta.',
  },
];

function waktu(value) {
  if (!value) return 'Belum pernah';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Belum pernah' : date.toLocaleString();
}

function serviceStatus(connection, sync) {
  if (!connection) return 'Belum terhubung';
  if (connection.status === 'reauth_required') return 'Login Google diperlukan';
  if (sync?.status === 'syncing') return 'Sedang sinkron';
  if (sync?.status === 'retry_wait') return 'Menunggu retry';
  if (sync?.status === 'error') return 'Perlu perhatian';
  return 'Terhubung';
}

export default function ConnectionSettingsPage() {
  const { user } = useAuth();
  const location = useLocation();
  const [connections, setConnections] = useState([]);
  const [syncStates, setSyncStates] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [localAiStatus, setLocalAiStatus] = useState('');
  const [localAiError, setLocalAiError] = useState('');
  const [localAiBusy, setLocalAiBusy] = useState(false);
  const [conflictBusy, setConflictBusy] = useState('');
  const [aiPreference, setAiPreference] = useState(() => {
    try {
      return localStorage.getItem('ale-ai-provider-preference') === 'cloud' ? 'cloud' : 'local';
    } catch {
      return 'local';
    }
  });
  const [cloudPrompt, setCloudPrompt] = useState('');
  const [cloudConsent, setCloudConsent] = useState(false);
  const [cloudResult, setCloudResult] = useState('');

  const connectionByService = useMemo(
    () => new Map(connections.map((connection) => [connection.service, connection])),
    [connections],
  );
  const syncByService = useMemo(
    () => new Map(syncStates.map((sync) => [sync.service, sync])),
    [syncStates],
  );

  const refresh = useCallback(async () => {
    setError('');
    const result = await getConnectionStatus();
    setConnections(result.connections || []);
    setSyncStates(result.sync || []);
    setConflicts(result.unresolvedConflicts || []);
    return result;
  }, []);

  useEffect(() => {
    let active = true;
    getConnectionStatus().then((result) => {
      if (!active) return;
      setConnections(result.connections || []);
      setSyncStates(result.sync || []);
      setConflicts(result.unresolvedConflicts || []);
      const params = new URLSearchParams(location.search);
      if (params.get('integration') === 'connected') {
        setNotice(`Google ${params.get('message') || ''} berhasil dihubungkan. Sinkronisasi akan dimulai otomatis.`);
      } else if (params.get('integration') === 'error') {
        setError(`Proses koneksi Google gagal (${params.get('message') || 'oauth_callback_failed'}).`);
      }
    }).catch((cause) => {
      console.error('[connection-settings] Gagal memuat status koneksi:', cause);
      if (active) setError(cause?.message || 'Status koneksi tidak dapat dimuat.');
    });
    return () => { active = false; };
  }, [location.search, user?.uid]);

  async function connect(service) {
    setBusy(`connect-${service}`);
    setError('');
    setNotice('');
    try {
      await beginGoogleConnection(service);
    } catch (cause) {
      console.error(`[connection-settings] Gagal memulai OAuth ${service}:`, cause);
      setError(cause?.message || 'Persetujuan Google tidak dapat dimulai.');
      setBusy('');
    }
  }

  async function disconnect(service) {
    if (!window.confirm(`Putuskan Google ${service} dan cabut izin aplikasi? Data pada Google tidak akan dihapus.`)) return;
    setBusy(`disconnect-${service}`);
    setError('');
    setNotice('');
    try {
      await disconnectGoogleService(service);
      await refresh();
      setNotice(`Google ${service} terputus. Data pada akun Google tidak dihapus.`);
    } catch (cause) {
      console.error(`[connection-settings] Gagal memutuskan ${service}:`, cause);
      setError(cause?.message || 'Koneksi Google tidak dapat diputuskan.');
      await refresh().catch((refreshError) => console.error('[connection-settings] Gagal memuat ulang status:', refreshError));
    } finally {
      setBusy('');
    }
  }

  async function sync(service) {
    setBusy(`sync-${service}`);
    setError('');
    setNotice('');
    try {
      let result;
      let page = 0;
      do {
        result = await syncGoogleService(service);
        page += 1;
      } while (result.hasMore && page < 4);
      await refresh();
      setNotice(result.hasMore
        ? `Sinkronisasi ${service} berlanjut bertahap. Tekan Sinkronkan lagi untuk melanjutkan.`
        : `Sinkronisasi ${service} selesai.`);
    } catch (cause) {
      console.error(`[connection-settings] Sinkronisasi ${service} gagal:`, cause);
      setError(cause?.message || 'Sinkronisasi tidak dapat diselesaikan.');
      await refresh().catch((refreshError) => console.error('[connection-settings] Gagal memuat ulang status:', refreshError));
    } finally {
      setBusy('');
    }
  }

  async function testLocalAi() {
    setLocalAiBusy(true);
    setLocalAiStatus('');
    setLocalAiError('');
    try {
      const result = await routeAiRequest({
        workflow: 'assistant',
        prompt: 'Balas dengan satu kata: siap',
        preference: 'local',
        sensitivity: 'sensitive',
        allowCloud: false,
      });
      setLocalAiStatus(`AI_nnoe lokal merespons (${result.model || 'model lokal'}).`);
    } catch (cause) {
      console.error('[connection-settings] AI lokal tidak tersedia:', cause);
      setLocalAiError(cause?.message || 'AI lokal tidak dapat dijangkau.');
    } finally {
      setLocalAiBusy(false);
    }
  }

  async function resolveConflict(conflictId, resolution) {
    setConflictBusy(conflictId);
    setError('');
    setNotice('');
    try {
      await resolveSyncConflict(conflictId, resolution);
      const conflict = conflicts.find((item) => item.id === conflictId);
      if (conflict) await hapusMutasiAntreanItem(user?.uid, conflict.service, conflict.remote_id);
      await refresh();
      setNotice(resolution === 'local'
        ? 'Versi lokal diterapkan setelah pemeriksaan versi terbaru.'
        : 'Versi Google dipertahankan dan konflik ditandai selesai.');
    } catch (cause) {
      console.error('[connection-settings] Resolusi konflik gagal:', cause);
      setError(cause?.message || 'Konflik tidak dapat diselesaikan.');
    } finally {
      setConflictBusy('');
    }
  }

  function ubahPreferensiAi(value) {
    setAiPreference(value);
    try {
      localStorage.setItem('ale-ai-provider-preference', value);
    } catch (cause) {
      console.error('[connection-settings] Preferensi AI tidak dapat disimpan:', cause);
      setError('Preferensi AI hanya berlaku di tab ini karena penyimpanan browser tidak tersedia.');
    }
  }

  async function kirimPromptAi() {
    if (!cloudPrompt.trim()) {
      setError('Tulis prompt terlebih dahulu.');
      return;
    }
    if (aiPreference === 'cloud' && !cloudConsent) {
      setError('Persetujuan eksplisit wajib sebelum mengirim prompt ke cloud.');
      return;
    }
    setLocalAiBusy(true);
    setError('');
    setCloudResult('');
    setLocalAiError('');
    try {
      const result = await routeAiRequest({
        workflow: 'assistant',
        prompt: cloudPrompt.trim(),
        preference: aiPreference,
        sensitivity: aiPreference === 'cloud' ? 'non_sensitive' : 'sensitive',
        allowCloud: aiPreference === 'cloud' && cloudConsent,
      });
      setCloudResult(result.text);
    } catch (cause) {
      console.error('[connection-settings] Permintaan AI gagal:', cause);
      setLocalAiError(cause?.message || 'Permintaan AI tidak dapat diproses.');
    } finally {
      setLocalAiBusy(false);
    }
  }

  return (
    <main className="connection-settings" aria-labelledby="connection-settings-title">
      <header className="connection-settings__header">
        <p className="connection-settings__eyebrow"><Ikon nama="settings" /> Koneksi akun</p>
        <h1 id="connection-settings-title">Pengaturan Koneksi</h1>
        <p>Hubungkan layanan secara terpisah. Persetujuan tidak pernah diminta otomatis.</p>
      </header>

      {error && <p className="connection-settings__message is-error" role="alert">{error}</p>}
      {notice && <p className="connection-settings__message is-success" role="status">{notice}</p>}
      {conflicts.length > 0 && (
        <section className="connection-settings__section" aria-labelledby="sync-conflicts-title">
          <h2 id="sync-conflicts-title">Konflik sinkronisasi ({conflicts.length})</h2>
          <p>Periksa kedua versi sebelum memilih. Tidak ada perubahan yang ditimpa secara otomatis.</p>
          <div className="connection-settings__grid">
            {conflicts.map((conflict) => (
              <article className="connection-settings__card" key={conflict.id}>
                <h3>{conflict.service} · {conflict.resource}</h3>
                <p>ID Google: <code>{conflict.remote_id}</code></p>
                <p>Terdeteksi: {waktu(conflict.detected_at)}</p>
                <div className="connection-settings__actions">
                  <button type="button" disabled={Boolean(conflictBusy)} onClick={() => resolveConflict(conflict.id, 'local')}>
                    {conflictBusy === conflict.id ? 'Menerapkan…' : 'Pakai versi lokal'}
                  </button>
                  <button type="button" className="is-secondary" disabled={Boolean(conflictBusy)} onClick={() => resolveConflict(conflict.id, 'remote')}>
                    Pakai versi Google
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="connection-settings__section" aria-labelledby="google-services-title">
        <h2 id="google-services-title">Google Workspace</h2>
        <p>Token refresh disimpan terenkripsi di backend; browser tidak menerima token Google. Sinkronisasi hanya berjalan saat aplikasi aktif/online.</p>
        <div className="connection-settings__grid">
          {SERVICES.map((service) => {
            const connection = connectionByService.get(service.id);
            const syncState = syncByService.get(service.id);
            const connected = connection?.status === 'connected';
            const isBusy = busy.endsWith(service.id);
            return (
              <article className="connection-settings__card" key={service.id}>
                <div className="connection-settings__card-heading">
                  <h3>{service.name}</h3>
                  <span className={`connection-settings__badge ${connected ? 'is-ready' : ''}`}>
                    {serviceStatus(connection, syncState)}
                  </span>
                </div>
                <p>{service.detail}</p>
                <dl>
                  <div><dt>Scope diminta</dt><dd><code>{service.scope}</code></dd></div>
                  <div><dt>Akun</dt><dd>{connection?.email || '—'}</dd></div>
                  <div><dt>Sinkron terakhir</dt><dd>{waktu(syncState?.last_success_at)}</dd></div>
                </dl>
                {syncState?.last_error_code && (
                  <p className="connection-settings__inline-error">Kode status: {syncState.last_error_code}</p>
                )}
                <div className="connection-settings__actions">
                  {connected ? (
                    <>
                      <button type="button" disabled={Boolean(busy)} onClick={() => sync(service.id)}>
                        {busy === `sync-${service.id}` ? 'Menyinkronkan…' : 'Sinkronkan'}
                      </button>
                      <button type="button" className="is-secondary" disabled={Boolean(busy)} onClick={() => disconnect(service.id)}>
                        {busy === `disconnect-${service.id}` ? 'Memutuskan…' : 'Putuskan'}
                      </button>
                    </>
                  ) : (
                    <button type="button" disabled={Boolean(busy)} onClick={() => connect(service.id)}>
                      {busy === `connect-${service.id}` ? 'Membuka Google…' : 'Hubungkan'}
                    </button>
                  )}
                  {isBusy && <span role="status">Memproses layanan…</span>}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="connection-settings__section" aria-labelledby="ai-provider-title">
        <h2 id="ai-provider-title">AI_nnoe dan AI cloud</h2>
        <div className="connection-settings__card">
          <div className="connection-settings__card-heading">
            <h3>AI_nnoe lokal (Ollama)</h3>
            <span className="connection-settings__badge">Default · lokal</span>
          </div>
          <p>Prompt diproses pada Ollama di perangkat ini. Pastikan Ollama berjalan dan mengizinkan origin aplikasi pada konfigurasi CORS.</p>
          <div className="connection-settings__actions">
            <button type="button" disabled={localAiBusy} onClick={testLocalAi}>
              {localAiBusy ? 'Memeriksa…' : 'Uji AI lokal'}
            </button>
            {localAiStatus && <span role="status">{localAiStatus}</span>}
          </div>
          {localAiError && <p className="connection-settings__inline-error" role="alert">{localAiError}</p>}
        </div>
        <div className="connection-settings__card">
          <div className="connection-settings__card-heading">
            <h3>AI cloud</h3>
            <span className="connection-settings__badge">Nonaktif secara default</span>
          </div>
          <p>Kunci provider hanya berada di environment backend. Jangan masukkan nama, email, NIP, nilai, atau data pribadi siswa. Cloud tidak memproses data yang ditandai sensitif.</p>
          <label className="connection-settings__field">
            Preferensi provider AI
            <select value={aiPreference} onChange={(event) => ubahPreferensiAi(event.target.value)}>
              <option value="local">AI_nnoe lokal (default)</option>
              <option value="cloud">Cloud (izin eksplisit per permintaan)</option>
            </select>
          </label>
          <label className="connection-settings__field">
            Prompt uji
            <textarea
              value={cloudPrompt}
              onChange={(event) => setCloudPrompt(event.target.value)}
              maxLength={20000}
              rows={4}
              placeholder="Gunakan hanya contoh umum tanpa data pribadi."
            />
          </label>
          {aiPreference === 'cloud' && (
            <label className="connection-settings__consent">
              <input
                type="checkbox"
                checked={cloudConsent}
                onChange={(event) => setCloudConsent(event.target.checked)}
              />
              <span>Saya memastikan prompt ini tidak sensitif dan mengizinkan pengirimannya ke penyedia AI cloud untuk permintaan ini.</span>
            </label>
          )}
          <div className="connection-settings__actions">
            <button type="button" disabled={localAiBusy || !cloudPrompt.trim()} onClick={kirimPromptAi}>
              {localAiBusy ? 'Memproses…' : aiPreference === 'cloud' ? 'Kirim dengan izin cloud' : 'Kirim ke AI_nnoe lokal'}
            </button>
          </div>
          {cloudResult && <pre className="connection-settings__result" role="status">{cloudResult}</pre>}
        </div>
      </section>

      <p className="connection-settings__footnote">
        PWA tidak dapat menjamin sinkronisasi saat aplikasi ditutup. Untuk keamanan, pencabutan izin Google juga dapat dilakukan pada pengaturan akun Google.
      </p>
    </main>
  );
}
