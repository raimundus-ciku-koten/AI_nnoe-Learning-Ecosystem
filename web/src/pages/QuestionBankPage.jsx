import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { isSchoolAdminRole, isTeacherRole } from '../services/roleAccess.js';
import { usePlatformControls } from '../context/PlatformControlContext.jsx';
import Ikon from '../components/Ikon.jsx';
import {
  hapusSoalBank, muatBankSoal, tambahSoalBank, ubahSoalBank,
} from '../services/questionBank.js';
import { buatDrafSoalAI } from '../services/aiIntegrations.js';
import '../styles/question-bank.css';

const FORM_AWAL = {
  mapel: '',
  kelas: '',
  jenis: 'pilihan_ganda',
  pertanyaan: '',
  pilihan: '',
  jawaban: '',
  pembahasan: '',
};

const batasi = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function siapkanSoal(form) {
  const jenis = form.jenis === 'uraian' ? 'uraian' : 'pilihan_ganda';
  const pilihan = jenis === 'pilihan_ganda'
    ? form.pilihan.split(/\r?\n/).map((item) => batasi(item, 300)).filter(Boolean)
    : [];
  const jawaban = batasi(form.jawaban, 1000);
  if (!batasi(form.mapel, 80) || !batasi(form.kelas, 30) || !batasi(form.pertanyaan, 2000)) {
    throw new Error('Mata pelajaran, kelas, dan pertanyaan wajib diisi.');
  }
  if (jenis === 'pilihan_ganda' &&
      (pilihan.length < 2 || pilihan.length > 5 || new Set(pilihan).size !== pilihan.length)) {
    throw new Error('Pilihan ganda harus memiliki 2–5 pilihan yang berbeda.');
  }
  if (!jawaban || (jenis === 'pilihan_ganda' && !pilihan.includes(jawaban))) {
    throw new Error(jenis === 'pilihan_ganda'
      ? 'Pilih kunci jawaban yang tersedia.'
      : 'Isi contoh jawaban atau pedoman penilaian.');
  }
  return {
    mapel: batasi(form.mapel, 80),
    kelas: batasi(form.kelas, 30),
    jenis,
    pertanyaan: batasi(form.pertanyaan, 2000),
    pilihan,
    jawaban,
    pembahasan: batasi(form.pembahasan, 2000),
  };
}

function formatTanggal(value) {
  const date = value instanceof Date ? value : new Date(value);
  return date instanceof Date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date)
    : 'Baru saja';
}

export default function QuestionBankPage() {
  const { user, role, activeRole, tenantId } = useAuth();
  const currentRole = activeRole || role;
  const { features } = usePlatformControls();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(FORM_AWAL);
  const [editId, setEditId] = useState('');
  const [search, setSearch] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [topic, setTopic] = useState('');
  const [aiMode, setAiMode] = useState('ai-nnoe');
  const [externalAiAcknowledged, setExternalAiAcknowledged] = useState(false);

  const canView = isTeacherRole(currentRole) || isSchoolAdminRole(currentRole);
  const canEdit = isTeacherRole(currentRole);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!user?.uid || !tenantId || !canView) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const result = await muatBankSoal(tenantId);
        if (active) setItems(result);
      } catch (err) {
        console.error('[question-bank] Gagal memuat bank soal:', err);
        if (active) setError('Bank soal belum dapat dimuat. Periksa akses tenant dan koneksi Supabase, lalu muat ulang.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [user?.uid, tenantId, canView]);

  const visibleItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('id');
    if (!term) return items;
    return items.filter((item) =>
      `${item.mapel} ${item.kelas} ${item.pertanyaan}`.toLocaleLowerCase('id').includes(term));
  }, [items, search]);

  function resetForm() {
    setForm(FORM_AWAL);
    setEditId('');
    setTopic('');
    setError('');
    setNotice('');
  }

  async function save(event) {
    event.preventDefault();
    if (!canEdit || !tenantId || !user?.uid) {
      setError('Hanya guru dalam tenant yang dapat mengelola soal.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const soal = siapkanSoal(form);
      if (editId) {
        const updated = await ubahSoalBank(tenantId, user.uid, editId, soal);
        setItems((current) => current
          .map((item) => item.id === editId ? updated : item)
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)));
        setNotice('Soal berhasil diperbarui.');
      } else {
        const result = await tambahSoalBank(tenantId, user.uid, soal);
        setItems((current) => [result, ...current].slice(0, 100));
        setNotice('Soal berhasil ditambahkan ke bank soal.');
      }
      setForm(FORM_AWAL);
      setEditId('');
    } catch (err) {
      console.error('[question-bank] Gagal menyimpan soal:', err);
      setError(err?.message || 'Soal tidak dapat disimpan.');
    } finally {
      setSaving(false);
    }
  }

  function edit(item) {
    setForm({
      mapel: item.mapel || '',
      kelas: item.kelas || '',
      jenis: item.jenis || 'pilihan_ganda',
      pertanyaan: item.pertanyaan || '',
      pilihan: Array.isArray(item.pilihan) ? item.pilihan.join('\n') : '',
      jawaban: item.jawaban || '',
      pembahasan: item.pembahasan || '',
    });
    setEditId(item.id);
    setTopic('');
    setNotice('');
    setError('');
  }

  async function remove(item) {
    if (!canEdit || !tenantId || !window.confirm('Hapus soal ini dari bank soal?')) return;
    setError('');
    setNotice('');
    try {
      await hapusSoalBank(tenantId, user.uid, item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      if (editId === item.id) resetForm();
      setNotice('Soal berhasil dihapus.');
    } catch (err) {
      console.error('[question-bank] Gagal menghapus soal:', err);
      setError(err?.message || 'Soal tidak dapat dihapus.');
    }
  }

  async function generateAiDraft() {
    if (!canEdit || aiBusy) return;
    if (!features.aiGeneration) {
      setError('Pembuatan draf AI sedang dinonaktifkan oleh administrator.');
      return;
    }
    setAiBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await buatDrafSoalAI(
        user?.uid,
        {
          mapel: form.mapel,
          kelas: form.kelas,
          topik: topic,
          jenis: form.jenis,
        },
        { mode: aiMode, externalAcknowledged: externalAiAcknowledged },
      );
      const draft = result?.payload?.questions?.[0];
      if (!draft) throw new Error('AI tidak mengembalikan draf soal yang valid.');
      setForm((current) => ({
        ...current,
        pertanyaan: draft.pertanyaan,
        pilihan: (draft.pilihan || []).join('\n'),
        jawaban: draft.jawaban,
        pembahasan: draft.pembahasan,
      }));
      const provider = {
        'local-qwen': 'Qwen 2.5 7B (lokal)',
        'local-qwen-small': 'Qwen 2.5 1.5B (lokal)',
        gemini: 'Gemini',
        deepseek: 'DeepSeek',
        groq: 'Groq',
        cerebras: 'Cerebras'
      }[result.penyedia] || 'AI';
      setNotice(`Draf soal dibuat dengan ${provider}. Periksa dan sunting sebelum menyimpan.`);
    } catch (err) {
      console.error('[question-bank] Gagal membuat draf AI:', err);
      setError(err?.message || 'Draf soal belum dapat dibuat.');
    } finally {
      setAiBusy(false);
    }
  }

  const pilihanForm = form.jenis === 'pilihan_ganda'
    ? form.pilihan.split(/\r?\n/).map((item) => batasi(item, 300)).filter(Boolean)
    : [];

  if (!canView) {
    return (
      <main className="question-bank-page">
        <section className="ale-kartu question-bank-notice" role="status">
          <h1>Bank Soal</h1>
          <p>Bank soal dan kunci jawaban hanya tersedia untuk guru, guru spesialis, serta administrator sekolah.</p>
        </section>
      </main>
    );
  }

  if (!tenantId) {
    return (
      <main className="question-bank-page">
        <section className="ale-kartu question-bank-notice" role="status">
          <h1>Bank Soal</h1>
          <p>Akun ini belum terhubung dengan tenant sekolah. Hubungi administrator untuk mengaktifkan akses bank soal.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="question-bank-page">
      <header className="question-bank-header">
        <p className="question-bank-kicker"><Ikon nama="clipboard" /> Asesmen dan Penilaian</p>
        <h1>Bank Soal</h1>
        <p>Simpan soal per mata pelajaran dan kelas. Kunci jawaban hanya dapat dilihat oleh staf yang berwenang.</p>
      </header>

      {error && <p className="question-bank-message is-error" role="alert">{error}</p>}
      {notice && <p className="question-bank-message is-success" role="status">{notice}</p>}

      {canEdit && (
        <section className="ale-kartu question-bank-editor">
          <h2>{editId ? 'Ubah soal' : 'Tambah soal'}</h2>
          <form onSubmit={save}>
            <div className="question-bank-fields">
              <label className="question-bank-wide">
                Topik / konteks soal
                <input value={topic} maxLength={500} placeholder="Contoh: persamaan linear satu variabel" onChange={(e) => setTopic(e.target.value)} />
              </label>
              <label>
                Mata pelajaran
                <input value={form.mapel} maxLength={80} required onChange={(e) => setForm({ ...form, mapel: e.target.value })} />
              </label>
              <label>
                Kelas / fase
                <input value={form.kelas} maxLength={30} required onChange={(e) => setForm({ ...form, kelas: e.target.value })} />
              </label>
              <label>
                Bentuk soal
                <select value={form.jenis} onChange={(e) => setForm({ ...form, jenis: e.target.value, jawaban: '' })}>
                  <option value="pilihan_ganda">Pilihan ganda</option>
                  <option value="uraian">Uraian</option>
                </select>
              </label>
              {features.aiGeneration ? (
                <fieldset className="question-bank-ai-mode question-bank-wide">
                  <legend>Pilihan AI untuk membuat draf soal</legend>
                  <label className="question-bank-ai-mode-option">
                    <input
                      type="radio"
                      name="question-ai-mode"
                      value="ai-nnoe"
                      checked={aiMode === 'ai-nnoe'}
                      onChange={() => {
                        setAiMode('ai-nnoe');
                        setExternalAiAcknowledged(false);
                      }}
                    />
                    <span><strong>1. Gunakan AI_nnoe</strong><small>Berjalan dengan model AI lokal yang tersedia di perangkat ini.</small></span>
                  </label>
                  <label className="question-bank-ai-mode-option">
                    <input
                      type="radio"
                      name="question-ai-mode"
                      value="ai-eksternal"
                      checked={aiMode === 'ai-eksternal'}
                      onChange={() => {
                        setAiMode('ai-eksternal');
                        setExternalAiAcknowledged(false);
                      }}
                    />
                    <span><strong>2. Gunakan AI_eksternal</strong><small>Berjalan dengan provider dan API key pribadi yang dipilih di Pengaturan → AI &amp; Layanan.</small></span>
                  </label>
                  {aiMode === 'ai-eksternal' && (
                    <div className="question-bank-ai-disclosure">
                      <p>Prompt soal akan dikirim dari perangkat ini ke provider pilihan Anda. Kuota, privasi, dan kemungkinan biaya mengikuti ketentuan provider; jangan masukkan data pribadi siswa.</p>
                      <p>Pilih provider dan tambahkan API key di Pengaturan → AI &amp; Layanan, lalu pilih provider tersebut untuk pembuatan soal.</p>
                      <label className="question-bank-ai-mode-option">
                        <input
                          type="checkbox"
                          checked={externalAiAcknowledged}
                          onChange={(event) => setExternalAiAcknowledged(event.target.checked)}
                        />
                        <span>Saya memahami prompt dikirim ke provider eksternal dan biaya/kuota provider dapat berlaku.</span>
                      </label>
                    </div>
                  )}
                  <button
                    type="button"
                    className="question-bank-ai-button"
                    disabled={aiBusy || !form.mapel.trim() || !form.kelas.trim() || !topic.trim() ||
                      (aiMode === 'ai-eksternal' && !externalAiAcknowledged)}
                    onClick={() => void generateAiDraft()}
                  >
                    {aiBusy ? 'Membuat draf…' : `Buat draf dengan ${aiMode === 'ai-nnoe' ? 'AI_nnoe' : 'AI_eksternal'}`}
                  </button>
                </fieldset>
              ) : (
                <p className="question-bank-message" role="status">Pembuatan draf AI sedang dinonaktifkan oleh administrator.</p>
              )}
            </div>
            <label className="question-bank-wide">
              Pertanyaan
              <textarea value={form.pertanyaan} maxLength={2000} rows={4} required onChange={(e) => setForm({ ...form, pertanyaan: e.target.value })} />
            </label>
            {form.jenis === 'pilihan_ganda' && (
              <>
                <label className="question-bank-wide">
                  Pilihan jawaban (satu pilihan per baris, 2–5 pilihan)
                  <textarea value={form.pilihan} maxLength={1600} rows={5} required onChange={(e) => setForm({ ...form, pilihan: e.target.value })} />
                </label>
                <label className="question-bank-wide">
                  Kunci jawaban
                  <select value={form.jawaban} required onChange={(e) => setForm({ ...form, jawaban: e.target.value })}>
                    <option value="">Pilih jawaban benar</option>
                    {pilihanForm.map((option, index) => <option key={`${index}-${option}`} value={option}>{option}</option>)}
                  </select>
                </label>
              </>
            )}
            {form.jenis === 'uraian' && (
              <label className="question-bank-wide">
                Contoh jawaban / pedoman penilaian
                <textarea value={form.jawaban} maxLength={1000} rows={3} required onChange={(e) => setForm({ ...form, jawaban: e.target.value })} />
              </label>
            )}
            <label className="question-bank-wide">
              Pembahasan (opsional)
              <textarea value={form.pembahasan} maxLength={2000} rows={3} onChange={(e) => setForm({ ...form, pembahasan: e.target.value })} />
            </label>
            <div className="question-bank-actions">
              <button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : editId ? 'Simpan perubahan' : 'Simpan soal'}</button>
              {editId && <button type="button" className="is-secondary" onClick={resetForm} disabled={saving}>Batal ubah</button>}
            </div>
          </form>
        </section>
      )}

      <section className="question-bank-list" aria-labelledby="question-bank-list-title">
        <div className="question-bank-list-header">
          <h2 id="question-bank-list-title">Soal tersimpan <span>{items.length}</span></h2>
          <label>
            <span className="sr-only">Cari soal</span>
            <input type="search" value={search} placeholder="Cari mapel, kelas, atau pertanyaan" onChange={(e) => setSearch(e.target.value)} />
          </label>
        </div>
        {loading ? <p className="question-bank-empty" role="status">Memuat soal…</p> : null}
        {!loading && visibleItems.length === 0 && (
          <p className="question-bank-empty">{items.length ? 'Tidak ada soal yang cocok dengan pencarian.' : 'Belum ada soal. Tambahkan soal pertama melalui formulir di atas.'}</p>
        )}
        {visibleItems.map((item) => (
          <article className="ale-kartu question-bank-item" key={item.id}>
            <div className="question-bank-item-meta">
              <span>{item.mapel} · Kelas {item.kelas}</span>
              <span>{item.jenis === 'uraian' ? 'Uraian' : 'Pilihan ganda'} · {formatTanggal(item.updatedAt)}</span>
            </div>
            <h3>{item.pertanyaan}</h3>
            {item.jenis === 'pilihan_ganda' && (
              <ol type="A">{(item.pilihan || []).map((option) => <li key={option}>{option}</li>)}</ol>
            )}
            <p><strong>Kunci / pedoman:</strong> {item.jawaban}</p>
            {item.pembahasan && <p className="question-bank-explanation">{item.pembahasan}</p>}
            {canEdit && item.ownerUid === user?.uid && (
              <div className="question-bank-actions">
                <button type="button" className="is-secondary" onClick={() => edit(item)}>Ubah</button>
                <button type="button" className="is-danger" onClick={() => remove(item)}>Hapus</button>
              </div>
            )}
          </article>
        ))}
        {!loading && items.length === 100 && <p className="question-bank-limit">Menampilkan 100 soal terbaru. Gunakan pencarian untuk mempersempit daftar.</p>}
      </section>
    </main>
  );
}
