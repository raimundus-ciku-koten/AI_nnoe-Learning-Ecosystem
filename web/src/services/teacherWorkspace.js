const MODULE_PATH = /^\/(pelaksanaan|asesmen|pemantauan|refleksi|laporan|kolaborasi|pengaturan|perangkat)\/[a-z0-9-]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const REFLECTION_PREFIX = 'ale-reflection-v1:';
const REFLECTION_FIELDS = Object.freeze(['berhasil', 'bukti', 'tantangan', 'langkahBerikutnya']);
const IMPROVEMENT_PREFIX = 'ale-improvement-plan-v1:';
const IMPROVEMENT_FIELDS = Object.freeze(['fokus', 'perubahan', 'indikator', 'tinjauUlang']);
const JOURNAL_PREFIX = 'ale-teaching-journal-v1:';
const JOURNAL_FIELDS = Object.freeze(['tujuan', 'kegiatan', 'capaian', 'tindakLanjut']);

function boundedText(value, label, max, required = false) {
  const text = String(value ?? '').trim();
  if (required && !text) throw new Error(`${label} wajib diisi.`);
  if (text.length > max) throw new Error(`${label} maksimal ${max} karakter.`);
  return text;
}

export function siapkanCatatanGuru(input) {
  const modulePath = boundedText(input.modulePath, 'Modul', 100, true);
  if (!MODULE_PATH.test(modulePath)) throw new Error('Modul catatan tidak valid.');

  const tanggal = boundedText(input.tanggal, 'Tanggal', 10, true);
  const waktuTanggal = new Date(`${tanggal}T00:00:00Z`);
  if (!ISO_DATE.test(tanggal) || Number.isNaN(waktuTanggal.getTime())
      || waktuTanggal.toISOString().slice(0, 10) !== tanggal) {
    throw new Error('Tanggal harus menggunakan format yang valid.');
  }

  const status = input.status;
  if (!['draf', 'selesai'].includes(status)) throw new Error('Status catatan tidak valid.');
  const isJournal = modulePath === '/pelaksanaan/jurnal';

  return {
    modulePath,
    moduleLabel: boundedText(input.moduleLabel, 'Nama modul', 100, true),
    judul: boundedText(input.judul, 'Judul', 120, true),
    tanggal,
    kelas: boundedText(input.kelas, 'Kelas', 80, isJournal),
    mapel: boundedText(input.mapel, 'Mata pelajaran', 80, isJournal),
    isi: boundedText(input.isi, 'Isi catatan', 6000, true),
    status,
  };
}

export function kosongkanRefleksi() {
  return Object.fromEntries(REFLECTION_FIELDS.map((field) => [field, '']));
}

export function susunIsiRefleksi(input) {
  const reflection = Object.fromEntries(REFLECTION_FIELDS.map((field) => [
    field,
    boundedText(input?.[field], 'Bagian refleksi', 1400),
  ]));
  if (!Object.values(reflection).some(Boolean)) {
    throw new Error('Isi refleksi wajib diisi.');
  }
  return `${REFLECTION_PREFIX}${JSON.stringify(reflection)}`;
}

export function uraikanIsiRefleksi(value) {
  const isi = String(value ?? '');
  if (!isi.startsWith(REFLECTION_PREFIX)) {
    return { ...kosongkanRefleksi(), berhasil: isi, legacy: true };
  }
  try {
    const parsed = JSON.parse(isi.slice(REFLECTION_PREFIX.length));
    return {
      ...Object.fromEntries(REFLECTION_FIELDS.map((field) => [
        field,
        typeof parsed?.[field] === 'string' ? parsed[field] : '',
      ])),
      legacy: false,
    };
  } catch {
    return { ...kosongkanRefleksi(), berhasil: isi, legacy: true };
  }
}

export function tampilkanIsiRefleksi(value) {
  const reflection = uraikanIsiRefleksi(value);
  if (reflection.legacy) return reflection.berhasil;
  const labels = {
    berhasil: 'Yang berjalan baik',
    bukti: 'Bukti belajar',
    tantangan: 'Yang perlu ditingkatkan',
    langkahBerikutnya: 'Langkah berikutnya',
  };
  return REFLECTION_FIELDS
    .filter((field) => reflection[field])
    .map((field) => `${labels[field]}:\n${reflection[field]}`)
    .join('\n\n');
}

export function kosongkanRencanaPerbaikan() {
  return Object.fromEntries(IMPROVEMENT_FIELDS.map((field) => [field, '']));
}

export function susunIsiRencanaPerbaikan(input) {
  const plan = Object.fromEntries(IMPROVEMENT_FIELDS.map((field) => [
    field,
    boundedText(input?.[field], 'Bagian rencana perbaikan', 1400),
  ]));
  if (!Object.values(plan).some(Boolean)) {
    throw new Error('Isi rencana perbaikan wajib diisi.');
  }
  return `${IMPROVEMENT_PREFIX}${JSON.stringify(plan)}`;
}

export function uraikanIsiRencanaPerbaikan(value) {
  const isi = String(value ?? '');
  if (!isi.startsWith(IMPROVEMENT_PREFIX)) {
    return { ...kosongkanRencanaPerbaikan(), fokus: isi, legacy: true };
  }
  try {
    const parsed = JSON.parse(isi.slice(IMPROVEMENT_PREFIX.length));
    return {
      ...Object.fromEntries(IMPROVEMENT_FIELDS.map((field) => [
        field,
        typeof parsed?.[field] === 'string' ? parsed[field] : '',
      ])),
      legacy: false,
    };
  } catch {
    return { ...kosongkanRencanaPerbaikan(), fokus: isi, legacy: true };
  }
}

export function tampilkanIsiRencanaPerbaikan(value) {
  const plan = uraikanIsiRencanaPerbaikan(value);
  if (plan.legacy) return plan.fokus;
  const labels = {
    fokus: 'Fokus perbaikan',
    perubahan: 'Perubahan yang dicoba',
    indikator: 'Indikator keberhasilan',
    tinjauUlang: 'Tinjau ulang',
  };
  return IMPROVEMENT_FIELDS
    .filter((field) => plan[field])
    .map((field) => `${labels[field]}:\n${plan[field]}`)
    .join('\n\n');
}

export function kosongkanJurnalMengajar() {
  return Object.fromEntries(JOURNAL_FIELDS.map((field) => [field, '']));
}

export function susunIsiJurnalMengajar(input) {
  const journal = Object.fromEntries(JOURNAL_FIELDS.map((field) => [
    field,
    boundedText(input?.[field], 'Bagian jurnal', 1400),
  ]));
  if (!Object.values(journal).some(Boolean)) {
    throw new Error('Isi jurnal wajib diisi.');
  }
  return `${JOURNAL_PREFIX}${JSON.stringify(journal)}`;
}

export function uraikanIsiJurnalMengajar(value) {
  const isi = String(value ?? '');
  if (!isi.startsWith(JOURNAL_PREFIX)) {
    return { ...kosongkanJurnalMengajar(), kegiatan: isi, legacy: true };
  }
  try {
    const parsed = JSON.parse(isi.slice(JOURNAL_PREFIX.length));
    return {
      ...Object.fromEntries(JOURNAL_FIELDS.map((field) => [
        field,
        typeof parsed?.[field] === 'string' ? parsed[field] : '',
      ])),
      legacy: false,
    };
  } catch {
    return { ...kosongkanJurnalMengajar(), kegiatan: isi, legacy: true };
  }
}

export function tampilkanIsiJurnalMengajar(value) {
  const journal = uraikanIsiJurnalMengajar(value);
  if (journal.legacy) return journal.kegiatan;
  const labels = {
    tujuan: 'Tujuan pembelajaran',
    kegiatan: 'Kegiatan pembelajaran',
    capaian: 'Capaian yang diamati',
    tindakLanjut: 'Tindak lanjut',
  };
  return JOURNAL_FIELDS
    .filter((field) => journal[field])
    .map((field) => `${labels[field]}:\n${journal[field]}`)
    .join('\n\n');
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function catatanKeCsv(catatan) {
  const headers = ['Modul', 'Judul', 'Tanggal', 'Kelas', 'Mata Pelajaran', 'Status', 'Catatan'];
  const rows = catatan.map((item) => [
    item.moduleLabel, item.judul, item.tanggal, item.kelas, item.mapel, item.status, item.isi,
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
