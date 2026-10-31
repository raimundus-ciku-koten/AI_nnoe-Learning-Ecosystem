import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const configs = await Promise.all([
  readFile(new URL('../../vercel.json', import.meta.url), 'utf8'),
  readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
]).then((contents) => contents.map((content) => JSON.parse(content)));

test('hosting security headers allow same-origin browser media only', () => {
  for (const config of configs) {
    const policy = config.headers
      .find((entry) => entry.source === '/(.*)')
      ?.headers.find((header) => header.key === 'Permissions-Policy')?.value;

    assert.ok(policy, 'global Permissions-Policy must be configured');
    assert.match(policy, /camera=\(self\)/);
    assert.match(policy, /microphone=\(self\)/);
    assert.match(policy, /geolocation=\(\)/);
    assert.match(policy, /payment=\(\)/);
  }
});
