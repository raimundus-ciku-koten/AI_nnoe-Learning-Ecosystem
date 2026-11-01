import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { adalahPeranGuru } from '../navigasi.js';
import {
  identitasEnkripsiDriveDalamSesi,
} from '../services/driveEncryption.js';
import {
  hubungkanGoogleDriveUntukPengguna,
  sesiGoogleWorkspacePerPengguna,
} from '../services/googleWorkspaceAuth.js';
import { MODUL_SISWA_BAGIAN } from '../services/studentModuleAiPrompts.js';
import { generateStudentModule } from '../services/studentModuleAi.js';
import {
  hapusModulSiswaDrive,
  muatModulSiswaDrive,
  simpanModulSiswaDrive,
} from '../services/studentModuleDriveRepository.js';
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
  const [driveBusy, setDriveBusy] = useState('');
  const [driveError, setDriveError] = useState('');
  const [driveNotice, setDriveNotice] = useState('');
  const [history, setHistory] = useState([]);
  const [historyCursor, setHistoryCursor] = useState('');
  const [selectedRecord, setSelectedRecord] = useState(null);
  const controllerRef = useRef(null);
  const completedCountRef = useRef(0);
  const ownerUid = user?.id || user?.uid || '';
  const ownerUidRef = useRef(ownerUid);
  ownerUidRef.current = ownerUid;
  const driveSession = ownerUid ? sesiGoogleWorkspacePerPengguna(ownerUid) : null;
  const driveIdentity = ownerUid ? identitasEnkripsiDriveDalamSesi(ownerUid) : null;
  const isTeacher = adalahPeranGuru(activeRole || role);

  useEffect(() => () => controllerRef.current?.abort(), []);
  useEffect(() => {
    controllerRef.current?.abort();
    setForm(FORM_AWAL);
    setSections([]);
    setBusy(false);
    setDriveBusy('');
    setHistory([]);
    setHistoryCursor('');
    setSelectedRecord(null);
    setError('');
    setNotice('');
    setDriveError('');
    setDriveNotice('');
    completedCountRef.current = 0;
  }, [ownerUid]);

  async function generate() {
    if (!isTeacher || busy || controllerRef.current ||
        sections.length >= MODUL_SISWA_BAGIAN.length) return;
    const controller = new AbortController();
    const requestedOwner = ownerUid;
    controllerRef.current = controller;
    setBusy(true);
    setError('');
    setNotice('');
    completedCountRef.current = sections.length;
    try {
      await generateStudentModule({
        uid: ownerUid,
        input: form,
        startIndex: sections.length,
        existingSections: sections,
        signal: controller.signal,
        onSection: (section) => {
          if (ownerUidRef.current !== requestedOwner) return;
          completedCountRef.current += 1;
          setSections((current) => [...current, section]);
        },
      });
      if (ownerUidRef.current !== requestedOwner) return;
      setNotice('Modul Siswa lengkap. Periksa isi dan sumber sebelum mencetak; draf belum tersimpan.');
    } catch (generationError) {
      if (ownerUidRef.current !== requestedOwner) return;
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
    if (sections.length > 0 &&
        !window.confirm('Hapus isi Modul Siswa yang sedang terbuka dari halaman ini? Draf yang belum disimpan tidak dapat dipulihkan.')) return;
    setForm(FORM_AWAL);
    setSections([]);
    setSelectedRecord(null);
    completedCountRef.current = 0;
    setError('');
    setNotice('');
  }

  async function hubungkanDrive() {
    const requestedOwner = ownerUid;
    setDriveBusy('connect');
    setDriveError('');
    setDriveNotice('');
    try {
      await hubungkanGoogleDriveUntukPengguna(user);
      if (ownerUidRef.current !== requestedOwner) return;
      if (!identitasEnkripsiDriveDalamSesi(ownerUid)) {
        setDriveNotice('Google Drive terhubung. Buka pengaturan Google untuk membuat atau memulihkan kunci vault sebelum memuat riwayat.');
        return;
      }
      setDriveNotice('Google Drive siap untuk riwayat Modul Siswa.');
    } catch (driveConnectionError) {
      console.error('[student-module] Gagal menghubungkan Google Drive:', driveConnectionError);
      setDriveError(driveConnectionError?.message || 'Google Drive tidak dapat dihubungkan.');
    } finally {
      setDriveBusy('');
    }
  }

  async function muatRiwayatDrive(pageToken = '', append = false) {
    const requestedOwner = ownerUid;
    setDriveBusy('load');
    setDriveError('');
    setDriveNotice('');
    try {
      const session = sesiGoogleWorkspacePerPengguna(ownerUid);
      const identity = identitasEnkripsiDriveDalamSesi(ownerUid);
      if (!session) throw new Error('Hubungkan Google Drive terlebih dahulu.');
      if (!identity) throw new Error('Buka atau pulihkan kunci vault di pengaturan Google terlebih dahulu.');
      const result = await muatModulSiswaDrive(
        session.accessToken,
        ownerUid,
        identity,
        pageToken,
      );
      if (ownerUidRef.current !== requestedOwner) return;
      setHistory((current) => {
        const combined = append ? [...current, ...result.entries] : result.entries;
        return [...new Map(combined.map((entry) => [entry.driveFileId, entry])).values()];
      });
      setHistoryCursor(result.nextPageToken || '');
      setDriveNotice(`${result.entries.length} draf Modul Siswa dimuat dari Google Drive.`);
    } catch (historyError) {
      console.error('[student-module] Gagal memuat riwayat Drive:', historyError);
      setDriveError(historyError?.message || 'Riwayat Modul Siswa tidak dapat dimuat.');
    } finally {
      setDriveBusy('');
    }
  }

  async function simpanKeDrive(asCopy = false) {
    const requestedOwner = ownerUid;
    setDriveBusy('save');
    setDriveError('');
    setDriveNotice('');
    try {
      const session = sesiGoogleWorkspacePerPengguna(ownerUid);
      const identity = identitasEnkripsiDriveDalamSesi(ownerUid);
      if (!session) throw new Error('Hubungkan Google Drive terlebih dahulu.');
      if (!identity) throw new Error('Buka atau pulihkan kunci vault di pengaturan Google terlebih dahulu.');
      const saved = await simpanModulSiswaDrive({
        accessToken: session.accessToken,
        ownerUid,
        identity,
        input: form,
        sections,
        existingRecord: asCopy ? null : selectedRecord,
      });
      if (ownerUidRef.current !== requestedOwner) return;
      setSelectedRecord(saved);
      setHistory((current) => [
        saved,
        ...current.filter((entry) => entry.driveFileId !== saved.driveFileId),
      ]);
      setDriveNotice('Draf Modul Siswa tersimpan terenkripsi di Google Drive akun Anda.');
    } catch (saveError) {
      console.error('[student-module] Gagal menyimpan draf ke Drive:', saveError);
      setDriveError(saveError?.message || 'Draf Modul Siswa tidak dapat disimpan ke Drive.');
    } finally {
      setDriveBusy('');
    }
  }

  async function hapusDrafDrive(entry) {
    if (!window.confirm(`Hapus draf "${entry.judul}" dari Google Drive? Penghapusan ini tidak dapat dibatalkan.`)) return;
    const requestedOwner = ownerUid;
    setDriveBusy('delete');
    setDriveError('');
    setDriveNotice('');
    try {
      const session = sesiGoogleWorkspacePerPengguna(ownerUid);
      const identity = identitasEnkripsiDriveDalamSesi(ownerUid);
      if (!session) throw new Error('Hubungkan Google Drive terlebih dahulu.');
      if (!identity) throw new Error('Buka atau pulihkan kunci vault di pengaturan Google terlebih dahulu.');
      await hapusModulSiswaDrive({
        accessToken: session.accessToken,
        ownerUid,
        identity,
        record: entry,
      });
      if (ownerUidRef.current !== requestedOwner) return;
      setHistory((current) => current.filter((item) => item.driveFileId !== entry.driveFileId));
      if (selectedRecord?.driveFileId === entry.driveFileId) setSelectedRecord(null);
      setDriveNotice('Draf dihapus dari Google Drive. Isi yang sedang terbuka tetap berada di halaman sampai Anda meresetnya.');
    } catch (deleteError) {
      console.error('[student-module] Gagal menghapus draf dari Drive:', deleteError);
      setDriveError(deleteError?.message || 'Draf Modul Siswa tidak dapat dihapus dari Drive.');
    } finally {
      setDriveBusy('');
    }
  }

  function pulihkanDraf(entry) {
    if (sections.length > 0 &&
        !window.confirm('Ganti isi Modul Siswa yang sedang terbuka dengan draf dari Drive? Simpan perubahan terlebih dahulu bila diperlukan.')) return;
    setForm(entry.input);
    setSections(entry.sections);
    setSelectedRecord(entry);
    completedCountRef.current = entry.sections.length;
    setError('');
    setNotice('Draf dipulihkan dari Google Drive. Periksa isinya sebelum melanjutkan atau mencetak.');
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
        <strong>Draf tersimpan hanya setelah Anda memilih Simpan ke Drive.</strong> Isi Modul Siswa dienkripsi sebelum diunggah ke Google Drive akun Anda. Sinkronisasi otomatis RPE, Prosem, dan ATP belum tersedia; konteks turunannya dapat dimasukkan manual.
      </section>
      {error && <p className="student-module-message is-error" role="alert">{error}</p>}
      {notice && <p className="student-module-message is-success" role="status">{notice}</p>}
      {driveError && <p className="student-module-message is-error" role="alert">{driveError}</p>}
      {driveNotice && <p className="student-module-message is-success" role="status">{driveNotice}</p>}

      <section className="student-module-drive-card" aria-label="Penyimpanan Modul Siswa">
        <div>
          <h2>Riwayat pribadi di Google Drive</h2>
          <p>
            {driveSession && driveIdentity
              ? `Vault siap${driveSession.email ? ` untuk ${driveSession.email}` : ''}.`
              : 'Hubungkan Google Drive dan buka kunci vault untuk menyimpan atau memulihkan draf.'}
            {' '}Access token hanya digunakan sementara di sesi ini.
          </p>
        </div>
        <div className="student-module-actions">
          <button type="button" className="is-secondary" onClick={hubungkanDrive} disabled={Boolean(driveBusy)}>
            {driveBusy === 'connect' ? 'Menghubungkan…' : 'Hubungkan Google Drive'}
          </button>
          <button type="button" className="is-secondary" onClick={() => void muatRiwayatDrive()} disabled={Boolean(driveBusy)}>
            {driveBusy === 'load' ? 'Memuat riwayat…' : 'Muat riwayat Drive'}
          </button>
          {(!driveSession || !driveIdentity) && (
            <a href="#/pengaturan/google">Buka pengaturan Google untuk menyiapkan vault</a>
          )}
        </div>
        {history.length > 0 && (
          <div className="student-module-history">
            <h3>Draf tersimpan</h3>
            <ul>
              {history.map((entry) => (
                <li key={entry.driveFileId}>
                  <span>
                    <strong>{entry.judul}</strong>
                    <small>{new Date(entry.updatedAt).toLocaleString('id-ID')} · {entry.sections.length}/9 bagian</small>
                  </span>
                  <button type="button" className="is-secondary" onClick={() => pulihkanDraf(entry)} disabled={Boolean(driveBusy || busy)}>
                    {selectedRecord?.driveFileId === entry.driveFileId ? 'Draf aktif' : 'Pulihkan'}
                  </button>
                  <button type="button" className="is-secondary" onClick={() => void hapusDrafDrive(entry)} disabled={Boolean(driveBusy || busy || !driveSession || !driveIdentity)}>
                    Hapus dari Drive
                  </button>
                </li>
              ))}
            </ul>
            {historyCursor && (
              <button type="button" className="is-secondary" onClick={() => void muatRiwayatDrive(historyCursor, true)} disabled={Boolean(driveBusy)}>
                {driveBusy === 'load' ? 'Memuat…' : 'Muat draf berikutnya'}
              </button>
            )}
          </div>
        )}
      </section>

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
            {sections.length > 0 && (
              <button type="button" className="is-secondary" onClick={() => void simpanKeDrive()} disabled={Boolean(driveBusy || busy || !driveSession || !driveIdentity)}>
                {driveBusy === 'save'
                  ? 'Menyimpan ke Drive…'
                  : selectedRecord ? 'Simpan perubahan ke Drive' : 'Simpan draf ke Drive'}
              </button>
            )}
            {sections.length > 0 && selectedRecord && (
              <button type="button" className="is-secondary" onClick={() => void simpanKeDrive(true)} disabled={Boolean(driveBusy || busy || !driveSession || !driveIdentity)}>
                Simpan sebagai draf baru
              </button>
            )}
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
          <p className="student-module-screen-notice">Pratinjau dokumen. Verifikasi isi, TP, asesmen, dan semua sumber sebelum digunakan; draf belum tersimpan sampai Anda memilih Simpan ke Drive.</p>
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
