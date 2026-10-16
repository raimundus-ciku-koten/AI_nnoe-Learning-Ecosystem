import React, { useCallback, useEffect, useState } from 'react';
import Ikon from '../components/Ikon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  hapusKunciPribadiAI,
  muatKoneksiAI,
  simpanKunciPribadiAI,
  simpanPreferensiAI
} from '../services/aiIntegrations.js';
import {
  disableBasicAnalytics,
  enableBasicAnalytics,
  getAnalyticsConsent
} from '../services/analyticsConsent.js';
import { generateFirebaseAiLogic } from '../services/firebaseAiLogic.js';
import '../styles/ai-integrations.css';

const PILIHAN_PROVIDER = [
  ['auto', 'Otomatis (Gemini → DeepSeek → Groq)'],
  ['gemini', 'Gemini'],
  ['deepseek', 'DeepSeek'],
  ['groq', 'Groq']
];

const PROVIDER = [
  { id: 'gemini', nama: 'Gemini', kunciPribadi: true, url: 'https://aistudio.google.com/apikey' },
  { id: 'deepseek', nama: 'DeepSeek', kunciPribadi: true, url: 'https://platform.deepseek.com/api_keys' },
  { id: 'groq', nama: 'Groq', kunciPribadi: true, url: 'https://console.groq.com/keys', catatan: 'Opsi inference cepat dengan kuota gratis terbatas dari GroqCloud. Batas dan model dapat berubah sesuai kebijakan provider.' },
  { id: 'cerebras', nama: 'Cerebras', catatan: 'Tidak dapat dipanggil langsung dari browser karena kebijakan CORS provider. Memerlukan proxy server-side dan tidak tersedia dalam mode tanpa billing.' },
  { id: 'claude', nama: 'Claude', catatan: 'Dinonaktifkan sampai tersedia endpoint API gratis yang dapat diverifikasi.' },
  { id: 'canva', nama: 'Canva', catatan: 'Koneksi dilakukan per akun melalui OAuth Canva Connect.' }
];

function statusProvider(provider, state) {
  if (provider.id === 'claude') return 'Belum tersedia';
  if (provider.id === 'cerebras') return 'Perlu proxy server';
  if (provider.id === 'canva') {
    if (!state?.canvaOAuthReady) return 'Menunggu konfigurasi OAuth';
    return state.providers.canva.connected ? 'Terhubung' : 'Belum terhubung';
  }
  const status = state?.providers?.[provider.id];
  if (!status?.available) return 'Belum dikonfigurasi';
  return status.personal ? 'Kunci pribadi aktif' : 'Kunci platform aktif';
}

export default function AIIntegrationsPage() {
  const { user } = useAuth();
  const [connections, setConnections] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [keys, setKeys] = useState({ gemini: '', deepseek: '', groq: '' });
  const [preferences, setPreferences] = useState({ planning: 'auto', assistant: 'auto', questions: 'auto' });
  const [analyticsConsent, setAnalyticsConsent] = useState('unset');
  const [analyticsBusy, setAnalyticsBusy] = useState(false);
  const [analyticsError, setAnalyticsError] = useState('');
  const [aiLogicPrompt, setAiLogicPrompt] = useState('');
  const [aiLogicAcknowledged, setAiLogicAcknowledged] = useState(false);
  const [aiLogicBusy, setAiLogicBusy] = useState(false);
  const [aiLogicError, setAiLogicError] = useState('');
  const [aiLogicAnswer, setAiLogicAnswer] = useState('');

  useEffect(() => {
    try {
      setAnalyticsConsent(getAnalyticsConsent());
    } catch (cause) {
      console.error('[analytics] Gagal membaca persetujuan lokal:', cause);
      setAnalyticsError('Status persetujuan Analytics tidak dapat dibaca dari penyimpanan browser.');
    }
  }, []);

  const refresh = useCallback(async () => {
    setError('');
    const result = await muatKoneksiAI(user?.uid);
    setConnections(result);
    setPreferences(result.preferences);
  }, [user?.uid]);

  useEffect(() => {
    let active = true;
    setKeys({ gemini: '', deepseek: '', groq: '' });
    if (user?.uid) {
      muatKoneksiAI(user.uid)
        .then((result) => {
          if (active) {
            setConnections(result);
            setPreferences(result.preferences);
          }
        })
        .catch((cause) => {
          console.error('[ai-integrations] Gagal memuat status provider:', cause);
          if (active) setError('Status provider AI pribadi tidak dapat dimuat.');
        });
    } else {
      setConnections(null);
      setError('Silakan masuk sebelum mengatur provider AI.');
    }
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    if (params.get('canva') === 'connected') {
      setNotice('Akun Canva berhasil dihubungkan.');
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash.split('?')[0]}`);
    } else if (params.get('canva') === 'error') {
      setError('Canva belum dapat dihubungkan. Periksa pengaturan OAuth dan coba lagi.');
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash.split('?')[0]}`);
    }
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

  async function simpanKunci(provider) {
    const apiKey = keys[provider].trim();
    if (!apiKey) {
      setError('Masukkan kunci API terlebih dahulu.');
      return;
    }
    const saved = await withBusy(
      `key-${provider}`,
      () => simpanKunciPribadiAI(user?.uid, provider, apiKey),
      `Kunci ${provider} valid dan aktif sementara di tab ini; tidak dikirim ke Firebase.`
    );
    if (saved) setKeys((current) => ({ ...current, [provider]: '' }));
  }

  function hapusKunci(provider) {
    void withBusy(`remove-${provider}`, () => hapusKunciPribadiAI(user?.uid, provider), `Kunci ${provider} dihapus dari sesi browser ini.`);
  }

  async function ubahPreferensi(workflow, provider) {
    const sebelumnya = preferences[workflow];
    setPreferences((current) => ({ ...current, [workflow]: provider }));
    const saved = await withBusy(`pref-${workflow}`, () => simpanPreferensiAI(user?.uid, workflow, provider), 'Pilihan provider tersimpan lokal untuk akun ini di browser.');
    if (!saved) setPreferences((current) => ({ ...current, [workflow]: sebelumnya }));
  }

  async function ubahPersetujuanAnalytics(enabled) {
    setAnalyticsBusy(true);
    setAnalyticsError('');
    try {
      if (enabled) {
        await enableBasicAnalytics();
        setAnalyticsConsent('granted');
      } else {
        await disableBasicAnalytics();
        setAnalyticsConsent('denied');
      }
    } catch (cause) {
      console.error('[analytics] Gagal memperbarui persetujuan:', cause);
      setAnalyticsError(cause?.message || 'Persetujuan Analytics tidak dapat diperbarui.');
    } finally {
      setAnalyticsBusy(false);
    }
  }

  async function kirimPromptAiLogic() {
    setAiLogicBusy(true);
    setAiLogicError('');
    setAiLogicAnswer('');
    try {
      if (!aiLogicAcknowledged) {
        throw new Error('Konfirmasi bahwa prompt tidak berisi data sensitif sebelum melanjutkan.');
      }
      setAiLogicAnswer(await generateFirebaseAiLogic(aiLogicPrompt));
    } catch (cause) {
      console.error('[firebase-ai-logic] Permintaan gagal:', cause);
      setAiLogicError(cause?.message || 'Permintaan Firebase AI Logic gagal.');
    } finally {
      setAiLogicBusy(false);
    }
  }

  return (
    <main className="ai-integrations" aria-labelledby="ai-integrations-title">
      <header className="ai-integrations__header">
        <p className="ai-integrations__eyebrow"><Ikon nama="settings" /> Pengaturan akun</p>
        <h1 id="ai-integrations-title">AI &amp; Layanan</h1>
        <p>Mode BYOK tanpa billing: kunci Anda dipakai langsung oleh browser untuk menghubungi provider terpilih. Kunci hanya tersimpan sementara di memori tab ini dan perlu dimasukkan kembali setelah tab ditutup atau dimuat ulang.</p>
      </header>
      <p className="ai-integrations__message is-warning" role="note">
        Kunci tidak dikirim ke Firebase, tetapi permintaan AI dan isinya dikirim langsung ke provider pilihan Anda. Provider dapat membatasi kuota atau mengenakan biaya sesuai akun dan kebijakan saat ini. Koneksi Canva/OAuth dan fitur server-side lain tidak tersedia tanpa Cloud Functions dan billing.
      </p>

      {error && <p className="ai-integrations__message is-error" role="alert">{error}</p>}
      {notice && <p className="ai-integrations__message is-success" role="status">{notice}</p>}

      <section className="ai-integrations__card" aria-labelledby="analytics-consent-title">
        <h2 id="analytics-consent-title">Analitik penggunaan (Firebase Analytics)</h2>
        <p>Persetujuan bersifat opsional dan dapat ditarik kapan saja. Jika diaktifkan, aplikasi hanya mengirim hitungan umum pembukaan aplikasi dan navigasi; URL, UID, email, prompt AI, serta data siswa tidak dicatat sebagai parameter. Google tetap dapat menerima metadata teknis standar seperti informasi perangkat dan jaringan.</p>
        <p role="status">
          Status: {analyticsConsent === 'granted' ? 'aktif' : analyticsConsent === 'denied' ? 'ditolak' : 'belum dipilih'}.
          {' '}Dashboard tersedia di Firebase Console → Analytics.
        </p>
        {analyticsError && <p className="ai-integrations__message is-error" role="alert">{analyticsError}</p>}
        <div className="ai-integrations__actions">
          <button type="button" disabled={analyticsBusy || analyticsConsent === 'granted'} onClick={() => void ubahPersetujuanAnalytics(true)}>
            {analyticsBusy ? 'Menyimpan…' : 'Setuju & aktifkan analitik dasar'}
          </button>
          <button type="button" className="is-secondary" disabled={analyticsBusy || analyticsConsent === 'denied' || analyticsConsent === 'unset'} onClick={() => void ubahPersetujuanAnalytics(false)}>
            Tolak / tarik persetujuan
          </button>
        </div>
      </section>

      <section className="ai-integrations__card" aria-labelledby="ai-logic-title">
        <h2 id="ai-logic-title">Firebase AI Logic (Gemini Developer API)</h2>
        <p>Gunakan hanya untuk prompt umum yang tidak sensitif. Prompt akan dikirim ke Google untuk pemrosesan; jangan sertakan nama, identitas, nilai, kesehatan, kredensial, atau informasi siswa/sekolah yang dapat dikenali. Permintaan langsung memakai App Check dan tidak memiliki fallback provider otomatis. Kuota gratis dan ketersediaan dapat berubah; pastikan Firebase AI Logic dan enforcement App Check sudah diaktifkan di Firebase Console.</p>
        <label className="ai-integrations__prompt">
          Prompt non-sensitif
          <textarea
            value={aiLogicPrompt}
            onChange={(event) => setAiLogicPrompt(event.target.value)}
            maxLength={5000}
            rows={5}
            placeholder="Contoh: Berikan tiga tips umum untuk membuat tujuan pembelajaran lebih terukur."
          />
        </label>
        <label className="ai-integrations__acknowledgement">
          <input
            type="checkbox"
            checked={aiLogicAcknowledged}
            onChange={(event) => setAiLogicAcknowledged(event.target.checked)}
          />
          Saya memastikan prompt ini tidak berisi data pribadi atau informasi sensitif.
        </label>
        <div className="ai-integrations__actions">
          <button type="button" disabled={aiLogicBusy || !aiLogicAcknowledged || !aiLogicPrompt.trim()} onClick={() => void kirimPromptAiLogic()}>
            {aiLogicBusy ? 'Memproses…' : 'Kirim prompt ke Firebase AI Logic'}
          </button>
        </div>
        {aiLogicError && <p className="ai-integrations__message is-error" role="alert">{aiLogicError}</p>}
        {aiLogicAnswer && <div className="ai-integrations__ai-answer" aria-live="polite"><h3>Jawaban AI</h3><p>{aiLogicAnswer}</p></div>}
      </section>

      {!connections && !error && <p role="status">Memuat status provider…</p>}

      {connections && (
        <>
          <section className="ai-integrations__card" aria-labelledby="ai-provider-title">
            <h2 id="ai-provider-title">Koneksi provider</h2>
            <p>Masukkan kunci API dari akun provider Anda. Kunci hanya disimpan di memori tab dan digunakan untuk menghubungi provider secara langsung.</p>
            <div className="ai-integrations__providers">
              {PROVIDER.map((provider) => (
                <article className="ai-integrations__provider" key={provider.id}>
                  <div className="ai-integrations__provider-heading">
                    <h3>{provider.nama}</h3>
                    <span className={`ai-integrations__badge ${connections.providers[provider.id]?.available ? 'is-ready' : ''}`}>
                      {statusProvider(provider, connections)}
                    </span>
                  </div>
                  {provider.catatan && <p>{provider.catatan}</p>}
                  {provider.url && <a href={provider.url} target="_blank" rel="noopener noreferrer">Dapatkan kunci API di {provider.nama}</a>}
                  {provider.kunciPribadi ? (
                    <div className="ai-integrations__key-controls">
                      <label>
                        Kunci API pribadi (hanya di memori tab ini)
                        <input
                          type="password"
                          autoComplete="new-password"
                          value={keys[provider.id]}
                          onChange={(event) => setKeys((current) => ({ ...current, [provider.id]: event.target.value }))}
                          placeholder={`Kunci ${provider.nama} Anda`}
                          maxLength={4096}
                        />
                      </label>
                      <div className="ai-integrations__actions">
                        <button type="button" disabled={Boolean(busy) || !keys[provider.id].trim()} onClick={() => simpanKunci(provider.id)}>
                          {busy === `key-${provider.id}` ? 'Memeriksa kunci…' : 'Periksa & aktifkan'}
                        </button>
                        {connections.providers[provider.id].personal && (
                          <button type="button" className="is-secondary" disabled={Boolean(busy)} onClick={() => hapusKunci(provider.id)}>
                            Hapus dari sesi
                          </button>
                        )}
                      </div>
                    </div>
                  ) : null}
                      {provider.id === 'canva' && (
                        <p>Canva Connect perlu OAuth dan backend server-side; tidak tersedia dalam mode gratis tanpa billing.</p>
                      )}
                </article>
              ))}
            </div>
          </section>

          <section className="ai-integrations__card" aria-labelledby="ai-preferences-title">
            <h2 id="ai-preferences-title">Preferensi per penggunaan</h2>
            <p>Pilihan otomatis mencoba kunci yang tersedia berurutan: Gemini, DeepSeek, lalu Groq. Cerebras perlu proxy server-side karena CORS. Preferensi tersimpan di browser ini per UID akun, tidak tersinkron ke perangkat lain. Provider gratis dapat memiliki kuota dan batas yang berubah. RPE tetap dihitung oleh mesin lokal tanpa AI.</p>
            <div className="ai-integrations__preferences">
              {[
                ['planning', 'Perencanaan (ATP/KKTP/Modul)'],
                ['assistant', 'Asisten AI'],
                ['questions', 'Pembuatan soal biasa']
              ].map(([workflow, label]) => (
                <label key={workflow}>
                  {label}
                  <select
                    value={preferences[workflow]}
                    disabled={Boolean(busy)}
                    onChange={(event) => ubahPreferensi(workflow, event.target.value)}
                  >
                    {PILIHAN_PROVIDER.map(([value, text]) => (
                      <option key={value} value={value}>{text}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
