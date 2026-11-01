import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import Ikon from '../components/Ikon.jsx';
import {
  hapusSoalBank, muatBankSoal, tambahSoalBank, ubahSoalBank,
} from '../services/questionBank.js';
import { buatDrafSoalAI } from '../services/aiIntegrations.js';
import {
  generateBrowserQuestionBankAnswers,
  generateBrowserQuestionBankQuestions,
} from '../services/browserAi.js';
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

const FORM_BANK_AWAL = {
  mapel: '',
  kelas: '',
  topik: '',
  kategori: 'latihan',
  judul: '',
  jenisSoal: 'Campuran',
  levelSoal: 'Campuran LOT-MOT-HOT',
  jumlahPG: 15,
  jumlahUraian: 5,
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

function namaMesinAI(result) {
  const provider = {
    local: 'AI_nnoe lokal',
    gemini: 'Gemini',
    deepseek: 'DeepSeek',
    groq: 'Groq',
    cerebras: 'Cerebras',
  }[result?.penyedia] || 'AI';
  return result?.fallbackUsed
    ? `${provider} menggunakan model cadangan ${result.model || ''}`.trim()
    : `${provider}${result?.model ? ` (${result.model})` : ''}`;
}

export function QuestionBankGeneratedDocument({ bank }) {
  if (!bank?.input || !Array.isArray(bank.questions) || !Array.isArray(bank.answers)) return null;
  const pilihanGanda = bank.questions.filter((question) => question.jenis === 'pilihan_ganda');
  const uraian = bank.questions.filter((question) => question.jenis === 'uraian');

  return (
    <article className="question-bank-generated-document" aria-label="Pratinjau cetak Bank Soal">
      <header className="question-bank-document-header">
        <p className="question-bank-document-meta">{bank.input.kategori}</p>
        <h1>{bank.input.judul}</h1>
        <div className="question-bank-document-meta">
          <span>Mata pelajaran: {bank.input.mapel}</span>
          <span>Kelas/fase: {bank.input.kelas}</span>
          <span>Topik: {bank.input.topik}</span>
          <span>Level kognitif: {bank.input.levelSoal}</span>
        </div>
      </header>

      <section>
        <h2>Soal</h2>
        {pilihanGanda.length > 0 && (
          <>
            <h3>Pilihan Ganda</h3>
            {pilihanGanda.map((question) => (
              <div className="question-bank-document-item" key={`pg-${question.nomor}`}>
                <p><strong>{question.nomor}.</strong> {question.pertanyaan}</p>
                <p><strong>Konteks:</strong> {question.konteks}</p>
                <p><strong>Level Bloom:</strong> {question.tingkatKognitifBloom}</p>
                <ol type="A">
                  {question.pilihan.map((choice, index) => (
                    <li key={`${index}-${choice}`}>
                      {choice}
                      {question.rasionalisasiPilihan?.[index] && (
                        <p><strong>Rasionalisasi:</strong> {question.rasionalisasiPilihan[index]}</p>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </>
        )}
        {uraian.length > 0 && (
          <>
            <h3>Uraian</h3>
            {uraian.map((question) => (
              <div className="question-bank-document-item" key={`uraian-${question.nomor}`}>
                <p><strong>{question.nomor}.</strong> {question.pertanyaan}</p>
                <p><strong>Konteks:</strong> {question.konteks}</p>
                <p><strong>Level Bloom:</strong> {question.tingkatKognitifBloom}</p>
              </div>
            ))}
          </>
        )}
      </section>

      <section className="question-bank-document-answers">
        <h2>Kunci Jawaban dan Pembahasan</h2>
        {bank.answers.map((answer) => {
          const label = answer.jenis === 'uraian' ? 'Uraian' : 'Pilihan ganda';
          return (
            <div className="question-bank-document-item" key={`${answer.jenis}-answer-${answer.nomor}`}>
              <h3>{label} {answer.nomor}</h3>
              <p><strong>Soal:</strong> {answer.pertanyaan}</p>
              <p><strong>{answer.jenis === 'uraian' ? 'Contoh jawaban/pedoman' : 'Kunci jawaban'}:</strong> {answer.jawaban}</p>
              <p><strong>Pembahasan:</strong> {answer.pembahasan}</p>
              {answer.caraCepat && <p><strong>Cara cepat:</strong> {answer.caraCepat}</p>}
            </div>
          );
        })}
      </section>
    </article>
  );
}

export default function QuestionBankPage() {
  const { user, role, tenantId } = useAuth();
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
  const [bankForm, setBankForm] = useState(FORM_BANK_AWAL);
  const [generatedBank, setGeneratedBank] = useState(null);
  const [generationPhase, setGenerationPhase] = useState('');
  const [generationError, setGenerationError] = useState('');
  const [generationNotice, setGenerationNotice] = useState('');

  const canView = ['guru', 'admin_sekolah'].includes(role);
  const canEdit = role === 'guru';

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
    setAiBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await buatDrafSoalAI(user?.uid, {
        mapel: form.mapel,
        kelas: form.kelas,
        topik: topic,
        jenis: form.jenis,
      });
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
        local: 'AI_nnoe lokal',
        gemini: 'Gemini',
        deepseek: 'DeepSeek',
        groq: 'Groq',
        cerebras: 'Cerebras'
      }[result.penyedia] || 'AI';
      const engine = result.fallbackUsed
        ? `${provider} menggunakan model cadangan ${result.model || ''}`.trim()
        : `${provider}${result.model ? ` (${result.model})` : ''}`;
      setNotice(`Draf soal dibuat dengan ${engine}. Periksa dan sunting sebelum menyimpan.`);
    } catch (err) {
      console.error('[question-bank] Gagal membuat draf AI:', err);
      setError(err?.message || 'Draf soal belum dapat dibuat.');
    } finally {
      setAiBusy(false);
    }
  }

  async function generateBankQuestions() {
    if (!canEdit || generationPhase) return;
    setGenerationPhase('questions');
    setGenerationError('');
    setGenerationNotice('');
    try {
      const result = await generateBrowserQuestionBankQuestions(user?.uid, bankForm);
      setGeneratedBank({
        input: result.input,
        questions: result.questions,
        answers: null,
        questionEngine: namaMesinAI(result),
      });
      setGenerationNotice(`Soal lengkap dibuat dengan ${namaMesinAI(result)}. Draf hanya tersimpan sementara di halaman ini.`);
    } catch (err) {
      console.error('[question-bank] Gagal membuat kumpulan soal:', err);
      setGenerationError(err?.message || 'Kumpulan soal belum dapat dibuat. Periksa input dan model AI lokal.');
    } finally {
      setGenerationPhase('');
    }
  }

  async function generateBankAnswers() {
    if (!canEdit || generationPhase || !generatedBank?.questions) return;
    setGenerationPhase('answers');
    setGenerationError('');
    setGenerationNotice('');
    try {
      const result = await generateBrowserQuestionBankAnswers(
        user?.uid,
        generatedBank.input,
        generatedBank.questions,
      );
      setGeneratedBank((current) => current && ({
        ...current,
        answers: result.answers,
        answerEngine: namaMesinAI(result),
      }));
      setGenerationNotice(`Kunci dan pembahasan lengkap dibuat dengan ${namaMesinAI(result)}. Periksa sebelum mencetak.`);
    } catch (err) {
      console.error('[question-bank] Gagal membuat kunci dan pembahasan:', err);
      setGenerationError(err?.message || 'Kunci dan pembahasan belum dapat dibuat. Soal tetap tersedia untuk dicoba kembali.');
    } finally {
      setGenerationPhase('');
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
          <p>Bank soal dan kunci jawaban hanya tersedia untuk guru serta administrator sekolah.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="question-bank-page">
      <header className="question-bank-header">
        <p className="question-bank-kicker"><Ikon nama="clipboard" /> Asesmen dan Penilaian</p>
        <h1>Bank Soal</h1>
        <p>Susun soal sesuai topik dan kelas. Soal manual disimpan di bank sekolah, sedangkan draf generator tidak tersimpan dan dapat dicetak sebagai PDF.</p>
      </header>

      {error && <p className="question-bank-message is-error" role="alert">{error}</p>}
      {notice && <p className="question-bank-message is-success" role="status">{notice}</p>}
      {!tenantId && (
        <section className="ale-kartu question-bank-notice" role="status">
          <p>Bank sekolah dan pengelolaan soal manual belum tersedia karena akun ini belum terhubung dengan tenant. Generator lokal tetap dapat digunakan; drafnya tidak disimpan.</p>
        </section>
      )}

      {canEdit && (
        <section className="ale-kartu question-bank-generator">
          <h2>Generator Bank Soal</h2>
          <p>Generator membuat soal dan pembahasan dalam dua tahap menggunakan AI lokal. Draf tidak disimpan ke Supabase atau riwayat perangkat; unduh melalui dialog cetak jika ingin menyimpan salinan.</p>
          <p className="question-bank-format-note">Format saat ini: pilihan ganda A–D dan campuran dengan uraian. Format formulir lain pada versi lama belum dipadankan.</p>
          <form onSubmit={(event) => {
            event.preventDefault();
            void generateBankQuestions();
          }}>
            <div className="question-bank-fields">
              <label>
                Mata pelajaran
                <input value={bankForm.mapel} maxLength={80} required disabled={Boolean(generationPhase)} onChange={(e) => setBankForm({ ...bankForm, mapel: e.target.value })} />
              </label>
              <label>
                Kelas/fase
                <input value={bankForm.kelas} maxLength={30} required disabled={Boolean(generationPhase)} onChange={(e) => setBankForm({ ...bankForm, kelas: e.target.value })} />
              </label>
              <label className="question-bank-wide">
                Topik / tujuan pembelajaran
                <input value={bankForm.topik} maxLength={500} required disabled={Boolean(generationPhase)} placeholder="Contoh: persamaan linear satu variabel" onChange={(e) => setBankForm({ ...bankForm, topik: e.target.value })} />
              </label>
              <label>
                Kategori
                <select value={bankForm.kategori} disabled={Boolean(generationPhase)} onChange={(e) => setBankForm({ ...bankForm, kategori: e.target.value })}>
                  <option value="ulangan">Ulangan Harian</option>
                  <option value="latihan">Latihan</option>
                  <option value="tugas">Tugas</option>
                  <option value="pts">PTS</option>
                  <option value="ujian">Ujian (PAS/PAT)</option>
                  <option value="tka">Persiapan TKA</option>
                </select>
              </label>
              <label>
                Jenis soal
                <select value={bankForm.jenisSoal} disabled={Boolean(generationPhase)} onChange={(e) => setBankForm({ ...bankForm, jenisSoal: e.target.value })}>
                  <option value="Multiple choice">Pilihan ganda</option>
                  <option value="Campuran">Campuran (pilihan ganda dan uraian)</option>
                </select>
              </label>
              <label>
                Level kognitif
                <select value={bankForm.levelSoal} disabled={Boolean(generationPhase)} onChange={(e) => setBankForm({ ...bankForm, levelSoal: e.target.value })}>
                  <option value="Campuran LOT-MOT-HOT">Campuran LOT–MOT–HOT</option>
                  <option value="LOT">LOT (C1–C2)</option>
                  <option value="MOT">MOT (C3–C4)</option>
                  <option value="HOTS">HOTS (C4–C6)</option>
                </select>
              </label>
              <label>
                Jumlah pilihan ganda
                <input type="number" min="1" max="50" step="1" required value={bankForm.jumlahPG} disabled={Boolean(generationPhase)} onChange={(e) => setBankForm({ ...bankForm, jumlahPG: e.target.value })} />
              </label>
              <label>
                Jumlah uraian
                <input type="number" min="0" max="20" step="1" required value={bankForm.jumlahUraian} disabled={Boolean(generationPhase)} onChange={(e) => setBankForm({ ...bankForm, jumlahUraian: e.target.value })} />
              </label>
              <label>
                Judul dokumen (opsional)
                <input value={bankForm.judul} maxLength={150} disabled={Boolean(generationPhase)} placeholder="Terisi otomatis dari kategori dan topik" onChange={(e) => setBankForm({ ...bankForm, judul: e.target.value })} />
              </label>
            </div>
            <div className="question-bank-actions">
              <button type="submit" disabled={Boolean(generationPhase)}>
                {generationPhase === 'questions' ? 'Membuat soal…' : 'Buat soal'}
              </button>
              <button type="button" className="is-secondary" disabled={Boolean(generationPhase) || !generatedBank?.questions} onClick={() => void generateBankAnswers()}>
                {generationPhase === 'answers' ? 'Membuat pembahasan…' : 'Buat kunci dan pembahasan'}
              </button>
              {generatedBank?.answers && (
                <button type="button" className="is-secondary" disabled={Boolean(generationPhase)} onClick={() => window.print()}>
                  Cetak / Simpan sebagai PDF
                </button>
              )}
            </div>
          </form>
          {generationError && <p className="question-bank-message is-error" role="alert">{generationError}</p>}
          {generationNotice && <p className="question-bank-message is-success" role="status">{generationNotice}</p>}
          {generatedBank && (
            <p className="question-bank-generation-status" role="status">
              Draf “{generatedBank.input.judul}” berisi {generatedBank.questions.length} soal.
              {generatedBank.answers
                ? ` Kunci dan pembahasan lengkap. Mesin soal: ${generatedBank.questionEngine}; mesin pembahasan: ${generatedBank.answerEngine}.`
                : ' Tahap kunci dan pembahasan belum selesai.'}
            </p>
          )}
        </section>
      )}

      {canEdit && generatedBank?.answers && (
        <section className="question-bank-output">
          <p className="question-bank-screen-notice">Pratinjau cetak “{generatedBank.input.judul}”. Draf ini belum tersimpan; gunakan tombol “Cetak / Simpan sebagai PDF” dan pilih tujuan penyimpanan.</p>
          <QuestionBankGeneratedDocument bank={generatedBank} />
        </section>
      )}

      {canEdit && tenantId && (
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
              <button type="button" className="question-bank-ai-button" disabled={aiBusy || !form.mapel.trim() || !form.kelas.trim() || !topic.trim()} onClick={() => void generateAiDraft()}>
                {aiBusy ? 'Membuat draf…' : 'Buat draf dengan AI'}
              </button>
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

      {tenantId && <section className="question-bank-list" aria-labelledby="question-bank-list-title">
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
      </section>}
    </main>
  );
}
