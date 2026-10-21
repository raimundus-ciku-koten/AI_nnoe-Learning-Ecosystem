// web/src/pages/dataDasar/denahLogika.test.mjs
// Jalankan: node --test web/src/pages/dataDasar/
// Syarat: Node >= 20 dan package.json bertipe module (default proyek Vite: "type": "module").
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acak,
  acakKursi,
  bacaKunciKursi,
  bagiKelompok,
  batas,
  bersihkanDenah,
  buatCsv,
  namaBerkas,
  netralkanSel,
  pindahkan,
  semuaKunci,
  ubahUkuran,
} from './denahLogika.js';

// Generator acak deterministik (mulberry32) agar tes stabil.
function benih(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ids = (n) => Array.from({ length: n }, (_, i) => `s${i + 1}`);

describe('batas', () => {
  it('menjepit ke rentang dan memakai default untuk non-angka', () => {
    assert.equal(batas('7', 1, 10, 5), 7);
    assert.equal(batas(99, 1, 10, 5), 10);
    assert.equal(batas(-3, 1, 10, 5), 1);
    assert.equal(batas('abc', 1, 10, 5), 5);
    assert.equal(batas(undefined, 1, 10, 5), 5);
  });
});

describe('bacaKunciKursi', () => {
  it('menerima format r-c saja', () => {
    assert.deepEqual(bacaKunciKursi('0-2'), { r: 0, c: 2 });
    assert.deepEqual(bacaKunciKursi('9-9'), { r: 9, c: 9 });
    for (const buruk of ['a-b', '1-2-3', '-1-2', '1_2', '__proto__', '', null, 12]) {
      assert.equal(bacaKunciKursi(buruk), null, String(buruk));
    }
  });
});

describe('acak', () => {
  it('menghasilkan permutasi tanpa mengubah array asal', () => {
    const asal = ids(20);
    const salinan = [...asal];
    const hasil = acak(asal, benih(1));
    assert.deepEqual(asal, salinan);
    assert.deepEqual([...hasil].sort(), [...asal].sort());
  });
  it('deterministik untuk rng yang sama', () => {
    assert.deepEqual(acak(ids(15), benih(42)), acak(ids(15), benih(42)));
  });
});

describe('bersihkanDenah', () => {
  it('memakai default untuk data kosong atau rusak', () => {
    for (const data of [undefined, null, 'x', 5, []]) {
      const h = bersihkanDenah(data, ids(3));
      assert.deepEqual(h, { baris: 5, kolom: 6, kursi: {}, kelompok: {}, jumlahKelompok: 4 });
    }
  });
  it('membuang siswa terhapus, kursi di luar grid, kunci aneh, dan siswa ganda', () => {
    const h = bersihkanDenah({
      baris: 2,
      kolom: 2,
      kursi: { '0-0': 's1', '0-1': 's2', '1-1': 'hantu', '2-0': 's3', '0-2': 's3', 'x-y': 's3', '1-0': 's1' },
    }, ids(3));
    assert.deepEqual(h.kursi, { '0-0': 's1', '0-1': 's2' });
  });
  it('menjepit ukuran dan membuang nomor kelompok di luar rentang', () => {
    const h = bersihkanDenah({
      baris: 50,
      kolom: 0,
      jumlahKelompok: 3,
      kelompok: { s1: 1, s2: 3, s3: 4, s4: 0, s5: 2.5, hantu: 1 },
    }, ids(5));
    assert.equal(h.baris, 10);
    assert.equal(h.kolom, 1);
    assert.deepEqual(h.kelompok, { s1: 1, s2: 3 });
  });
  it('tidak terpengaruh kunci __proto__ dari data mentah', () => {
    const data = JSON.parse('{"kursi":{"__proto__":"s1","0-0":"s2"},"kelompok":{"__proto__":1}}');
    const h = bersihkanDenah(data, ids(3));
    assert.deepEqual(h.kursi, { '0-0': 's2' });
    assert.deepEqual(h.kelompok, {});
    assert.equal(Object.getPrototypeOf(h.kursi), Object.prototype);
  });
});

describe('ubahUkuran', () => {
  it('melaporkan siswa yang kursinya hilang', () => {
    const { kursi, terlepas } = ubahUkuran({ '0-0': 'a', '2-1': 'b', '1-3': 'c' }, 2, 2);
    assert.deepEqual(kursi, { '0-0': 'a' });
    assert.deepEqual(terlepas.sort(), ['b', 'c']);
  });
});

describe('acakKursi', () => {
  it('menempatkan semua siswa tanpa kursi ganda bila muat', () => {
    const { kursi, tidakMuat } = acakKursi(ids(10), 3, 4, benih(7));
    assert.equal(tidakMuat.length, 0);
    assert.equal(new Set(Object.values(kursi)).size, 10);
    Object.keys(kursi).forEach((k) => assert.ok(semuaKunci(3, 4).includes(k)));
  });
  it('melaporkan siswa yang tidak kebagian kursi', () => {
    const { kursi, tidakMuat } = acakKursi(ids(10), 2, 3, benih(7));
    assert.equal(Object.keys(kursi).length, 6);
    assert.equal(tidakMuat.length, 4);
  });
});

describe('bagiKelompok', () => {
  it('membagi merata (selisih ukuran maksimal 1) dan menyertakan semua siswa', () => {
    for (const [siswa, n] of [[28, 5], [30, 6], [7, 3], [3, 10]]) {
      const peta = bagiKelompok(ids(siswa), n, benih(siswa + n));
      assert.equal(Object.keys(peta).length, siswa);
      const ukuran = Array.from({ length: n }, (_, i) => Object.values(peta).filter((v) => v === i + 1).length);
      assert.ok(Math.max(...ukuran) - Math.min(...ukuran) <= 1, `${siswa}/${n}: ${ukuran}`);
      assert.ok(Object.values(peta).every((v) => v >= 1 && v <= n));
    }
  });
  it('menjepit jumlah kelompok ke 2–10', () => {
    assert.equal(Math.max(...Object.values(bagiKelompok(ids(30), 99, benih(1)))), 10);
    assert.equal(Math.max(...Object.values(bagiKelompok(ids(30), 0, benih(1)))), 2);
  });
});

describe('pindahkan', () => {
  it('memindahkan ke kursi kosong', () => {
    assert.deepEqual(pindahkan({ '0-0': 'a' }, 'a', '1-1'), { '1-1': 'a' });
  });
  it('menukar dua siswa yang sama-sama duduk', () => {
    assert.deepEqual(pindahkan({ '0-0': 'a', '0-1': 'b' }, 'a', '0-1'), { '0-0': 'b', '0-1': 'a' });
  });
  it('mengeluarkan penghuni lama bila siswa berasal dari daftar "belum duduk"', () => {
    assert.deepEqual(pindahkan({ '0-1': 'b' }, 'a', '0-1'), { '0-1': 'a' });
  });
  it('tidak berubah bila dijatuhkan di kursinya sendiri dan tidak memutasi objek asal', () => {
    const asal = { '0-0': 'a' };
    assert.deepEqual(pindahkan(asal, 'a', '0-0'), { '0-0': 'a' });
    pindahkan(asal, 'a', '2-2');
    assert.deepEqual(asal, { '0-0': 'a' });
  });
  it('tidak pernah menghasilkan siswa ganda', () => {
    const rng = benih(99);
    let kursi = { '0-0': 'a', '0-1': 'b', '1-0': 'c' };
    const kunci = semuaKunci(3, 3);
    for (let i = 0; i < 200; i += 1) {
      const id = ['a', 'b', 'c', 'd'][Math.floor(rng() * 4)];
      kursi = pindahkan(kursi, id, kunci[Math.floor(rng() * kunci.length)]);
      const nilai = Object.values(kursi);
      assert.equal(new Set(nilai).size, nilai.length);
    }
  });
});

describe('CSV', () => {
  it('menetralkan formula injection dan memberi kutip bila perlu', () => {
    assert.equal(netralkanSel('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
    assert.equal(netralkanSel('+62812'), "'+62812");
    assert.equal(netralkanSel('@cmd'), "'@cmd");
    assert.equal(netralkanSel('Budi, S.'), '"Budi, S."');
    assert.equal(netralkanSel('Ani'), 'Ani');
    assert.equal(netralkanSel(3), '3');
    assert.equal(netralkanSel(null), '');
  });
  it('menyusun CSV dengan CRLF', () => {
    assert.equal(buatCsv(['Nama', 'Kelompok'], [['Ani', 1], ['Budi', '']]), 'Nama,Kelompok\r\nAni,1\r\nBudi,\r\n');
  });
  it('namaBerkas aman', () => {
    assert.equal(namaBerkas('X IPA 1'), 'X-IPA-1');
    assert.equal(namaBerkas('../../etc/passwd'), 'etc-passwd');
    assert.equal(namaBerkas(''), 'kelas');
  });
});
