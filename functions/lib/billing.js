'use strict';

const PAKET = require('../shared/pricing.json');
const DAFTAR_PAKET = [
  ...PAKET.school.map((item) => ({ ...item, productType: 'school' })),
  ...PAKET.student.map((item) => ({ ...item, productType: 'individual', userType: 'student' })),
  ...PAKET.teacherSd.map((item) => ({ ...item, productType: 'individual', userType: 'teacher' })),
  ...PAKET.teacherSubject.map((item) => ({ ...item, productType: 'individual', userType: 'teacher' })),
];

function cariPaket(productType, planId) {
  return DAFTAR_PAKET.find((item) =>
    item.productType === productType && item.id === planId);
}

function peranBolehMembeli(role, productType, planId) {
  const paket = cariPaket(productType, planId);
  if (!paket) return false;
  if (productType === 'school') return role === 'admin_sekolah';
  return (role === 'siswa' && paket.userType === 'student') ||
    (role === 'guru' && paket.userType === 'teacher');
}

function hitungTagihan(data, ppn = 0.11) {
  if (!data || !['school', 'individual'].includes(data.productType)) {
    throw new TypeError('Jenis purchase tidak valid.');
  }
  const paket = cariPaket(data.productType, data.planId);
  if (!paket) throw new TypeError('Paket purchase tidak valid.');
  if (!Number.isFinite(ppn) || ppn < 0 || ppn > 0.2) {
    throw new TypeError('Tarif PPN tidak valid.');
  }
  if (!['bulanan', 'tahunan'].includes(data.siklus)) {
    throw new TypeError('Siklus tagihan tidak valid.');
  }

  const harga = data.siklus === 'bulanan'
    ? Math.round(paket.annualPrice / PAKET.monthlyDivisor)
    : paket.annualPrice;
  const ppnAmount = Math.round(harga * ppn);
  return {
    productType: paket.productType,
    planId: paket.id,
    planName: paket.name,
    siklus: data.siklus,
    rincian: [{ peran: paket.id, jumlah: 1, hargaSatuan: harga, total: harga }],
    subtotal: harga,
    tarifPpn: ppn,
    ppn: ppnAmount,
    total: harga + ppnAmount,
    kapasitas: paket.productType === 'school'
      ? { siswa: paket.students, guru: paket.teachers }
      : null,
  };
}

function tanggalAkhirSiklus(mulai, siklus) {
  const tanggal = new Date(mulai);
  const hari = tanggal.getUTCDate();
  const sampai = new Date(tanggal);
  sampai.setUTCDate(1);
  if (siklus === 'bulanan') {
    sampai.setUTCMonth(sampai.getUTCMonth() + 1);
  } else if (siklus === 'tahunan') {
    sampai.setUTCFullYear(sampai.getUTCFullYear() + 1);
  } else {
    throw new TypeError('Siklus langganan tidak valid.');
  }
  const hariTerakhir = new Date(Date.UTC(
    sampai.getUTCFullYear(),
    sampai.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  sampai.setUTCDate(Math.min(hari, hariTerakhir));
  return sampai;
}

function statusMidtrans(status, fraudStatus) {
  if (status === 'settlement' || (status === 'capture' && fraudStatus === 'accept')) return 'paid';
  if (['expire', 'cancel', 'deny', 'failure'].includes(status)) return 'failed';
  return 'pending';
}

function signatureValid({ orderId, statusCode, grossAmount, signatureKey, serverKey }) {
  if (![orderId, statusCode, grossAmount, signatureKey, serverKey].every((v) => typeof v === 'string' && v)) {
    return false;
  }
  const crypto = require('node:crypto');
  const expected = crypto.createHash('sha512')
    .update(orderId + statusCode + grossAmount + serverKey)
    .digest();
  let received;
  try {
    received = Buffer.from(signatureKey, 'hex');
  } catch {
    return false;
  }
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

module.exports = {
  PAKET,
  cariPaket,
  peranBolehMembeli,
  hitungTagihan,
  tanggalAkhirSiklus,
  statusMidtrans,
  signatureValid,
};
