import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { isTeacherRole } from '../services/roleAccess.js';
import '../styles/guidance-program.css';

const PILIHAN_PROGRAM = [
  { id: 'bk', label: 'Bimbingan dan Konseling' },
  { id: 'kokurikuler', label: 'Kokurikuler' },
  { id: 'ekstrakurikuler', label: 'Ekstrakurikuler' },
];
export const BENTUK_KOKURIKULER = [
  { id: 'projek', label: 'Projek kolaboratif lintas disiplin (model pilihan sekolah)' },
  { id: 'kebiasaan', label: 'Gerakan 7 Kebiasaan Anak Indonesia Hebat' },
  { id: 'lainnya', label: 'Cara lain yang dirancang satuan pendidikan' },
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
export const DIMENSI_PROFIL = [
  'Keimanan dan Ketakwaan terhadap Tuhan Yang Maha Esa',
  'Kewargaan',
  'Penalaran Kritis',
  'Kreativitas',
  'Kolaborasi',
  'Kemandirian',
  'Kesehatan',
  'Komunikasi',
];
export const SARAN_TEMA = {
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
  kokurikuler: {
    A: [
      'Kenalan dengan lingkungan sekitar',
      'Kata-kata dan cerita dari keluarga',
      'Halaman bersih dan kebiasaan sehat',
      'Taman kecil dan pertumbuhan tanaman',
      'Permainan tradisional dan gerak sehat',
    ],
    B: [
      'Mengamati lingkungan dan membuat peta sederhana',
      'Cerita budaya dan wawancara santun',
      'Mengurangi sampah di sekolah',
      'Kebun kelas dan jurnal pertumbuhan',
    ],
    C: [
      'Mengenali potensi dan kebutuhan lingkungan',
      'Dokumentasi cerita dan tradisi',
      'Audit sampah dan aksi kebersihan',
      'Karya kreatif untuk masalah di sekitar',
    ],
    D: [
      'Aksi kolaboratif untuk kebutuhan komunitas',
      'Cerita digital dan literasi media',
      'Kesehatan dan lingkungan sekolah',
      'Riset sederhana dan solusi berkelanjutan',
    ],
    E: [
      'Mengenal bahasa, budaya, dan tradisi',
      'Cerita digital dan warisan budaya',
      'Mengenal pesisir dan keanekaragaman hayati',
      'Gotong royong untuk kebutuhan komunitas',
      'Mengenal motif dan proses tenun',
      'Konservasi lingkungan dan potensi maritim',
      'Inovasi produk dari sumber daya lokal',
      'Lingkungan bersih dan sekolah sehat',
      'Seni pertunjukan dan dokumentasi budaya',
      'Sekolah pantai dan kesadaran lingkungan',
      'Budaya bahari dalam sastra dan seni',
      'Ibadah, kedamaian, dan toleransi',
      'Kebugaran dan kebiasaan hidup aktif',
      'Jelajah alam dan budaya secara bertanggung jawab',
    ],
    F: [
      'Menganalisis ancaman lingkungan dan merancang solusi berbasis data',
      'Menguji prototipe produk dan memperbaikinya dari umpan balik',
      'Memimpin aksi sosial dan mengevaluasi dampaknya',
      'Mengembangkan kewirausahaan sosial dan kemitraan',
      'Melestarikan warisan budaya melalui karya dan diseminasi',
      'Merancang kebiasaan sehat dan advokasi berbasis bukti',
      'Menyusun rekomendasi dan rencana keberlanjutan',
    ],
  },
  ekstrakurikuler: {
    A: ['Mencoba keterampilan dasar melalui permainan dan gerak', 'Bercerita, bernyanyi, atau berkarya dengan bahan sederhana'],
    B: ['Berlatih keterampilan mengikuti aturan dan urutan', 'Membuat karya atau penampilan kelompok kecil'],
    C: ['Merancang karya kelompok dengan pembagian peran', 'Menyajikan hasil dan menerima masukan'],
    D: ['Mengembangkan teknik dan tanggung jawab dalam tim', 'Menyelesaikan projek sesuai minat bersama'],
    E: ['Merencanakan projek dan gelar karya sesuai minat', 'Berbagi peran dan mendokumentasikan proses kegiatan'],
    F: ['Memimpin projek, membimbing teman, dan berbagi hasil', 'Mengembangkan karya serta refleksi untuk keberlanjutan kegiatan'],
  },
};
export function saranTema(program, fase) {
  const saran = SARAN_TEMA[program];
  return Array.isArray(saran) ? saran : (saran?.[fase] ?? []);
}
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
  'Latihan bertahap dan umpan balik',
  'Mentoring sebaya',
];
const KOSONG = {
  program: 'bk',
  bentukKokurikuler: 'projek',
  fase: 'D',
  kelas: '',
  semester: '1',
  alokasiWaktuTahunan: '',
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
  dimensi: [],
  lokasi: '',
  keterkaitan: '',
  rumpunEkstra: '',
  minatSumberDaya: '',
  pembinaKelompok: '',
  kesepakatanEkstra: '',
  kalenderEkstra: '',
  dokumentasiEkstra: '',
  mitra: '',
  timFasilitator: '',
  orientasiKesepakatan: '',
  izinEtika: '',
  hakCipta: '',
  aksesibilitas: '',
  buktiKarya: '',
  digital: '',
  rencanaOffline: '',
  asesmenFormatif: '',
  asesmenSumatif: '',
  tahapMengenal: '',
  tahapMenyelidiki: '',
  tahapMerancang: '',
  tahapBerkarya: '',
  tahapMerefleksi: '',
  tahapEkstraOrientasi: '',
  tahapEkstraEksplorasi: '',
  tahapEkstraPerencanaan: '',
  tahapEkstraPembuatan: '',
  tahapEkstraPenyempurnaan: '',
  tahapEkstraPameran: '',
  asesmenDiagnostik: '',
  risiko: '',
  pencegahan: '',
  penanggungJawab: '',
  keamananInklusi: '',
  rubrikEkstra: '',
  portofolio: '',
  kontribusiIndividu: '',
  anggaranBahan: '',
  anggaranLapangan: '',
  anggaranDokumentasi: '',
  anggaranPameran: '',
  pameran: '',
  keberlanjutan: '',
};

const PROGRAM_SPESIALIS = {
  guru_bk: 'bk',
  guru_kokurikuler: 'kokurikuler',
  guru_ekstrakurikuler: 'ekstrakurikuler',
};

function programDiperbolehkanUntukPeran(role) {
  const programSpesialis = PROGRAM_SPESIALIS[role];
  return programSpesialis
    ? PILIHAN_PROGRAM.filter(({ id }) => id === programSpesialis)
    : isTeacherRole(role) ? PILIHAN_PROGRAM : [];
}

function drafAwalUntukPeran(role) {
  const program = PROGRAM_SPESIALIS[role] || KOSONG.program;
  return {
    ...KOSONG,
    program,
    fase: program === 'kokurikuler' || program === 'ekstrakurikuler' ? 'E' : KOSONG.fase,
  };
}

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
  const { role: baseRole, activeRole } = useAuth();
  const role = activeRole || baseRole;
  const pilihanProgram = useMemo(() => programDiperbolehkanUntukPeran(role), [role]);
  const [draft, setDraft] = useState(() => drafAwalUntukPeran(role));
  const [hasil, setHasil] = useState(null);
  const [galatDimensi, setGalatDimensi] = useState('');
  const temaSaran = useMemo(() => saranTema(draft.program, draft.fase), [draft.fase, draft.program]);
  const strategi = draft.program === 'bk' ? STRATEGI_BK : STRATEGI_KEGIATAN;

  useEffect(() => {
    setDraft(drafAwalUntukPeran(role));
    setHasil(null);
    setGalatDimensi('');
  }, [role]);

  function ubah(event) {
    const { name, value } = event.target;
    if (name === 'program' && !pilihanProgram.some((program) => program.id === value)) return;
    setDraft((current) => ({
      ...current,
      [name]: event.target.type === 'checkbox'
        ? (event.target.checked
          ? [...current[name], value]
          : current[name].filter((item) => item !== value))
        : value,
      ...(name === 'program' ? {
        komponen: value === 'bk' ? KOMPONEN_BK[0] : '',
        bidang: value === 'bk' ? BIDANG_BK[0] : '',
        strategi: value === 'bk' ? STRATEGI_BK[0] : STRATEGI_KEGIATAN[0],
        fase: value === 'kokurikuler' ? 'E' : current.fase,
      } : {}),
    }));
  }

  function buatRencana(event) {
    event.preventDefault();
    if (!pilihanProgram.some((program) => program.id === draft.program)) {
      setHasil(null);
      return;
    }
    if (draft.program === 'kokurikuler' && (draft.dimensi.length < 1 || draft.dimensi.length > 4)) {
      setGalatDimensi('Pilih satu sampai empat dimensi profil lulusan yang paling relevan.');
      return;
    }
    setGalatDimensi('');
    setHasil({ ...draft, dibuatPada: new Date().toLocaleDateString('id-ID', { dateStyle: 'long' }) });
  }

  if (!isTeacherRole(role)) {
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
        <strong>Bedakan intrakurikuler, kokurikuler, dan ekstrakurikuler.</strong>
        <span>
          Intrakurikuler adalah pembelajaran terjadwal dengan beban kurikulum untuk mencapai tujuan
          belajar; CP mata pelajaran yang diimpor, termasuk Pendidikan Agama dan mata pelajaran
          lainnya, menjadi acuannya. Kokurikuler menguatkan, mendalami, atau memperkaya pembelajaran
          intrakurikuler. Ekstrakurikuler mengembangkan karakter dan potensi, bakat, minat,
          kemampuan, kerja sama, serta kemandirian murid dengan bimbingan dan pengawasan sekolah.
          Karena itu CP mapel tetap berstatus intrakurikuler, meskipun dapat menjadi acuan projek
          kokurikuler.
        </span>
        <small>
          Acuan definisi dan struktur: Permendikbudristek Nomor 12 Tahun 2024, Pasal 1 angka 6–9
          dan Pasal 7. Pembaruan kokurikuler dan ekstrakurikuler: Permendikdasmen Nomor 13 Tahun
          2025, Pasal 16–19 dan Pasal 22.{' '}
          <a href="https://peraturan.go.id/files/permendikbudristek-no-12-tahun-2024.pdf" target="_blank" rel="noopener noreferrer">
            Peraturan dasar
          </a>{' · '}
          <a href="https://peraturan.go.id/files/permendikdasmen-no-13-tahun-2025.pdf" target="_blank" rel="noopener noreferrer">
            Peraturan perubahan
          </a>.
        </small>
      </aside>

      <aside className="guidance-program__notice" role="note">
        <strong>
          {role === 'guru_bk'
            ? 'Ruang kerja BK non-sensitif · draf privat'
            : 'Draf privat, belum tersimpan ke akun.'}
        </strong>
        <span>
          {role === 'guru_bk'
            ? 'Gunakan hanya untuk rancangan layanan dan jadwal umum. Ini bukan sistem rujukan atau catatan konseling. Jangan masukkan nama siswa, identitas, diagnosis, isi konseling, atau detail kasus. Draf hanya berada di browser dan hilang saat halaman ditutup.'
            : 'Isi hanya data program yang diperlukan. Draf berada di browser dan hilang saat halaman ditutup; gunakan cetak atau Simpan sebagai PDF untuk membuat salinan lokal.'}
        </span>
      </aside>
      {['guru_kokurikuler', 'guru_ekstrakurikuler'].includes(role) && (
        <aside className="guidance-program__notice" role="note">
          <strong>Draf rancangan · belum menjadi persetujuan kegiatan sekolah.</strong>
          <span>
            Tanggung jawab pembina, persetujuan sekolah dan orang tua, keselamatan,
            penggunaan dokumentasi, serta sumber daya wajib mengikuti kebijakan sekolah
            sebelum kegiatan dilaksanakan. Draf ini belum disimpan atau disetujui.
          </span>
        </aside>
      )}

      <form className="guidance-program__form" onSubmit={buatRencana}>
        <section className="guidance-program__section" aria-labelledby="guidance-context-title">
          <h2 id="guidance-context-title">Konteks program</h2>
          <div className="guidance-program__grid">
            <label>
              Jenis program
              <select name="program" value={draft.program} onChange={ubah}>
                {pilihanProgram.map((pilihan) => (
                  <option key={pilihan.id} value={pilihan.id}>{pilihan.label}</option>
                ))}
              </select>
            </label>
            {draft.program === 'kokurikuler' && (
              <label className="guidance-program__wide">
                Bentuk kegiatan kokurikuler
                <select name="bentukKokurikuler" value={draft.bentukKokurikuler} onChange={ubah}>
                  {BENTUK_KOKURIKULER.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
                </select>
                <small>
                  Peraturan mengizinkan pembelajaran kolaboratif lintas disiplin, Gerakan 7 Kebiasaan,
                  dan/atau cara lain. Tahap projek di bawah adalah pola yang dipakai buku panduan sekolah,
                  bukan satu-satunya bentuk kokurikuler.
                </small>
              </label>
            )}
            {draft.program !== 'bk' && (
              <label>
                Fase
                <select name="fase" value={draft.fase} onChange={ubah}>
                  {FASE.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
            )}
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
            {draft.program !== 'bk' && (
              <label>
                Lokasi atau lingkungan kegiatan
                <input name="lokasi" value={draft.lokasi} onChange={ubah} maxLength={160} placeholder="Isi sesuai konteks sekolah; tidak ada lokasi baku." />
              </label>
            )}
            <label>
              Semester
              <select name="semester" value={draft.semester} onChange={ubah}>
                <option value="1">Semester 1</option>
                <option value="2">Semester 2</option>
              </select>
            </label>
            {draft.program === 'kokurikuler' && (
              <label>
                Alokasi beban belajar kokurikuler per tahun ajaran
                <input name="alokasiWaktuTahunan" value={draft.alokasiWaktuTahunan} onChange={ubah}
                  maxLength={120} placeholder="Contoh: 100 JP untuk satu tahun ajaran" required />
                <small>Rumuskan alokasi satu tahun ajaran sesuai struktur dan kebijakan satuan pendidikan.</small>
              </label>
            )}
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
            {draft.program === 'kokurikuler' && (
              <>
                <p className="guidance-program__wide guidance-program__guidance-note">
                  Untuk sekolah yang menerapkan SK SMAN 1 Tanjung Bunga Nomor 03.e/I.21.25/SMAN.1.Tj.B/MN/2025,
                  panduan menetapkan minimal tiga projek bertema berbeda pada Fase E (Kelas X)
                  dalam satu tahun ajaran dan minimal dua projek bertema berbeda pada Fase F
                  (Kelas XI–XII). Itu ketentuan SK
                  sekolah tersebut, bukan angka umum Permendikdasmen. Fase A–D pada buku
                  merupakan adaptasi/usulan; sesuaikan dengan kebijakan satuan pendidikan.
                </p>
              </>
            )}
            {draft.program !== 'bk' && (
              <>
                <fieldset className="guidance-program__dimensions guidance-program__wide"
                  aria-describedby={draft.program === 'kokurikuler' ? 'guidance-dimension-error' : undefined}>
                  <legend>
                    Dimensi profil lulusan
                    {draft.program === 'kokurikuler' ? ' (pilih 1–4)' : ' (opsional; pilih yang paling relevan)'}
                  </legend>
                  <div>
                    {DIMENSI_PROFIL.map((dimensi) => (
                      <label key={dimensi}>
                        <input
                          type="checkbox"
                          name="dimensi"
                          value={dimensi}
                          checked={draft.dimensi.includes(dimensi)}
                          onChange={ubah}
                          disabled={!draft.dimensi.includes(dimensi) && draft.dimensi.length >= 4}
                        />
                        {dimensi}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {draft.program === 'kokurikuler' && (
                  <p className="guidance-program__validation guidance-program__wide" id="guidance-dimension-error" role="alert" hidden={!galatDimensi}>
                    {galatDimensi}
                  </p>
                )}
              </>
            )}
            {draft.program === 'ekstrakurikuler' && (
              <>
                <label className="guidance-program__wide">
                  Rumpun atau jenis kegiatan ekstrakurikuler
                  <input name="rumpunEkstra" value={draft.rumpunEkstra} onChange={ubah} maxLength={160}
                    placeholder="Contoh: olahraga, seni, Pramuka, jurnalistik, atau keterampilan" required />
                </label>
                <label>
                  Pemetaan minat dan sumber daya
                  <textarea name="minatSumberDaya" value={draft.minatSumberDaya} onChange={ubah} maxLength={900} rows={3} required
                    placeholder="Ringkas hasil survei minat, pembina/pelatih yang tersedia, alat, bahan, tempat, dan dukungan komunitas." />
                </label>
                <label>
                  Pembina, pelatih, dan pengelompokan murid
                  <textarea name="pembinaKelompok" value={draft.pembinaKelompok} onChange={ubah} maxLength={900} rows={3} required
                    placeholder="Tetapkan pembina/pelatih, kelompok, peran, dan cara merotasi tanggung jawab." />
                </label>
                <label>
                  Pendaftaran, orientasi, dan kesepakatan belajar
                  <textarea name="kesepakatanEkstra" value={draft.kesepakatanEkstra} onChange={ubah} maxLength={900} rows={3} required
                    placeholder="Jelaskan tata cara pendaftaran, jadwal, kehadiran, penggunaan alat, dan kesepakatan bersama murid." />
                </label>
                <label>
                  Kalender dan frekuensi kegiatan
                  <textarea name="kalenderEkstra" value={draft.kalenderEkstra} onChange={ubah} maxLength={700} rows={3} required
                    placeholder="Rinci jadwal latihan/pertemuan selama semester atau tahun ajaran." />
                </label>
                <p className="guidance-program__wide guidance-program__guidance-note">
                  Sesuaikan target dan cara mendampingi dengan fase serta kelas. Panduan ekstrakurikuler
                  menyusun alur enam tahap dari orientasi sampai pameran dan refleksi; asesmen mencakup
                  proses, keterampilan, karya, kontribusi individu, dan refleksi, bukan hanya lomba.
                  Untuk satuan pendidikan formal dasar dan menengah, aturan juga mensyaratkan layanan
                  ekstrakurikuler dan sekurang-kurangnya menyediakan Pramuka atau kepanduan lainnya.
                </p>
              </>
            )}
          </div>
        </section>

        <section className="guidance-program__section" aria-labelledby="guidance-design-title">
          <h2 id="guidance-design-title">Rancangan</h2>
          <div className="guidance-program__grid">
            <label className="guidance-program__wide">
              Asesmen kebutuhan atau alasan program
              <textarea name="asesmen" value={draft.asesmen} onChange={ubah} maxLength={1200} rows={3} required
                placeholder={draft.program === 'ekstrakurikuler'
                  ? 'Petakan minat, bakat, kebutuhan murid, kemampuan awal, dan kesesuaian jenis kegiatan.'
                  : draft.program === 'kokurikuler'
                    ? 'Jelaskan kebutuhan murid/sekolah dan konteks sosial budaya yang mendasari tema.'
                    : ''} />
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
              <textarea name="tujuan" value={draft.tujuan} onChange={ubah} maxLength={1200} rows={3} required
                placeholder={draft.program === 'kokurikuler'
                  ? 'Rumuskan 3–5 tujuan yang teramati: kompetensi + konteks + bukti + ukuran mutu.'
                  : ''} />
            </label>
            <label>
              Indikator keberhasilan
              <textarea name="indikator" value={draft.indikator} onChange={ubah} maxLength={1000} rows={3} required
                placeholder={draft.program === 'kokurikuler'
                  ? 'Indikator teramati untuk tiap dimensi dan deskriptor Sangat Baik, Baik, Cukup, Kurang.'
                  : ''} />
            </label>
            <label>
              Waktu dan durasi
              <input name="waktu" value={draft.waktu} onChange={ubah} maxLength={160} placeholder="Contoh: 2 × 40 menit" />
            </label>
            <label>
              Media dan bahan
              <textarea name="media" value={draft.media} onChange={ubah} maxLength={800} rows={3} />
            </label>
            {draft.program === 'kokurikuler' ? (
              <>
                <label>
                  Acuan intrakurikuler yang dikuatkan (mata pelajaran dan CP)
                  <textarea name="keterkaitan" value={draft.keterkaitan} onChange={ubah} maxLength={1200} rows={3} required
                    placeholder="Salin atau rujuk CP dari dokumen yang telah diimpor: nama mapel, fase, elemen, dan rumusan CP yang relevan. Contoh: Pendidikan Agama Katolik dan Budi Pekerti, Fase E." />
                  <small>
                    Gunakan CP yang sudah diimpor pada Perencanaan Mapel sebagai acuan. Catat
                    mapel, fase, elemen, dan rumusan CP yang benar-benar dikuatkan; mata pelajaran
                    beserta CP-nya tetap berstatus intrakurikuler.
                  </small>
                </label>
                <label>
                  Tim kerja dan fasilitator kokurikuler
                  <textarea name="timFasilitator" value={draft.timFasilitator} onChange={ubah} maxLength={800} rows={3}
                    placeholder="Tuliskan koordinator, fasilitator/guru lintas disiplin, dan tanggung jawab utama." />
                </label>
                <label>
                  Orientasi dan kesepakatan belajar murid
                  <textarea name="orientasiKesepakatan" value={draft.orientasiKesepakatan} onChange={ubah} maxLength={900} rows={3}
                    placeholder="Jelaskan cara memperkenalkan tujuan, membentuk kelompok, membagi peran, dan menyepakati etika kegiatan." />
                </label>
                <label>
                  Mitra, narasumber, dan izin
                  <textarea name="mitra" value={draft.mitra} onChange={ubah} maxLength={1000} rows={3}
                    placeholder="Tuliskan mitra yang telah dihubungi; rencanakan izin orang tua/narasumber sebelum kegiatan." />
                </label>
                <label>
                  Etika, persetujuan, dan dokumentasi
                  <textarea name="izinEtika" value={draft.izinEtika} onChange={ubah} maxLength={900} rows={3} required
                    placeholder="Catat cara memperoleh izin orang tua/narasumber dan batas penggunaan foto, audio, atau video." />
                </label>
                <label>
                  Hak cipta dan atribusi sumber
                  <textarea name="hakCipta" value={draft.hakCipta} onChange={ubah} maxLength={700} rows={3}
                    placeholder="Rencanakan pencantuman sumber dan izin sebelum karya dipublikasikan atau digunakan komersial." />
                </label>
                <label>
                  Aksesibilitas dan kebutuhan dukungan
                  <textarea name="aksesibilitas" value={draft.aksesibilitas} onChange={ubah} maxLength={700} rows={3}
                    placeholder="Atur peran dan alternatif kegiatan agar semua murid dapat berkontribusi." />
                </label>
                {draft.bentukKokurikuler === 'projek' ? (
                  <>
                    <label className="guidance-program__wide">
                      Rencana tahapan projek
                      <small>Lima tahap berikut mengikuti panduan. Isi kegiatan murid dan keluaran/bukti untuk setiap tahap.</small>
                    </label>
                    {[
                      ['tahapMengenal', '1. Mengenal · memahami konteks dan merumuskan pertanyaan'],
                      ['tahapMenyelidiki', '2. Menyelidiki · observasi, wawancara, dan mengumpulkan data'],
                      ['tahapMerancang', '3. Merancang · memilih solusi, membagi peran, dan membuat rencana'],
                      ['tahapBerkarya', '4. Berkarya dan beraksi · membuat, menguji, atau melaksanakan aksi'],
                      ['tahapMerefleksi', '5. Merefleksi dan membagikan · perbaikan, refleksi, pameran, dan umpan balik'],
                    ].map(([name, label]) => (
                      <label key={name}>
                        {label}
                        <textarea name={name} value={draft[name]} onChange={ubah} maxLength={1400} rows={3} required />
                      </label>
                    ))}
                    <label>
                      Bukti karya yang ditargetkan
                      <textarea name="buktiKarya" value={draft.buktiKarya} onChange={ubah} maxLength={800} rows={3}
                        placeholder="Contoh: prototipe yang diuji, dokumentasi, jurnal individu, dan presentasi." />
                    </label>
                    <label>
                      Pemanfaatan teknologi digital
                      <textarea name="digital" value={draft.digital} onChange={ubah} maxLength={700} rows={3}
                        placeholder="Gunakan alat yang tersedia; jangan jadikan aplikasi tertentu syarat penilaian." />
                    </label>
                    <label>
                      Rencana tanpa internet
                      <textarea name="rencanaOffline" value={draft.rencanaOffline} onChange={ubah} maxLength={700} rows={3}
                        placeholder="Contoh: catatan kertas, sketsa, penyimpanan lokal, dan sinkronisasi saat tersedia." />
                    </label>
                    <label>
                      Risiko dan keselamatan
                      <textarea name="risiko" value={draft.risiko} onChange={ubah} maxLength={800} rows={3} required />
                    </label>
                    <label>
                      Pencegahan dan rencana cadangan
                      <textarea name="pencegahan" value={draft.pencegahan} onChange={ubah} maxLength={800} rows={3} required />
                    </label>
                    <label>
                      Penanggung jawab risiko
                      <input name="penanggungJawab" value={draft.penanggungJawab} onChange={ubah} maxLength={160} required />
                    </label>
                    <label>
                      Pameran atau pembagian hasil
                      <textarea name="pameran" value={draft.pameran} onChange={ubah} maxLength={700} rows={3} />
                    </label>
                    <label>
                      Keberlanjutan setelah projek
                      <textarea name="keberlanjutan" value={draft.keberlanjutan} onChange={ubah} maxLength={700} rows={3} />
                    </label>
                  </>
                ) : (
                  <>
                    <label className="guidance-program__wide">
                      Alur kegiatan kokurikuler
                      <textarea name="langkah" value={draft.langkah} onChange={ubah} maxLength={2400} rows={6} required
                        placeholder="Uraikan aktivitas, peran murid/guru, waktu, dan refleksi sesuai bentuk kegiatan yang dipilih." />
                    </label>
                    <label className="guidance-program__wide">
                      Bukti kompetensi atau hasil kegiatan
                      <textarea name="buktiKarya" value={draft.buktiKarya} onChange={ubah} maxLength={800} rows={3} required />
                    </label>
                  </>
                )}
              </>
            ) : draft.program === 'ekstrakurikuler' ? (
              <>
                <label className="guidance-program__wide">
                  Rencana tahapan kegiatan ekstrakurikuler
                  <small>Isi kegiatan murid dan bukti/hasil di setiap tahap; sesuaikan dengan jenis kegiatan dan fase.</small>
                </label>
                {[
                  ['tahapEkstraOrientasi', '1. Orientasi · tujuan, kesepakatan, pengetahuan awal, dan pilihan tema'],
                  ['tahapEkstraEksplorasi', '2. Eksplorasi dan latihan dasar · mencoba teknik dan menerima umpan balik'],
                  ['tahapEkstraPerencanaan', '3. Perancangan · menyepakati kriteria, jadwal, kebutuhan, dan pembagian peran'],
                  ['tahapEkstraPembuatan', '4. Pembuatan · mengerjakan karya/projek, mendokumentasikan, dan memperbaiki'],
                  ['tahapEkstraPenyempurnaan', '5. Penyempurnaan · melengkapi karya dan berlatih untuk pameran/unjuk karya'],
                  ['tahapEkstraPameran', '6. Pameran dan refleksi · menampilkan hasil, menerima umpan balik, dan merefleksikan proses'],
                ].map(([name, label]) => (
                  <label key={name}>
                    {label}
                    <textarea name={name} value={draft[name]} onChange={ubah} maxLength={1400} rows={3} required />
                  </label>
                ))}
                <label>
                  Keamanan, perlindungan, dan inklusi
                  <textarea name="keamananInklusi" value={draft.keamananInklusi} onChange={ubah} maxLength={1000} rows={4} required
                    placeholder="Catat risiko dan pencegahan, aksesibilitas, perlindungan murid, penyesuaian peran, dan penanggung jawab." />
                </label>
                <label className="guidance-program__wide">
                  Dokumentasi dan pencatatan perkembangan
                  <textarea name="dokumentasiEkstra" value={draft.dokumentasiEkstra} onChange={ubah} maxLength={800} rows={3} required
                    placeholder="Rencanakan jurnal pembina, bukti perkembangan/portofolio, izin dokumentasi, dan penyimpanan yang aman." />
                </label>
              </>
            ) : (
              <label className="guidance-program__wide">
                Langkah kegiatan: pembukaan, pengalaman/inti, refleksi, dan aksi
                <textarea name="langkah" value={draft.langkah} onChange={ubah} maxLength={2400} rows={6} required />
              </label>
            )}
            {draft.program !== 'bk' ? (
              <>
                {draft.program !== 'bk' && (
                  <label>
                    Asesmen diagnostik awal
                    <textarea name="asesmenDiagnostik" value={draft.asesmenDiagnostik} onChange={ubah} maxLength={900} rows={3} required
                      placeholder={draft.program === 'kokurikuler'
                        ? 'Petakan kesiapan, minat, pengetahuan awal, dan kebutuhan pendampingan sebelum kegiatan.'
                        : 'Petakan minat dan keterampilan awal murid melalui angket, percakapan, atau unjuk kerja sederhana.'} />
                  </label>
                )}
                <label>
                  Asesmen formatif
                  <textarea name="asesmenFormatif" value={draft.asesmenFormatif} onChange={ubah} maxLength={1000} rows={4} required
                    placeholder={draft.program === 'kokurikuler'
                      ? 'Contoh: observasi bertanggal, jurnal refleksi, check-in, dan umpan balik sejawat/mitra.'
                      : 'Contoh: observasi proses, jurnal latihan, umpan balik langsung, dan penilaian sejawat.'} />
                </label>
                <label>
                  {draft.program === 'kokurikuler' ? 'Asesmen sumatif dan rubrik' : 'Asesmen sumatif, unjuk kerja, dan rubrik'}
                  <textarea name="asesmenSumatif" value={draft.asesmenSumatif} onChange={ubah} maxLength={1200} rows={4} required
                    placeholder={draft.program === 'kokurikuler'
                      ? 'Nilai karya, proses, presentasi, dan portofolio dengan kriteria transparan: Sangat Baik, Baik, Cukup, Kurang.'
                      : 'Nilai keterampilan, proses, karya/penampilan, dan refleksi dengan kriteria yang dibagikan sejak awal.'} />
                </label>
                {draft.program === 'ekstrakurikuler' && (
                  <>
                    <label>
                      Rubrik dan kriteria yang dibagikan kepada murid
                      <textarea name="rubrikEkstra" value={draft.rubrikEkstra} onChange={ubah} maxLength={1200} rows={4} required
                        placeholder="Contoh kriteria: penguasaan keterampilan, ketekunan, kualitas karya, kerja sama, komunikasi, dan refleksi." />
                    </label>
                    <label>
                      Portofolio dan bukti perkembangan
                      <textarea name="portofolio" value={draft.portofolio} onChange={ubah} maxLength={900} rows={3} required
                        placeholder="Contoh: karya, foto proses berizin, catatan latihan, umpan balik, dan refleksi murid." />
                    </label>
                    <label>
                      Bukti kontribusi individu
                      <textarea name="kontribusiIndividu" value={draft.kontribusiIndividu} onChange={ubah} maxLength={900} rows={3} required
                        placeholder="Jelaskan cara memantau kontribusi setiap murid, bukan hanya nilai hasil kelompok." />
                    </label>
                  </>
                )}
              </>
            ) : (
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
            )}
            <label>
              Tindak lanjut
              <textarea name="tindakLanjut" value={draft.tindakLanjut} onChange={ubah} maxLength={1000} rows={4} required />
            </label>
          </div>
        </section>
        {draft.program !== 'bk' && (
          <section className="guidance-program__section" aria-labelledby="guidance-budget-title">
            <h2 id="guidance-budget-title">
              {draft.program === 'kokurikuler' ? 'Anggaran kokurikuler' : 'Sumber daya dan anggaran ekstrakurikuler'}
            </h2>
            <p className="guidance-program__guidance-note">
              Prioritaskan alat/fasilitas sekolah, bahan lokal, dan daur ulang. Hindari iuran wajib
              dari murid; sumber biaya harus disepakati dan mengikuti kebijakan satuan pendidikan.
            </p>
            <div className="guidance-program__grid">
              <label>Bahan dan alat<textarea name="anggaranBahan" value={draft.anggaranBahan} onChange={ubah} maxLength={600} rows={3} /></label>
              <label>Lapangan dan transportasi<textarea name="anggaranLapangan" value={draft.anggaranLapangan} onChange={ubah} maxLength={600} rows={3} /></label>
              <label>Dokumentasi dan cetak<textarea name="anggaranDokumentasi" value={draft.anggaranDokumentasi} onChange={ubah} maxLength={600} rows={3} /></label>
              <label>Pameran<textarea name="anggaranPameran" value={draft.anggaranPameran} onChange={ubah} maxLength={600} rows={3} /></label>
            </div>
          </section>
        )}

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
              <BarisRingkasan label="Fase" nilai={`Fase ${hasil.fase}`} />
              {hasil.program === 'kokurikuler' && (
                <BarisRingkasan
                  label="Bentuk kokurikuler"
                  nilai={BENTUK_KOKURIKULER.find(({ id }) => id === hasil.bentukKokurikuler)?.label}
                />
              )}
              <BarisRingkasan label="Lokasi atau lingkungan" nilai={hasil.lokasi} />
              {hasil.program !== 'bk' && (
                <BarisRingkasan label="Dimensi sasaran" nilai={hasil.dimensi.join(', ')} />
              )}
              {hasil.program === 'kokurikuler' && (
                <BarisRingkasan label="Alokasi beban belajar tahunan" nilai={hasil.alokasiWaktuTahunan} />
              )}
              {hasil.program === 'bk' && (
                <>
                  <BarisRingkasan label="Bidang" nilai={hasil.bidang} />
                  <BarisRingkasan label="Komponen" nilai={hasil.komponen} />
                </>
              )}
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
            ['Lokasi atau lingkungan belajar', hasil.lokasi],
            ...(hasil.program === 'kokurikuler' ? [
              ['Acuan intrakurikuler yang dikuatkan (mata pelajaran dan CP)', hasil.keterkaitan],
              ['Mitra, narasumber, dan izin', hasil.mitra],
              ['Etika, persetujuan, dan dokumentasi', hasil.izinEtika],
              ['Hak cipta dan atribusi sumber', hasil.hakCipta],
              ['Aksesibilitas dan kebutuhan dukungan', hasil.aksesibilitas],
            ] : []),
            ...(hasil.program === 'ekstrakurikuler' ? [
              ['Rumpun/jenis ekstrakurikuler', hasil.rumpunEkstra],
              ['Pemetaan minat dan sumber daya', hasil.minatSumberDaya],
              ['Pembina, pelatih, dan pengelompokan murid', hasil.pembinaKelompok],
              ['Pendaftaran, orientasi, dan kesepakatan belajar', hasil.kesepakatanEkstra],
              ['Kalender dan frekuensi kegiatan', hasil.kalenderEkstra],
              ['Dokumentasi dan pencatatan perkembangan', hasil.dokumentasiEkstra],
              ['Keamanan, perlindungan, dan inklusi', hasil.keamananInklusi],
              ['Rubrik ekstrakurikuler', hasil.rubrikEkstra],
              ['Portofolio dan bukti perkembangan', hasil.portofolio],
              ['Bukti kontribusi individu', hasil.kontribusiIndividu],
            ] : []),
            ...(hasil.program === 'kokurikuler' ? [
              ['Tim kerja dan fasilitator kokurikuler', hasil.timFasilitator],
              ['Orientasi dan kesepakatan belajar murid', hasil.orientasiKesepakatan],
            ] : []),
            ...(hasil.program !== 'bk' ? [
              ['Asesmen diagnostik awal', hasil.asesmenDiagnostik],
              ['Asesmen formatif', hasil.asesmenFormatif],
              [hasil.program === 'ekstrakurikuler' ? 'Asesmen sumatif, unjuk kerja, dan rubrik' : 'Asesmen sumatif dan rubrik', hasil.asesmenSumatif],
            ] : []),
            ['Tujuan', hasil.tujuan],
            ['Indikator keberhasilan', hasil.indikator],
            ['Media dan bahan', hasil.media],
            ...(hasil.program === 'bk' ? [
              ['Langkah kegiatan', hasil.langkah],
              ['Evaluasi', hasil.evaluasi],
            ] : []),
            ...(hasil.program === 'kokurikuler' ? (hasil.bentukKokurikuler === 'projek' ? [
              ['Bukti karya yang ditargetkan', hasil.buktiKarya],
              ['Pemanfaatan teknologi digital', hasil.digital],
              ['Rencana tanpa internet', hasil.rencanaOffline],
              ['Risiko dan keselamatan', hasil.risiko],
              ['Pencegahan dan rencana cadangan', hasil.pencegahan],
              ['Penanggung jawab risiko', hasil.penanggungJawab],
              ['Pameran atau pembagian hasil', hasil.pameran],
              ['Keberlanjutan setelah projek', hasil.keberlanjutan],
            ] : [
              ['Langkah kegiatan', hasil.langkah],
              ['Bukti kompetensi atau hasil kegiatan', hasil.buktiKarya],
            ]) : []),
            ...(hasil.program !== 'bk' ? [
              ['Bahan dan alat', hasil.anggaranBahan],
              ['Lapangan dan transportasi', hasil.anggaranLapangan],
              ['Dokumentasi dan cetak', hasil.anggaranDokumentasi],
              ['Pameran', hasil.anggaranPameran],
            ] : []),
            ['Tindak lanjut', hasil.tindakLanjut],
          ].filter(([, isi]) => isi).map(([judul, isi]) => (
            <section key={judul}>
              <h3>{judul}</h3>
              <p>{isi}</p>
            </section>
          ))}
          {hasil.program === 'kokurikuler' && hasil.bentukKokurikuler === 'projek' && (
            <section>
              <h3>Lima tahap projek</h3>
              {[
                ['1. Mengenal', hasil.tahapMengenal],
                ['2. Menyelidiki', hasil.tahapMenyelidiki],
                ['3. Merancang', hasil.tahapMerancang],
                ['4. Berkarya dan beraksi', hasil.tahapBerkarya],
                ['5. Merefleksi dan membagikan', hasil.tahapMerefleksi],
              ].map(([label, content]) => <p key={label}><strong>{label}</strong>{'\n'}{content}</p>)}
              <h3>Rubrik capaian</h3>
              <p>Sangat Baik · Baik · Cukup · Kurang. Tentukan deskriptor yang teramati untuk setiap dimensi sasaran sebelum projek dimulai; gunakan observasi, jurnal, karya, penilaian sejawat, dan umpan balik.</p>
            </section>
          )}
          {hasil.program === 'ekstrakurikuler' && (
            <section>
              <h3>Enam tahap ekstrakurikuler</h3>
              {[
                ['1. Orientasi', hasil.tahapEkstraOrientasi],
                ['2. Eksplorasi dan latihan dasar', hasil.tahapEkstraEksplorasi],
                ['3. Perancangan', hasil.tahapEkstraPerencanaan],
                ['4. Pembuatan', hasil.tahapEkstraPembuatan],
                ['5. Penyempurnaan', hasil.tahapEkstraPenyempurnaan],
                ['6. Pameran dan refleksi', hasil.tahapEkstraPameran],
              ].map(([label, content]) => <p key={label}><strong>{label}</strong>{'\n'}{content}</p>)}
              <p>Nilai proses dan perkembangan keterampilan dengan beberapa bukti, termasuk observasi, unjuk kerja, portofolio, presentasi, dan refleksi; jangan hanya menilai hasil lomba.</p>
            </section>
          )}
        </article>
      )}
    </main>
  );
}
