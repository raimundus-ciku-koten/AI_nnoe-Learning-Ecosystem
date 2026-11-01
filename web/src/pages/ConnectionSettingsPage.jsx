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
import {
  aturUlangPengaturanLokalAI,
  muatPengaturanLokalAI,
  routeAiRequest,
  simpanPengaturanLokalAI,
} from '../services/aiProviders.js';
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
  const [localAiSettings, setLocalAiSettings] = useState(null);
  const [localAiSettingsUser, setLocalAiSettingsUser] = useState('');
  const [conflictBusy, setConflictBusy] = useState('');

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
    if (user?.uid) {
      try {
        setLocalAiSettings(muatPengaturanLokalAI(user.uid));
        setLocalAiSettingsUser(user.uid);
        setLocalAiError('');
      } catch (cause) {
        console.error('[connection-settings] Pengaturan AI lokal tidak dapat dimuat:', cause);
        setLocalAiSettingsUser('');
        setLocalAiError(cause?.message || 'Pengaturan AI_nnoe lokal tidak dapat dimuat.');
      }
    } else {
      setLocalAiSettings(null);
      setLocalAiSettingsUser('');
      setLocalAiError('Masuk ke akun sebelum mengatur AI_nnoe lokal.');
    }
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

  function simpanPengaturanAiLokal() {
    if (!localAiSettings || localAiSettingsUser !== user?.uid || localAiBusy) return;
    setLocalAiBusy(true);
    setLocalAiError('');
    setLocalAiStatus('');
    try {
      setLocalAiSettings(simpanPengaturanLokalAI(user?.uid, localAiSettings));
      setLocalAiStatus('Pengaturan AI_nnoe disimpan lokal untuk akun ini pada browser ini.');
    } catch (cause) {
      console.error('[connection-settings] Pengaturan AI lokal tidak dapat disimpan:', cause);
      setLocalAiError(cause?.message || 'Pengaturan AI_nnoe lokal tidak dapat disimpan.');
    } finally {
      setLocalAiBusy(false);
    }
  }

  function resetPengaturanAiLokal() {
    if (!user?.uid || localAiSettingsUser !== user.uid || localAiBusy) return;
    setLocalAiBusy(true);
    setLocalAiError('');
    setLocalAiStatus('');
    try {
      setLocalAiSettings(aturUlangPengaturanLokalAI(user?.uid));
      setLocalAiStatus('Pengaturan AI_nnoe dikembalikan ke nilai bawaan.');
    } catch (cause) {
      console.error('[connection-settings] Pengaturan AI lokal tidak dapat diatur ulang:', cause);
      setLocalAiError(cause?.message || 'Pengaturan AI_nnoe lokal tidak dapat diatur ulang.');
    } finally {
      setLocalAiBusy(false);
    }
  }

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
        uid: user?.uid,
        workflow: 'assistant',
        prompt: 'Balas dengan satu kata: siap',
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
        <h2 id="ai-provider-title">AI_nnoe lokal</h2>
        <div className="connection-settings__card">
          <div className="connection-settings__card-heading">
            <h3>AI_nnoe lokal (Ollama)</h3>
            <span className="connection-settings__badge">Lokal saja</span>
          </div>
          <p>Semua menu generatif hanya memanggil Ollama di perangkat ini. Pastikan Ollama berjalan, memakai model yang telah diunduh, dan mengizinkan origin aplikasi pada CORS. Untuk mencegah Ollama sendiri memakai model cloud, aktifkan OLLAMA_NO_CLOUD=1 lalu mulai ulang Ollama.</p>
          <p>Setiap alur AI generatif mencoba model cadangan lokal jika model utama gagal atau hasilnya tidak lolos validasi. Kedua model harus sudah tersedia di Ollama; batas waktu berlaku untuk setiap percobaan sehingga totalnya dapat mencapai dua kali batas tersebut. Tidak ada provider cloud yang dipanggil.</p>
          <p>
            “Tanpa batas keluaran aplikasi” meminta model lokal menghasilkan keluaran tanpa batas token
            yang ditetapkan aplikasi. Batas konteks model, memori, kecepatan, dan kemampuan perangkat
            tetap berlaku; permintaan tetap memiliki batas waktu keselamatan.
          </p>
          {localAiSettings && localAiSettingsUser === user?.uid ? (
            <div className="connection-settings__local-ai-fields">
              <label className="connection-settings__field">
                Endpoint localhost
                <input
                  type="url"
                  value={localAiSettings.endpoint}
                  maxLength={300}
                  autoComplete="url"
                  onChange={(event) => setLocalAiSettings((current) => ({ ...current, endpoint: event.target.value }))}
                />
              </label>
              <label className="connection-settings__field">
                Model lokal
                <input
                  type="text"
                  value={localAiSettings.model}
                  maxLength={100}
                  autoComplete="off"
                  onChange={(event) => setLocalAiSettings((current) => ({ ...current, model: event.target.value }))}
                />
              </label>
              <label className="connection-settings__field">
                Model cadangan lokal
                <input
                  type="text"
                  value={localAiSettings.fallbackModel}
                  maxLength={100}
                  autoComplete="off"
                  onChange={(event) => setLocalAiSettings((current) => ({ ...current, fallbackModel: event.target.value }))}
                />
              </label>
              <label className="connection-settings__field">
                Batas waktu per model (detik, 15–600)
                <input
                  type="number"
                  min="15"
                  max="600"
                  step="1"
                  value={localAiSettings.timeoutSeconds}
                  onChange={(event) => setLocalAiSettings((current) => ({ ...current, timeoutSeconds: event.target.value }))}
                />
              </label>
              <label className="connection-settings__field">
                Keluaran maksimum (token; -1 = tanpa batas keluaran aplikasi)
                <input
                  type="number"
                  min="-1"
                  step="1"
                  value={localAiSettings.outputTokens}
                  onChange={(event) => setLocalAiSettings((current) => ({ ...current, outputTokens: event.target.value }))}
                />
              </label>
              <div className="connection-settings__actions">
                <button type="button" disabled={localAiBusy || !user?.uid} onClick={simpanPengaturanAiLokal}>
                  Simpan pengaturan lokal
                </button>
                <button type="button" className="is-secondary" disabled={localAiBusy || !user?.uid} onClick={resetPengaturanAiLokal}>
                  Atur ulang
                </button>
              </div>
            </div>
          ) : <p role="status">Memuat pengaturan AI_nnoe lokal…</p>}
          <div className="connection-settings__actions">
            <button type="button" disabled={localAiBusy || !user?.uid} onClick={testLocalAi}>
              {localAiBusy ? 'Memeriksa…' : 'Uji AI lokal'}
            </button>
            {localAiStatus && <span role="status">{localAiStatus}</span>}
          </div>
          {localAiError && <p className="connection-settings__inline-error" role="alert">{localAiError}</p>}
        </div>
      </section>

      <p className="connection-settings__footnote">
        PWA tidak dapat menjamin sinkronisasi saat aplikasi ditutup. Untuk keamanan, pencabutan izin Google juga dapat dilakukan pada pengaturan akun Google.
      </p>
    </main>
  );
}
