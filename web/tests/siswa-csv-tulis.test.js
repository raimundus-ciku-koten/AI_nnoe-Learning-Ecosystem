// web/tests/siswa-csv-tulis.test.js
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bangunCsvSiswa, csvEscape, namaAman, stempelTanggal,
} from '../src/pages/dataDasar/siswa/csv.js';

describe('csvEscape', () => {
  test('teks biasa tidak berubah', () => assert.equal(csvEscape('Ahmad'), 'Ahmad'));
  test('koma / kutip / baris baru di-kutip', () => {
    assert.equal(csvEscape('A, B'), '"A, B"');
    assert.equal(csvEscape('A "B"'), '"A ""B"""');
    assert.equal(csvEscape('A\nB'), '"A\nB"');
  });
  for (const awal of ['=', '+', '-', '@']) {
    test(`formula injection "${awal}…" dinetralkan`, () => {
      assert.equal(csvEscape(`${awal}cmd|' /C calc'!A0`).startsWith("'"), true);
    });
  }
  test('null/undefined → kosong', () => {
    assert.equal(csvEscape(null), '');
    assert.equal(csvEscape(undefined), '');
  });
});

describe('berkas', () => {
  test('namaAman', () => {
    assert.equal(namaAman('X IPA/1'), 'X_IPA_1');
    assert.equal(namaAman('///'), 'berkas');
  });
  test('stempelTanggal', () => assert.equal(stempelTanggal(new Date(2026, 9, 5)), '20261005'));
  test('bangunCsvSiswa', () => {
    const csv = bangunCsvSiswa([
      { nama: '=HYPERLINK("x")', nisn: '0123456789', jk: 'L', kelas: 'X-1', kodeUnik: 'ALE-1' },
      { nama: 'Siti', kelas: 'X-2' },
    ]);
    const [kepala, a, b] = csv.split('\r\n');
    assert.equal(kepala, 'nama,nisn,jk,kelas,kode_unik');
    assert.ok(a.startsWith(`"'=HYPERLINK(""x"")"`));
    assert.equal(b, 'Siti,,,X-2,');
  });
});
