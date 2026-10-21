import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalisasiNama } from './nama.js';

test('menormalkan setiap kata nama menjadi Title Case', () => {
  assert.equal(normalisasiNama('  mARIA de-sOUZA  '), 'Maria De-Souza');
  assert.equal(normalisasiNama("  d'ANGELO  "), "D'Angelo");
  assert.equal(normalisasiNama('bUDI SANTOSO'), 'Budi Santoso');
  assert.equal(normalisasiNama(''), '');
});
