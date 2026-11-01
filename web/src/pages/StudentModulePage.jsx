import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { adalahPeranGuru } from '../navigasi.js';
import { MODUL_SISWA_BAGIAN } from '../services/studentModuleAiPrompts.js';
import { generateStudentModule } from '../services/studentModuleAi.js';
import '../styles/student-module.css';

const FORM_AWAL = {
  mapel: '',
  kelas: '',
  topik: '',
  tp: '',
  jumlahJP: '',
  durasi: '45',
  level: 'Campuran',
  tahunAjaran: '',
  penulis: '',
  sekolah: '',
  catatan: '',
  asesmenProsem: '',
  profilProsem: '',
  metadataAtp: '',
  sumberPustaka: '',
};

function renderInline(text, keyPrefix) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${keyPrefix}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function cellsFromRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function MarkdownContent({ markdown }) {
  const lines = markdown.split(/\r?\n/);
  const nodes = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const Level = `h${Math.min(4, Number(heading[1].length) + 1)}`;
      nodes.push(<Level key={`heading-${index}`}>{renderInline(heading[2], `heading-${index}`)}</Level>);
      index += 1;
      continue;
    }
    if (line.startsWith('|') && index + 1 < lines.length &&
        /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[index + 1])) {
      const headers = cellsFromRow(line);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        rows.push(cellsFromRow(lines[index]));
        index += 1;
      }
      nodes.push(
        <div className="student-module-table-wrap" key={`table-${index}`}>
          <table>
            <thead><tr>{headers.map((cell, cellIndex) => <th key={`${cellIndex}-${cell}`}>{renderInline(cell, `th-${index}-${cellIndex}`)}</th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>{headers.map((_, cellIndex) => (
                <td key={`cell-${cellIndex}`}>{renderInline(row[cellIndex] || '', `td-${index}-${rowIndex}-${cellIndex}`)}</td>
              ))}</tr>
            ))}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      const items = [];
      while (index < lines.length) {
        const item = lines[index].trim().match(/^[-*]\s+(.+)$/);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      nodes.push(<ul key={`list-${index}`}>{items.map((item, itemIndex) => (
        <li key={`item-${itemIndex}`}>{renderInline(item, `ul-${index}-${itemIndex}`)}</li>
      ))}</ul>);
      continue;
    }
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      const items = [];
      while (index < lines.length) {
        const item = lines[index].trim().match(/^\d+[.)]\s+(.+)$/);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      nodes.push(<ol key={`ordered-${index}`}>{items.map((item, itemIndex) => (
        <li key={`item-${itemIndex}`}>{renderInline(item, `ol-${index}-${itemIndex}`)}</li>
      ))}</ol>);
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() &&
        !/^(#{1,4}\s+|\|.*\||[-*]\s+|\d+[.)]\s+)/.test(lines[index].trim())) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    nodes.push(<p key={`paragraph-${index}`}>{renderInline(paragraph.join(' '), `p-${index}`)}</p>);
  }
  return <div className="student-module-markdown">{nodes}</div>;
}

export function StudentModuleDocument({ input, sections }) {
  if (!input || !Array.isArray(sections) || sections.length !== MODUL_SISWA_BAGIAN.length) return null;
  return (
    <article className="student-module-document" aria-label="Pratinjau cetak Modul Siswa">
      <header className="student-module-cover">
        <p className="student-module-cover-label">MODUL PEMBELAJARAN MANDIRI</p>
        <h1>{input.topik}</h1>
        <p className="student-module-cover-subtitle">{input.mapel} · {input.kelas}</p>
        {input.sekolah && <p>{input.sekolah}</p>}
        <dl>
          {input.tahunAjaran && <div><dt>Tahun Ajaran</dt><dd>{input.tahunAjaran}</dd></div>}
          {input.penulis && <div><dt>Penulis</dt><dd>{input.penulis}</dd></div>}
          <div><dt>Alokasi Waktu</dt><dd>{input.jumlahJP} JP × {input.durasi} menit</dd></div>
        </dl>
      </header>
      {sections.map((section, index) => (
        <section
          className={`student-module-section${index === 7 || index === 8 ? ' is-new-page' : ''}`}
          key={section.id}
        >
          <h2>{index + 1}. {section.judul}</h2>
          <MarkdownContent markdown={section.markdown} />
        </section>
      ))}
    </article>
  );
}

export default function StudentModulePage() {
  const { user, role, activeRole } = useAuth();
  const [form, setForm] = useState(FORM_AWAL);
  const [sections, setSections] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const controllerRef = useRef(null);
  const completedCountRef = useRef(0);
  const isTeacher = adalahPeranGuru(activeRole || role);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function generate() {
    if (!isTeacher || busy || controllerRef.current ||
        sections.length >= MODUL_SISWA_BAGIAN.length) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await generateStudentModule({
        uid: user?.uid,
        input: form,
        startIndex: sections.length,
        existingSections: sections,
        signal: controller.signal,
        onSection: (section) => {
          completedCountRef.current += 1;
          setSections((current) => [...current, section]);
        },
      });
      setNotice('Modul Siswa lengkap. Periksa isi dan sumber sebelum mencetak; draf belum tersimpan.');
    } catch (generationError) {
      console.error('[student-module] Gagal menyusun modul:', generationError);
      if (generationError?.name === 'AbortError') {
        setNotice(`Penyusunan dihentikan. ${completedCountRef.current} bagian yang sudah selesai tetap tersedia.`);
      } else {
        setError(generationError?.message || 'Modul belum dapat disusun. Bagian yang telah selesai tetap tersedia.');
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setBusy(false);
    }
  }

  function cancel() {
    controllerRef.current?.abort();
  }

  function reset() {
    if (busy) return;
    setForm(FORM_AWAL);
    setSections([]);
    completedCountRef.current = 0;
    setError('');
    setNotice('');
  }

  if (!isTeacher) {
    return (
      <main className="student-module-page">
        <section className="student-module-notice" role="status">
          <h1>Modul Siswa</h1>
          <p>Generator Modul Siswa hanya tersedia untuk guru.</p>
        </section>
      </main>
    );
  }

  const completed = sections.length === MODUL_SISWA_BAGIAN.length;

  return (
    <main className="student-module-page">
      <header className="student-module-header">
        <p className="student-module-kicker">Perangkat Pembelajaran</p>
        <h1>Modul Siswa</h1>
        <p>Susun bahan belajar mandiri dalam sembilan bagian. Isi hanya data yang sudah diverifikasi; generator menggunakan model AI di perangkat melalui Ollama.</p>
      </header>

      <section className="student-module-notice" aria-label="Batas penyimpanan dan sinkronisasi">
        <strong>Draf belum tersimpan.</strong> Modul hanya berada di memori halaman. Sinkronisasi otomatis RPE, Prosem, dan ATP belum tersedia; konteks turunannya dapat dimasukkan manual. Jika halaman ditutup, draf akan hilang.
      </section>
      {error && <p className="student-module-message is-error" role="alert">{error}</p>}
      {notice && <p className="student-module-message is-success" role="status">{notice}</p>}

      <section className="student-module-form-card">
        <h2>Data Modul</h2>
        <p>Nama sekolah, tahun, dan referensi bersifat opsional. Jika belum diketahui, biarkan kosong atau tulis PERLU KONFIRMASI.</p>
        <form onSubmit={(event) => {
          event.preventDefault();
          void generate();
        }}>
          <div className="student-module-fields">
            <label>
              Mata pelajaran
              <input required maxLength={100} disabled={busy || sections.length > 0} value={form.mapel} onChange={(event) => setForm({ ...form, mapel: event.target.value })} />
            </label>
            <label>
              Kelas/fase
              <input required maxLength={40} disabled={busy || sections.length > 0} value={form.kelas} onChange={(event) => setForm({ ...form, kelas: event.target.value })} />
            </label>
            <label className="student-module-wide">
              Topik/materi
              <input required maxLength={200} disabled={busy || sections.length > 0} value={form.topik} onChange={(event) => setForm({ ...form, topik: event.target.value })} />
            </label>
            <label className="student-module-wide">
              Tujuan Pembelajaran (TP)
              <textarea required maxLength={300} rows={3} disabled={busy || sections.length > 0} value={form.tp} onChange={(event) => setForm({ ...form, tp: event.target.value })} />
            </label>
            <label>
              Alokasi waktu (JP)
              <input type="number" required min="1" max="40" step="1" disabled={busy || sections.length > 0} value={form.jumlahJP} onChange={(event) => setForm({ ...form, jumlahJP: event.target.value })} />
            </label>
            <label>
              Durasi setiap JP (menit)
              <input type="number" required min="15" max="180" step="1" disabled={busy || sections.length > 0} value={form.durasi} onChange={(event) => setForm({ ...form, durasi: event.target.value })} />
            </label>
            <label>
              Level kognitif
              <select disabled={busy || sections.length > 0} value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })}>
                <option value="Campuran">Campuran LOT–MOT–HOTS</option>
                <option value="LOT">LOT (C1–C2)</option>
                <option value="MOT">MOT (C3–C4)</option>
                <option value="HOTS">HOTS (C5–C6)</option>
              </select>
            </label>
            <label>
              Tahun ajaran (opsional)
              <input maxLength={30} disabled={busy || sections.length > 0} value={form.tahunAjaran} onChange={(event) => setForm({ ...form, tahunAjaran: event.target.value })} />
            </label>
            <label>
              Penulis (opsional)
              <input maxLength={100} disabled={busy || sections.length > 0} value={form.penulis} onChange={(event) => setForm({ ...form, penulis: event.target.value })} />
            </label>
            <label>
              Sekolah (opsional)
              <input maxLength={150} disabled={busy || sections.length > 0} value={form.sekolah} onChange={(event) => setForm({ ...form, sekolah: event.target.value })} />
            </label>
            <label className="student-module-wide">
              Catatan guru (opsional)
              <textarea maxLength={400} rows={2} disabled={busy || sections.length > 0} value={form.catatan} onChange={(event) => setForm({ ...form, catatan: event.target.value })} />
            </label>
            <label>
              Asesmen Prosem (opsional)
              <textarea maxLength={300} rows={3} disabled={busy || sections.length > 0} value={form.asesmenProsem} onChange={(event) => setForm({ ...form, asesmenProsem: event.target.value })} />
            </label>
            <label>
              Dimensi profil Prosem (opsional)
              <textarea maxLength={200} rows={3} disabled={busy || sections.length > 0} value={form.profilProsem} onChange={(event) => setForm({ ...form, profilProsem: event.target.value })} />
            </label>
            <label className="student-module-wide">
              Metadata ATP (opsional)
              <textarea maxLength={2000} rows={3} disabled={busy || sections.length > 0} value={form.metadataAtp} onChange={(event) => setForm({ ...form, metadataAtp: event.target.value })} />
            </label>
            <label className="student-module-wide">
              Sumber pustaka terverifikasi (opsional)
              <textarea maxLength={2000} rows={3} disabled={busy || sections.length > 0} value={form.sumberPustaka} onChange={(event) => setForm({ ...form, sumberPustaka: event.target.value })} />
            </label>
          </div>
          <div className="student-module-actions">
            {!completed && (
              <button type="submit" disabled={busy}>
                {busy
                  ? `Menyusun bagian ${sections.length + 1} dari 9…`
                  : sections.length > 0 ? `Lanjutkan dari bagian ${sections.length + 1}` : 'Susun Modul Siswa'}
              </button>
            )}
            {busy && <button type="button" className="is-secondary" onClick={cancel}>Batalkan proses</button>}
            {completed && <button type="button" onClick={() => window.print()}>Cetak / Simpan sebagai PDF</button>}
            {sections.length > 0 && !busy && <button type="button" className="is-secondary" onClick={reset}>Buat modul baru</button>}
          </div>
        </form>
        {sections.length > 0 && (
          <p className="student-module-progress" role="status">
            {sections.length} dari 9 bagian selesai.
            {sections.map((section) => ` ${section.judul}: ${section.fallbackUsed ? `model cadangan ${section.model}` : section.model || 'AI lokal'}.`)}
          </p>
        )}
      </section>

      {completed && (
        <section className="student-module-output">
          <p className="student-module-screen-notice">Pratinjau dokumen. Verifikasi isi, TP, asesmen, dan semua sumber sebelum digunakan; draf ini belum tersimpan.</p>
          <StudentModuleDocument input={form} sections={sections} />
        </section>
      )}
      {!completed && sections.length > 0 && (
        <section className="student-module-output">
          <h2>Bagian yang sudah selesai</h2>
          <ol>{sections.map((section) => <li key={section.id}>{section.judul}</li>)}</ol>
          <p>Lanjutkan pembuatan untuk melengkapi modul. Bagian selesai dipertahankan selama halaman tetap terbuka.</p>
        </section>
      )}
    </main>
  );
}
