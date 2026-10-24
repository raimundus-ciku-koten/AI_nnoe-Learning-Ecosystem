import React, { useEffect, useRef, useState } from 'react';
import '../styles/assistant.css';
import Ikon from '../components/Ikon.jsx';
import { usePlatformControls } from '../context/PlatformControlContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { tanyaAsisten } from '../services/aiAssistant.js';

const SARAN = [
  'Buat ide kegiatan pembuka pembelajaran yang menarik.',
  'Bantu saya menjelaskan konsep sulit dengan contoh sederhana.',
  'Susun pertanyaan refleksi untuk siswa setelah belajar.',
];
const MAKS_RIWAYAT_TAMPIL = 100;
const NAMA_PROVIDER = {
  'local-qwen': 'Qwen 2.5 1.5B (lokal)',
  'local-llama': 'Llama 3.2 3B (lokal)',
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
  groq: 'Groq',
};

export default function AsistenPage() {
  const { features } = usePlatformControls();
  const { user } = useAuth();
  const aiEnabled = features.aiAssistant;
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState('');
  const daftarRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const daftar = daftarRef.current;
    if (daftar) daftar.scrollTop = daftar.scrollHeight;
  }, [messages, busy]);

  async function kirim(teks = draft) {
    const pertanyaan = teks.trim();
    if (!pertanyaan || busy) return;
    if (!aiEnabled) {
      setError('Asisten AI sedang dinonaktifkan oleh administrator.');
      return;
    }
    const berikutnya = [...messages, { role: 'user', text: pertanyaan }].slice(-MAKS_RIWAYAT_TAMPIL);
    setMessages(berikutnya);
    setDraft('');
    setError('');
    setBusy(true);
    try {
      const hasil = await tanyaAsisten(user?.uid, berikutnya.slice(-16).map(({ role, text }) => ({ role, text })));
      setMessages((lama) => [...lama, { role: 'assistant', text: hasil.answer }].slice(-MAKS_RIWAYAT_TAMPIL));
      setProvider(NAMA_PROVIDER[hasil.penyedia] || hasil.penyedia);
    } catch (err) {
      console.error('[asisten] Permintaan AI gagal:', err);
      setError(err.message || 'Permintaan AI gagal. Silakan coba lagi.');
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  async function ulangiPermintaan() {
    if (busy || !messages.length) return;
    if (!aiEnabled) {
      setError('Asisten AI sedang dinonaktifkan oleh administrator.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const hasil = await tanyaAsisten(user?.uid, messages.slice(-16).map(({ role, text }) => ({ role, text })));
      setMessages((lama) => [...lama, { role: 'assistant', text: hasil.answer }].slice(-MAKS_RIWAYAT_TAMPIL));
      setProvider(NAMA_PROVIDER[hasil.penyedia] || hasil.penyedia);
    } catch (err) {
      console.error('[asisten] Pengulangan permintaan AI gagal:', err);
      setError(err.message || 'Permintaan AI gagal. Silakan coba lagi.');
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    void kirim();
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void kirim();
    }
  }

  function mulaiBaru() {
    if (busy) return;
    setMessages([]);
    setError('');
    setProvider('');
    setDraft('');
    inputRef.current?.focus();
  }

  return (
    <section className="ai-page" aria-labelledby="ai-heading">
      <div className="ai-heading-row">
        <div>
          <p className="ai-eyebrow">AI_nnoe Learning Ecosystem</p>
          <h2 id="ai-heading">Asisten AI</h2>
          <p className="ai-subheading">
            Teman diskusi untuk ide pembelajaran, materi, dan kegiatan kelas.
          </p>
        </div>
        <button type="button" className="ai-new-chat" onClick={mulaiBaru} disabled={busy || !messages.length}>
          <Ikon nama="refresh" /> Percakapan baru
        </button>
      </div>

      <div className="ai-chat-card">
        <div className="ai-chat-meta">
          <span className="ai-status"><span aria-hidden="true" /> {aiEnabled ? 'Siap membantu' : 'Layanan dinonaktifkan'}</span>
          <span>Chat selalu menggunakan AI_nnoe lokal; API provider eksternal tidak dipakai di sini.</span>
        </div>

        {!aiEnabled && (
          <p className="ai-error" role="status">Asisten AI sementara dinonaktifkan oleh administrator.</p>
        )}

        <div className="ai-messages" ref={daftarRef} aria-live="polite" aria-relevant="additions text">
          {!messages.length && (
            <div className="ai-welcome">
              <span className="ai-welcome-icon"><Ikon nama="spark" /></span>
              <h3>Apa yang ingin Anda siapkan hari ini?</h3>
              <p>Tanyakan sesuatu atau pilih contoh untuk memulai.</p>
              <div className="ai-suggestions">
                {SARAN.map((saran) => (
                  <button key={saran} type="button" onClick={() => void kirim(saran)} disabled={busy || !aiEnabled}>
                    {saran}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message, index) => (
            <article key={`${index}-${message.role}`} className={`ai-message ai-message-${message.role}`}>
              <div className="ai-message-label">{message.role === 'user' ? 'Anda' : 'Asisten AI'}</div>
              <p>{message.text}</p>
            </article>
          ))}
          {busy && (
            <div className="ai-message ai-message-assistant" role="status">
              <div className="ai-message-label">Asisten AI</div>
              <p className="ai-thinking"><span /><span /><span /> Sedang menyiapkan jawaban…</p>
            </div>
          )}
        </div>

        {error && (
          <div className="ai-error" role="alert">
            <span>{error}</span>
            {aiEnabled && <button type="button" onClick={() => void ulangiPermintaan()} disabled={busy}>Coba lagi</button>}
          </div>
        )}

        <form className="ai-composer" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="ai-prompt">Pesan untuk Asisten AI</label>
          <textarea
            ref={inputRef}
            id="ai-prompt"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={3000}
            placeholder="Tulis pertanyaan atau kebutuhan Anda…"
            rows={3}
            disabled={busy || !aiEnabled}
          />
          <div className="ai-composer-footer">
            <span>Jangan kirim kata sandi atau data pribadi sensitif.</span>
            <button type="submit" disabled={busy || !draft.trim() || !aiEnabled}>
              <Ikon nama="chat" /> {busy ? 'Mengirim…' : 'Kirim'}
            </button>
          </div>
        </form>
        <p className="ai-provider-note">
          {provider ? `Jawaban terakhir dibuat dengan ${provider}. ` : ''}
          Jawaban AI dapat keliru; periksa kembali informasi penting.
        </p>
      </div>
    </section>
  );
}
