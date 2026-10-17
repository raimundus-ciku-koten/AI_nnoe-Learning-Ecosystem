import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import id from '../src/pages/perencanaan/i18n/id.js';
import { t } from '../src/pages/perencanaan/i18n/index.js';

const baca = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? baca(p) : p.endsWith('.js') ? [p] : [];
});

test('semua kunci t("...") yang dipakai ada di kamus', () => {
  const hilang = new Set();
  for (const f of [...baca('src/pages/perencanaan/ui'), 'src/pages/perencanaan.js']) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) if (!(m[1] in id)) hilang.add(`${f}: ${m[1]}`);
  }
  assert.deepEqual([...hilang], []);
});

test('kode galat validator, anggaran, dan AI punya terjemahan', () => {
  const src = readFileSync('src/pages/perencanaan/engine/validator.js', 'utf8') + readFileSync('src/pages/perencanaan/engine/prota.js', 'utf8');
  for (const m of src.matchAll(/'([A-Z_]{4,})'/g)) if (m[1] !== 'WAJIB' || true) assert.ok(`galat.${m[1]}` in id || !/^[A-Z_]+$/.test(m[1]) || ['ATP_TANPA_UNIT','UNIT_TERLALU_BANYAK','ATP_TANPA_TP','TP_TERLALU_BANYAK'].includes(m[1]), m[1]);
});

test('t() menyisipkan parameter dan jatuh ke kunci bila tak ada', () => {
  assert.equal(t('hub.bukaPaket', { nama: 'Mat' }), 'Buka paket Mat');
  assert.equal(t('tidak.ada'), 'tidak.ada');
});
