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
  cancelLocalAiPreparation,
  getRecommendedLocalAiModel,
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
  const [preferences, setPreferences] = useState(() => {
    const recommendedModel = getRecommendedLocalAiModel();
    return {
      planning: recommendedModel,
      assistant: recommendedModel,
      questions: recommendedModel,
    };
  });
  const [modelToPrepare, setModelToPrepare] = useState(() => getRecommendedLocalAiModel());
  const [confirmModel, setConfirmModel] = useState('');
  const [failedModel, setFailedModel] = useState('');
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
    setConfirmModel('');
    setFailedModel('');
    setError('');
    setNotice('');
    setLocalStatus({ ready: false, model: '', loading: true });
    try {
      await prepareLocalAiModel(model);
      setLocalStatus(getLocalAiStatus());
      setNotice(`${LOCAL_AI_MODELS[model].name} siap. Model ini dijalankan di perangkat dan respons prompt tidak dikirim ke penyedia AI.`);
    } catch (cause) {
      if (cause?.name === 'AbortError') {
        setNotice('Persiapan model dibatalkan. Model tidak diunduh lagi sampai Anda memilih untuk menyiapkannya.');
        setLocalStatus(getLocalAiStatus());
        setBusy('');
        return;
      }
      console.error('[ai-integrations] Gagal menyiapkan model lokal:', cause);
      setError(cause?.message || 'Model lokal tidak dapat disiapkan pada perangkat ini.');
      setFailedModel(model);
      setLocalStatus(getLocalAiStatus());
    } finally {
      setBusy('');
    }
  }

  function requestModelPreparation(model) {
    setError('');
    setNotice('');
    setConfirmModel(model);
    setModelToPrepare(model);
  }

  function cancelModelPreparation() {
    if (!cancelLocalAiPreparation()) return;
    setLocalStatus(getLocalAiStatus());
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

  const recommendedLocalModel = getRecommendedLocalAiModel();
  const lowMemory = recommendedLocalModel === 'local-qwen-small';
  const reportedMemory = typeof navigator !== 'undefined' ? navigator.deviceMemory : undefined;

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
          <h3>Qwen 2.5 7B Instruct · kuantisasi 4-bit</h3>
          <p>Model kualitas tinggi untuk asisten, draf soal, dan perencanaan; tidak memerlukan API key.</p>
          <p>Unduhan pertama sekitar 4,5 GB. Katalog WebLLM memperkirakan kebutuhan GPU sekitar 5,1 GB VRAM; kebutuhan aktual dapat lebih tinggi bergantung pada browser, panjang konteks, dan perangkat.</p>
          <button
            type="button"
            className={recommendedLocalModel === 'local-qwen' ? undefined : 'is-secondary'}
            disabled={Boolean(busy)}
            onClick={() => requestModelPreparation('local-qwen')}
          >
            {busy === 'model' && modelToPrepare === 'local-qwen' ? 'Mengunduh/menyiapkan Qwen 7B…' : 'Pilih Qwen 7B · ±4,5 GB'}
          </button>
        </div>
        <div className="ai-integrations__provider">
          <h3>Alternatif — Qwen 2.5 1.5B Instruct · kuantisasi 4-bit</h3>
          <p>Gunakan jika GPU tidak menyediakan memori yang cukup untuk model 7B. Unduhan pertama sekitar 1 GB dengan estimasi kebutuhan WebGPU sekitar 1,6 GB VRAM.</p>
          <button
            type="button"
            className={recommendedLocalModel === 'local-qwen-small' ? undefined : 'is-secondary'}
            disabled={Boolean(busy)}
            onClick={() => requestModelPreparation('local-qwen-small')}
          >
            {busy === 'model' && modelToPrepare === 'local-qwen-small' ? 'Menyiapkan model…' : 'Pilih Qwen 1.5B · ±1 GB'}
          </button>
        </div>
        {confirmModel && (
          <section className="ai-integrations__message is-warning" aria-labelledby="local-model-confirm-title">
            <h3 id="local-model-confirm-title">Konfirmasi persiapan model</h3>
            <p>
              {LOCAL_AI_MODELS[confirmModel].name} memerlukan unduhan pertama
              {' '}{LOCAL_AI_MODELS[confirmModel].downloadSize}. Pastikan koneksi dan ruang penyimpanan browser mencukupi.
              File model dapat tetap tersimpan di cache browser dan diunduh ulang jika cache dibersihkan.
              Persiapan hanya berjalan di perangkat ini; kapasitas GPU belum dapat dipastikan aplikasi.
            </p>
            <div className="ai-integrations__actions">
              <button type="button" onClick={() => void prepareModel(confirmModel)}>
                Konfirmasi dan siapkan {confirmModel === 'local-qwen' ? 'Qwen 7B' : 'Qwen 1.5B'}
              </button>
              <button type="button" className="is-secondary" onClick={() => setConfirmModel('')}>
                Batal
              </button>
            </div>
          </section>
        )}
        {progress && (
          <p role="status" aria-live="polite">
            {formatProgress(progress)}
            {Number.isFinite(progress.progress) && (
              <progress max="1" value={progress.progress} aria-label="Progres pengunduhan model" />
            )}
          </p>
        )}
        {busy === 'model' && (
          <button type="button" className="is-secondary" onClick={cancelModelPreparation}>
            Batalkan persiapan model
          </button>
        )}
        {failedModel === 'local-qwen' && !busy && (
          <p className="ai-integrations__message is-warning" role="status">
            Qwen 7B tidak berhasil disiapkan. Anda dapat mencoba Qwen 1.5B sebagai alternatif yang lebih ringan.
            {' '}
            <button type="button" className="is-secondary" onClick={() => requestModelPreparation('local-qwen-small')}>
              Pilih Qwen 1.5B
            </button>
          </p>
        )}
        <p className="ai-integrations__message" role="note">
          Rekomendasi perangkat saat ini: <strong>{LOCAL_AI_MODELS[recommendedLocalModel].name}</strong>
          {Number.isFinite(reportedMemory)
            ? ` berdasarkan sinyal RAM perangkat sekitar ${reportedMemory} GB.`
            : ' karena browser tidak memberikan sinyal RAM perangkat.'}
          {' '}Sinyal ini bukan pengukuran VRAM dan tidak menjamin model dapat dimuat.
          Untuk Qwen 7B, gunakan Chrome/Edge terbaru, WebGPU aktif, GPU dengan sekitar 6 GB VRAM tersedia, dan RAM sistem 16 GB atau lebih sebagai rekomendasi.
          Unduhan hanya dimulai setelah tombol model ditekan dan memakai ruang cache browser.
        </p>
        {lowMemory && (
          <p className="ai-integrations__message is-warning" role="note">
            Browser melaporkan perangkat dengan RAM sekitar 4 GB atau kurang. Qwen 1.5B disarankan sebagai pilihan awal; Qwen 7B tetap tersedia, tetapi kemungkinan gagal dimuat pada perangkat ini.
          </p>
        )}
        <p className="ai-integrations__message" role="status">
          Status lokal: {localStatus.loading ? 'sedang memuat' : localStatus.ready ? `${providerLabel(localStatus.model)} siap` : 'belum dimuat'}.
        </p>
      </section>

      <section className="ai-integrations__card" aria-labelledby="ai-preferences-title">
        <h2 id="ai-preferences-title">Pilih model untuk tiap fitur</h2>
        <p>Model lokal awal mengikuti rekomendasi perangkat; Anda dapat mengubah pilihan kapan saja. Preferensi yang sudah tersimpan tetap dihormati. Unduhan hanya dimulai setelah Anda menekan tombol model. Chat selalu memakai AI_nnoe lokal; pilihan provider eksternal hanya berlaku untuk generator yang menyediakan pilihan AI_eksternal. Jangan aktifkan API key kecuali Anda memahami pemindahan prompt dan potensi tagihan provider.</p>
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
                    <option key={id} value={id}>
                      {model.name} · lokal{id === recommendedLocalModel ? ' · rekomendasi perangkat' : ''}
                    </option>
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
