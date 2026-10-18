'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  PAKET, cariPaket, hitungTagihan, tanggalAkhirSiklus, statusMidtrans, signatureValid,
  peranBolehMembeli,
} = require('./billing');

test('menghitung harga paket sekolah dari tarif bersama', () => {
  const basic = hitungTagihan({
    productType: 'school', planId: 'sekolah-basic', siklus: 'bulanan',
  });
  assert.equal(basic.subtotal, 350000);
  assert.equal(basic.ppn, 38500);
  assert.equal(basic.total, 388500);
  assert.deepEqual(basic.kapasitas, { siswa: 100, guru: 20 });

  const enterprise = hitungTagihan({
    productType: 'school', planId: 'sekolah-enterprise', siklus: 'tahunan',
  });
  assert.equal(enterprise.subtotal, 15000000);
  assert.equal(enterprise.kapasitas.guru, null);
});

test('semua paket individu mengikuti harga tahunan dan bulanan satu per sepuluh', () => {
  for (const daftar of [PAKET.student, PAKET.teacherSd, PAKET.teacherSubject]) {
    for (const paket of daftar) {
      const tahunan = hitungTagihan({
        productType: 'individual', planId: paket.id, siklus: 'tahunan',
      });
      const bulanan = hitungTagihan({
        productType: 'individual', planId: paket.id, siklus: 'bulanan',
      });
      assert.equal(tahunan.subtotal, paket.annualPrice);
      assert.equal(bulanan.subtotal, paket.annualPrice / PAKET.monthlyDivisor);
    }
  }
});

test('lookup dan validasi paket hanya mengizinkan produk terdaftar', () => {
  assert.equal(cariPaket('individual', 'siswa-basic').userType, 'student');
  assert.equal(cariPaket('individual', 'guru-mapel-pro').userType, 'teacher');
  assert.throws(() => hitungTagihan({
    productType: 'school', planId: 'siswa-pro', siklus: 'tahunan',
  }));
  assert.throws(() => hitungTagihan({
    productType: 'individual', planId: 'siswa-pro', siklus: 'mingguan',
  }));
  assert.throws(() => hitungTagihan({
    productType: 'other', planId: 'siswa-basic', siklus: 'bulanan',
  }));
  assert.throws(() => hitungTagihan({
    productType: 'individual', planId: 'siswa-basic', siklus: 'bulanan',
  }, 0.21));
});

test('peran hanya dapat membeli jenis paket yang ditetapkan', () => {
  assert.equal(peranBolehMembeli('admin_sekolah', 'school', 'sekolah-pro'), true);
  assert.equal(peranBolehMembeli('guru', 'individual', 'guru-sd-pro'), true);
  assert.equal(peranBolehMembeli('guru', 'individual', 'siswa-pro'), false);
  assert.equal(peranBolehMembeli('siswa', 'individual', 'siswa-premium'), true);
  assert.equal(peranBolehMembeli('ortu', 'individual', 'siswa-basic'), false);
  assert.equal(peranBolehMembeli('admin_sekolah', 'individual', 'guru-mapel-basic'), false);
});

test('menambah siklus langganan dengan tanggal kalender UTC', () => {
  assert.equal(
    tanggalAkhirSiklus(new Date('2026-01-31T00:00:00Z'), 'bulanan').toISOString(),
    '2026-02-28T00:00:00.000Z',
  );
  assert.equal(
    tanggalAkhirSiklus(new Date('2024-02-29T00:00:00Z'), 'tahunan').toISOString(),
    '2025-02-28T00:00:00.000Z',
  );
});

test('memetakan status Midtrans tanpa mengaktifkan pembayaran yang belum lunas', () => {
  assert.equal(statusMidtrans('settlement'), 'paid');
  assert.equal(statusMidtrans('capture', 'accept'), 'paid');
  assert.equal(statusMidtrans('capture', 'challenge'), 'pending');
  assert.equal(statusMidtrans('pending'), 'pending');
  assert.equal(statusMidtrans('expire'), 'failed');
});

test('memverifikasi signature notifikasi dengan SHA-512', () => {
  const fields = { orderId: 'tenant.order-1', statusCode: '200', grossAmount: '10000.00' };
  const serverKey = 'server-key-for-test';
  const signatureKey = crypto.createHash('sha512')
    .update(fields.orderId + fields.statusCode + fields.grossAmount + serverKey)
    .digest('hex');
  assert.equal(signatureValid({ ...fields, signatureKey, serverKey }), true);
  assert.equal(signatureValid({ ...fields, signatureKey: 'bad', serverKey }), false);
});
