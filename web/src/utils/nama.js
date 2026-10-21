export function normalisasiNama(nama) {
  return String(nama || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('id-ID')
    .replace(/(^|[\s'’-])(\p{L})/gu, (_, pemisah, huruf) => (
      `${pemisah}${huruf.toLocaleUpperCase('id-ID')}`
    ));
}
