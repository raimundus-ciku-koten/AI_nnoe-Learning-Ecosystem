import catalog from '../data/pricing.json';

export const NOMOR_WHATSAPP_OWNER = '6282236267895';
const PEMBAGI_BULANAN = catalog.monthlyDivisor;

export const KELOMPOK_PAKET = [
  { id: 'school', label: 'Paket Sekolah', plans: catalog.school },
  { id: 'student', label: 'Paket Siswa', plans: catalog.student },
  { id: 'teacherSd', label: 'Paket Guru Kelas SD', plans: catalog.teacherSd },
  { id: 'teacherSubject', label: 'Paket Guru Mata Pelajaran', plans: catalog.teacherSubject },
];

export function formatRupiah(amount) {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new TypeError('Harga paket tidak valid.');
  }
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function hargaEkuivalenBulanan(hargaTahunan) {
  if (!Number.isSafeInteger(hargaTahunan) || hargaTahunan < 0 ||
      !Number.isSafeInteger(PEMBAGI_BULANAN) || PEMBAGI_BULANAN < 1) {
    throw new TypeError('Harga katalog tidak valid.');
  }
  return Math.round(hargaTahunan / PEMBAGI_BULANAN);
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

export function tautanWhatsApp(paket = '') {
  const pesan = paket
    ? `Halo, saya ingin bertanya tentang ${paket}. Mohon informasi ketersediaan dan ketentuannya.`
    : 'Halo, saya ingin bertanya tentang paket AI_nnoe Learning Ecosystem.';
  return `https://wa.me/${NOMOR_WHATSAPP_OWNER}?text=${encodeURIComponent(pesan)}`;
}
