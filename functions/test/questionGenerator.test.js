'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { tanganiSoal, validasiMasukan, uraiDraf } = require('../lib/questionGenerator');

const config = {
  geminiKeys: ['gemini-key'],
  geminiModel: 'gemini-test',
  deepseekKey: 'deepseek-key',
  deepseekModel: 'deepseek-test',
  preferredProvider: 'auto',
  perJam: 3,
  perHari: 10
};
const req = (data, role = 'guru') => ({
  auth: { uid: 'guru-1', token: { role, tenantId: 'sekolah-1' } },
  data
});
function buatDb() {
  const state = new Map();
  return {
    doc: (path) => ({ path }),
    runTransaction: async (callback) => callback({
      get: async (ref) => ({ exists: state.has(ref.path), data: () => state.get(ref.path) }),
      set: (ref, value) => state.set(ref.path, value)
    })
  };
}
const response = (data) => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] } }] })
});

test('validates the required draft context', () => {
  assert.deepEqual(validasiMasukan({
    mapel: ' Matematika ', kelas: 'X', topik: ' Persamaan linear ', jenis: 'pilihan_ganda'
  }), { mapel: 'Matematika', kelas: 'X', topik: 'Persamaan linear', jenis: 'pilihan_ganda' });
  assert.throws(() => validasiMasukan({ mapel: '', kelas: 'X', jenis: 'uraian' }));
});

test('validates question JSON and answer choices', () => {
  assert.deepEqual(uraiDraf(JSON.stringify({ questions: [{
    pertanyaan: 'Berapakah 2 + 2?', pilihan: ['2', '3', '4'], jawaban: '4', pembahasan: 'Penjumlahan dasar.'
  }] }), 'pilihan_ganda').questions.length, 1);
  assert.throws(() => uraiDraf(JSON.stringify({ questions: [{
    pertanyaan: 'Soal', pilihan: ['A', 'B'], jawaban: 'C', pembahasan: 'Bahas'
  }] }), 'pilihan_ganda'));
  assert.throws(() => uraiDraf('not-json', 'uraian'));
});

test('rejects non-teacher accounts and returns a validated teacher draft', async () => {
  await assert.rejects(tanganiSoal({
    req: req({ mapel: 'IPA', kelas: 'V', topik: 'Gaya', jenis: 'uraian' }, 'siswa'),
    db: buatDb(),
    config
  }), (error) => error.kode === 'permission-denied');
  const result = await tanganiSoal({
    req: req({ mapel: 'IPA', kelas: 'V', topik: 'Gaya', jenis: 'uraian' }),
    db: buatDb(),
    config,
    fetchFn: async () => response({ questions: [{
      pertanyaan: 'Jelaskan pengaruh gaya pada gerak benda.',
      pilihan: [],
      jawaban: 'Gaya dapat mengubah gerak atau bentuk benda.',
      pembahasan: 'Gaya dapat mengubah kecepatan, arah, atau bentuk.'
    }] })
  });
  assert.equal(result.penyedia, 'gemini');
  assert.equal(result.payload.questions[0].jenis, 'uraian');
});
