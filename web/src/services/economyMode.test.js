import assert from 'node:assert/strict';
import { test } from 'node:test';
import { intervalForEconomyMode, isEconomyMode } from './economyMode.js';

test('economy mode defaults off and preserves normal intervals', () => {
  assert.equal(isEconomyMode(), false);
  assert.equal(intervalForEconomyMode(30_000), 30_000);
});

test('economy mode follows browser Save-Data preference', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { connection: { saveData: true } },
  });
  try {
    assert.equal(isEconomyMode(), true);
    assert.equal(intervalForEconomyMode(30_000), 180_000);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous);
    else delete globalThis.navigator;
  }
});

test('economy mode rejects invalid intervals', () => {
  assert.throws(() => intervalForEconomyMode(0), /Interval mode hemat data tidak valid/);
  assert.throws(() => intervalForEconomyMode(90_000, 60_000), /Interval mode hemat data tidak valid/);
});
