import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);
const pricing = JSON.parse(readFileSync(new URL('functions/shared/pricing.json', root), 'utf8'));
const migration = readFileSync(
  new URL('supabase/migrations/20261018000400_midtrans_billing.sql', root),
  'utf8',
);
const catalogRows = new Map();
const rowPattern = /^\s*\('([^']+)',\s*'(school|individual)',\s*'[^']+',\s*(?:null|'[^']+'),\s*'([^']+)',\s*(\d+),/gm;

for (const match of migration.matchAll(rowPattern)) {
  assert.equal(catalogRows.has(match[1]), false, `Duplicate SQL plan ${match[1]}`);
  catalogRows.set(match[1], {
    productType: match[2],
    name: match[3],
    annualPrice: Number(match[4]),
  });
}

test('Supabase billing plan seed matches the shared annual-price catalog', () => {
  const expected = [
    ...pricing.school.map((plan) => ({ ...plan, productType: 'school' })),
    ...pricing.student.map((plan) => ({ ...plan, productType: 'individual' })),
    ...pricing.teacherSd.map((plan) => ({ ...plan, productType: 'individual' })),
    ...pricing.teacherSubject.map((plan) => ({ ...plan, productType: 'individual' })),
  ];

  assert.equal(catalogRows.size, expected.length);
  for (const plan of expected) {
    assert.deepEqual(catalogRows.get(plan.id), {
      productType: plan.productType,
      name: plan.name,
      annualPrice: plan.annualPrice,
    }, `Plan ${plan.id} must match the shared catalog`);
  }
});

test('reapplying the billing migration preserves existing plan configuration', () => {
  assert.match(migration, /on conflict\s*\(id\)\s*do nothing\s*;/i);
  assert.doesNotMatch(migration, /on conflict\s*\(id\)\s*do update/i);
});
