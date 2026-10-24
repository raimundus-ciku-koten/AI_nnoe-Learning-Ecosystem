import test from 'node:test';
import assert from 'node:assert/strict';
import { promptAtp, promptKktp, promptModul } from '../src/services/planningAiPrompts.js';

const context = {
  jenjang: 'sd',
  kelas: 'III',
  fase: 'B',
  mapel: 'Matematika',
};

test('ATP prompt preserves phase CP and constrains generated goals to the selected grade', () => {
  const prompt = promptAtp({
    ...context,
    cp: [{ elemen: 'Bilangan', cp: 'Memahami nilai tempat dan operasi bilangan.' }],
    totalJP: 144,
    jpPerPekan: 4,
  });

  assert.match(prompt, /kelas\/kelompok/);
  assert.match(prompt, /pembagian resmi kementerian/i);
  assert.match(prompt, /Rancang TP hanya untuk kelas sasaran/);
  assert.match(prompt, /III/);
  assert.match(prompt, /Memahami nilai tempat dan operasi bilangan\./);
  assert.match(prompt, /konkret/);
});

test('KKTP prompt is scoped to its grade and includes differentiated assessment guidance', () => {
  const prompt = promptKktp({
    ...context,
    tps: [{ kode: 'B.1', rumusan: 'Membandingkan dua bilangan.' }],
  });

  assert.match(prompt, /B\.1/);
  assert.match(prompt, /alternatif bukti yang aksesibel/);
  assert.match(prompt, /III/);
});

test('module prompt adds optional and safe ice breaker/STOP guidance', () => {
  const prompt = promptModul({
    ...context,
    unit: {
      no: 1,
      nama: 'Bilangan',
      tp: [{ kode: 'B.1', rumusan: 'Membandingkan dua bilangan.', materi: 'Nilai tempat' }],
    },
    jpUnit: 8,
    jpPerPertemuan: 2,
  });

  assert.match(prompt, /ice breaker singkat dan teknik STOP/i);
  assert.match(prompt, /bukan kewajiban setiap pertemuan/);
  assert.match(prompt, /tidak menghukum/);
  assert.match(prompt, /representasi/);
});
