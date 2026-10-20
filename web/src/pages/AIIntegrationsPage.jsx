import React, { useCallback, useEffect, useState } from 'react';
import Ikon from '../components/Ikon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  hapusKunciPribadiAI,
  muatKoneksiAI,
  sambungkanCanva,
  simpanKunciPribadiAI,
  simpanPreferensiAI,
} from '../services/aiIntegrations.js';
import '../styles/ai-integrations.css';

const PROVIDER_PREFERENCE_OPTIONS = [
  ['auto', 'Otomatis (Gemini → DeepSeek → Groq → Claude)'],
  ['gemini', 'Gemini'],
  ['deepseek', 'DeepSeek'],
  ['groq', 'Groq'],
  ['claude', 'Claude'],
];

const PROVIDERS = [
  { id: 'gemini', name: 'Gemini', url: 'https://aistudio.google.com/apikey' },
  { id: 'deepseek', name: 'DeepSeek', url: 'https://platform.deepseek.com/api_keys' },
  {
    id: 'groq',
    name: 'Groq',
    url: 'https://console.groq.com/keys',
    note: 'Kuota gratis dan model dapat berubah sesuai kebijakan provider.',
  },
  { id: 'claude', name: 'Claude', url: 'https://console.anthropic.com/settings/keys' },
];

function providerStatus(provider, connections) {
  if (!connections.configured) return 'Server belum dikonfigurasi';
  return connections.providers[provider.id]?.available ? 'Kunci pribadi aktif' : 'Belum tersambung';
}

export default function AIIntegrationsPage() {
  const { user } = useAuth();
  const [connections, setConnections] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [consent, setConsent] = useState(false);
  const [keys, setKeys] = useState({ gemini: '', deepseek: '', groq: '', claude: '' });
  const [preferences, setPreferences] = useState({ assistant: 'auto', questions: 'auto' });

  const refresh = useCallback(async () => {
    setError('');
    const result = await muatKoneksiAI(user?.uid);
    setConnections(result);
    setPreferences((current) => ({ ...current, ...result.preferences }));
  }, [user?.uid]);

  useEffect(() => {
    let active = true;
    setConnections(null);
    setKeys({ gemini: '', deepseek: '', groq: '', claude: '' });
    setConsent(false);
    if (!user?.uid) {
      setError('Silakan masuk sebelum mengatur provider AI.');
      return () => { active = false; };
    }
    muatKoneksiAI(user.uid)
      .then((result) => {
        if (active) {
          setConnections(result);
          setPreferences((current) => ({ ...current, ...result.preferences }));
        }
      })
      .catch((cause) => {
        console.error('[ai-integrations] Gagal memuat status provider:', cause);
        if (active) setError(cause?.message || 'Status provider AI pribadi tidak dapat dimuat.');
      });
    return () => { active = false; };
  }, [user?.uid]);

  async function withBusy(id, action, success) {
    setBusy(id);
    setError('');
    setNotice('');
    try {
      await action();
      await refresh();
      setNotice(success);
      return true;
    } catch (cause) {
      console.error(`[ai-integrations] Aksi ${id} gagal:`, cause);
      setError(cause?.message || 'Pengaturan AI tidak dapat disimpan.');
      return false;
    } finally {
      setBusy('');
    }
  }

  async function saveKey(provider) {
    const apiKey = keys[provider].trim();
    if (!consent) {
      setError('Setujui pengiriman permintaan uji dan kemungkinan biaya sebelum memeriksa kunci.');
      return;
    }
    if (!apiKey) {
      setError('Masukkan kunci API terlebih dahulu.');
      return;
    }
    const saved = await withBusy(
      `key-${provider}`,
      () => simpanKunciPribadiAI(user?.uid, provider, apiKey),
      `Kunci ${provider} terverifikasi dan tersimpan terenkripsi. Layanan kini akan memilih kunci ini setelah Anda masuk.`,
    );
    if (saved) {
      setKeys((current) => ({ ...current, [provider]: '' }));
      setConsent(false);
    }
  }

  function removeCredential(provider) {
    const label = provider === 'canva' ? 'Canva' : provider;
    void withBusy(
      `remove-${provider}`,
      () => hapusKunciPribadiAI(user?.uid, provider),
      `Koneksi ${label} telah dihapus.`,
    );
  }

  async function changePreference(workflow, provider) {
    const previous = preferences[workflow];
    setPreferences((current) => ({ ...current, [workflow]: provider }));
    const saved = await withBusy(
      `pref-${workflow}`,
      () => simpanPreferensiAI(user?.uid, workflow, provider),
      'Preferensi provider tersimpan pada browser ini untuk akun Anda.',
    );
    if (!saved) setPreferences((current) => ({ ...current, [workflow]: previous }));
  }

  async function connectCanva() {
    setBusy('canva-connect');
    setError('');
    setNotice('');
    try {
      const result = await sambungkanCanva(user?.uid);
      const authorizationUrl = new URL(result?.authorizationUrl);
      if (authorizationUrl.origin !== 'https://www.canva.com') {
        throw new Error('URL otorisasi Canva tidak valid.');
      }
      window.location.assign(authorizationUrl.toString());
    } catch (cause) {
      console.error('[ai-integrations] Gagal memulai Canva OAuth:', cause);
      setError(cause?.message || 'Koneksi Canva tidak dapat dimulai.');
      setBusy('');
    }
  }

  const canvaConnected = connections?.providers?.canva?.connected === true;

  return (
    <main className="ai-integrations" aria-labelledby="ai-integrations-title">
      <header className="ai-integrations__header">
        <p className="ai-integrations__eyebrow"><Ikon nama="settings" /> Pengaturan akun</p>
        <h1 id="ai-integrations-title">AI &amp; Layanan</h1>
        <p>Sambungkan kunci AI pribadi dan layanan Canva ke akun Anda.</p>
      </header>

      <p className="ai-integrations__message is-warning" role="note">
        Prompt dan materi yang Anda kirim akan diproses oleh provider AI yang dipilih. Provider dapat
        menerapkan batas kuota atau biaya; kuota gratis tidak dijamin. Jangan kirim kata sandi atau
        data pribadi sensitif.
      </p>
      {!connections?.configured && (
        <p className="ai-integrations__message is-warning" role="status">
          Penyimpanan kunci belum diaktifkan oleh administrator. Superadmin perlu mengonfigurasi
          secret AI_CREDENTIALS_KEYRING pada Supabase Edge Functions sebelum kunci dapat disimpan.
        </p>
      )}

      {error && <p className="ai-integrations__message is-error" role="alert">{error}</p>}
      {notice && <p className="ai-integrations__message is-success" role="status">{notice}</p>}

      {!connections && !error && <p role="status">Memuat status provider…</p>}

      {connections && (
        <>
          <section className="ai-integrations__card" aria-labelledby="ai-provider-title">
            <h2 id="ai-provider-title">Koneksi provider AI</h2>
            <p>Kunci disimpan terenkripsi di backend dan tidak pernah disimpan pada browser.</p>
            <label className="ai-integrations__acknowledgement">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <span>
                Saya memahami bahwa pemeriksaan kunci mengirim permintaan uji ke provider terkait,
                dan pemakaian AI dapat tunduk pada biaya serta ketentuan provider.
              </span>
            </label>
            <div className="ai-integrations__providers">
              {PROVIDERS.map((provider) => (
                <article className="ai-integrations__provider" key={provider.id}>
                  <div className="ai-integrations__provider-heading">
                    <h3>{provider.name}</h3>
                    <span className={`ai-integrations__badge ${connections.providers[provider.id]?.available ? 'is-ready' : ''}`}>
                      {providerStatus(provider, connections)}
                    </span>
                  </div>
                  {provider.note && <p>{provider.note}</p>}
                  <a href={provider.url} target="_blank" rel="noopener noreferrer">
                    Buka portal resmi {provider.name}
                  </a>
                  <div className="ai-integrations__key-controls">
                    <label>
                      Kunci API pribadi
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={keys[provider.id]}
                        onChange={(event) => setKeys((current) => ({ ...current, [provider.id]: event.target.value }))}
                        placeholder={`Kunci ${provider.name} Anda`}
                        maxLength={4096}
                        disabled={!connections.configured || Boolean(busy)}
                      />
                    </label>
                    <div className="ai-integrations__actions">
                      <button
                        type="button"
                        disabled={!connections.configured || !consent || Boolean(busy) || !keys[provider.id].trim()}
                        onClick={() => void saveKey(provider.id)}
                      >
                        {busy === `key-${provider.id}` ? 'Memeriksa kunci…' : 'Verifikasi & simpan'}
                      </button>
                      {connections.providers[provider.id]?.personal && (
                        <button
                          type="button"
                          className="is-secondary"
                          disabled={Boolean(busy)}
                          onClick={() => removeCredential(provider.id)}
                        >
                          Hapus kunci
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="ai-integrations__card" aria-labelledby="ai-preferences-title">
            <h2 id="ai-preferences-title">Preferensi layanan AI</h2>
            <p>Kunci yang sudah tersimpan aktif otomatis saat fitur AI digunakan setelah Anda masuk.</p>
            <div className="ai-integrations__preferences">
              {[
                ['assistant', 'Asisten AI'],
                ['questions', 'Pembuatan draf soal'],
              ].map(([workflow, label]) => (
                <label key={workflow}>
                  {label}
                  <select
                    value={preferences[workflow] || 'auto'}
                    disabled={Boolean(busy)}
                    onChange={(event) => void changePreference(workflow, event.target.value)}
                  >
                    {PROVIDER_PREFERENCE_OPTIONS.map(([value, text]) => (
                      <option key={value} value={value}>{text}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </section>

          <section className="ai-integrations__card" aria-labelledby="canva-title">
            <h2 id="canva-title">Canva</h2>
            <p>
              {canvaConnected
                ? 'Akun Canva tersambung. Pembuatan desain Canva dari aplikasi belum tersedia.'
                : 'Sambungkan akun Canva melalui OAuth. Fitur pembuatan desain akan tersedia pada integrasi lanjutan.'}
            </p>
            <div className="ai-integrations__actions">
              {!canvaConnected ? (
                <button
                  type="button"
                  disabled={!connections.configured || !connections.canvaConfigured || Boolean(busy)}
                  onClick={() => void connectCanva()}
                >
                  {busy === 'canva-connect' ? 'Membuka Canva…' : 'Sambungkan Canva'}
                </button>
              ) : (
                <button
                  type="button"
                  className="is-secondary"
                  disabled={Boolean(busy)}
                  onClick={() => removeCredential('canva')}
                >
                  Putuskan Canva
                </button>
              )}
              {!connections.canvaConfigured && (
                <span className="ai-integrations__muted">OAuth Canva belum dikonfigurasi oleh administrator.</span>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
