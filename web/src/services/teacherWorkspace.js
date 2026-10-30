const MODULE_PATH = /^\/(pelaksanaan|asesmen|pemantauan|refleksi|laporan|kolaborasi|pengaturan|perangkat)\/[a-z0-9-]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const REFLECTION_PREFIX = 'ale-reflection-v1:';
const REFLECTION_FIELDS = Object.freeze(['berhasil', 'bukti', 'tantangan', 'langkahBerikutnya']);
const IMPROVEMENT_PREFIX = 'ale-improvement-plan-v1:';
const IMPROVEMENT_FIELDS = Object.freeze(['fokus', 'perubahan', 'indikator', 'tinjauUlang']);
const JOURNAL_PREFIX = 'ale-teaching-journal-v1:';
const JOURNAL_FIELDS = Object.freeze(['tujuan', 'kegiatan', 'capaian', 'tindakLanjut']);
const DEVELOPMENT_PREFIX = 'ale-development-plan-v1:';
const DEVELOPMENT_FIELDS = Object.freeze(['kompetensi', 'aktivitas', 'target', 'bukti']);
const OBSERVATION_PREFIX = 'ale-observation-v1:';
const OBSERVATION_FIELDS = Object.freeze(['fokus', 'observasi', 'umpanBalik', 'tindakLanjut']);
const PORTFOLIO_PREFIX = 'ale-portfolio-v1:';
const PORTFOLIO_FIELDS = Object.freeze(['jenisKarya', 'deskripsi', 'kompetensi', 'tautan']);
const INTERVENTION_PREFIX = 'ale-class-intervention-v1:';
const INTERVENTION_FIELDS = Object.freeze(['kebutuhan', 'remedial', 'pengayaan', 'indikator']);
const DIFFERENTIATION_PREFIX = 'ale-differentiation-plan-v1:';
const DIFFERENTIATION_FIELDS = Object.freeze(['tujuan', 'kebutuhan', 'strategi', 'cekPemahaman']);
const IMPLEMENTATION_PREFIX = 'ale-plan-implementation-v1:';
const IMPLEMENTATION_FIELDS = Object.freeze(['rencana', 'status', 'pelaksanaan', 'kendala', 'tindakLanjut']);
const QUICK_NOTE_PREFIX = 'ale-class-quick-note-v1:';
const QUICK_NOTE_FIELDS = Object.freeze(['pengamatan', 'respons', 'tindakLanjut']);

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

export function kosongkanRencanaKompetensi() {
  return Object.fromEntries(DEVELOPMENT_FIELDS.map((field) => [field, '']));
}

export function susunIsiRencanaKompetensi(input) {
  const plan = Object.fromEntries(DEVELOPMENT_FIELDS.map((field) => [
    field,
    boundedText(input?.[field], 'Bagian pengembangan kompetensi', 1400),
  ]));
  if (!Object.values(plan).some(Boolean)) {
    throw new Error('Isi rencana pengembangan kompetensi wajib diisi.');
  }
  return `${DEVELOPMENT_PREFIX}${JSON.stringify(plan)}`;
}

export function uraikanIsiRencanaKompetensi(value) {
  const isi = String(value ?? '');
  if (!isi.startsWith(DEVELOPMENT_PREFIX)) {
    return { ...kosongkanRencanaKompetensi(), kompetensi: isi, legacy: true };
  }
  try {
    const parsed = JSON.parse(isi.slice(DEVELOPMENT_PREFIX.length));
    return {
      ...Object.fromEntries(DEVELOPMENT_FIELDS.map((field) => [
        field,
        typeof parsed?.[field] === 'string' ? parsed[field] : '',
      ])),
      legacy: false,
    };
  } catch {
    return { ...kosongkanRencanaKompetensi(), kompetensi: isi, legacy: true };
  }
}

export function tampilkanIsiRencanaKompetensi(value) {
  const plan = uraikanIsiRencanaKompetensi(value);
  if (plan.legacy) return plan.kompetensi;
  const labels = {
    kompetensi: 'Kompetensi yang dikembangkan',
    aktivitas: 'Aktivitas belajar',
    target: 'Target waktu',
    bukti: 'Bukti atau capaian',
  };
  return DEVELOPMENT_FIELDS
    .filter((field) => plan[field])
    .map((field) => `${labels[field]}:\n${plan[field]}`)
    .join('\n\n');
}

export function kosongkanCatatanObservasi() {
  return Object.fromEntries(OBSERVATION_FIELDS.map((field) => [field, '']));
}

export function susunIsiCatatanObservasi(input) {
  const observation = Object.fromEntries(OBSERVATION_FIELDS.map((field) => [
    field,
    boundedText(input?.[field], 'Bagian observasi', 1400),
  ]));
  if (!Object.values(observation).some(Boolean)) {
    throw new Error('Isi catatan observasi wajib diisi.');
  }
  return `${OBSERVATION_PREFIX}${JSON.stringify(observation)}`;
}

export function uraikanIsiCatatanObservasi(value) {
  const isi = String(value ?? '');
  if (!isi.startsWith(OBSERVATION_PREFIX)) {
    return { ...kosongkanCatatanObservasi(), observasi: isi, legacy: true };
  }
  try {
    const parsed = JSON.parse(isi.slice(OBSERVATION_PREFIX.length));
    return {
      ...Object.fromEntries(OBSERVATION_FIELDS.map((field) => [
        field,
        typeof parsed?.[field] === 'string' ? parsed[field] : '',
      ])),
      legacy: false,
    };
  } catch {
    return { ...kosongkanCatatanObservasi(), observasi: isi, legacy: true };
  }
}

export function tampilkanIsiCatatanObservasi(value) {
  const observation = uraikanIsiCatatanObservasi(value);
  if (observation.legacy) return observation.observasi;
  const labels = {
    fokus: 'Fokus observasi',
    observasi: 'Catatan faktual',
    umpanBalik: 'Umpan balik',
    tindakLanjut: 'Tindak lanjut',
  };
  return OBSERVATION_FIELDS
    .filter((field) => observation[field])
    .map((field) => `${labels[field]}:\n${observation[field]}`)
    .join('\n\n');
}

export function kosongkanPortofolioGuru() {
  return Object.fromEntries(PORTFOLIO_FIELDS.map((field) => [field, '']));
}

export function susunIsiPortofolioGuru(input) {
  const labels = {
    jenisKarya: 'Jenis karya',
    deskripsi: 'Deskripsi',
    kompetensi: 'Kompetensi',
    tautan: 'Tautan bukti',
  };
  const portfolio = Object.fromEntries(PORTFOLIO_FIELDS.map((field) => [
    field,
    boundedText(input?.[field], labels[field], field === 'tautan' ? 1000 : 1400,
      ['jenisKarya', 'deskripsi'].includes(field)),
  ]));
  if (portfolio.tautan) {
    let url;
    try { url = new URL(portfolio.tautan); } catch { throw new Error('Tautan bukti harus berupa URL HTTPS yang valid.'); }
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error('Tautan bukti harus menggunakan HTTPS dan tidak boleh memuat kredensial.');
    }
    portfolio.tautan = url.href;
  }
  return `${PORTFOLIO_PREFIX}${JSON.stringify(portfolio)}`;
}

export function uraikanIsiPortofolioGuru(value) {
  const isi = String(value ?? '');
  if (!isi.startsWith(PORTFOLIO_PREFIX)) {
    return { ...kosongkanPortofolioGuru(), deskripsi: isi, legacy: true };
  }
  try {
    const parsed = JSON.parse(isi.slice(PORTFOLIO_PREFIX.length));
    return {
      ...Object.fromEntries(PORTFOLIO_FIELDS.map((field) => [
        field,
        typeof parsed?.[field] === 'string' ? parsed[field] : '',
      ])),
      legacy: false,
    };
  } catch {
    return { ...kosongkanPortofolioGuru(), deskripsi: isi, legacy: true };
  }
}

export function tampilkanIsiPortofolioGuru(value) {
  const portfolio = uraikanIsiPortofolioGuru(value);
  if (portfolio.legacy) return portfolio.deskripsi;
  const labels = {
    jenisKarya: 'Jenis karya',
    deskripsi: 'Deskripsi',
    kompetensi: 'Kompetensi',
    tautan: 'Tautan bukti HTTPS',
  };
  return PORTFOLIO_FIELDS
    .filter((field) => portfolio[field])
    .map((field) => `${labels[field]}:\n${portfolio[field]}`)
    .join('\n\n');
}

export function kosongkanRencanaIntervensiKelas() {
  return Object.fromEntries(INTERVENTION_FIELDS.map((field) => [field, '']));
}

export function susunIsiRencanaIntervensiKelas(input) {
  const plan = Object.fromEntries(INTERVENTION_FIELDS.map((field) => [
    field,
    boundedText(input?.[field], 'Bagian rencana kelas', 1400),
  ]));
  if (!plan.kebutuhan) throw new Error('Kebutuhan kelas wajib diisi.');
  if (!plan.remedial && !plan.pengayaan) {
    throw new Error('Isi setidaknya satu rencana remedial atau pengayaan.');
  }
  return `${INTERVENTION_PREFIX}${JSON.stringify(plan)}`;
}

export function uraikanIsiRencanaIntervensiKelas(value) {
  const isi = String(value ?? '');
  if (!isi.startsWith(INTERVENTION_PREFIX)) {
    return { ...kosongkanRencanaIntervensiKelas(), kebutuhan: isi, legacy: true };
  }
  try {
    const parsed = JSON.parse(isi.slice(INTERVENTION_PREFIX.length));
    return {
      ...Object.fromEntries(INTERVENTION_FIELDS.map((field) => [
        field,
        typeof parsed?.[field] === 'string' ? parsed[field] : '',
      ])),
      legacy: false,
    };
  } catch {
    return { ...kosongkanRencanaIntervensiKelas(), kebutuhan: isi, legacy: true };
  }
}

export function tampilkanIsiRencanaIntervensiKelas(value) {
  const plan = uraikanIsiRencanaIntervensiKelas(value);
  if (plan.legacy) return plan.kebutuhan;
  const labels = {
    kebutuhan: 'Kebutuhan belajar kelas',
    remedial: 'Rencana penguatan/remedial',
    pengayaan: 'Rencana pengayaan',
    indikator: 'Indikator tinjau ulang',
  };
  return INTERVENTION_FIELDS
    .filter((field) => plan[field])
    .map((field) => `${labels[field]}:\n${plan[field]}`)
    .join('\n\n');
}

export function kosongkanRencanaDiferensiasi() {
  return Object.fromEntries(DIFFERENTIATION_FIELDS.map((field) => [field, '']));
}

export function susunIsiRencanaDiferensiasi(input) {
  const plan = Object.fromEntries(DIFFERENTIATION_FIELDS.map((field) => [
    field,
    boundedText(input?.[field], 'Bagian rencana diferensiasi', 1400),
  ]));
  if (!plan.tujuan || !plan.strategi) {
    throw new Error('Tujuan dan strategi diferensiasi wajib diisi.');
  }
  return `${DIFFERENTIATION_PREFIX}${JSON.stringify(plan)}`;
}

export function uraikanIsiRencanaDiferensiasi(value) {
  const isi = String(value ?? '');
  if (!isi.startsWith(DIFFERENTIATION_PREFIX)) {
    return { ...kosongkanRencanaDiferensiasi(), strategi: isi, legacy: true };
  }
  try {
    const parsed = JSON.parse(isi.slice(DIFFERENTIATION_PREFIX.length));
    return {
      ...Object.fromEntries(DIFFERENTIATION_FIELDS.map((field) => [
        field,
        typeof parsed?.[field] === 'string' ? parsed[field] : '',
      ])),
      legacy: false,
    };
  } catch {
    return { ...kosongkanRencanaDiferensiasi(), strategi: isi, legacy: true };
  }
}

export function tampilkanIsiRencanaDiferensiasi(value) {
  const plan = uraikanIsiRencanaDiferensiasi(value);
  if (plan.legacy) return plan.strategi;
  const labels = {
    tujuan: 'Tujuan belajar',
    kebutuhan: 'Kebutuhan umum kelas',
    strategi: 'Pilihan strategi',
    cekPemahaman: 'Cek pemahaman',
  };
  return DIFFERENTIATION_FIELDS
    .filter((field) => plan[field])
    .map((field) => `${labels[field]}:\n${plan[field]}`)
    .join('\n\n');
}

export function kosongkanRealisasiRencana() {
  return { ...Object.fromEntries(IMPLEMENTATION_FIELDS.map((field) => [field, ''])), status: 'belum' };
}

export function susunIsiRealisasiRencana(input) {
  const labels = {
    rencana: 'Rencana',
    status: 'Status',
    pelaksanaan: 'Pelaksanaan',
    kendala: 'Kendala',
    tindakLanjut: 'Tindak lanjut',
  };
  const implementation = Object.fromEntries(IMPLEMENTATION_FIELDS.map((field) => [
    field,
    field === 'status'
      ? String(input?.status ?? '')
      : boundedText(input?.[field], labels[field], 1400, ['rencana', 'pelaksanaan'].includes(field)),
  ]));
  if (!['selesai', 'sebagian', 'belum'].includes(implementation.status)) {
    throw new Error('Status realisasi tidak valid.');
  }
  return `${IMPLEMENTATION_PREFIX}${JSON.stringify(implementation)}`;
}

export function uraikanIsiRealisasiRencana(value) {
  const isi = String(value ?? '');
  if (!isi.startsWith(IMPLEMENTATION_PREFIX)) {
    return { ...kosongkanRealisasiRencana(), pelaksanaan: isi, legacy: true };
  }
  try {
    const parsed = JSON.parse(isi.slice(IMPLEMENTATION_PREFIX.length));
    return {
      ...Object.fromEntries(IMPLEMENTATION_FIELDS.map((field) => [
        field,
        typeof parsed?.[field] === 'string' ? parsed[field] : field === 'status' ? 'belum' : '',
      ])),
      legacy: false,
    };
  } catch {
    return { ...kosongkanRealisasiRencana(), pelaksanaan: isi, legacy: true };
  }
}

export function tampilkanIsiRealisasiRencana(value) {
  const implementation = uraikanIsiRealisasiRencana(value);
  if (implementation.legacy) return implementation.pelaksanaan;
  const labels = {
    rencana: 'Rencana yang ditinjau',
    status: 'Status pelaksanaan',
    pelaksanaan: 'Realisasi',
    kendala: 'Kendala',
    tindakLanjut: 'Tindak lanjut',
  };
  const statuses = { selesai: 'Selesai', sebagian: 'Terlaksana sebagian', belum: 'Belum dimulai' };
  return IMPLEMENTATION_FIELDS
    .filter((field) => field === 'status' || implementation[field])
    .map((field) => `${labels[field]}:\n${field === 'status' ? statuses[implementation.status] : implementation[field]}`)
    .join('\n\n');
}

export function kosongkanCatatanKelasCepat() {
  return Object.fromEntries(QUICK_NOTE_FIELDS.map((field) => [field, '']));
}

export function susunIsiCatatanKelasCepat(input) {
  const note = Object.fromEntries(QUICK_NOTE_FIELDS.map((field) => [
    field,
    boundedText(input?.[field], 'Bagian catatan kelas', 1400),
  ]));
  if (!note.pengamatan) throw new Error('Pengamatan umum wajib diisi.');
  return `${QUICK_NOTE_PREFIX}${JSON.stringify(note)}`;
}

export function uraikanIsiCatatanKelasCepat(value) {
  const isi = String(value ?? '');
  if (!isi.startsWith(QUICK_NOTE_PREFIX)) {
    return { ...kosongkanCatatanKelasCepat(), pengamatan: isi, legacy: true };
  }
  try {
    const parsed = JSON.parse(isi.slice(QUICK_NOTE_PREFIX.length));
    return {
      ...Object.fromEntries(QUICK_NOTE_FIELDS.map((field) => [
        field,
        typeof parsed?.[field] === 'string' ? parsed[field] : '',
      ])),
      legacy: false,
    };
  } catch {
    return { ...kosongkanCatatanKelasCepat(), pengamatan: isi, legacy: true };
  }
}

export function tampilkanIsiCatatanKelasCepat(value) {
  const note = uraikanIsiCatatanKelasCepat(value);
  if (note.legacy) return note.pengamatan;
  const labels = {
    pengamatan: 'Pengamatan umum',
    respons: 'Respons guru',
    tindakLanjut: 'Tindak lanjut',
  };
  return QUICK_NOTE_FIELDS
    .filter((field) => note[field])
    .map((field) => `${labels[field]}:\n${note[field]}`)
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
