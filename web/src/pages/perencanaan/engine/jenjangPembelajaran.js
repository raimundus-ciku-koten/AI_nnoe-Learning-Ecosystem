const LEVELS = Object.freeze({
  tk: Object.freeze({
    label: 'TK / PAUD',
    grades: Object.freeze(['Kelompok A', 'Kelompok B']),
    phase: 'Fondasi',
  }),
  sd: Object.freeze({
    label: 'SD',
    grades: Object.freeze(['I', 'II', 'III', 'IV', 'V', 'VI']),
  }),
  smp: Object.freeze({
    label: 'SMP',
    grades: Object.freeze(['VII', 'VIII', 'IX']),
  }),
  sma: Object.freeze({
    label: 'SMA / MA',
    grades: Object.freeze(['X', 'XI', 'XII']),
  }),
});

const ROMAN_TO_NUMBER = Object.freeze({
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6,
  VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12,
});

export const JENJANG_PEMBELAJARAN = LEVELS;

export function normalisasiJenjang(value) {
  const normalized = String(value ?? '').trim().toLocaleLowerCase('id-ID');
  if (['tk', 'paud', 'paud/tk', 'fondasi'].includes(normalized)) return 'tk';
  if (['sd', 'sd/sederajat', 'sekolah dasar'].includes(normalized)) return 'sd';
  if (['smp', 'smp/sederajat', 'sekolah menengah pertama'].includes(normalized)) return 'smp';
  if (['sma', 'ma', 'smk', 'sma/ma', 'sma / ma', 'sekolah menengah atas'].includes(normalized)) return 'sma';
  return '';
}

export function normalisasiFase(value) {
  const normalized = String(value ?? '').trim().toLocaleUpperCase('id-ID');
  return normalized === 'FONDASI' ? 'Fondasi' : /^[A-F]$/.test(normalized) ? normalized : '';
}

function angkaKelas(value) {
  const normalized = String(value ?? '').trim().toLocaleUpperCase('id-ID')
    .replace(/^KELAS\s+/, '');
  if (normalized === 'KELOMPOK A' || normalized === 'KELOMPOK B') return null;
  if (/^\d{1,2}$/.test(normalized)) return Number(normalized);
  return ROMAN_TO_NUMBER[normalized] ?? null;
}

export function faseUntukKelas(jenjang, kelas) {
  const level = normalisasiJenjang(jenjang);
  if (level === 'tk') {
    return /^kelompok\s+[ab]$/i.test(String(kelas ?? '').trim()) ? 'Fondasi' : '';
  }
  const number = angkaKelas(kelas);
  if (level === 'sd') return number >= 1 && number <= 2 ? 'A' : number <= 4 && number >= 3 ? 'B' : number <= 6 && number >= 5 ? 'C' : '';
  if (level === 'smp') return number >= 7 && number <= 9 ? 'D' : '';
  if (level === 'sma') return number === 10 ? 'E' : number >= 11 && number <= 12 ? 'F' : '';
  return '';
}

export function jenjangUntukFase(fase) {
  const normalized = normalisasiFase(fase);
  if (normalized === 'Fondasi') return 'tk';
  if (['A', 'B', 'C'].includes(normalized)) return 'sd';
  if (normalized === 'D') return 'smp';
  if (['E', 'F'].includes(normalized)) return 'sma';
  return '';
}

export function inferJenjangDanKelas({ jenjang, kelas, fase } = {}) {
  const knownLevel = normalisasiJenjang(jenjang) || jenjangUntukFase(fase) || 'sma';
  const grades = LEVELS[knownLevel].grades;
  const currentClass = String(kelas ?? '').trim();
  const normalizedCurrent = currentClass.replace(/^kelas\s+/i, '').toLocaleUpperCase('id-ID');
  const grade = grades.find((item) =>
    item.toLocaleUpperCase('id-ID') === normalizedCurrent ||
    item.toLocaleUpperCase('id-ID') === currentClass.toLocaleUpperCase('id-ID') ||
    (angkaKelas(item) !== null && angkaKelas(item) === angkaKelas(normalizedCurrent)));
  if (grade) return { jenjang: knownLevel, kelas: grade };
  const normalizedPhase = normalisasiFase(fase);
  const phaseDefault = {
    tk: 'Kelompok A',
    sd: ({ A: 'I', B: 'III', C: 'V' })[normalizedPhase] ?? 'I',
    smp: 'VII',
    sma: ({ E: 'X', F: 'XI' })[normalizedPhase] ?? 'X',
  }[knownLevel];
  return { jenjang: knownLevel, kelas: phaseDefault };
}

export function profilPembelajaran({ jenjang, kelas, fase } = {}) {
  const resolved = inferJenjangDanKelas({ jenjang, kelas, fase });
  const gradeNumber = angkaKelas(resolved.kelas);
  if (resolved.jenjang === 'tk') {
    return {
      jenjang: resolved.jenjang,
      kelas: resolved.kelas,
      fase: 'Fondasi',
      fokus: 'perkembangan holistik, bahasa lisan, kesadaran bilangan, motorik, kemandirian, dan interaksi sosial',
      pendekatan: 'bermain bermakna, eksplorasi benda nyata, cerita, gerak, pilihan terbatas, dan aktivitas singkat yang fleksibel',
      penalaran: 'pengamatan, pengelompokan sederhana, urutan, sebab-akibat yang dekat dengan pengalaman anak',
      literasiNumerasi: 'percakapan, menyimak, kosakata, simbol awal, pola, membandingkan, dan menghitung melalui benda konkret',
      scaffolding: 'konkret dan multisensori; hindari abstraksi formal, lembar kerja berlebihan, dan tuntutan baca-tulis-hitung yang tidak sesuai perkembangan',
      karakter: 'rasa ingin tahu, kepedulian, kemandirian, komunikasi, dan kebiasaan baik melalui teladan',
      regulasi: 'ice breaker gerak/lagu dan jeda napas singkat boleh dipakai bila membantu; STOP dilakukan bersama orang dewasa dengan bahasa sederhana, tanpa memaksa anak menutup mata atau berbagi perasaan',
    };
  }
  if (resolved.jenjang === 'sd') {
    const tahap = gradeNumber <= 2 ? 'awal' : gradeNumber <= 4 ? 'tengah' : 'lanjut';
    const details = {
      awal: {
        fokus: 'fondasi literasi, numerasi, rasa aman belajar, komunikasi, dan kebiasaan mandiri',
        pendekatan: 'instruksi singkat, permainan terarah, contoh dan pemodelan guru, latihan bertahap serta umpan balik segera',
        penalaran: 'mengenali, mengurutkan, mengelompokkan, menjelaskan pilihan sederhana, dan menghubungkan sebab-akibat dekat',
        literasiNumerasi: 'kelancaran memahami teks sesuai kemampuan baca, kosakata, bilangan dan operasi dasar dengan benda konkret serta representasi gambar',
        scaffolding: 'konkret → gambar/diagram → simbol sederhana; abstraksi dan beban multi-langkah dinaikkan bertahap',
      },
      tengah: {
        fokus: 'kelancaran memahami informasi, strategi numerasi, kolaborasi, dan tanggung jawab belajar',
        pendekatan: 'pemodelan → latihan terpandu → pemecahan masalah mandiri dan diskusi berpasangan',
        penalaran: 'membandingkan strategi, membaca tabel/grafik sederhana, membuat inferensi dan menjelaskan alasan',
        literasiNumerasi: 'teks beragam, gagasan utama dan bukti; operasi bilangan, pecahan/pengukuran dan representasi visual sesuai CP',
        scaffolding: 'benda konkret → diagram/model → simbol dan strategi multi-langkah; kurangi bantuan setelah pemahaman terlihat',
      },
      lanjut: {
        fokus: 'pemahaman lintas konsep, kemandirian, penalaran berbasis bukti, dan kesiapan transisi ke SMP',
        pendekatan: 'masalah kontekstual, penyelidikan sederhana, proyek ringkas, refleksi dan pilihan strategi',
        penalaran: 'inferensi, membandingkan sumber/strategi, membuat generalisasi sederhana dan menguji alasan',
        literasiNumerasi: 'menafsirkan teks dan data, menyusun argumen singkat; pemodelan numerasi dan masalah multi-langkah',
        scaffolding: 'representasi konkret/visual tetap tersedia, sambil menguatkan simbol, generalisasi, dan transfer konsep',
      },
    }[tahap];
    return {
      jenjang: resolved.jenjang, kelas: resolved.kelas, fase: faseUntukKelas(resolved.jenjang, resolved.kelas),
      ...details,
      karakter: 'integritas, gotong royong, tanggung jawab, kepedulian, dan rasa ingin tahu dalam konteks nyata',
      regulasi: 'ice breaker singkat bersifat opsional; ajarkan STOP sebagai jeda sadar yang aman dan tidak menghukum, lalu kembali ke tujuan belajar',
    };
  }
  if (resolved.jenjang === 'smp') {
    return {
      jenjang: resolved.jenjang, kelas: resolved.kelas, fase: 'D',
      fokus: 'transisi menuju abstraksi, identitas dan tanggung jawab remaja, literasi informasi, serta numerasi kontekstual',
      pendekatan: 'scaffolding eksplisit yang dilepas bertahap, diskusi kolaboratif, investigasi, dan pilihan representasi',
      penalaran: 'membandingkan bukti, menjelaskan hubungan sebab-akibat, proporsi/pola, membuat model awal, dan memeriksa kesimpulan',
      literasiNumerasi: 'menganalisis gagasan dan keandalan sumber; membaca data, rasio, representasi, serta masalah multi-langkah sesuai CP',
      scaffolding: 'konteks nyata → tabel/diagram/model → simbol/variabel; minta murid menjelaskan perpindahan antarrepresentasi',
      karakter: 'integritas akademik, empati, kolaborasi, tanggung jawab digital, dan ketekunan',
      regulasi: 'ice breaker pilihan murid dapat digunakan seperlunya; STOP merupakan strategi jeda opsional, bukan hukuman atau pengganti dukungan konseling',
    };
  }
  return {
    jenjang: resolved.jenjang, kelas: resolved.kelas, fase: faseUntukKelas(resolved.jenjang, resolved.kelas),
    fokus: gradeNumber === 10
      ? 'penguatan fondasi disiplin ilmu, kemandirian belajar, dan transisi menuju penalaran formal'
      : 'kedalaman disiplin ilmu, transfer, sintesis, evaluasi bukti, dan kesiapan studi/kerja',
    pendekatan: 'masalah autentik, pemodelan, eksperimen/analisis sumber, diskusi berbasis bukti, dan refleksi',
    penalaran: gradeNumber === 10
      ? 'menghubungkan konsep prasyarat, menjelaskan model, menyusun argumen dan memeriksa bukti'
      : 'abstraksi dan pemodelan, evaluasi asumsi/bukti, sintesis beberapa konsep, serta argumentasi yang dapat dipertanggungjawabkan',
    literasiNumerasi: 'membaca kritis sumber disipliner, menafsirkan representasi/data, menyusun argumen dan menggunakan kuantifikasi sesuai CP',
    scaffolding: 'konteks/data → representasi/model → notasi formal; sesuaikan bantuan dan tetap sediakan akses bagi kebutuhan belajar beragam',
    karakter: 'integritas akademik, tanggung jawab, kolaborasi, kepedulian, dan etika penggunaan informasi/teknologi',
    regulasi: 'ice breaker dan STOP dapat dipilih secara sukarela dan proporsional; jangan mengganggu waktu belajar atau menggantikan dukungan profesional',
  };
}
