// web/src/pages/dataDasar/siswa/csv.js
/** Ekspor CSV siswa. Fungsi murni kecuali `unduhBerkas` (butuh DOM). */

/** BOM agar Excel Windows membaca UTF-8 dengan benar. */
export const BOM = '\uFEFF';

/** Escape RFC 4180 + penangkal formula injection (=, +, -, @, tab, CR). */
export function csvEscape(nilai) {
  let t = String(nilai ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** Nama berkas aman lintas OS. */
export function namaAman(s) {
  return String(s ?? '').replace(/[^\w\-.]+/g, '_').replace(/^_+|_+$/g, '') || 'berkas';
}

/** YYYYMMDD menurut waktu lokal. */
export function stempelTanggal(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** Isi CSV (tanpa BOM) untuk daftar siswa. */
export function bangunCsvSiswa(daftar) {
  const baris = ['nama,nisn,jk,kelas,kode_unik'];
  for (const s of daftar) {
    baris.push([s.nama, s.nisn || '', s.jk || '', s.kelas || '', s.kodeUnik || '']
      .map(csvEscape).join(','));
  }
  return baris.join('\r\n');
}

export function unduhBerkas(nama, isi, tipe) {
  const blob = new Blob([isi], { type: `${tipe};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
