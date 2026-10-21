// web/tests/siswa-impor.test.js — jalankan: node --test web/tests/
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bacaNisn, hitungStatus, normJK, tentukanPemisah, uraiImpor, uraiTabel,
} from '../src/pages/dataDasar/siswa/impor.js';

const ctx = (tambah = {}) => ({ kelas: 'X-1', nisnAda: new Map(), namaDiKelas: new Set(), ...tambah });

describe('normJK', () => {
  const kasus = [
    ['L', 'L'], ['l', 'L'], ['Lk', 'L'], ['Laki-laki', 'L'], ['LAKI LAKI', 'L'], ['Pria', 'L'], ['Male', 'L'],
    ['P', 'P'], ['Pr', 'P'], ['Perempuan', 'P'], ['Wanita', 'P'], ['Female', 'P'], ['Putri', 'P'],
    ['', ''], ['x', ''], ['??', ''],
  ];
  for (const [masuk, keluar] of kasus) {
    test(`${JSON.stringify(masuk)} → ${JSON.stringify(keluar)}`, () => assert.equal(normJK(masuk), keluar));
  }
});

describe('bacaNisn', () => {
  test('digit biasa', () => assert.deepEqual(bacaNisn('0123456789'), { nisn: '0123456789' }));
  test('kosong', () => assert.deepEqual(bacaNisn('  '), { nisn: '' }));
  test('awalan apostrof Excel & spasi', () => assert.equal(bacaNisn("'0123 456 789").nisn, '0123456789'));
  test('akhiran .0 dibuang', () => assert.equal(bacaNisn('1234567890.0').nisn, '1234567890'));
  test('pemisah ribuan → periksa', () => {
    const h = bacaNisn('1.234.567.890');
    assert.equal(h.nisn, '1234567890');
    assert.ok(h.periksa);
  });
  test('notasi ilmiah → galat', () => assert.match(bacaNisn('1,23457E+09').galat, /notasi ilmiah/));
  test('huruf → galat', () => assert.match(bacaNisn('12ab').galat, /angka/));
  test('> 20 digit → galat', () => assert.match(bacaNisn('1'.repeat(21)).galat, /20 digit/));
});

describe('tentukanPemisah', () => {
  test('tab dari Excel', () => assert.equal(tentukanPemisah('A\t1\tL\nB\t2\tP'), '\t'));
  test('titik koma', () => assert.equal(tentukanPemisah('A;1;L\nB;2;P'), ';'));
  test('koma', () => assert.equal(tentukanPemisah('A,1,L\nB,2,P'), ','));
  test('tab menang atas koma di dalam nama', () => assert.equal(tentukanPemisah('Fauzi, Ahmad\t1\tL'), '\t'));
  test('koma dalam kutip diabaikan', () => assert.equal(tentukanPemisah('"Fauzi, Ahmad";1;L'), ';'));
  test('tanpa pemisah → tab', () => assert.equal(tentukanPemisah('Ahmad'), '\t'));
});

describe('uraiTabel', () => {
  test('sel ber-kutip berisi pemisah', () => {
    assert.deepEqual(uraiTabel('"Fauzi, Ahmad",1,L', ',').baris, [['Fauzi, Ahmad', '1', 'L']]);
  });
  test('kutip ganda di dalam sel', () => {
    assert.deepEqual(uraiTabel('"A ""B"" C",1', ',').baris, [['A "B" C', '1']]);
  });
  test('baris baru di dalam sel ber-kutip', () => {
    assert.deepEqual(uraiTabel('"A\nB",1\nC,2', ',').baris, [['A\nB', '1'], ['C', '2']]);
  });
  test('CRLF & baris kosong diabaikan', () => {
    assert.deepEqual(uraiTabel('A,1\r\n\r\nB,2\r\n', ',').baris, [['A', '1'], ['B', '2']]);
  });
  test('kutip tak tertutup ditandai', () => assert.equal(uraiTabel('"A,1\nB,2', ',').kutipTerbuka, true));
});

describe('uraiImpor', () => {
  test('baris valid → ok', () => {
    const [b] = uraiImpor('Ahmad Fauzi\t0123456789\tL', ctx());
    assert.deepEqual({ ...b }, { no: 1, nama: 'Ahmad Fauzi', nisn: '0123456789', jk: 'L', status: 'ok', catatan: '' });
  });

  test('baris judul dilewati & urutan kolom mengikuti judul', () => {
    const r = uraiImpor('No\tNama Lengkap\tL/P\tNISN\n1\tSiti\tPerempuan\t0123456789', ctx());
    assert.equal(r.length, 1);
    assert.equal(r[0].nama, 'Siti');
    assert.equal(r[0].jk, 'P');
    assert.equal(r[0].nisn, '0123456789');
  });

  test('judul tanpa kolom NISN → NISN dikosongkan, bukan salah baca', () => {
    const [b] = uraiImpor('Nama;L/P\nBudi;L', ctx());
    assert.equal(b.nisn, '');
    assert.equal(b.jk, 'L');
  });

  test('nama kosong → lewati', () => {
    const [b] = uraiImpor('\t0123456789\tL', ctx());
    assert.equal(b.status, 'lewati');
    assert.match(b.catatan, /Nama kosong/);
  });

  test('NISN sudah terdaftar → lewati', () => {
    const nisnAda = new Map([['0123456789', { nama: 'Budi', kelas: 'X-2' }]]);
    const [b] = uraiImpor('Ani\t0123456789\tP', ctx({ nisnAda }));
    assert.equal(b.status, 'lewati');
    assert.match(b.catatan, /Budi \(X-2\)/);
  });

  test('NISN ganda di tempelan → baris kedua dilewati', () => {
    const r = uraiImpor('A\t0123456789\nB\t0123456789', ctx());
    assert.deepEqual(r.map((x) => x.status), ['ok', 'lewati']);
  });

  test('NISN bukan 10 digit → periksa', () => {
    const [b] = uraiImpor('A\t123456789', ctx());
    assert.equal(b.status, 'periksa');
    assert.match(b.catatan, /9 digit/);
  });

  test('NISN Excel ilmiah → lewati', () => {
    const [b] = uraiImpor('A\t1,23457E+09', ctx());
    assert.equal(b.status, 'lewati');
  });

  test('L/P tak dikenali → periksa & kosong', () => {
    const [b] = uraiImpor('A\t0123456789\tzz', ctx());
    assert.equal(b.status, 'periksa');
    assert.equal(b.jk, '');
  });

  test('nama sama di kelas / di tempelan → periksa', () => {
    const r = uraiImpor('Ani\nANI\nBudi', ctx({ namaDiKelas: new Set(['budi']) }));
    assert.deepEqual(r.map((x) => x.status), ['ok', 'periksa', 'periksa']);
  });

  test('nama beraksen/spasi ganda dianggap sama', () => {
    const r = uraiImpor('José  Álvarez\nJose Alvarez', ctx());
    assert.equal(r[1].status, 'periksa');
  });

  test('nama berkoma di dalam kutip (CSV)', () => {
    const [b] = uraiImpor('"Fauzi, Ahmad",0123456789,L', ctx());
    assert.equal(b.nama, 'Fauzi, Ahmad');
    assert.equal(b.nisn, '0123456789');
  });

  test('kutip liar tidak menelan seluruh data', () => {
    const r = uraiImpor('"Ani;0123456789;P\nBudi;0123456780;L', ctx());
    assert.equal(r.length, 2);
    assert.equal(r[1].nama, 'Budi');
  });

  test('nama > 100 karakter → dipotong & periksa', () => {
    const [b] = uraiImpor(`${'a'.repeat(120)}\t0123456789`, ctx());
    assert.equal(b.nama.length, 100);
    assert.equal(b.status, 'periksa');
  });

  test('BOM & teks kosong', () => {
    assert.equal(uraiImpor('\uFEFFAni\t0123456789', ctx())[0].nama, 'Ani');
    assert.deepEqual(uraiImpor('', ctx()), []);
    assert.deepEqual(uraiImpor(null, ctx()), []);
  });

  test('bersih() dapat disuntikkan', () => {
    const [b] = uraiImpor('ani', { ...ctx(), bersih: (s) => s.toUpperCase() });
    assert.equal(b.nama, 'ANI');
  });
});

describe('hitungStatus', () => {
  test('menjumlah per status', () => {
    const h = hitungStatus([{ status: 'ok' }, { status: 'periksa' }, { status: 'lewati' }, { status: 'ok' }]);
    assert.deepEqual(h, { siap: 3, periksa: 1, lewati: 1 });
  });
});
