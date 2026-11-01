import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const configs = await Promise.all([
  readFile(new URL('../../vercel.json', import.meta.url), 'utf8'),
  readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
]).then((contents) => contents.map((content) => JSON.parse(content)));
const rootConfig = configs[0];

function listFunctionFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return entry.name.startsWith('_') ? [] : listFunctionFiles(join(directory, entry.name));
    }
    return /\.(?:[cm]?[jt]s)$/.test(entry.name) ? [join(directory, entry.name)] : [];
  });
}

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

test('root deployment routes auth endpoints through one function before the SPA fallback', () => {
  const authRewriteIndex = rootConfig.rewrites.findIndex(
    (rewrite) => rewrite.source === '/api/auth/:path*'
      && rewrite.destination === '/api/auth?route=:path*',
  );
  const spaRewriteIndex = rootConfig.rewrites.findIndex(
    (rewrite) => rewrite.source === '/(.*)' && rewrite.destination === '/index.html',
  );

  assert.notEqual(authRewriteIndex, -1);
  assert.ok(spaRewriteIndex > authRewriteIndex);
});

test('root deployment remains within Vercel Hobby function limit', () => {
  const functions = listFunctionFiles(fileURLToPath(new URL('../../api', import.meta.url)));
  assert.ok(functions.length <= 12, `Found ${functions.length} deployable API functions`);
});
