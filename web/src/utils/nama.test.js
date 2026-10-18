import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalisasiNama } from './nama.js';

test('memastikan huruf awal nama kapital dan gelar yang diinput tetap dipertahankan', () => {
  assert.equal(normalisasiNama('  maria de-souza, s.pd.  '), 'Maria De-Souza, S.pd.');
  assert.equal(normalisasiNama('CEO AI_nnoe Corp'), 'CEO AI_nnoe Corp');
});
