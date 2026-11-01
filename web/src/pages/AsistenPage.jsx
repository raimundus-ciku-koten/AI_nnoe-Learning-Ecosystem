import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../styles/assistant.css';
import Ikon from '../components/Ikon.jsx';
import SafeMarkdown from '../components/SafeMarkdown.jsx';
import AssistantArtifacts from '../components/AssistantArtifacts.jsx';
import { usePlatformControls } from '../context/PlatformControlContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { tanyaAsistenStreaming } from '../services/aiAssistant.js';
import {
  cariKonteksDokumenLokal,
  daftarDokumenBelajarLokal,
  hapusDokumenBelajarLokal,
  indeksDokumenBelajarLokal,
} from '../services/localStudyDocuments.js';
import { extractAssistantArtifacts } from '../services/assistantArtifacts.js';

const SARAN = [
  'Buat ide kegiatan pembuka pembelajaran yang menarik.',
  'Bantu saya menjelaskan konsep sulit dengan contoh sederhana.',
  'Susun pertanyaan refleksi untuk siswa setelah belajar.',
];
const MAKS_RIWAYAT_TAMPIL = 100;

function ubahJawabanTerakhir(messages, transform) {
  const index = messages.length - 1;
  if (index < 0 || messages[index].role !== 'assistant') return messages;
  return [...messages.slice(0, index), transform(messages[index])];
}

export default function AsistenPage() {
  const { features } = usePlatformControls();
  const { user } = useAuth();
  const aiEnabled = features.aiAssistant;
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState('');
  const [documents, setDocuments] = useState([]);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [documentNotice, setDocumentNotice] = useState('');
  const [documentError, setDocumentError] = useState('');
  const [nearBottom, setNearBottom] = useState(true);
  const daftarRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const controllerRef = useRef(null);
  const documentTaskRef = useRef(null);
  const { assistantViews, assistantArtifacts } = useMemo(() => {
    const views = [];
    const artifacts = [];
    messages.forEach((message, messageIndex) => {
      if (message.role !== 'assistant') {
        views.push({ message, visible: message.text });
        return;
      }
      const parsed = extractAssistantArtifacts(message.text);
      views.push({ message, visible: parsed.visible });
      parsed.artifacts.forEach((artifact, artifactIndex) => {
        artifacts.push({
          ...artifact,
          key: `${messageIndex}:${artifactIndex}:${artifact.id}`,
        });
      });
    });
    const versions = new Map();
    const versionTotals = new Map();
    artifacts.forEach(({ id }) => versionTotals.set(id, (versionTotals.get(id) || 0) + 1));
    const preparedArtifacts = artifacts.map((artifact) => {
      const version = (versions.get(artifact.id) || 0) + 1;
      versions.set(artifact.id, version);
      return { ...artifact, version, versionCount: versionTotals.get(artifact.id) };
    });
    return { assistantViews: views, assistantArtifacts: preparedArtifacts };
  }, [messages]);

  useEffect(() => {
    let active = true;
    controllerRef.current?.abort();
    controllerRef.current = null;
    documentTaskRef.current = null;
    setBusy(false);
    setDocumentBusy(false);
    setMessages([]);
    setDraft('');
    setError('');
    setProvider('');
    setDocuments([]);
    setDocumentNotice('');
    setDocumentError('');
    setNearBottom(true);
    if (user?.uid) {
      daftarDokumenBelajarLokal(user.uid).then((result) => {
        if (active) setDocuments(result);
      }).catch((cause) => {
        console.error('[asisten] Dokumen lokal tidak dapat dimuat:', cause);
        if (active) setDocumentError(cause?.message || 'Daftar dokumen lokal tidak dapat dimuat.');
      });
    }
    return () => {
      active = false;
      controllerRef.current?.abort();
    };
  }, [user?.uid]);

  useEffect(() => {
    const daftar = daftarRef.current;
    if (nearBottom && daftar) daftar.scrollTop = daftar.scrollHeight;
  }, [messages, busy, nearBottom]);

  async function prosesPercakapan(conversation) {
    const ownerUid = user?.uid;
    if (!ownerUid) {
      setError('Sesi akun tidak tersedia. Masuk kembali sebelum menggunakan AI_nnoe.');
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setMessages([...conversation, { role: 'assistant', text: '', sources: [] }].slice(-MAKS_RIWAYAT_TAMPIL));
    setError('');
    setProvider('');
    setNearBottom(true);
    setBusy(true);
    try {
      const recentQuestions = conversation
        .filter((message) => message.role === 'user')
        .slice(-3)
        .map((message) => message.text)
        .join('\n')
        .slice(-5000);
      let sourceContext = [];
      try {
        sourceContext = await cariKonteksDokumenLokal(ownerUid, recentQuestions);
      } catch (cause) {
        console.error('[asisten] Pencarian konteks lokal gagal:', cause);
        setDocumentError(cause?.message || 'Pencarian dokumen lokal gagal; jawaban dilanjutkan tanpa konteks dokumen.');
        if (documents.length) throw cause;
      }
      if (controller.signal.aborted) return;
      setMessages((current) => ubahJawabanTerakhir(current, (message) => ({
        ...message,
        sources: sourceContext,
      })));
      const result = await tanyaAsistenStreaming(
        ownerUid,
        conversation.slice(-16).map(({ role, text }) => ({ role, text })),
        {
          signal: controller.signal,
          sourceContext,
          onChunk: (chunk) => {
            if (controller.signal.aborted) return;
            setMessages((current) => ubahJawabanTerakhir(current, (message) => ({
              ...message,
              text: message.text + chunk,
            })));
          },
          onFallback: ({ fallbackModel }) => {
            setProvider(`Model utama gagal; mencoba model cadangan lokal ${fallbackModel}…`);
            setMessages((current) => ubahJawabanTerakhir(current, (message) => ({
              ...message,
              text: '',
            })));
          },
        },
      );
      setMessages((current) => ubahJawabanTerakhir(current, (message) => ({
        ...message,
        text: result.answer,
      })));
      setProvider(`AI_nnoe lokal · ${result.model}${result.fallbackUsed ? ' (model cadangan)' : ''}`);
    } catch (cause) {
      if (controller.signal.aborted) {
        setProvider('Respons dihentikan.');
        setMessages((current) => {
          const last = current.at(-1);
          if (last?.role !== 'assistant') return current;
          return last.text.trim()
            ? ubahJawabanTerakhir(current, (message) => ({ ...message, incomplete: true }))
            : current.slice(0, -1);
        });
      } else {
        console.error('[asisten] Permintaan AI gagal:', cause);
        setError(cause?.message || 'Permintaan AI gagal. Silakan coba lagi.');
        setMessages((current) => {
          const last = current.at(-1);
          if (last?.role !== 'assistant') return current;
          return last.text.trim()
            ? ubahJawabanTerakhir(current, (message) => ({ ...message, incomplete: true }))
            : current.slice(0, -1);
        });
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setBusy(false);
        inputRef.current?.focus();
      }
    }
  }

  function kirim(teks = draft) {
    const pertanyaan = teks.trim();
    if (!pertanyaan || busy) return;
    if (!aiEnabled) {
      setError('Asisten AI sedang dinonaktifkan oleh administrator.');
      return;
    }
    const berikutnya = [...messages, { role: 'user', text: pertanyaan }]
      .filter((message) => message.role !== 'assistant' || message.text.trim())
      .slice(-MAKS_RIWAYAT_TAMPIL - 1);
    setMessages(berikutnya);
    setDraft('');
    setError('');
    void prosesPercakapan(berikutnya);
  }

  function ulangiPermintaan() {
    if (busy || !messages.length) return;
    if (!aiEnabled) {
      setError('Asisten AI sedang dinonaktifkan oleh administrator.');
      return;
    }
    const conversation = messages.at(-1)?.role === 'assistant' ? messages.slice(0, -1) : messages;
    if (!conversation.some((message) => message.role === 'user')) return;
    setError('');
    void prosesPercakapan(conversation);
  }

  async function indeksPdf(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !user?.uid || documentBusy) return;
    const ownerUid = user.uid;
    const task = { ownerUid };
    documentTaskRef.current = task;
    setDocumentBusy(true);
    setDocumentError('');
    setDocumentNotice('');
    try {
      const indexed = await indeksDokumenBelajarLokal(ownerUid, file);
      const updated = await daftarDokumenBelajarLokal(ownerUid);
      if (user?.uid === ownerUid) {
        setDocuments(updated);
        setDocumentNotice(`${indexed.name} siap digunakan sebagai konteks lokal (${indexed.pageCount} halaman).`);
      }
    } catch (cause) {
      console.error('[asisten] PDF tidak dapat diindeks secara lokal:', cause);
      if (user?.uid === ownerUid) {
        setDocumentError(cause?.message || 'PDF tidak dapat diproses.');
      }
    } finally {
      if (documentTaskRef.current === task) {
        documentTaskRef.current = null;
        setDocumentBusy(false);
      }
    }
  }

  async function hapusPdf(document) {
    if (!user?.uid || documentBusy ||
        !window.confirm(`Hapus indeks lokal “${document.name}”? Berkas asli tidak berubah.`)) return;
    const ownerUid = user.uid;
    const task = { ownerUid };
    documentTaskRef.current = task;
    setDocumentBusy(true);
    setDocumentError('');
    setDocumentNotice('');
    try {
      const removed = await hapusDokumenBelajarLokal(ownerUid, document.id);
      if (!removed) throw new Error('Dokumen lokal tidak ditemukan atau bukan milik akun ini.');
      const updated = await daftarDokumenBelajarLokal(ownerUid);
      if (user?.uid === ownerUid) {
        setDocuments(updated);
        setDocumentNotice(`Indeks ${document.name} dihapus dari browser ini.`);
      }
    } catch (cause) {
      console.error('[asisten] Indeks PDF lokal tidak dapat dihapus:', cause);
      if (user?.uid === ownerUid) {
        setDocumentError(cause?.message || 'Indeks PDF lokal tidak dapat dihapus.');
      }
    } finally {
      if (documentTaskRef.current === task) {
        documentTaskRef.current = null;
        setDocumentBusy(false);
      }
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
    setNearBottom(true);
    inputRef.current?.focus();
  }

  function batalkanRespons() {
    controllerRef.current?.abort();
  }

  function ikutiPesanTerbaru(event) {
    const element = event.currentTarget;
    setNearBottom(element.scrollHeight - element.scrollTop - element.clientHeight < 96);
  }

  return (
    <section className="ai-page" aria-labelledby="ai-heading">
      <div className="ai-heading-row">
        <div>
          <p className="ai-eyebrow">AI_nnoe Learning Ecosystem</p>
          <h2 id="ai-heading">Teman Belajar AI_nnoe</h2>
          <p className="ai-subheading">
            Teman Belajar yang membantu Anda bernalar, bertahap, dan sesuai kebutuhan.
          </p>
        </div>
        <button type="button" className="ai-new-chat" onClick={mulaiBaru} disabled={busy || !messages.length}>
          <Ikon nama="refresh" /> Percakapan baru
        </button>
      </div>

      <div className="ai-chat-card">
        <div className="ai-chat-meta">
          <span className="ai-status"><span aria-hidden="true" /> {aiEnabled ? 'Siap membantu' : 'Layanan dinonaktifkan'}</span>
          <span>AI_nnoe memproses prompt secara lokal melalui Ollama pada perangkat ini.</span>
        </div>

        {!aiEnabled && (
          <p className="ai-error" role="status">Asisten AI sementara dinonaktifkan oleh administrator.</p>
        )}

        <div className="ai-messages" ref={daftarRef} onScroll={ikutiPesanTerbaru} aria-live="polite" aria-relevant="additions text">
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
          {assistantViews.map(({ message, visible }, index) => (
            message.role === 'assistant' && !message.text.trim() ? null : (
            <article key={`${index}-${message.role}`} className={`ai-message ai-message-${message.role}`}>
              <div className="ai-message-label">
                {message.role === 'user' ? 'Anda' : message.incomplete ? 'AI_nnoe · respons terhenti' : 'AI_nnoe'}
              </div>
              <SafeMarkdown className="ai-message-content">{visible}</SafeMarkdown>
              {message.sources?.length > 0 && (
                <ul className="ai-message-sources" aria-label="Sumber dokumen lokal yang digunakan">
                  {message.sources.map((source, sourceIndex) => (
                    <li key={`${source.name}-${source.page}-${sourceIndex}`}>
                      {source.name}, halaman {source.page}
                    </li>
                  ))}
                </ul>
              )}
            </article>
            )
          ))}
          {busy && (
            <div className="ai-message ai-message-assistant" role="status">
              <div className="ai-message-label">AI_nnoe</div>
              <p className="ai-thinking"><span /><span /><span /> Sedang menyiapkan jawaban…</p>
            </div>
          )}

        </div>
        <AssistantArtifacts artifacts={assistantArtifacts} />

        <section className="ai-documents" aria-labelledby="ai-documents-title">
          <div className="ai-documents-heading">
            <div>
              <h3 id="ai-documents-title">Dokumen belajar lokal</h3>
              <p>Dokumen dan indeks tetap di browser ini; hanya potongan yang cocok dikirim ke Ollama localhost.</p>
            </div>
            <label className="ai-document-upload">
              {documentBusy ? 'Memproses…' : 'Tambah PDF'}
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={indeksPdf}
                disabled={documentBusy || !user?.uid}
                aria-label="Tambah dokumen PDF lokal"
              />
            </label>
          </div>
          <p className="ai-document-hint">
            Pencarian konteks dilakukan di browser. Maksimal 10 PDF berukuran 10 MB per berkas;
            PDF hasil pindai yang tidak memiliki teks memerlukan OCR yang belum tersedia.
          </p>
          {documentNotice && <p className="ai-document-notice" role="status">{documentNotice}</p>}
          {documentError && <p className="ai-error" role="alert">{documentError}</p>}
          {documents.length > 0 ? (
            <ul className="ai-document-list">
              {documents.map((document) => (
                <li key={document.id}>
                  <span>{document.name} · {document.pageCount} halaman</span>
                  <button
                    type="button"
                    className="ai-document-remove"
                    disabled={documentBusy}
                    onClick={() => void hapusPdf(document)}
                  >
                    Hapus
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="ai-document-empty">Belum ada dokumen PDF lokal.</p>}
        </section>

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
            <span>Memerlukan Ollama aktif. Jangan masukkan kata sandi atau data yang tidak diperlukan.</span>
            {busy ? (
              <button type="button" className="ai-stop-button" onClick={batalkanRespons}>
                Berhenti
              </button>
            ) : (
              <button type="submit" disabled={!draft.trim() || !aiEnabled}>
                <Ikon nama="chat" /> Kirim
              </button>
            )}
          </div>
        </form>
        <p className="ai-provider-note">
          {provider ? `${provider}. ` : ''}
          AI dapat keliru. Periksa kembali informasi penting dan pastikan Ollama aktif.
        </p>
      </div>
    </section>
  );
}
