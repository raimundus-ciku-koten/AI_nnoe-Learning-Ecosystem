import React, { useCallback, useEffect, useState } from 'react';
import Ikon from '../components/Ikon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  hapusKunciPribadiAI,
  muatKoneksiAI,
  simpanKunciPribadiAI,
  simpanPreferensiAI,
} from '../services/aiIntegrations.js';
import {
  getLocalAiStatus,
  LOCAL_AI_MODELS,
  prepareLocalAiModel,
  subscribeLocalAiProgress,
} from '../services/localAi.js';
import '../styles/ai-integrations.css';

const PROVIDERS = [
  { id: 'gemini', name: 'Gemini', url: 'https://aistudio.google.com/apikey' },
  { id: 'deepseek', name: 'DeepSeek', url: 'https://platform.deepseek.com/api_keys' },
  { id: 'groq', name: 'Groq', url: 'https://console.groq.com/keys' },
];
const WORKFLOWS = [
  ['planning', 'Perencanaan (ATP/KKTP/Modul)'],
  ['assistant', 'Asisten AI'],
  ['questions', 'Pembuatan draf soal'],
];
const MODEL_OPTIONS = Object.entries(LOCAL_AI_MODELS);
const MODEL_LABELS = Object.fromEntries(MODEL_OPTIONS.map(([key, model]) => [key, model.name]));

function providerLabel(id) {
  return MODEL_LABELS[id] || PROVIDERS.find((provider) => provider.id === id)?.name || id;
}

function formatProgress(progress) {
  if (Number.isFinite(progress.progress)) {
    return `${progress.status} ${Math.round(progress.progress * 100)}%`;
  }
  return progress.status;
}

export default function AIIntegrationsPage() {
  const { user } = useAuth();
  const [connections, setConnections] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [keys, setKeys] = useState({ gemini: '', deepseek: '', groq: '' });
  const [preferences, setPreferences] = useState({
    planning: 'local-qwen',
    assistant: 'local-qwen',
    questions: 'local-qwen',
  });
  const [modelToPrepare, setModelToPrepare] = useState('local-qwen');
  const [localStatus, setLocalStatus] = useState(getLocalAiStatus);
  const [progress, setProgress] = useState(null);
  const [apiDisclosureAccepted, setApiDisclosureAccepted] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.uid) return;
    const result = await muatKoneksiAI(user.uid);
    setConnections(result);
    setPreferences(result.preferences);
  }, [user?.uid]);

  useEffect(() => {
    let active = true;
    setKeys({ gemini: '', deepseek: '', groq: '' });
    setConnections(null);
    setApiDisclosureAccepted(false);
    setNotice('');
    if (!user?.uid) {
      setError('Silakan masuk sebelum mengatur provider AI.');
      return undefined;
    }
    setError('');
    muatKoneksiAI(user.uid)
      .then((result) => {
        if (!active) return;
        setConnections(result);
        setPreferences(result.preferences);
      })
      .catch((cause) => {
        console.error('[ai-integrations] Gagal memuat status provider:', cause);
        if (active) setError('Status provider AI pribadi tidak dapat dimuat.');
      });
    return () => { active = false; };
  }, [user?.uid]);

  useEffect(() => subscribeLocalAiProgress((next) => {
    setProgress(next);
    setLocalStatus(getLocalAiStatus());
  }), []);

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

  async function prepareModel(model) {
    setBusy('model');
    setError('');
    setNotice('');
    setLocalStatus({ ready: false, model: '', loading: true });
    try {
      await prepareLocalAiModel(model);
      setLocalStatus(getLocalAiStatus());
      setNotice(`${LOCAL_AI_MODELS[model].name} siap. Model ini dijalankan di perangkat dan respons prompt tidak dikirim ke penyedia AI.`);
    } catch (cause) {
      console.error('[ai-integrations] Gagal menyiapkan model lokal:', cause);
      setError(cause?.message || 'Model lokal tidak dapat disiapkan pada perangkat ini.');
      setLocalStatus(getLocalAiStatus());
    } finally {
      setBusy('');
    }
  }

  async function simpanKunci(provider) {
    if (!apiDisclosureAccepted) {
      setError('Setujui dulu bahwa prompt akan dikirim ke provider dan ketentuan kuota/biaya provider berlaku.');
      return;
    }
    const apiKey = keys[provider].trim();
    if (!apiKey) {
      setError('Masukkan kunci API terlebih dahulu.');
      return;
    }
    const saved = await withBusy(
      `key-${provider}`,
      () => simpanKunciPribadiAI(user?.uid, provider, apiKey),
      `Kunci ${providerLabel(provider)} hanya aktif di memori tab ini. Prompt akan dikirim langsung ke provider tersebut bila dipilih.`,
    );
    if (saved) setKeys((current) => ({ ...current, [provider]: '' }));
  }

  function hapusKunci(provider) {
    void withBusy(
      `remove-${provider}`,
      () => hapusKunciPribadiAI(user?.uid, provider),
      `Kunci ${providerLabel(provider)} dihapus dari memori sesi.`,
    );
  }

  async function ubahPreferensi(workflow, provider) {
    const previous = preferences[workflow];
    setPreferences((current) => ({ ...current, [workflow]: provider }));
    const saved = await withBusy(
      `pref-${workflow}`,
      () => simpanPreferensiAI(user?.uid, workflow, provider),
      `Pilihan ${providerLabel(provider)} tersimpan di browser untuk sesi akun ini. Logout menghapus preferensi dan kunci sesi.`,
    );
    if (!saved) setPreferences((current) => ({ ...current, [workflow]: previous }));
  }

  const lowMemory = typeof navigator !== 'undefined' &&
    Number.isFinite(navigator.deviceMemory) && navigator.deviceMemory <= 4;

  return (
    <main className="ai-integrations" aria-labelledby="ai-integrations-title">
      <header className="ai-integrations__header">
        <p className="ai-integrations__eyebrow"><Ikon nama="settings" /> Pengaturan akun</p>
        <h1 id="ai-integrations-title">AI &amp; Layanan</h1>
        <p>Urutan rekomendasi: model lokal privat, model lokal lebih besar, lalu API key pribadi sebagai opsi ketiga.</p>
      </header>

      {error && <p className="ai-integrations__message is-error" role="alert">{error}</p>}
      {notice && <p className="ai-integrations__message is-success" role="status">{notice}</p>}

      <section className="ai-integrations__card" aria-labelledby="ai-local-title">
        <h2 id="ai-local-title">1. Utama — AI lokal di perangkat</h2>
        <p>WebLLM memakai WebGPU. Prompt diproses di browser tanpa API key dan tanpa mengirim isi prompt ke server model. File model diunduh dari distribusi model saat pertama kali disiapkan, lalu cache browser dapat menggunakannya kembali.</p>
        <div className="ai-integrations__provider">
          <h3>Qwen 2.5 1.5B Instruct · kuantisasi 4-bit</h3>
          <p>Model default untuk asisten, draf soal, dan perencanaan; tak perlu API key.</p>
          <p>Perkiraan kebutuhan WebGPU sekitar 1,6 GB VRAM untuk konfigurasi model ini, bukan ukuran RAM sistem atau ukuran unduhan yang dijamin.</p>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => { setModelToPrepare('local-qwen'); void prepareModel('local-qwen'); }}
          >
            {busy === 'model' && modelToPrepare === 'local-qwen' ? 'Menyiapkan model…' : 'Siapkan model utama Qwen'}
          </button>
        </div>
        <div className="ai-integrations__provider">
          <h3>2. Alternatif — Llama 3.2 3B Instruct · kuantisasi 4-bit</h3>
          <p>Model lebih besar untuk dicoba pada perangkat dengan GPU memadai; estimasi WebLLM sekitar 2,3 GB VRAM. Tidak direkomendasikan untuk perangkat 2 GB dan bisa berat pada perangkat 4 GB.</p>
          <button
            type="button"
            className="is-secondary"
            disabled={Boolean(busy)}
            onClick={() => { setModelToPrepare('local-llama'); void prepareModel('local-llama'); }}
          >
            {busy === 'model' && modelToPrepare === 'local-llama' ? 'Menyiapkan model…' : 'Siapkan model Llama 3B'}
          </button>
        </div>
        {progress && (
          <p role="status" aria-live="polite">
            {formatProgress(progress)}
            {Number.isFinite(progress.progress) && (
              <progress max="1" value={progress.progress} aria-label="Progres pengunduhan model" />
            )}
          </p>
        )}
        <p className="ai-integrations__message" role="note">
          Rekomendasi praktis: Chrome/Edge terbaru, WebGPU dan akselerasi grafis aktif, serta RAM 8 GB atau lebih untuk pengalaman lebih stabil. RAM 2–4 GB tetap boleh mencoba Qwen, tetapi performa, waktu muat, atau keberhasilan tidak dapat dijamin; tutup tab/aplikasi lain dan gunakan model utama yang lebih kecil. Model 3B memerlukan GPU yang lebih besar. Aplikasi tidak dapat mengukur VRAM secara andal.
        </p>
        {lowMemory && (
          <p className="ai-integrations__message is-warning" role="note">
            Browser melaporkan perangkat dengan RAM sekitar 4 GB atau kurang. Mulai dari Qwen 1.5B; Llama 3B kemungkinan kehabisan memori.
          </p>
        )}
        <p className="ai-integrations__message" role="status">
          Status lokal: {localStatus.loading ? 'sedang memuat' : localStatus.ready ? `${providerLabel(localStatus.model)} siap` : 'belum dimuat'}.
        </p>
      </section>

      <section className="ai-integrations__card" aria-labelledby="ai-preferences-title">
        <h2 id="ai-preferences-title">Pilih model untuk tiap fitur</h2>
        <p>Awali dengan Qwen. Unduhan dimulai hanya setelah Anda menekan tombol siapkan model. Chat selalu memakai AI_nnoe lokal; pilihan provider eksternal hanya berlaku untuk generator yang menyediakan pilihan AI_eksternal. Jangan aktifkan API key kecuali Anda memahami pemindahan prompt dan potensi tagihan provider.</p>
        {!connections && !error && <p role="status">Memuat pilihan akun…</p>}
        {connections && (
          <div className="ai-integrations__preferences">
            {WORKFLOWS.map(([workflow, label]) => (
              <label key={workflow}>
                {label}
                <select
                  value={preferences[workflow]}
                  disabled={Boolean(busy)}
                  onChange={(event) => void ubahPreferensi(workflow, event.target.value)}
                >
                  {MODEL_OPTIONS.map(([id, model]) => (
                    <option key={id} value={id}>{model.name} · lokal</option>
                  ))}
                  {(workflow === 'assistant' ? [] : PROVIDERS).filter((provider) => connections.providers[provider.id]?.available)
                    .map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        API pribadi · {provider.name}
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="ai-integrations__card" aria-labelledby="ai-byok-title">
        <h2 id="ai-byok-title">3. Opsi terakhir — API key pribadi</h2>
        <p>API key tidak dibuat aplikasi. Kunci yang Anda masukkan hanya disimpan di memori tab ini, tidak masuk Supabase/localStorage/log, dan hilang saat sesi ditutup. Penyimpanan kunci terenkripsi di Drive belum tersedia.</p>
        <p className="ai-integrations__message is-warning" role="alert">
          Saat memilih provider API, prompt yang dikirim dapat berisi data yang Anda tulis dan akan keluar dari perangkat menuju provider. Provider dapat mengubah kuota, syarat, harga, atau meminta metode pembayaran; free tier bukan jaminan bebas biaya. Jangan kirim informasi pribadi atau data siswa.
        </p>
        <label className="ai-integrations__acknowledgement">
          <input
            type="checkbox"
            checked={apiDisclosureAccepted}
            onChange={(event) => setApiDisclosureAccepted(event.target.checked)}
          />
          Saya memahami prompt dikirim ke provider pilihan saya, API key hanya berlaku di sesi ini, dan biaya/kuota provider menjadi tanggung jawab akun provider saya.
        </label>
        <div className="ai-integrations__providers">
          {PROVIDERS.map((provider) => (
            <article className="ai-integrations__provider" key={provider.id}>
              <div className="ai-integrations__provider-heading">
                <h3>{provider.name}</h3>
                <span className={`ai-integrations__badge ${connections?.providers[provider.id]?.available ? 'is-ready' : ''}`}>
                  {connections?.providers[provider.id]?.available ? 'Key aktif di memori tab' : 'Belum dihubungkan'}
                </span>
              </div>
              <a href={provider.url} target="_blank" rel="noopener noreferrer">Buka portal resmi {provider.name}</a>
              <label>
                API key {provider.name} — hanya di memori tab
                <input
                  type="password"
                  autoComplete="new-password"
                  value={keys[provider.id]}
                  onChange={(event) => setKeys((current) => ({ ...current, [provider.id]: event.target.value }))}
                  maxLength={4096}
                  disabled={Boolean(busy)}
                />
              </label>
              <div className="ai-integrations__actions">
                <button
                  type="button"
                  disabled={!apiDisclosureAccepted || Boolean(busy) || !keys[provider.id].trim()}
                  onClick={() => void simpanKunci(provider.id)}
                >
                  Simpan key di sesi ini
                </button>
                {connections?.providers[provider.id]?.personal && (
                  <button
                    type="button"
                    className="is-secondary"
                    disabled={Boolean(busy)}
                    onClick={() => hapusKunci(provider.id)}
                  >
                    Hapus key dari sesi
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <p className="ai-integrations__message" role="note">
        Analitik penggunaan AI tidak aktif. Jawaban model lokal maupun provider eksternal dapat keliru; periksa dan sunting hasil belajar sebelum digunakan.
      </p>
    </main>
  );
}
