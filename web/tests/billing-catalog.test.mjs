import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);
const pricing = JSON.parse(readFileSync(new URL('web/src/data/pricing.json', root), 'utf8'));
const migration = readFileSync(
  new URL('supabase/migrations/20261018000400_midtrans_billing.sql', root),
  'utf8',
);
const priceAdjustment = readFileSync(
  new URL('supabase/migrations/20261019000100_indonesia_price_catalog.sql', root),
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
for (const match of priceAdjustment.matchAll(/\('([^']+)',\s*(\d+)\)/g)) {
  const current = catalogRows.get(match[1]);
  assert.ok(current, `Price adjustment references unknown plan ${match[1]}`);
  catalogRows.set(match[1], { ...current, annualPrice: Number(match[2]) });
}

test('Supabase billing seed and price adjustments match the shared catalog', () => {
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

test('the Indonesia price adjustment only updates the three school annual prices', () => {
  assert.match(priceAdjustment, /update public\.billing_plans/i);
  assert.match(priceAdjustment, /set annual_price = updates\.annual_price/i);
  assert.equal([...priceAdjustment.matchAll(/\('([^']+)',\s*(\d+)\)/g)].length, 3);
  assert.doesNotMatch(priceAdjustment, /delete\s+from|drop\s+table|truncate/i);
});

test('all catalog prices use whole-Rupiah values and a consistent ten-month annual price', () => {
  const plans = [
    ...pricing.school,
    ...pricing.student,
    ...pricing.teacherSd,
    ...pricing.teacherSubject,
  ];
  for (const plan of plans) {
    const monthly = plan.annualPrice / pricing.monthlyDivisor;
    assert.ok(Number.isSafeInteger(monthly), `${plan.id} monthly price must be whole Rupiah`);
    assert.equal(monthly % 100, 0, `${plan.id} price should avoid sub-hundred-Rupiah precision`);
  }
  assert.deepEqual(pricing.school.map(({ annualPrice }) => annualPrice), [
    2990000, 6990000, 14990000,
  ]);
});
