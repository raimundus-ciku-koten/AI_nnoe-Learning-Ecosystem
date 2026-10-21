// tests/code128.test.mjs — jalankan: node --test tests/code128.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nilaiCode128, polaModul, svgCode128, bersihkan, START_B, START_C, STOP, CODE_B, CODE_C } from '../src/lib/code128.js';

/** Decoder independen: pola lebar modul → nilai simbol → teks (memverifikasi checksum & stop). */
function dekode(nilai) {
  const [start, ...sisa] = nilai;
  assert.ok(start === START_B || start === START_C, 'start harus B atau C');
  assert.equal(sisa.at(-1), STOP, 'simbol terakhir harus STOP');
  const cek = sisa.at(-2);
  const data = sisa.slice(0, -2);
  let jumlah = start;
  data.forEach((v, i) => { jumlah += v * (i + 1); });
  assert.equal(cek, jumlah % 103, 'checksum salah');

  let set = start === START_B ? 'B' : 'C';
  let out = '';
  for (const v of data) {
    if (set === 'B') {
      if (v === CODE_C) set = 'C';
      else { assert.ok(v >= 0 && v <= 94, `nilai B di luar rentang: ${v}`); out += String.fromCharCode(v + 32); }
    } else if (v === CODE_B) set = 'B';
    else { assert.ok(v >= 0 && v <= 99); out += String(v).padStart(2, '0'); }
  }
  return out;
}

const KASUS = [
  'A', 'ALE-XIIPA1-AB12CD-1234', 'ALE-X1-000000-0001', '1234', '12345', '123456789012',
  'AB1234CD', 'AB123456CD', 'AB12345678CD', '00', '0', 'abc xyz ~!@#', 'A12', 'ALE-KLS-ZZZZZZ-9999',
  '0051234567', 'X'.repeat(40),
];

for (const teks of KASUS) {
  test(`round-trip "${teks.slice(0, 24)}"`, () => {
    const nilai = nilaiCode128(teks);
    assert.equal(dekode(nilai), teks);
    // pola harus berupa 6 digit per simbol + 7 untuk stop
    assert.equal(polaModul(nilai).length, (nilai.length - 1) * 6 + 7);
  });
}

test('karakter non-ASCII diganti "-"', () => {
  assert.equal(bersihkan('Üñï\u0000A'), '----A');
  assert.equal(dekode(nilaiCode128('Üñï')), '---');
});

test('Set C memperpendek deretan digit', () => {
  assert.ok(nilaiCode128('0051234567').length < nilaiCode128('ABCDEFGHIJ').length);
  assert.equal(nilaiCode128('1234')[0], START_C);
});

test('SVG: valid, satu <path>, label ter-escape', () => {
  const svg = svgCode128('A"<b>', { tinggi: 40, lebarModul: 1.5 });
  assert.match(svg, /^<svg [^>]*viewBox="0 0 [\d.]+ [\d.]+"/);
  assert.equal((svg.match(/<path /g) || []).length, 1);
  assert.ok(!svg.includes('<b>'));
  assert.ok(svg.includes('A&quot;&lt;b&gt;'));
});
