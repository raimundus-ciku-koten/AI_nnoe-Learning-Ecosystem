import React, { useCallback, useEffect, useState } from 'react';
import Ikon from '../components/Ikon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  hapusKunciPribadiAI,
  EXTERNAL_AI_PROVIDERS_ENABLED,
  muatKoneksiAI,
  simpanKunciPribadiAI,
  simpanPreferensiAI
} from '../services/aiIntegrations.js';
import '../styles/ai-integrations.css';

const PILIHAN_PROVIDER = [
  ['auto', 'Otomatis (Gemini → DeepSeek → Groq; satu provider per permintaan)'],
  ['gemini', 'Gemini'],
  ['deepseek', 'DeepSeek'],
  ['groq', 'Groq']
];

const PROVIDER = [
  { id: 'gemini', nama: 'Gemini', kunciPribadi: true, url: 'https://aistudio.google.com/apikey' },
  { id: 'deepseek', nama: 'DeepSeek', kunciPribadi: true, url: 'https://platform.deepseek.com/api_keys' },
  { id: 'groq', nama: 'Groq', kunciPribadi: true, url: 'https://console.groq.com/keys', catatan: 'Opsi inference cepat dengan kuota gratis terbatas dari GroqCloud. Batas dan model dapat berubah sesuai kebijakan provider.' }
];

function statusProvider(provider, state) {
  if (!EXTERNAL_AI_PROVIDERS_ENABLED) return 'Dinonaktifkan (tanpa billing)';
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
      `Kunci ${provider} valid dan aktif sementara di tab ini. Kunci tidak disimpan pada server aplikasi.`
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

  return (
    <main className="ai-integrations" aria-labelledby="ai-integrations-title">
      <header className="ai-integrations__header">
        <p className="ai-integrations__eyebrow"><Ikon nama="settings" /> Pengaturan akun</p>
        <h1 id="ai-integrations-title">AI &amp; Layanan</h1>
        <p>Hubungkan provider AI dengan kunci pribadi Anda untuk membuat draf soal dan perangkat ajar. Penyusunan manual tetap tersedia.</p>
      </header>
      <p className="ai-integrations__message is-warning" role="note">
        {EXTERNAL_AI_PROVIDERS_ENABLED
          ? 'Permintaan hanya dikirim setelah Anda mengaktifkan kunci dan menekan tombol pembuatan. Draf perencanaan mengirim konteks paket yang diperlukan (mata pelajaran, kelas, CP/TP, dan tahun ajaran) langsung dari browser ke provider terpilih. Jangan masukkan data pribadi siswa. Kuota, biaya, dan kebijakan penyimpanan mengikuti provider.'
          : 'Provider AI eksternal dinonaktifkan.'}
      </p>
      <p className="ai-integrations__message" role="note">
        Kunci hanya disimpan di memori tab browser ini dan dihapus saat keluar atau menutup tab; aplikasi tidak mengirimnya ke servernya.
        Kunci yang digunakan pada browser tetap dapat diakses oleh skrip halaman. Jangan gunakan kunci bersama atau memasukkan data pribadi siswa.
        Periksa syarat, kuota, kemungkinan billing, dan kebijakan data provider sebelum mengaktifkan.
      </p>

      {error && <p className="ai-integrations__message is-error" role="alert">{error}</p>}
      {notice && <p className="ai-integrations__message is-success" role="status">{notice}</p>}

      <p className="ai-integrations__message" role="note">
        Analitik penggunaan belum diaktifkan. Aplikasi tidak mengirim peristiwa analitik.
      </p>

      {!connections && !error && <p role="status">Memuat status provider…</p>}

      {connections && (
        <>
          <section className="ai-integrations__card" aria-labelledby="ai-provider-title">
            <h2 id="ai-provider-title">Koneksi provider</h2>
            <p>{EXTERNAL_AI_PROVIDERS_ENABLED
              ? 'Periksa kunci menggunakan daftar model provider tanpa membuat konten. Kunci yang berhasil diperiksa hanya aktif sementara di tab ini.'
              : 'Koneksi provider dinonaktifkan. Pengaturan ini tidak menerima atau mengirim kunci API.'}</p>
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
                  {provider.url && <a href={provider.url} target="_blank" rel="noopener noreferrer">Buka portal resmi {provider.nama}</a>}
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
                          disabled={!EXTERNAL_AI_PROVIDERS_ENABLED}
                        />
                      </label>
                      <div className="ai-integrations__actions">
                        <button type="button" disabled={!EXTERNAL_AI_PROVIDERS_ENABLED || Boolean(busy) || !keys[provider.id].trim()} onClick={() => simpanKunci(provider.id)}>
                          {busy === `key-${provider.id}` ? 'Memeriksa kunci…' : 'Periksa & aktifkan'}
                        </button>
                        {connections.providers[provider.id].personal && (
                          <button type="button" className="is-secondary" disabled={!EXTERNAL_AI_PROVIDERS_ENABLED || Boolean(busy)} onClick={() => hapusKunci(provider.id)}>
                            Hapus dari sesi
                          </button>
                        )}
                      </div>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          <section className="ai-integrations__card" aria-labelledby="ai-preferences-title">
            <h2 id="ai-preferences-title">Preferensi per penggunaan</h2>
            <p>{EXTERNAL_AI_PROVIDERS_ENABLED
              ? 'Pengaturan berlaku untuk draf soal dan perangkat ajar selama sesi aplikasi. Otomatis memilih provider aktif pertama berdasarkan urutan Gemini, DeepSeek, Groq; jika gagal, permintaan berhenti tanpa fallback.'
              : 'Provider AI eksternal dinonaktifkan.'}</p>
            <div className="ai-integrations__preferences">
              {[
                ['questions', 'Pembuatan draf soal'],
                ['planning', 'Perencanaan (KKTP dan Modul Ajar)'],
              ].map(([workflow, label]) => (
                <label key={workflow}>
                  {label}
                  <select
                    value={preferences[workflow]}
                    disabled={!EXTERNAL_AI_PROVIDERS_ENABLED || Boolean(busy)}
                    onChange={(event) => ubahPreferensi(workflow, event.target.value)}
                  >
                    {PILIHAN_PROVIDER.map(([value, text]) => (
                      <option key={value} value={value}>{text}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <p>Asisten percakapan belum diaktifkan. RPE, Prota, dan Prosem tetap dihitung deterministik; ATP, KKTP, dan Modul Ajar dapat ditinjau serta disunting sebelum digunakan.</p>
          </section>
        </>
      )}
    </main>
  );
}
