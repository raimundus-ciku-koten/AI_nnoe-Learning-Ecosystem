import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCapaianPembelajaranText } from '../src/pages/perencanaan/engine/capaianPembelajaran.js';

const source = [
  'CAPAIAN PEMBELAJARAN MATEMATIKA',
  'Fase E (Umumnya untuk Kelas X SMA/MA/SMK/MAK/Program Paket C)',
  'Pada akhir Fase E, murid memiliki kemampuan sebagai berikut.',
  '5.1. Bilangan',
  'Menggeneralisasi sifat bilangan dan menyelesaikan masalah kontekstual.',
  '5.2. Aljabar',
  'Menerapkan relasi dan fungsi untuk memodelkan masalah.',
  'Fase F (Umumnya untuk Kelas XI dan XII SMA/MA/SMK/MAK/Program Paket C)',
  'Pada akhir Fase F, murid memiliki kemampuan sebagai berikut.',
  '6.1. Bilangan',
  'Menjelaskan barisan dan deret aritmetika serta geometri.',
].join('\n');

test('imports only the requested subject and phase from a PDF text extraction', () => {
  const draft = parseCapaianPembelajaranText({
    text: source,
    mapel: 'Matematika',
    fase: 'E',
    fileName: 'Matematika.pdf',
    sourceFileId: 'drive-file-1',
  });

  assert.equal(draft.mapel, 'Matematika');
  assert.equal(draft.fase, 'E');
  assert.deepEqual(draft.cp, [
    {
      elemen: 'Bilangan',
      cp: 'Menggeneralisasi sifat bilangan dan menyelesaikan masalah kontekstual.',
    },
    {
      elemen: 'Aljabar',
      cp: 'Menerapkan relasi dan fungsi untuk memodelkan masalah.',
    },
  ]);
  assert.equal(draft.source.fileName, 'Matematika.pdf');
  assert.equal(draft.source.fileId, 'drive-file-1');
});

test('finds a subject chapter inside a shared aggregate curriculum PDF', () => {
  const draft = parseCapaianPembelajaranText({
    text: [
      'CAPAIAN PEMBELAJARAN BAHASA INDONESIA',
      'Fase F (Umumnya untuk Kelas XI dan XII)',
      'Pada akhir Fase F murid memiliki kemampuan sebagai berikut.',
      '1. Menyimak',
      'Mengevaluasi teks aural.',
      source,
    ].join('\n'),
    mapel: 'Matematika',
    fase: 'F',
    fileName: '21. SMK.pdf',
  });
  assert.deepEqual(draft.cp, [{
    elemen: 'Bilangan',
    cp: 'Menjelaskan barisan dan deret aritmetika serta geometri.',
  }]);
});

test('rejects mismatched subjects, unsupported phases, and empty outcome sections', () => {
  assert.throws(() => parseCapaianPembelajaranText({
    text: source,
    mapel: 'Fisika',
    fase: 'E',
    fileName: 'Matematika.pdf',
  }), /Bagian CP.*tidak ditemukan/);
  assert.throws(() => parseCapaianPembelajaranText({
    text: source,
    mapel: 'Matematika',
    fase: 'G',
    fileName: 'Matematika.pdf',
  }), /Fase CP harus Fondasi atau A sampai F/);
  assert.throws(() => parseCapaianPembelajaranText({
    text: 'CAPAIAN PEMBELAJARAN MATEMATIKA\nFase A (Umumnya untuk Kelas I)',
    mapel: 'Matematika',
    fase: 'A',
    fileName: 'Matematika.pdf',
  }), /tidak ditemukan|kosong/);
});

test('imports the PAUD/TK Fase Fondasi outcome without relabeling it as A-F', () => {
  const draft = parseCapaianPembelajaranText({
    text: [
      'CAPAIAN PEMBELAJARAN PAUD',
      'Fase Fondasi (Umumnya untuk usia 5–6 tahun)',
      'Pada akhir Fase Fondasi, anak menunjukkan kemampuan sebagai berikut.',
      '1. Nilai Agama dan Budi Pekerti',
      'Mengenal kebiasaan baik melalui pengalaman sehari-hari.',
    ].join('\n'),
    mapel: 'PAUD',
    fase: 'Fondasi',
    fileName: 'PAUD.pdf',
  });

  assert.equal(draft.fase, 'Fondasi');
  assert.deepEqual(draft.cp, [{
    elemen: 'Nilai Agama dan Budi Pekerti',
    cp: 'Mengenal kebiasaan baik melalui pengalaman sehari-hari.',
  }]);
});
