import React, { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import '../styles/guidance-program.css';

const PILIHAN_PROGRAM = [
  { id: 'bk', label: 'Bimbingan dan Konseling' },
  { id: 'kokurikuler', label: 'Kokurikuler' },
  { id: 'ekstrakurikuler', label: 'Ekstrakurikuler' },
];

const BIDANG_BK = ['Pribadi', 'Sosial', 'Belajar', 'Karier'];
const FASE = [
  ['A', 'Fase A · Kelas I–II'],
  ['B', 'Fase B · Kelas III–IV'],
  ['C', 'Fase C · Kelas V–VI'],
  ['D', 'Fase D · Kelas VII–IX'],
  ['E', 'Fase E · Kelas X'],
  ['F', 'Fase F · Kelas XI–XII (SMK empat tahun: XIII)'],
];
const SARAN_TEMA = {
  bk: {
    A: [
      'Mengenal dan menamai perasaan dasar',
      'Teman baru dan bermain bergantian',
      'Rutinitas sekolah dan kesiapan belajar',
      'Tubuhku milikku: berani berkata tidak dan bercerita',
      'Meminta bantuan kepada orang dewasa tepercaya',
      'Mengenal pekerjaan di lingkungan sekolah',
    ],
    B: [
      'Mengenali kekuatan diri dan hal yang disukai',
      'Menenangkan diri saat marah atau kecewa',
      'Kerja sama dan berbagi tugas dalam kelompok',
      'Ejekan, perundungan, dan cara mencari bantuan',
      'Cara belajar yang sesuai dan jadwal belajar',
      'Pekerjaan, minat, dan hobi',
    ],
    C: [
      'Mengenal perubahan diri dan pubertas dengan aman',
      'Mengelola emosi dan tekanan teman sebaya',
      'Menyelesaikan konflik dan menjaga pertemanan',
      'Keamanan digital dan etika bermedia sosial',
      'Kebiasaan belajar dan kecemasan menghadapi ujian',
      'Menyiapkan peralihan ke jenjang berikutnya',
    ],
    D: [
      'Mengenali diri: kekuatan, minat, dan nilai',
      'Mengelola emosi, stres, dan kecemasan',
      'Pertemanan sehat dan tekanan teman sebaya',
      'Etika bermedia sosial dan keamanan digital',
      'Mengatur waktu dan prioritas belajar',
      'Menjelajahi pilihan jenjang dan karier',
    ],
    E: [
      'Beradaptasi dengan lingkungan belajar baru',
      'Mengenali identitas dan nilai diri',
      'Menjaga kesehatan mental dan mengelola tekanan',
      'Relasi sehat, batas pribadi, dan kerja sama',
      'Belajar mandiri dan mengatasi kebiasaan menunda',
      'Menjelajahi minat, program keahlian, dan karier',
    ],
    F: [
      'Menentukan nilai hidup dan arah diri',
      'Mengelola stres, kecemasan seleksi, dan kejenuhan',
      'Mengambil keputusan secara bertanggung jawab',
      'Menjelajahi studi lanjut, kerja, dan kewirausahaan',
      'Menyusun rencana setelah lulus beserta alternatifnya',
      'Menyiapkan komunikasi dan kemandirian hidup',
    ],
  },
  kokurikuler: [
    'Kepemimpinan dan kerja sama',
    'Kepedulian sosial dan lingkungan',
    'Literasi dan komunikasi',
    'Kreativitas dan pemecahan masalah',
  ],
  ekstrakurikuler: [
    'Kepemimpinan dan tanggung jawab',
    'Kebugaran dan sportivitas',
    'Kreativitas dan apresiasi seni',
    'Kerja sama dan pengembangan minat',
  ],
};
const KOMPONEN_BK = [
  'Layanan dasar',
  'Peminatan dan perencanaan individual',
  'Layanan responsif',
  'Dukungan sistem',
];
const STRATEGI_BK = [
  'Klasikal',
  'Kelompok',
  'Individual',
  'Konsultasi',
  'Kolaborasi',
  'Advokasi',
  'Media dan teknologi',
];
const STRATEGI_KEGIATAN = [
  'Projek',
  'Praktik atau unjuk karya',
  'Diskusi dan refleksi',
  'Kolaborasi',
  'Latihan rutin',
];
const KOSONG = {
  program: 'bk',
  fase: 'D',
  kelas: '',
  semester: '1',
  bidang: 'Pribadi',
  komponen: KOMPONEN_BK[0],
  tema: '',
  asesmen: '',
  sasaran: '',
  tujuan: '',
  indikator: '',
  strategi: STRATEGI_BK[0],
  waktu: '',
  media: '',
  langkah: '',
  evaluasi: '',
  tindakLanjut: '',
};

function BarisRingkasan({ label, nilai }) {
  if (!nilai) return null;
  return (
    <div className="guidance-program__summary-row">
      <dt>{label}</dt>
      <dd>{nilai}</dd>
    </div>
  );
}

export default function GuidanceProgramPage() {
  const { role } = useAuth();
  const [draft, setDraft] = useState(KOSONG);
  const [hasil, setHasil] = useState(null);
  const temaSaran = useMemo(
    () => (draft.program === 'bk' ? SARAN_TEMA.bk[draft.fase] : SARAN_TEMA[draft.program]),
    [draft.fase, draft.program],
  );
  const strategi = draft.program === 'bk' ? STRATEGI_BK : STRATEGI_KEGIATAN;

  function ubah(event) {
    const { name, value } = event.target;
    setDraft((current) => ({
      ...current,
      [name]: value,
      ...(name === 'program' ? {
        komponen: value === 'bk' ? KOMPONEN_BK[0] : '',
        bidang: value === 'bk' ? BIDANG_BK[0] : '',
        strategi: value === 'bk' ? STRATEGI_BK[0] : STRATEGI_KEGIATAN[0],
      } : {}),
    }));
  }

  function buatRencana(event) {
    event.preventDefault();
    setHasil({ ...draft, dibuatPada: new Date().toLocaleDateString('id-ID', { dateStyle: 'long' }) });
  }

  if (role !== 'guru') {
    return (
      <main className="guidance-program">
        <section className="guidance-program__notice" role="alert">
          <h1>Program Layanan dan Kegiatan</h1>
          <p>Halaman ini tersedia untuk akun Guru yang aktif. Hak akses mengikuti peran yang diberikan server.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="guidance-program">
      <header className="guidance-program__header">
        <p className="guidance-program__eyebrow">Ruang kerja Guru</p>
        <h1>Program Layanan dan Kegiatan</h1>
        <p>
          Rancang layanan BK mengikuti kebutuhan peserta didik, fase, bidang layanan, dan siklus
          perencanaan. Formulir yang sama juga dapat dipakai untuk merancang kegiatan kokurikuler
          atau ekstrakurikuler.
        </p>
        <p>
          Gunakan panduan BK sebagai bahan kerja, bukan pengganti kebijakan sekolah atau peraturan
          yang berlaku. Sesuaikan tema, strategi, dan tindak lanjut dengan hasil asesmen kebutuhan.
        </p>
      </header>

      <aside className="guidance-program__notice" role="note">
        <strong>Draf privat, belum tersimpan ke akun.</strong>
        <span>
          Isi hanya data program yang diperlukan. Jangan masukkan nama siswa, isi konseling,
          diagnosis, atau catatan kasus. Draf hilang saat halaman ditutup; gunakan cetak atau
          Simpan sebagai PDF untuk membuat salinan lokal.
        </span>
      </aside>

      <form className="guidance-program__form" onSubmit={buatRencana}>
        <section className="guidance-program__section" aria-labelledby="guidance-context-title">
          <h2 id="guidance-context-title">Konteks program</h2>
          <div className="guidance-program__grid">
            <label>
              Jenis program
              <select name="program" value={draft.program} onChange={ubah}>
                {PILIHAN_PROGRAM.map((pilihan) => (
                  <option key={pilihan.id} value={pilihan.id}>{pilihan.label}</option>
                ))}
              </select>
            </label>
            {draft.program === 'bk' && (
              <>
                <label>
                  Fase
                  <select name="fase" value={draft.fase} onChange={ubah}>
                    {FASE.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </label>
                <label>
                  Bidang layanan
                  <select name="bidang" value={draft.bidang} onChange={ubah}>
                    {BIDANG_BK.map((bidang) => <option key={bidang}>{bidang}</option>)}
                  </select>
                </label>
                <label>
                  Komponen layanan
                  <select name="komponen" value={draft.komponen} onChange={ubah}>
                    {KOMPONEN_BK.map((komponen) => <option key={komponen}>{komponen}</option>)}
                  </select>
                </label>
              </>
            )}
            <label>
              Kelas atau kelompok sasaran
              <input name="kelas" value={draft.kelas} onChange={ubah} maxLength={80} placeholder="Contoh: Kelas VII" />
            </label>
            <label>
              Semester
              <select name="semester" value={draft.semester} onChange={ubah}>
                <option value="1">Semester 1</option>
                <option value="2">Semester 2</option>
              </select>
            </label>
            <label className="guidance-program__wide">
              Tema atau topik
              <input
                name="tema"
                list="guidance-topic-suggestions"
                value={draft.tema}
                onChange={ubah}
                maxLength={160}
                placeholder="Pilih saran atau tulis tema sendiri"
                required
              />
              <datalist id="guidance-topic-suggestions">
                {temaSaran.map((tema) => <option key={tema} value={tema} />)}
              </datalist>
              <small>Tema bebas dapat diketik; daftar saran bukan pilihan yang membatasi.</small>
            </label>
          </div>
        </section>

        <section className="guidance-program__section" aria-labelledby="guidance-design-title">
          <h2 id="guidance-design-title">Rancangan</h2>
          <div className="guidance-program__grid">
            <label className="guidance-program__wide">
              Asesmen kebutuhan atau alasan program
              <textarea name="asesmen" value={draft.asesmen} onChange={ubah} maxLength={1200} rows={3} required />
            </label>
            <label>
              Sasaran dan cakupan
              <input name="sasaran" value={draft.sasaran} onChange={ubah} maxLength={240} required />
            </label>
            <label>
              Strategi
              <select name="strategi" value={draft.strategi} onChange={ubah}>
                {strategi.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              Tujuan layanan atau kegiatan
              <textarea name="tujuan" value={draft.tujuan} onChange={ubah} maxLength={800} rows={3} required />
            </label>
            <label>
              Indikator keberhasilan
              <textarea name="indikator" value={draft.indikator} onChange={ubah} maxLength={800} rows={3} required />
            </label>
            <label>
              Waktu dan durasi
              <input name="waktu" value={draft.waktu} onChange={ubah} maxLength={160} placeholder="Contoh: 2 × 40 menit" />
            </label>
            <label>
              Media dan bahan
              <textarea name="media" value={draft.media} onChange={ubah} maxLength={800} rows={3} />
            </label>
            <label className="guidance-program__wide">
              Langkah kegiatan: pembukaan, pengalaman/inti, refleksi, dan aksi
              <textarea name="langkah" value={draft.langkah} onChange={ubah} maxLength={2400} rows={6} required />
            </label>
            <label>
              Evaluasi
              <textarea
                name="evaluasi"
                value={draft.evaluasi}
                onChange={ubah}
                maxLength={1000}
                rows={4}
                placeholder={draft.program === 'bk' ? 'Contoh: pemahaman, kenyamanan, dan rencana tindakan (UCA)' : ''}
                required
              />
            </label>
            <label>
              Tindak lanjut
              <textarea name="tindakLanjut" value={draft.tindakLanjut} onChange={ubah} maxLength={1000} rows={4} required />
            </label>
          </div>
        </section>

        <div className="guidance-program__actions">
          <button type="submit">Buat pratinjau program</button>
          {hasil && (
            <button type="button" className="is-secondary" onClick={() => window.print()}>
              Cetak / Simpan sebagai PDF
            </button>
          )}
        </div>
      </form>

      {hasil && (
        <article className="guidance-program__preview" aria-labelledby="guidance-preview-title">
          <header>
            <p>{PILIHAN_PROGRAM.find(({ id }) => id === hasil.program)?.label} · Draf</p>
            <h2 id="guidance-preview-title">{hasil.tema}</h2>
            <dl className="guidance-program__summary">
              <BarisRingkasan label="Fase" nilai={hasil.program === 'bk' ? `Fase ${hasil.fase}` : ''} />
              <BarisRingkasan label="Bidang" nilai={hasil.bidang} />
              <BarisRingkasan label="Komponen" nilai={hasil.komponen} />
              <BarisRingkasan label="Sasaran" nilai={hasil.sasaran} />
              <BarisRingkasan label="Kelas/kelompok" nilai={hasil.kelas} />
              <BarisRingkasan label="Semester" nilai={`Semester ${hasil.semester}`} />
              <BarisRingkasan label="Strategi" nilai={hasil.strategi} />
              <BarisRingkasan label="Waktu" nilai={hasil.waktu} />
              <BarisRingkasan label="Tanggal draf" nilai={hasil.dibuatPada} />
            </dl>
          </header>
          {[
            ['Asesmen kebutuhan atau alasan program', hasil.asesmen],
            ['Tujuan', hasil.tujuan],
            ['Indikator keberhasilan', hasil.indikator],
            ['Media dan bahan', hasil.media],
            ['Langkah kegiatan', hasil.langkah],
            ['Evaluasi', hasil.evaluasi],
            ['Tindak lanjut', hasil.tindakLanjut],
          ].filter(([, isi]) => isi).map(([judul, isi]) => (
            <section key={judul}>
              <h3>{judul}</h3>
              <p>{isi}</p>
            </section>
          ))}
        </article>
      )}
    </main>
  );
}
