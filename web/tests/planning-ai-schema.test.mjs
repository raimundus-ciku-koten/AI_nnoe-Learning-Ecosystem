import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parsePlanningOutput } from '../src/services/planningAiSchema.js';
import { kontrakKodeAtp, promptAtp, promptKktp, promptModul } from '../src/services/planningAiPrompts.js';
import { PRASYARAT, JENIS } from '../src/pages/perencanaan/constants.js';
import { sumberBelajarModul } from '../src/pages/perencanaan/engine/prota.js';

const detailPage = await readFile(
  new URL('../src/pages/perencanaan/ui/halaman-detail.js', import.meta.url),
  'utf8',
);

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

test('builds the legacy ATP code contract and reuses a complete saved contract', () => {
  const cp = [
    { elemen: 'Bilangan', cp: 'CP bilangan.' },
    { elemen: 'Aljabar', cp: 'CP aljabar.' },
  ];
  assert.deepEqual(kontrakKodeAtp({ cp, totalJP: 72, jpPerPekan: 4 }), [
    { elemen: 'Bilangan', kode: ['A.1', 'A.2', 'A.3'] },
    { elemen: 'Aljabar', kode: ['B.1', 'B.2', 'B.3'] },
  ]);
  const saved = [{ elemen: 'Bilangan', kode: ['E.1', 'E.2'] }];
  assert.deepEqual(kontrakKodeAtp({
    cp: [cp[0]], totalJP: 72, jpPerPekan: 4, kodePerElemen: saved,
  }), saved);
  assert.match(promptAtp({
    mapel: 'Matematika', kelas: 'X', fase: 'E', cp: [cp[0]],
    totalJP: 72, jpPerPekan: 4, kodePerElemen: saved,
  }), /E\.1, E\.2/);
});

test('validates a one-element legacy ATP and rejects a code or weekly JP mismatch', () => {
  const singleElement = {
    rasionalisasi: 'Urutan TP bergerak dari pengenalan menuju penerapan.',
    cp: [{ elemen: 'Bilangan', cp: 'Memahami bilangan.' }],
    unit: [{
      no: 1,
      nama: 'Bilangan',
      elemen: 'Bilangan',
      semester: 1,
      tujuanUnit: 'Menggunakan bilangan.',
      kataKunci: ['bilangan'],
      isiProsesPembelajaran: 'Mengamati dan berlatih.',
      dimensiProfil: ['Bernalar kritis'],
      glosarium: [],
      tp: [{
        kode: 'E.1',
        rumusan: 'Mengidentifikasi bilangan.',
        materi: 'Bilangan',
        strategiAsesmen: 'Observasi.',
        jp: 4,
      }],
    }],
  };
  const context = {
    cp: singleElement.cp,
    legacyContract: true,
    requireAtpDetails: true,
    kodeTp: ['E.1'],
    jpPerPekan: 4,
  };
  assert.deepEqual(parsePlanningOutput('atp', JSON.stringify(singleElement), context), singleElement);
  assert.throws(
    () => parsePlanningOutput('atp', JSON.stringify({
      ...singleElement,
      unit: [{ ...singleElement.unit[0], tp: [{ ...singleElement.unit[0].tp[0], kode: 'X.1' }] }],
    }), context),
    /kode TP harus mengikuti kontrak sumber dan urutannya/,
  );
  assert.throws(
    () => parsePlanningOutput('atp', JSON.stringify({
      ...singleElement,
      unit: [{ ...singleElement.unit[0], tp: [{ ...singleElement.unit[0].tp[0], jp: 3 }] }],
    }), context),
    /alokasi setiap TP harus berupa kelipatan JP per pekan/,
  );
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
  assert.throws(() => parsePlanningOutput('kktp', JSON.stringify(result), {
    kodeTp: ['E1'],
    allowLegacyKktp: true,
  }), /kode TP tidak sesuai/);
});

test('validates complete KKTP output and preserves the four-level rubric fields', () => {
  const result = {
    ambang: 75,
    items: [{
      kode: 'E.1',
      indikator: ['Mengidentifikasi konsep.'],
      asesmen: 'Observasi.',
      rubrik: {
        perluBimbingan: 'Perlu bantuan.',
        cukup: 'Mulai memahami.',
        baik: 'Memahami.',
        sangatBaik: 'Menerapkan.',
      },
      tindakLanjut: 'Latihan terarah.',
    }],
    rubrikUmum: Array.from({ length: 4 }, (_, index) => ({
      aspek: `Aspek ${index + 1}`,
      belumBerkembang: 'Perlu bantuan.',
      berkembangSesuaiHarapan: 'Mencapai sebagian besar indikator.',
      mahir: 'Menerapkan mandiri.',
    })),
  };
  assert.deepEqual(parsePlanningOutput('kktp', JSON.stringify(result), { kodeTp: ['E1'] }), result);
  assert.throws(() => parsePlanningOutput('kktp', JSON.stringify({ ...result, ambang: 59 }), { kodeTp: ['E1'] }), /60-85/);
  assert.throws(() => parsePlanningOutput('kktp', JSON.stringify({
    ...result,
    rubrikUmum: result.rubrikUmum.slice(0, 3),
  }), { kodeTp: ['E1'] }), /minimal 4 butir/);
});

test('normalizes previously saved KKTP drafts without fabricating missing content', () => {
  const legacy = {
    ambang: 75,
    items: [{
      kode: 'E.1',
      indikator: ['Mengidentifikasi konsep.'],
      rubrik: {
        perluBimbingan: 'Perlu bantuan.',
        cukup: 'Mulai memahami.',
        baik: 'Memahami.',
        sangatBaik: 'Menerapkan.',
      },
    }],
  };
  const result = parsePlanningOutput('kktp', JSON.stringify(legacy), {
    kodeTp: ['E1'],
    allowLegacyKktp: true,
  });
  assert.equal(result.items[0].asesmen, 'PERLU KONFIRMASI');
  assert.equal(result.items[0].tindakLanjut, 'PERLU KONFIRMASI');
  assert.equal(result.rubrikUmum.length, 4);
  assert.equal(result.rubrikUmum[0].aspek, 'PERLU KONFIRMASI');
  assert.throws(() => parsePlanningOutput('kktp', JSON.stringify(legacy), { kodeTp: ['E1'] }), /struktur memiliki kolom/);
});

test('KKTP prompt includes required per-TP and general-rubric sections', () => {
  const prompt = promptKktp({
    mapel: 'Matematika',
    kelas: 'X',
    fase: 'E',
    tps: [{ unit: 'Bilangan', kode: 'E.1', rumusan: 'Mengidentifikasi bilangan.' }],
  });
  assert.match(prompt, /"asesmen"/);
  assert.match(prompt, /"tindakLanjut"/);
  assert.match(prompt, /"rubrikUmum"/);
  assert.match(prompt, /E\.1/);
});

test('Modul Ajar prompt uses canonical CP, Prota allocation, and Prosem schedule', () => {
  const prompt = promptModul({
    mapel: 'Matematika',
    kelas: 'X-A',
    fase: 'E',
    tahunAjaran: '2026/2027',
    cp: [{ elemen: 'Bilangan', cp: 'Memahami bilangan.' }],
    unit: {
      no: 1,
      nama: 'Bilangan',
      semester: 1,
      tp: [{ kode: 'E.1', rumusan: 'Mengenali bilangan.', materi: 'Bilangan' }],
    },
    alokasi: { semester: 1, jpTP: 10, uh: 2, totalJP: 12, jpPerPekan: 5 },
    jadwal: [{
      semester: 1,
      pekan: 4,
      mulai: '2026-08-03',
      selesai: '2026-08-09',
      penanda: null,
      segmen: [{ jenis: 'tp', kode: 'E.1', jp: 5 }],
    }],
  });
  assert.match(prompt, /"cp":"Memahami bilangan\."/);
  assert.match(prompt, /"totalJP":12/);
  assert.match(prompt, /"pekan":4/);
  assert.match(prompt, /DATA jadwal menyatakan JP, bukan durasi menit/);
  assert.match(prompt, /rubrik, dan lampiran belum tersedia/);
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

test('requires AI-generated modules to preserve every ATP code and sequential meeting numbers', () => {
  const result = {
    tujuanKode: ['E.1', 'E.2'],
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
      pendahuluan: ['Menyapa peserta didik.'],
      inti: ['Diskusi.'],
      penutup: ['Refleksi.'],
    }],
    asesmen: { diagnostik: 'Tanya jawab.', formatif: 'Observasi.', sumatif: 'Tes.' },
    remedial: 'Latihan tambahan.',
    pengayaan: 'Soal tantangan.',
    refleksiGuru: ['Evaluasi proses.'],
    refleksiSiswa: ['Apa yang dipelajari?'],
  };
  const context = { kodeTp: ['E1', 'E2'], requireAllCodes: true };
  assert.deepEqual(parsePlanningOutput('modul', JSON.stringify(result), context), result);
  assert.throws(
    () => parsePlanningOutput('modul', JSON.stringify({ ...result, tujuanKode: ['E.1'] }), context),
    /semua kode TP unit harus digunakan/,
  );
  assert.throws(
    () => parsePlanningOutput('modul', JSON.stringify({
      ...result,
      pertemuan: [{ ...result.pertemuan[0], ke: 2 }],
    }), context),
    /nomor pertemuan harus berurutan/,
  );
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

test('exposes local AI drafting for KKTP and Modul Ajar and saves only after editor approval', () => {
  assert.match(detailPage, /onClick:\s*\(\)\s*=>\s*buatDrafAi\(JENIS\.KKTP\)/);
  assert.match(detailPage, /onClick:\s*\(\)\s*=>\s*buatDrafAi\(JENIS\.MODUL,\s*u\)/);
  assert.match(detailPage, /mulaiEditorKktp\(hasil\.payload,\s*SUMBER\.AI\)/);
  assert.match(detailPage, /mulaiEditorModul\(unit,\s*hasil\.payload,\s*SUMBER\.AI\)/);
  assert.match(detailPage, /simpan\(JENIS\.KKTP,\s*payload,\s*editorSumberKktp\)/);
  assert.match(detailPage, /payload,\s*sumber:\s*editorSumberModul/);
  assert.doesNotMatch(detailPage, /detail\.aiNonaktif/);
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
      1: { modul: [{ no: 1, jpTP: 8, uh: 2 }] },
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
