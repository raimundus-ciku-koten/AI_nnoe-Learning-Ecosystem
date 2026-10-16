import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlanningOutput } from '../src/services/planningAiSchema.js';

const atp = () => ({
  cp: [{ elemen: 'Bilangan', cp: 'Memahami bilangan.' }],
  unit: [{
    no: 1,
    nama: 'Bilangan',
    elemen: 'Bilangan',
    semester: 1,
    tp: [{ kode: 'E.1', rumusan: 'Mengidentifikasi bilangan.', materi: 'Bilangan', jp: 4 }]
  }]
});

test('validates and normalizes a valid ATP output', () => {
  const parsed = parsePlanningOutput('atp', JSON.stringify(atp()));
  assert.equal(parsed.unit[0].tp[0].kode, 'E.1');
});

test('rejects duplicate TP codes and invalid output shapes', () => {
  const output = atp();
  output.unit[0].tp.push({ ...output.unit[0].tp[0] });
  assert.throws(() => parsePlanningOutput('atp', JSON.stringify(output)), /kode TP ganda/);
  assert.throws(() => parsePlanningOutput('atp', 'not json'), /bukan JSON valid/);
});

test('rejects KKTP codes not present in its source ATP', () => {
  const result = {
    ambang: 75,
    items: [{
      kode: 'X.1',
      indikator: ['Mengidentifikasi konsep.'],
      rubrik: {
        perluBimbingan: 'Perlu bantuan.',
        cukup: 'Cukup.',
        baik: 'Baik.',
        sangatBaik: 'Sangat baik.'
      }
    }]
  };
  assert.throws(() => parsePlanningOutput('kktp', JSON.stringify(result), { kodeTp: ['E1'] }), /kode TP tidak sesuai/);
});

test('rejects Modul Ajar that references a foreign TP code', () => {
  const result = {
    tujuanKode: ['X.1'],
    model: 'Inkuiri',
    pemahamanBermakna: ['Konsep digunakan sehari-hari.'],
    pertanyaanPemantik: ['Apa yang kamu amati?'],
    dimensiProfil: ['Bernalar kritis'],
    sarpras: ['Papan tulis'],
    pertemuan: [{
      ke: 1,
      judul: 'Pengantar',
      tujuan: 'Memahami konsep.',
      menit: 40,
      pendahuluan: ['Menyapa siswa.'],
      inti: ['Diskusi.'],
      penutup: ['Refleksi.']
    }],
    asesmen: { diagnostik: 'Tanya jawab.', formatif: 'Observasi.', sumatif: 'Tes.' },
    remedial: 'Latihan tambahan.',
    pengayaan: 'Soal tantangan.',
    refleksiGuru: ['Evaluasi proses.'],
    refleksiSiswa: ['Apa yang dipelajari?']
  };
  assert.throws(() => parsePlanningOutput('modul', JSON.stringify(result), { kodeTp: ['E1'] }), /kode tujuan tidak sesuai/);
});
