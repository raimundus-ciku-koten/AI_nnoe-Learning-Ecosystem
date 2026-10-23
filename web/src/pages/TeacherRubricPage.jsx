import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import Ikon from '../components/Ikon.jsx';
import {
  BATAS_KRITERIA_RUBRIK,
  bacaRubrikJson,
  buatRubrikAwal,
  deskripsiTingkatTerpilih,
  hasilRubrikKeCsv,
  hitungSkorRubrik,
  hapusRubrikLokal,
  muatRubrikLokal,
  rubrikKeCsv,
  rubrikKeJson,
  simpanRubrikLokal,
  TINGKAT_RUBRIK,
} from '../services/teacherRubric.js';
import '../styles/teacher-rubric.css';

function unduhRubrik(rubrik) {
  const csv = rubrikKeCsv(rubrik);
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${rubrik.judul.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'rubrik'}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function unduhCadanganRubrik(rubrik) {
  const url = URL.createObjectURL(new Blob([rubrikKeJson(rubrik)], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${rubrik.judul.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'rubrik'}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function unduhHasilAnonim(rubrik, pilihanSkor) {
  const csv = hasilRubrikKeCsv(rubrik, pilihanSkor);
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'pratinjau-skor-rubrik-anonim.csv';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function pesanAksiRubrik(action) {
  if (action instanceof TypeError) return action.message;
  return 'Rubrik tidak dapat diekspor. Periksa data rubrik dan coba lagi.';
}

export default function TeacherRubricPage() {
  const { user } = useAuth();
  const fileInput = useRef(null);
  const [rubrik, setRubrik] = useState(buatRubrikAwal);
  const [savedAt, setSavedAt] = useState('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [skorPilihan, setSkorPilihan] = useState({});

  useEffect(() => {
    setReady(false);
    setSavedAt('');
    setError('');
    try {
      const saved = muatRubrikLokal(window.localStorage, user.uid);
      setRubrik(saved?.rubrik || buatRubrikAwal());
      setSavedAt(saved?.savedAt || '');
    } catch (loadError) {
      console.error('[teacher-rubric] Gagal memuat rubrik lokal:', loadError);
      setRubrik(buatRubrikAwal());
      setError(loadError?.message || 'Draf rubrik lokal tidak dapat dimuat.');
    } finally {
      setReady(true);
    }
  }, [user.uid]);

  const skorMaksimum = useMemo(() => rubrik.kriteria.length * TINGKAT_RUBRIK[0].score, [rubrik.kriteria.length]);
  const ringkasanSkor = useMemo(
    () => hitungSkorRubrik(rubrik, skorPilihan),
    [rubrik, skorPilihan],
  );

  function ubahRubrik(field, value) {
    setRubrik((current) => ({ ...current, [field]: value }));
    setNotice('');
  }

  function ubahKriteria(id, field, value) {
    setRubrik((current) => ({
      ...current,
      kriteria: current.kriteria.map((item) => item.id === id ? { ...item, [field]: value } : item),
    }));
    setNotice('');
  }

  function ubahSkor(id, value) {
    setSkorPilihan((current) => {
      const next = { ...current };
      if (value === '') delete next[id];
      else next[id] = Number(value);
      return next;
    });
  }

  function ubahDeskripsi(id, levelIndex, value) {
    setRubrik((current) => ({
      ...current,
      kriteria: current.kriteria.map((item) => item.id === id
        ? { ...item, deskripsi: item.deskripsi.map((description, index) => index === levelIndex ? value : description) }
        : item),
    }));
    setNotice('');
  }

  function tambahKriteria() {
    if (rubrik.kriteria.length >= BATAS_KRITERIA_RUBRIK) return;
    const id = globalThis.crypto?.randomUUID?.()
      || `kriteria-${Date.now()}-${rubrik.kriteria.length}`;
    setRubrik((current) => ({
      ...current,
      kriteria: [...current.kriteria, { id, nama: '', deskripsi: ['', '', '', ''] }],
    }));
    setNotice('');
  }

  function hapusKriteria(id) {
    if (rubrik.kriteria.length <= 1) return;
    setRubrik((current) => ({
      ...current,
      kriteria: current.kriteria.filter((item) => item.id !== id),
    }));
    setSkorPilihan((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setNotice('');
  }

  function simpan() {
    setError('');
    setNotice('');
    try {
      const record = simpanRubrikLokal(window.localStorage, user.uid, rubrik);
      setRubrik(record.rubrik);
      setSavedAt(record.savedAt);
      setNotice('Rubrik tersimpan di browser ini untuk akun Anda.');
    } catch (saveError) {
      console.error('[teacher-rubric] Gagal menyimpan rubrik lokal:', saveError);
      setError(saveError?.message || 'Rubrik tidak dapat disimpan di browser ini.');
    }
  }

  function hapusDraf() {
    if (!window.confirm('Hapus draf rubrik tersimpan dari browser ini?')) return;
    setError('');
    setNotice('');
    try {
      hapusRubrikLokal(window.localStorage, user.uid);
      setRubrik(buatRubrikAwal());
      setSavedAt('');
      setNotice('Draf rubrik lokal telah dihapus.');
    } catch (removeError) {
      console.error('[teacher-rubric] Gagal menghapus rubrik lokal:', removeError);
      setError(removeError?.message || 'Draf rubrik tidak dapat dihapus.');
    }
  }

  function eksporCsv() {
    setError('');
    try {
      unduhRubrik(rubrik);
    } catch (exportError) {
      console.error('[teacher-rubric] Gagal mengekspor CSV:', exportError);
      setError(pesanAksiRubrik(exportError));
    }
  }

  function eksporCadangan() {
    setError('');
    try {
      unduhCadanganRubrik(rubrik);
    } catch (exportError) {
      console.error('[teacher-rubric] Gagal membuat cadangan JSON:', exportError);
      setError(pesanAksiRubrik(exportError));
    }
  }

  function eksporPratinjauSkor() {
    setError('');
    try {
      unduhHasilAnonim(rubrik, skorPilihan);
      setNotice('Pratinjau skor anonim berhasil diekspor. Berkas tidak memuat identitas siswa.');
    } catch (exportError) {
      console.error('[teacher-rubric] Gagal mengekspor pratinjau skor:', exportError);
      setError(pesanAksiRubrik(exportError));
    }
  }

  async function imporRubrik(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setNotice('');
    try {
      if (file.size > 100 * 1024) {
        throw new TypeError('Berkas rubrik tidak valid atau melebihi batas 100 KB.');
      }
      const imported = bacaRubrikJson(await file.text());
      if (!window.confirm('Impor akan mengganti isi rubrik yang sedang terbuka. Lanjutkan?')) return;
      setRubrik(imported);
      setSkorPilihan({});
      setSavedAt('');
      setNotice('Rubrik berhasil dimuat. Simpan draf untuk menyimpannya di browser ini.');
    } catch (importError) {
      console.error('[teacher-rubric] Gagal mengimpor rubrik:', importError);
      setError(importError?.message || 'Berkas rubrik tidak dapat diimpor.');
    }
  }

  if (!user?.uid) {
    return (
      <section className="ale-kartu teacher-rubric-denied" role="alert">
        <h1>Rubrik Penilaian</h1>
        <p>Rubrik hanya dapat dikelola setelah akun guru tersedia.</p>
      </section>
    );
  }

  return (
    <main className="teacher-rubric">
      <header className="teacher-rubric-header">
        <div>
          <p className="teacher-rubric-kicker"><Ikon nama="clipboard" /> Asesmen dan Penilaian</p>
          <h1>Pembuat Rubrik Penilaian</h1>
          <p>Susun kriteria dan deskripsi capaian secara manual. Tidak ada data yang dikirim ke layanan AI.</p>
        </div>
        <div className="teacher-rubric-actions">
          <button type="button" className="secondary" onClick={() => fileInput.current?.click()} disabled={!ready}>Impor JSON</button>
          <button type="button" className="secondary" onClick={eksporCadangan} disabled={!ready}>Cadangan JSON</button>
          <button type="button" className="secondary" onClick={() => window.print()} disabled={!ready}>Cetak</button>
          <button type="button" className="secondary" onClick={eksporCsv} disabled={!ready}>Ekspor CSV</button>
          <button type="button" onClick={simpan} disabled={!ready}>Simpan draf</button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            onChange={imporRubrik}
            aria-label="Pilih berkas JSON rubrik untuk impor"
            hidden
          />
        </div>
      </header>

      <aside className="teacher-rubric-local-note" role="note">
        Draf disimpan hanya pada browser dan perangkat ini, terpisah per akun. Draf tidak tersinkron ke Supabase atau perangkat lain. Gunakan Cadangan JSON dan Impor JSON untuk memindahkan draf secara manual. Hindari memasukkan nama atau data pribadi siswa.
      </aside>

      <section className="ale-kartu teacher-rubric-meta" aria-label="Informasi rubrik">
        <label>Judul rubrik
          <input value={rubrik.judul} maxLength={120} onChange={(event) => ubahRubrik('judul', event.target.value)} />
        </label>
        <label>Mata pelajaran
          <input value={rubrik.mapel} maxLength={100} onChange={(event) => ubahRubrik('mapel', event.target.value)} placeholder="Opsional" />
        </label>
        <label>Kelas
          <input value={rubrik.kelas} maxLength={80} onChange={(event) => ubahRubrik('kelas', event.target.value)} placeholder="Opsional" />
        </label>
        <label>Periode
          <input value={rubrik.periode} maxLength={80} onChange={(event) => ubahRubrik('periode', event.target.value)} placeholder="Opsional" />
        </label>
      </section>

      {error && <p className="teacher-rubric-error" role="alert">{error}</p>}
      {notice && <p className="teacher-rubric-notice" role="status">{notice}</p>}

      <section className="teacher-rubric-section" aria-labelledby="teacher-rubric-criteria-title">
        <div className="teacher-rubric-section-heading">
          <div>
            <p className="teacher-rubric-kicker">Instrumen manual</p>
            <h2 id="teacher-rubric-criteria-title">Kriteria dan tingkat capaian</h2>
            <p>Skor maksimum {skorMaksimum} poin · {rubrik.kriteria.length} kriteria · 4 tingkat per kriteria</p>
          </div>
          <button
            type="button"
            className="secondary teacher-rubric-add"
            onClick={tambahKriteria}
            disabled={!ready || rubrik.kriteria.length >= BATAS_KRITERIA_RUBRIK}
          >
            Tambah kriteria
          </button>
        </div>

        <div className="teacher-rubric-criteria">
          {rubrik.kriteria.map((criterion, criterionIndex) => (
            <fieldset className="ale-kartu teacher-rubric-criterion" key={criterion.id}>
              <legend>Kriteria {criterionIndex + 1}</legend>
              <div className="teacher-rubric-criterion-heading">
                <label>
                  Nama kriteria
                  <input
                    value={criterion.nama}
                    maxLength={120}
                    onChange={(event) => ubahKriteria(criterion.id, 'nama', event.target.value)}
                    aria-label={`Nama kriteria ${criterionIndex + 1}`}
                  />
                </label>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => hapusKriteria(criterion.id)}
                  disabled={!ready || rubrik.kriteria.length <= 1}
                  aria-label={`Hapus kriteria ${criterionIndex + 1}`}
                >
                  Hapus
                </button>
              </div>
              <div className="teacher-rubric-levels">
                {TINGKAT_RUBRIK.map(({ score, label }, levelIndex) => (
                  <label className="teacher-rubric-level" key={score}>
                    <span><strong>{score} · {label}</strong></span>
                    <textarea
                      rows={3}
                      maxLength={500}
                      value={criterion.deskripsi[levelIndex]}
                      onChange={(event) => ubahDeskripsi(criterion.id, levelIndex, event.target.value)}
                      aria-label={`${label}, kriteria ${criterionIndex + 1}`}
                      placeholder="Tuliskan indikator capaian yang dapat diamati"
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </section>

      <section className="ale-kartu teacher-rubric-score" aria-labelledby="teacher-rubric-score-title">
        <div className="teacher-rubric-section-heading">
          <div>
            <p className="teacher-rubric-kicker">Perhitungan sementara</p>
            <h2 id="teacher-rubric-score-title">Pratinjau skor rubrik</h2>
            <p>Skor hanya dihitung di halaman ini dan tidak disimpan atau dikaitkan dengan identitas siswa.</p>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => setSkorPilihan({})}
            disabled={!ready || ringkasanSkor.scoredCount === 0}
          >
            Reset skor
          </button>
        </div>
        <div className="teacher-rubric-score-list">
          {rubrik.kriteria.map((criterion, index) => (
            <label key={criterion.id}>
              <span>{criterion.nama || `Kriteria ${index + 1}`}</span>
              <select
                value={skorPilihan[criterion.id] ?? ''}
                onChange={(event) => ubahSkor(criterion.id, event.target.value)}
                disabled={!ready}
                aria-label={`Skor ${criterion.nama || `kriteria ${index + 1}`}`}
              >
                <option value="">Belum dinilai</option>
                {TINGKAT_RUBRIK.map(({ score, label }) => (
                  <option key={score} value={score}>{score} · {label}</option>
                ))}
              </select>
              {skorPilihan[criterion.id] && (
                <span className="teacher-rubric-score-indicator">
                  Indikator tingkat terpilih:{' '}
                  {deskripsiTingkatTerpilih(criterion, skorPilihan[criterion.id])}
                </span>
              )}
            </label>
          ))}
        </div>
        <div className="teacher-rubric-score-summary" role="status" aria-live="polite">
          {ringkasanSkor.scoredCount === 0 ? (
            <p>Pilih tingkat pada satu atau lebih kriteria untuk melihat perhitungan.</p>
          ) : (
            <p>
              Skor sementara: <strong>{ringkasanSkor.earned}/{ringkasanSkor.possible}</strong>
              {' '}· <strong>{ringkasanSkor.percentage}%</strong>
              {' '}· {ringkasanSkor.scoredCount} kriteria dinilai
            </p>
          )}
        </div>
        <div className="teacher-rubric-score-export">
          <p>Ekspor hanya memuat rubrik dan skor sementara, tanpa kolom nama atau identitas siswa.</p>
          <button
            type="button"
            className="secondary"
            onClick={eksporPratinjauSkor}
            disabled={!ready || ringkasanSkor.scoredCount === 0}
          >
            Ekspor pratinjau skor anonim
          </button>
        </div>
      </section>

      <footer className="teacher-rubric-footer">
        <p>{savedAt ? `Terakhir disimpan ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(savedAt))}` : 'Belum ada draf tersimpan.'}</p>
        <button type="button" className="danger" onClick={hapusDraf} disabled={!ready || !savedAt}>Hapus draf tersimpan</button>
      </footer>
    </main>
  );
}
