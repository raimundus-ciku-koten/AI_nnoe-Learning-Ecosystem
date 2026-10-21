export function normalisasiNama(nama) {
  return String(nama || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(^|[\s-])(\p{L})/gu, (_, pemisah, huruf) => (
      `${pemisah}${huruf.toLocaleUpperCase('id-ID')}`
    ));
}
