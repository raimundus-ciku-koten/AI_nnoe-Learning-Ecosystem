const STORAGE_PREFIX = 'ainnoe:teacher-rubric:v1:';
const MAX_CRITERIA = 10;
const MAX_IMPORT_BYTES = 100 * 1024;
const LEVEL_COUNT = 4;
const LEVELS = [
  { score: 4, label: 'Sangat baik' },
  { score: 3, label: 'Baik' },
  { score: 2, label: 'Cukup' },
  { score: 1, label: 'Perlu bimbingan' },
];

const text = (value, label, max, required = false) => {
  const result = String(value ?? '').trim();
  if (required && !result) throw new TypeError(`${label} wajib diisi.`);
  if (result.length > max) throw new TypeError(`${label} maksimal ${max} karakter.`);
  return result;
};

function storageKey(userId) {
  const id = text(userId, 'ID akun', 128, true);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new TypeError('ID akun tidak valid.');
  return `${STORAGE_PREFIX}${id}`;
}

export function buatRubrikAwal() {
  return {
    judul: 'Rubrik Penilaian',
    mapel: '',
    kelas: '',
    periode: '',
    kriteria: [
      {
        id: 'kriteria-1',
        nama: 'Pemahaman materi',
        deskripsi: [
          'Menjelaskan konsep secara akurat, menghubungkan gagasan, dan memberi contoh yang relevan secara mandiri.',
          'Menjelaskan konsep utama dengan benar; terdapat kekeliruan kecil yang tidak mengubah pemahaman inti.',
          'Menunjukkan pemahaman sebagian, tetapi masih memerlukan pertanyaan pemandu untuk menjelaskan hubungan antargagasan.',
          'Belum menunjukkan pemahaman konsep utama dan memerlukan pendampingan bertahap.',
        ],
      },
      {
        id: 'kriteria-2',
        nama: 'Ketepatan proses',
        deskripsi: [
          'Memilih strategi yang sesuai, menjalankan langkah secara runtut, dan memeriksa kembali hasil secara mandiri.',
          'Menggunakan strategi yang sesuai dengan urutan yang tepat; hanya ada kekeliruan kecil yang dapat diperbaiki.',
          'Menyelesaikan sebagian langkah, tetapi masih memerlukan arahan untuk memilih strategi atau memeriksa hasil.',
          'Belum dapat menjalankan langkah utama meskipun sudah mendapat arahan; perlu contoh dan latihan bertahap.',
        ],
      },
      {
        id: 'kriteria-3',
        nama: 'Komunikasi dan penyajian',
        deskripsi: [
          'Menyampaikan gagasan secara runtut, menggunakan istilah yang tepat, dan menanggapi pertanyaan dengan alasan yang jelas.',
          'Penyampaian cukup runtut dan dapat dipahami; sebagian besar istilah dan alasan sudah tepat.',
          'Gagasan utama dapat dikenali, tetapi penyampaian atau alasan masih perlu diperjelas dengan pertanyaan pemandu.',
          'Gagasan belum tersampaikan dengan jelas dan memerlukan dukungan untuk menyusun penjelasan dasar.',
        ],
      },
    ],
  };
}

export function normalisasiRubrik(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Format rubrik tidak valid.');
  }
  if (!Array.isArray(value.kriteria) || value.kriteria.length < 1 ||
      value.kriteria.length > MAX_CRITERIA) {
    throw new TypeError(`Rubrik harus memiliki 1–${MAX_CRITERIA} kriteria.`);
  }
  const ids = new Set();
  const kriteria = value.kriteria.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new TypeError(`Kriteria ${index + 1} tidak valid.`);
    }
    const id = text(item.id, `ID kriteria ${index + 1}`, 80, true);
    if (ids.has(id)) throw new TypeError('ID kriteria harus unik.');
    ids.add(id);
    if (!Array.isArray(item.deskripsi) || item.deskripsi.length !== LEVEL_COUNT) {
      throw new TypeError(`Kriteria ${index + 1} harus memiliki empat deskripsi tingkat.`);
    }
    return {
      id,
      nama: text(item.nama, `Nama kriteria ${index + 1}`, 120, true),
      deskripsi: item.deskripsi.map((description, levelIndex) =>
        text(description, `Deskripsi kriteria ${index + 1}, tingkat ${levelIndex + 1}`, 500)),
    };
  });

  return {
    judul: text(value.judul, 'Judul rubrik', 120, true),
    mapel: text(value.mapel, 'Mata pelajaran', 100),
    kelas: text(value.kelas, 'Kelas', 80),
    periode: text(value.periode, 'Periode', 80),
    kriteria,
  };
}

export function muatRubrikLokal(storage, userId) {
  const raw = storage.getItem(storageKey(userId));
  if (raw === null) return null;
  let record;
  try {
    record = JSON.parse(raw);
  } catch (cause) {
    throw new Error('Draf rubrik lokal tidak dapat dibaca. Ekspor atau hapus data browser yang rusak.', { cause });
  }
  if (!record || typeof record !== 'object' ||
      typeof record.savedAt !== 'string' || !Number.isFinite(Date.parse(record.savedAt))) {
    throw new Error('Format draf rubrik lokal tidak dikenali.');
  }
  return {
    rubrik: normalisasiRubrik(record.rubrik),
    savedAt: record.savedAt,
  };
}

export function simpanRubrikLokal(storage, userId, rubric, now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError('Waktu penyimpanan rubrik tidak valid.');
  }
  const record = {
    rubrik: normalisasiRubrik(rubric),
    savedAt: now.toISOString(),
  };
  storage.setItem(storageKey(userId), JSON.stringify(record));
  return record;
}

export function rubrikKeJson(input) {
  return JSON.stringify({
    version: 1,
    rubrik: normalisasiRubrik(input),
  }, null, 2);
}

export function bacaRubrikJson(json) {
  if (typeof json !== 'string' || new TextEncoder().encode(json).length > MAX_IMPORT_BYTES) {
    throw new TypeError('Berkas rubrik tidak valid atau melebihi batas 100 KB.');
  }
  let document;
  try {
    document = JSON.parse(json);
  } catch (cause) {
    throw new Error('Berkas rubrik bukan JSON yang valid.', { cause });
  }
  if (!document || typeof document !== 'object' || document.version !== 1) {
    throw new TypeError('Versi berkas rubrik tidak didukung.');
  }
  return normalisasiRubrik(document.rubrik);
}

export function hapusRubrikLokal(storage, userId) {
  storage.removeItem(storageKey(userId));
}

function selCsv(value) {
  const content = String(value ?? '');
  const safeContent = /^[\u0000-\u0020]*[=+\-@]/.test(content)
    ? `'${content}`
    : content;
  return `"${safeContent.replaceAll('"', '""')}"`;
}

export function rubrikKeCsv(input) {
  const rubric = normalisasiRubrik(input);
  const metadata = [
    ['Rubrik', rubric.judul],
    ['Mata pelajaran', rubric.mapel],
    ['Kelas', rubric.kelas],
    ['Periode', rubric.periode],
  ];
  const headings = ['Kriteria', ...LEVELS.map(({ score, label }) => `${score} - ${label}`)];
  const rows = rubric.kriteria.map((item) => [item.nama, ...item.deskripsi]);
  return [...metadata, [], headings, ...rows]
    .map((row) => row.map(selCsv).join(','))
    .join('\r\n');
}

export function hasilRubrikKeCsv(rubricInput, scoreSelections) {
  const rubric = normalisasiRubrik(rubricInput);
  const result = hitungSkorRubrik(rubric, scoreSelections);
  if (result.scoredCount === 0) {
    throw new TypeError('Pilih skor pada minimal satu kriteria sebelum mengekspor hasil.');
  }

  const rows = [
    ['Pratinjau skor rubrik anonim'],
    ['Rubrik', rubric.judul],
    ['Mata pelajaran', rubric.mapel],
    ['Kelas', rubric.kelas],
    ['Periode', rubric.periode],
    ['Catatan', 'Pratinjau sementara; bukan nilai resmi. Tidak memuat identitas siswa.'],
    [],
    ['Kriteria', 'Skor', 'Tingkat', 'Deskripsi tingkat'],
    ...rubric.kriteria.map((criterion) => {
      const score = scoreSelections[criterion.id];
      const level = LEVELS.find((item) => item.score === Number(score));
      return [
        criterion.nama,
        score ?? '',
        level?.label || '',
        level ? criterion.deskripsi[LEVELS.indexOf(level)] : '',
      ];
    }),
    [],
    ['Total skor', result.earned],
    ['Skor maksimum kriteria yang dinilai', result.possible],
    ['Persentase sementara', `${result.percentage}%`],
    ['Kriteria yang dinilai', `${result.scoredCount}/${rubric.kriteria.length}`],
  ];
  return `\uFEFF${rows.map((row) => row.map(selCsv).join(',')).join('\r\n')}`;
}

export function hitungSkorRubrik(rubricInput, scoreSelections) {
  const rubric = normalisasiRubrik(rubricInput);
  if (!scoreSelections || typeof scoreSelections !== 'object' || Array.isArray(scoreSelections)) {
    throw new TypeError('Pilihan skor rubrik tidak valid.');
  }
  const criteriaIds = new Set(rubric.kriteria.map(({ id }) => id));
  for (const id of Object.keys(scoreSelections)) {
    if (!criteriaIds.has(id)) throw new TypeError('Pilihan skor tidak cocok dengan kriteria rubrik.');
  }

  const selections = rubric.kriteria.flatMap((criterion) => {
    const value = scoreSelections[criterion.id];
    if (value === undefined || value === null || value === '') return [];
    const score = Number(value);
    if (!LEVELS.some((level) => level.score === score)) {
      throw new TypeError(`Skor untuk "${criterion.nama}" tidak valid.`);
    }
    return [{ criterionId: criterion.id, score }];
  });
  const scoredCount = selections.length;
  const earned = selections.reduce((total, selection) => total + selection.score, 0);
  const possible = scoredCount * LEVELS[0].score;

  return {
    scoredCount,
    earned,
    possible,
    percentage: possible > 0 ? Math.round((earned / possible) * 10000) / 100 : null,
  };
}

export function deskripsiTingkatTerpilih(criterion, score) {
  const levelIndex = LEVELS.findIndex((level) => level.score === Number(score));
  if (levelIndex < 0 || !Array.isArray(criterion?.deskripsi)) return '';
  return criterion.deskripsi[levelIndex]?.trim() || 'Deskripsi untuk tingkat ini belum diisi.';
}

export const TINGKAT_RUBRIK = LEVELS;
export const BATAS_KRITERIA_RUBRIK = MAX_CRITERIA;
