// web/tests/scan-util.test.js — jalankan: node --test web/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KODE_MAKS, idAbsensi, jamLokal, kunciTanggal, normalisasiKode, pesanGalat,
} from '../src/utils/scan-util.js';

test('normalisasiKode: menerima kode wajar dan memangkas spasi', () => {
  assert.deepEqual(normalisasiKode('  SIS-001_a.b:c '), { ok: true, kode: 'SIS-001_a.b:c' });
});

test('normalisasiKode: men-decode persen dan membuang karakter tak terlihat', () => {
  assert.deepEqual(normalisasiKode('AB%2D12'), { ok: true, kode: 'AB-12' });
  assert.deepEqual(normalisasiKode('AB12​\n'), { ok: true, kode: 'AB12' });
});

test('normalisasiKode: menolak kosong, null, terlalu panjang, dan karakter berbahaya', () => {
  assert.equal(normalisasiKode('').alasan, 'kosong');
  assert.equal(normalisasiKode(null).alasan, 'kosong');
  assert.equal(normalisasiKode(undefined).alasan, 'kosong');
  assert.equal(normalisasiKode('A'.repeat(KODE_MAKS + 1)).alasan, 'terlalu-panjang');
  assert.equal(normalisasiKode('<script>alert(1)</script>').alasan, 'karakter');
  assert.equal(normalisasiKode('a b').alasan, 'karakter');
  assert.equal(normalisasiKode('a/b').alasan, 'karakter');
});

test('normalisasiKode: persen rusak tidak melempar galat', () => {
  assert.equal(normalisasiKode('%E0%A4%A').ok, false);
});

test('kunciTanggal: memakai tanggal lokal, bukan UTC', () => {
  assert.equal(kunciTanggal(new Date(2026, 9, 14, 0, 5)), '2026-10-14');
  assert.equal(kunciTanggal(new Date(2026, 0, 3, 23, 59)), '2026-01-03');
});

test('jamLokal: Date, Timestamp-like, milidetik, dan nilai kosong', () => {
  const d = new Date(2026, 9, 14, 7, 5);
  assert.equal(jamLokal(d), '07:05');
  assert.equal(jamLokal({ toDate: () => d }), '07:05');
  assert.equal(jamLokal(d.getTime()), '07:05');
  assert.equal(jamLokal(null), '');
  assert.equal(jamLokal('bukan tanggal'), '');
});

test('idAbsensi: deterministik', () => {
  assert.equal(idAbsensi('2026-10-14', 'abc'), '2026-10-14_abc');
});

test('pesanGalat: memetakan kode Firebase', () => {
  assert.match(pesanGalat({ code: 'permission-denied' }), /Akses ditolak/);
  assert.match(pesanGalat({ code: 'unavailable' }), /Jaringan/);
  assert.match(pesanGalat(new Error('x')), /kesalahan/i);
});
