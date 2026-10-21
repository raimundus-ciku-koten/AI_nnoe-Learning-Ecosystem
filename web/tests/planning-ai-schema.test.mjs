import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlanningOutput } from '../src/services/planningAiSchema.js';
import { PRASYARAT, JENIS } from '../src/pages/perencanaan/constants.js';
import { sumberBelajarModul } from '../src/pages/perencanaan/engine/prota.js';

const atp = () => ({
  cp: [{ elemen: 'Bilangan', cp: 'Memahami bilangan.' }],
  unit: [
    {
      no: 1,
      nama: 'Bilangan',
      elemen: 'Bilangan',
      semester: 1,
      tp: [{ kode: 'E.1', rumusan: 'Mengidentifikasi bilangan.', materi: 'Bilangan', jp: 4 }]
    },
    {
      no: 2,
      nama: 'Pola',
      elemen: 'Bilangan',
      semester: 2,
      tp: [{ kode: 'E.2', rumusan: 'Menerapkan bilangan.', materi: 'Pola bilangan', jp: 4 }]
    }
  ]
});

test('validates and normalizes a valid ATP output', () => {
  const parsed = parsePlanningOutput('atp', JSON.stringify(atp()));
  assert.equal(parsed.unit[0].tp[0].kode, 'E.1');
});

test('requires AI-generated ATP to preserve the imported CP exactly', () => {
  const sourceCp = atp().cp;
  const parsed = parsePlanningOutput('atp', JSON.stringify(atp()), { cp: sourceCp });
  assert.deepEqual(parsed.cp, sourceCp);

  const changed = atp();
  changed.cp[0].cp = 'Rumusan CP hasil parafrasa.';
  assert.throws(
    () => parsePlanningOutput('atp', JSON.stringify(changed), { cp: sourceCp }),
    /rumusan CP harus sama persis/,
  );
});

test('rejects duplicate TP codes and invalid output shapes', () => {
  const output = atp();
  output.unit[0].tp.push({ ...output.unit[0].tp[0] });
  assert.throws(() => parsePlanningOutput('atp', JSON.stringify(output)), /kode TP ganda/);
  assert.throws(() => parsePlanningOutput('atp', 'not json'), /bukan JSON valid/);
});

test('rejects incomplete or extra AI fields instead of silently stripping them', () => {
  const incomplete = atp();
  delete incomplete.unit[0].tp[0].materi;
  assert.throws(() => parsePlanningOutput('atp', JSON.stringify(incomplete)), /kolom yang tidak dikenal atau belum lengkap/);

  const extra = atp();
  extra.unit[0].teacherName = 'Data pribadi';
  assert.throws(() => parsePlanningOutput('atp', JSON.stringify(extra)), /kolom yang tidak dikenal atau belum lengkap/);
});

test('rejects oversized text and arrays instead of truncating model output', () => {
  const longText = atp();
  longText.cp[0].cp = 'x'.repeat(3001);
  assert.throws(() => parsePlanningOutput('atp', JSON.stringify(longText)), /maksimal 3000 karakter/);

  const tooManyUnits = atp();
  tooManyUnits.unit = Array.from({ length: 31 }, (_, index) => ({
    ...tooManyUnits.unit[0],
    no: index + 1,
    nama: `Unit ${index + 1}`,
    semester: index < 15 ? 1 : 2,
    tp: [{ ...tooManyUnits.unit[0].tp[0], kode: `E.${index + 1}` }],
  }));
  assert.throws(() => parsePlanningOutput('atp', JSON.stringify(tooManyUnits)), /maksimal 30 butir/);
});

test('requires every ATP CP element to map to an ordered unit with learning goals', () => {
  const missingElement = atp();
  missingElement.cp.push({ elemen: 'Aljabar', cp: 'Menggunakan pola aljabar.' });
  assert.throws(() => parsePlanningOutput('atp', JSON.stringify(missingElement)), /setiap elemen CP harus memiliki TP/);

  const unknownElement = atp();
  unknownElement.unit[0].elemen = 'Aljabar';
  assert.throws(() => parsePlanningOutput('atp', JSON.stringify(unknownElement)), /elemen unit tidak tercantum dalam CP/);

  const unordered = atp();
  unordered.unit[0].semester = 2;
  unordered.unit[1].semester = 1;
  assert.throws(() => parsePlanningOutput('atp', JSON.stringify(unordered)), /urutan semester tidak boleh mundur/);
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

test('allows intentionally empty optional sections in a manually authored module only', () => {
  const result = {
    tujuanKode: ['E.1'],
    model: 'Diskusi',
    pemahamanBermakna: [],
    pertanyaanPemantik: [],
    dimensiProfil: [],
    sarpras: [],
    pertemuan: [{
      ke: 1,
      judul: 'Eksplorasi',
      tujuan: 'Mengamati konsep.',
      menit: 40,
      pendahuluan: [],
      inti: ['Diskusi kelompok.'],
      penutup: []
    }],
    asesmen: { diagnostik: '', formatif: 'Observasi proses.', sumatif: '' },
    remedial: '',
    pengayaan: '',
    refleksiGuru: [],
    refleksiSiswa: []
  };

  assert.deepEqual(
    parsePlanningOutput('modul', JSON.stringify(result), { kodeTp: ['E1'], allowEmptyLists: true }),
    result,
  );
  assert.throws(
    () => parsePlanningOutput('modul', JSON.stringify(result), { kodeTp: ['E1'] }),
    /minimal 1 butir/,
  );
});

test('requires current Prosem before creating modules and invalidates them when Prosem changes', () => {
  assert.deepEqual(PRASYARAT[JENIS.MODUL], [JENIS.ATP, JENIS.PROTA, JENIS.PROSEM]);
  assert.deepEqual(PRASYARAT[JENIS.ATP], [JENIS.RPE, JENIS.CP]);
});

test('returns canonical CP and TP text from the source ATP for the module renderer', () => {
  const source = atp();
  source.cp.push({ elemen: 'Aljabar', cp: 'Menggunakan pola aljabar.' });
  source.unit[0].tp[0].materi = 'Bilangan bulat';
  assert.deepEqual(sumberBelajarModul(source, source.unit[0]), {
    cp: [{ elemen: 'Bilangan', cp: 'Memahami bilangan.' }],
    tp: [{
      kode: 'E.1',
      rumusan: 'Mengidentifikasi bilangan.',
      materi: 'Bilangan bulat',
    }],
    alokasi: null,
    jadwal: [],
  });
});

test('includes canonical Prota allocation and Prosem schedule for the module', () => {
  const source = atp();
  const prota = {
    program: {
      1: { modul: [{ no: 1, jp: 10, jpTP: 8, uh: 2 }] },
      2: { modul: [{ no: 2, jp: 12, jpTP: 10, uh: 2 }] },
    },
  };
  const prosem = {
    ganjil: {
      bulan: [{
        pekan: [{
          noSemester: 3,
          mulai: '2026-08-03',
          selesai: '2026-08-09',
          segmen: [{ modulNo: 1, jp: 4 }, { modulNo: 2, jp: 2 }],
        }],
      }],
    },
    genap: { bulan: [] },
  };
  assert.deepEqual(sumberBelajarModul(source, source.unit[0], prota, prosem), {
    cp: [{ elemen: 'Bilangan', cp: 'Memahami bilangan.' }],
    tp: [{
      kode: 'E.1',
      rumusan: 'Mengidentifikasi bilangan.',
      materi: 'Bilangan',
    }],
    alokasi: { semester: 1, jp: 10, jpTP: 8, uh: 2 },
    jadwal: [{
      semester: 1,
      pekan: 3,
      mulai: '2026-08-03',
      selesai: '2026-08-09',
      jp: 4,
    }],
  });
});
