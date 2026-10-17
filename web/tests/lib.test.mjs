// tests/lib.test.mjs — jalankan: node --test tests/lib.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvEscape, buatCsv } from '../src/lib/berkas.js';
import { esc, normal, namaAman } from '../src/lib/teks.js';
import { kodeCadangan, kodeUntuk, cariKodeGanda, rencanaKodeBaru, kodeLayakSimpan } from '../src/lib/kodeSiswa.js';

test('csvEscape: formula injection dinetralkan', () => {
  for (const jahat of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx', '\rx']) {
    assert.ok(csvEscape(jahat).replace(/^"/, '').startsWith("'"), jahat);
  }
});

test('csvEscape: kutip, koma, baris baru', () => {
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(csvEscape('a\nb'), '"a\nb"');
  assert.equal(csvEscape(null), '');
});

test('csvEscape: NISN berawalan 0 tetap teks di Excel, nilai lain tidak berubah', () => {
  assert.equal(csvEscape('0051234567', { teksExcel: true }), '"=""0051234567"""');
  assert.equal(csvEscape('1051234567', { teksExcel: true }), '1051234567');
  assert.equal(csvEscape('0051234567'), '0051234567');
});

test('buatCsv: BOM + CRLF', () => {
  assert.equal(buatCsv([['a', 'b'], ['1', '2']]), '\uFEFFa,b\r\n1,2');
});

test('teks: esc, normal, namaAman', () => {
  assert.equal(esc(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(normal('  ÁNÍ Bü '), 'ani bu');
  assert.equal(namaAman('X IPA/1: ??'), 'X_IPA_1');
  assert.equal(namaAman('///'), 'berkas');
});

test('kodeCadangan: deterministik & kompatibel dengan format lama', () => {
  const s = { nama: 'Ani', nisn: '0051234567', kelas: 'X-1' };
  assert.equal(kodeCadangan(s), kodeCadangan({ ...s }));
  assert.match(kodeCadangan(s), /^ALE-X1-[0-9A-Z]{6}-4567$/);
  assert.match(kodeCadangan({ nama: 'Tanpa' }), /^ALE-KLS-[0-9A-Z]{6}-[0-9A-Z]{4}$/);
});

test('kodeUntuk: prioritas tersimpan → pembuat → cadangan', () => {
  const s = { nama: 'A', kelas: 'X' };
  assert.equal(kodeUntuk({ ...s, kodeUnik: ' KODE-1 ' }, () => 'LAIN'), 'KODE-1');
  assert.equal(kodeUntuk(s, () => 'PEMBUAT'), 'PEMBUAT');
  assert.equal(kodeUntuk(s, () => { throw new Error('x'); }), kodeCadangan(s));
  assert.equal(kodeUntuk(s, null), kodeCadangan(s));
});

test('cariKodeGanda', () => {
  assert.deepEqual([...cariKodeGanda(['A', 'B', 'A', 'C', 'A', 'B'])].sort(), ['A', 'B']);
});

test('rencanaKodeBaru: unik, lewati yang tersimpan & tanpa id, tangani tabrakan', () => {
  const semua = [
    { id: '1', nama: 'Kembar', nisn: '', kelas: 'X' },
    { id: '2', nama: 'Kembar', nisn: '', kelas: 'X' },        // data identik → kode dasar sama
    { id: '3', nama: 'Sudah', kelas: 'X', kodeUnik: 'ADA-0001' },
    { nama: 'TanpaId', kelas: 'X' },
  ];
  const { rencana, tanpaId } = rencanaKodeBaru(semua, semua);
  assert.equal(rencana.length, 2);
  assert.equal(tanpaId.length, 1);
  assert.notEqual(rencana[0].kode, rencana[1].kode);
  assert.ok(rencana.every((r) => kodeLayakSimpan(r.kode)));
  assert.ok(!rencana.some((r) => r.kode === 'ADA-0001'));
});

test('rencanaKodeBaru: pembuat aplikasi yang menghasilkan kode tak layak → pakai cadangan', () => {
  const s = [{ id: '1', nama: 'A', kelas: 'X' }];
  const { rencana } = rencanaKodeBaru(s, s, () => 'kode dengan spasi/garis');
  assert.equal(rencana[0].kode, kodeCadangan(s[0]));
});
