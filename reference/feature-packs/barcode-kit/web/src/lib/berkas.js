// web/src/lib/berkas.js
/** CSV, unduhan berkas, dan clipboard. Tanpa dependensi. */

/**
 * Escape satu sel CSV (RFC 4180) + penangkal formula injection.
 * @param {*} nilai
 * @param {{teksExcel?:boolean}} [opsi] teksExcel: angka berawalan 0 (mis. NISN
 *        "0051234567") dipaksa tetap teks di Excel agar nol depan tidak hilang.
 */
export function csvEscape(nilai, { teksExcel = false } = {}) {
  let t = String(nilai ?? '');
  if (teksExcel && /^0\d+$/.test(t)) return `"=""${t}"""`; // ="0051234567"
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** Gabungkan baris sel jadi teks CSV, diawali BOM agar Excel Windows membaca UTF-8. */
export function buatCsv(baris) {
  return '\uFEFF' + baris.map((b) => b.join(',')).join('\r\n');
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

export async function salinTeks(teks) {
  try {
    await navigator.clipboard.writeText(teks);
    return true;
  } catch { /* lanjut ke cadangan */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = teks;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
