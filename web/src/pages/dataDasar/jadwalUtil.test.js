// Jalankan dari akar repo:  node --test web/src/pages/dataDasar/jadwalUtil.test.js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GalatJadwal, MAKS_ENTRI, cariBentrok, formatDurasi, formatJam, idBentrokDalamHari,
  kelompokPerHari, menit, normalisasiEntri, sarankanJamBerikutnya, terapkanOperasi,
  totalMenit, validasiSesi,
} from './jadwalUtil.js';

const sesi = (id, hari, mulai, selesai, kelas = '7A', mapel = 'IPA') => ({ id, hari, mulai, selesai, kelas, mapel });

describe('menit / formatJam / formatDurasi', () => {
  it('mengonversi jam ke menit dan sebaliknya', () => {
    assert.equal(menit('00:00'), 0);
    assert.equal(menit('07:40'), 460);
    assert.equal(menit('23:59'), 1439);
    assert.equal(formatJam(460), '07:40');
  });
  it('mengembalikan NaN untuk format salah', () => {
    for (const jam of ['24:00', '7:00', '07:60', '', null, undefined, 700]) assert.ok(Number.isNaN(menit(jam)), String(jam));
  });
  it('memformat durasi', () => {
    assert.equal(formatDurasi(0), '0 menit');
    assert.equal(formatDurasi(40), '40 menit');
    assert.equal(formatDurasi(60), '1 jam');
    assert.equal(formatDurasi(90), '1 jam 30 menit');
    assert.equal(formatDurasi(-5), '0 menit');
  });
});

describe('validasiSesi', () => {
  it('menerima sesi valid', () => assert.equal(validasiSesi(sesi('a', 1, '07:00', '07:40')), null));
  it('menolak hari di luar Senin–Sabtu', () => {
    assert.equal(validasiSesi(sesi('a', 0, '07:00', '07:40')).field, 'hari');
    assert.equal(validasiSesi(sesi('a', 7, '07:00', '07:40')).field, 'hari');
    assert.equal(validasiSesi(sesi('a', Number.NaN, '07:00', '07:40')).field, 'hari');
  });
  it('menolak jam kosong atau terbalik', () => {
    assert.equal(validasiSesi(sesi('a', 1, '', '07:40')).field, 'mulai');
    assert.equal(validasiSesi(sesi('a', 1, '07:00', '')).field, 'selesai');
    assert.equal(validasiSesi(sesi('a', 1, '08:00', '08:00')).field, 'selesai');
    assert.equal(validasiSesi(sesi('a', 1, '09:00', '08:00')).field, 'selesai');
  });
  it('menolak kelas atau mapel kosong', () => {
    assert.equal(validasiSesi(sesi('a', 1, '07:00', '07:40', '  ', 'IPA')).field, 'kelas');
    assert.equal(validasiSesi(sesi('a', 1, '07:00', '07:40', '7A', '')).field, 'mapel');
  });
});

describe('cariBentrok', () => {
  const daftar = [sesi('a', 1, '07:00', '07:40'), sesi('b', 2, '07:00', '07:40')];
  it('mendeteksi irisan di hari yang sama', () => {
    assert.equal(cariBentrok(daftar, { hari: 1, mulai: '07:30', selesai: '08:10' })?.id, 'a');
    assert.equal(cariBentrok(daftar, { hari: 1, mulai: '06:30', selesai: '07:10' })?.id, 'a');
    assert.equal(cariBentrok(daftar, { hari: 1, mulai: '07:10', selesai: '07:20' })?.id, 'a'); // di dalam
  });
  it('sesi yang hanya bersambung bukan bentrok', () => {
    assert.equal(cariBentrok(daftar, { hari: 1, mulai: '07:40', selesai: '08:20' }), null);
    assert.equal(cariBentrok(daftar, { hari: 1, mulai: '06:20', selesai: '07:00' }), null);
  });
  it('mengabaikan hari lain dan id yang sedang diubah', () => {
    assert.equal(cariBentrok(daftar, { hari: 3, mulai: '07:00', selesai: '07:40' }), null);
    assert.equal(cariBentrok(daftar, { hari: 1, mulai: '07:00', selesai: '07:40' }, 'a'), null);
  });
  it('tidak melempar galat untuk masukan belum lengkap', () => {
    assert.equal(cariBentrok(daftar, { hari: 1, mulai: '', selesai: '07:40' }), null);
    assert.equal(cariBentrok(daftar, { hari: 1, mulai: '08:00', selesai: '07:00' }), null);
  });
});

describe('normalisasiEntri', () => {
  it('menangani data bukan array', () => {
    assert.deepEqual(normalisasiEntri(undefined), { entri: [], dibuang: 0 });
    assert.deepEqual(normalisasiEntri('x'), { entri: [], dibuang: 0 });
  });
  it('membuang entri rusak, id ganda, dan menghitungnya', () => {
    const { entri, dibuang } = normalisasiEntri([
      sesi('a', 1, '07:00', '07:40'),
      sesi('a', 2, '07:00', '07:40'), // id ganda
      null,
      { id: 'c', hari: 9, mulai: '07:00', selesai: '07:40', kelas: '7A', mapel: 'IPA' },
      { id: 'd', hari: 1, mulai: '08:00', selesai: '07:00', kelas: '7A', mapel: 'IPA' },
      { id: 'e', hari: 1, mulai: '07:00', selesai: '07:40', kelas: '', mapel: 'IPA' },
      { hari: 1, mulai: '07:00', selesai: '07:40', kelas: '7A', mapel: 'IPA' }, // tanpa id
    ]);
    assert.equal(entri.length, 1);
    assert.equal(dibuang, 6);
  });
  it('tidak membuang entri yang saling bentrok dan tidak memotong jumlah', () => {
    const banyak = Array.from({ length: MAKS_ENTRI + 5 }, (_, i) => sesi(`s${i}`, 1, '07:00', '07:40'));
    assert.equal(normalisasiEntri(banyak).entri.length, MAKS_ENTRI + 5);
  });
  it('merapikan teks dan hanya menyimpan field yang dikenal', () => {
    const { entri } = normalisasiEntri([{ ...sesi('a', '2', '07:00', '07:40', '  7A   ', ' IPA  '), liar: 1 }]);
    assert.deepEqual(entri[0], sesi('a', 2, '07:00', '07:40', '7A', 'IPA'));
  });
});

describe('terapkanOperasi', () => {
  const awal = [sesi('a', 1, '07:00', '07:40')];

  it('menambah sesi tanpa mengubah array asal', () => {
    const baru = terapkanOperasi(awal, { jenis: 'tambah', sesi: sesi('b', 1, '07:40', '08:20') });
    assert.equal(baru.length, 2);
    assert.equal(awal.length, 1);
  });
  it('menolak tambah yang bentrok', () => {
    assert.throws(() => terapkanOperasi(awal, { jenis: 'tambah', sesi: sesi('b', 1, '07:30', '08:10') }),
      (e) => e instanceof GalatJadwal && e.kode === 'BENTROK' && e.rincian.id === 'a');
  });
  it('menolak tambah bila sudah penuh', () => {
    const penuh = Array.from({ length: MAKS_ENTRI }, (_, i) => sesi(`s${i}`, (i % 6) + 1, '07:00', '07:10'));
    assert.throws(() => terapkanOperasi(penuh, { jenis: 'tambah', sesi: sesi('baru', 1, '12:00', '12:40') }),
      (e) => e.kode === 'PENUH');
  });
  it('menolak id ganda dan data tidak valid', () => {
    assert.throws(() => terapkanOperasi(awal, { jenis: 'tambah', sesi: sesi('a', 2, '07:00', '07:40') }), (e) => e.kode === 'ID_GANDA');
    assert.throws(() => terapkanOperasi(awal, { jenis: 'tambah', sesi: sesi('z', 1, '09:00', '08:00') }),
      (e) => e.kode === 'TIDAK_VALID' && e.rincian.field === 'selesai');
  });
  it('mengubah sesi dan mengabaikan dirinya sendiri saat cek bentrok', () => {
    const baru = terapkanOperasi(awal, { jenis: 'ubah', sesi: sesi('a', 1, '07:10', '07:50', '7B', 'MTK') });
    assert.equal(baru[0].kelas, '7B');
  });
  it('mengubah ke waktu yang bentrok ditolak; ubah sesi yang sudah hilang -> TIDAK_ADA', () => {
    const dua = [...awal, sesi('b', 1, '08:00', '08:40')];
    assert.throws(() => terapkanOperasi(dua, { jenis: 'ubah', sesi: sesi('b', 1, '07:30', '08:10') }), (e) => e.kode === 'BENTROK');
    assert.throws(() => terapkanOperasi(awal, { jenis: 'ubah', sesi: sesi('x', 1, '10:00', '10:40') }), (e) => e.kode === 'TIDAK_ADA');
  });
  it('menghapus bersifat idempoten', () => {
    assert.deepEqual(terapkanOperasi(awal, { jenis: 'hapus', id: 'a' }), []);
    assert.deepEqual(terapkanOperasi(awal, { jenis: 'hapus', id: 'tidak-ada' }), awal);
  });
  it('menolak operasi tak dikenal', () => {
    assert.throws(() => terapkanOperasi(awal, { jenis: 'x' }), (e) => e.kode === 'OPERASI_TIDAK_DIKENAL');
    assert.throws(() => terapkanOperasi(awal, undefined), (e) => e.kode === 'OPERASI_TIDAK_DIKENAL');
  });
});

describe('kelompokPerHari / totalMenit', () => {
  it('mengelompokkan, mengurutkan, dan menyediakan keenam hari', () => {
    const peta = kelompokPerHari([sesi('b', 1, '09:00', '09:40'), sesi('a', 1, '07:00', '07:40'), sesi('c', 6, '07:00', '08:00')]);
    assert.deepEqual([...peta.keys()], [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(peta.get(1).map((x) => x.id), ['a', 'b']);
    assert.equal(peta.get(2).length, 0);
  });
  it('menjumlah menit mengajar', () => {
    assert.equal(totalMenit([sesi('a', 1, '07:00', '07:40'), sesi('b', 2, '08:00', '09:00')]), 100);
    assert.equal(totalMenit([]), 0);
  });
});

describe('idBentrokDalamHari', () => {
  it('menandai semua sesi yang beririsan, bukan yang bersambung', () => {
    const urut = [sesi('a', 1, '07:00', '10:00'), sesi('b', 1, '07:10', '08:00'), sesi('c', 1, '07:50', '08:30'), sesi('d', 1, '10:00', '10:40')];
    assert.deepEqual([...idBentrokDalamHari(urut)].sort(), ['a', 'b', 'c']);
  });
  it('kosong bila tidak ada irisan', () => {
    assert.equal(idBentrokDalamHari([sesi('a', 1, '07:00', '07:40'), sesi('b', 1, '07:40', '08:20')]).size, 0);
  });
});

describe('sarankanJamBerikutnya', () => {
  it('melanjutkan dengan durasi yang sama', () => {
    assert.deepEqual(sarankanJamBerikutnya('07:00', '07:40'), { mulai: '07:40', selesai: '08:20' });
  });
  it('null bila melewati tengah malam atau masukan tidak valid', () => {
    assert.equal(sarankanJamBerikutnya('23:00', '23:59'), null);
    assert.equal(sarankanJamBerikutnya('08:00', '07:00'), null);
    assert.equal(sarankanJamBerikutnya('', '07:00'), null);
  });
});
