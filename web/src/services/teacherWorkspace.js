const MODULE_PATH = /^\/(pelaksanaan|asesmen|pemantauan|refleksi|laporan|kolaborasi|pengaturan|perangkat)\/[a-z0-9-]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

  return {
    modulePath,
    moduleLabel: boundedText(input.moduleLabel, 'Nama modul', 100, true),
    judul: boundedText(input.judul, 'Judul', 120, true),
    tanggal,
    kelas: boundedText(input.kelas, 'Kelas', 80),
    mapel: boundedText(input.mapel, 'Mata pelajaran', 80),
    isi: boundedText(input.isi, 'Isi catatan', 6000, true),
    status,
  };
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
