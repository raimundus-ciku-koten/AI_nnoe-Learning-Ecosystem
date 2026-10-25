import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { test } from 'node:test';

const publicDirectory = new URL('../public/', import.meta.url);
const sourceDirectory = new URL('../src/', import.meta.url);

async function pngMetadata(file) {
  const path = new URL(file, publicDirectory);
  const [bytes, metadata] = await Promise.all([readFile(path), stat(path)]);
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    size: metadata.size,
  };
}

test('optimized application logos retain transparent PNG dimensions within their budgets', async () => {
  const mark1x = await pngMetadata('logo-ale-mark-1x.png');
  const mark2x = await pngMetadata('logo-ale-mark-2x.png');
  const lockup1x = await pngMetadata('logo-ale-lockup-1x.png');
  const lockup2x = await pngMetadata('logo-ale-lockup-2x.png');

  assert.deepEqual([mark1x.width, mark1x.height], [57, 40]);
  assert.ok(mark1x.size < 6_000, `1x mark is ${mark1x.size} bytes`);
  assert.deepEqual([mark2x.width, mark2x.height], [114, 80]);
  assert.ok(mark2x.size < 15_000, `2x mark is ${mark2x.size} bytes`);
  assert.deepEqual([lockup1x.width, lockup1x.height], [112, 87]);
  assert.ok(lockup1x.size < 18_000, `1x lockup is ${lockup1x.size} bytes`);
  assert.deepEqual([lockup2x.width, lockup2x.height], [224, 175]);
  assert.ok(lockup2x.size < 55_000, `2x lockup is ${lockup2x.size} bytes`);

  for (const source of [
    'components/AppShell.jsx',
    'components/sidebar.js',
    'components/loading.js',
    'pages/TrialDemoPage.jsx',
    'pages/login.js',
  ]) {
    const content = await readFile(new URL(source, sourceDirectory), 'utf8');
    assert.match(content, /logo-ale-mark-1x\.png/, `${source} should use the optimized 1x mark`);
    assert.match(content, /logo-ale-mark-2x\.png 2x/, `${source} should offer a 2x mark`);
    assert.doesNotMatch(content, /logo-ale-mark\.png/, `${source} should not use the full-resolution mark`);
  }

  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(index, /src="\/logo-ale-lockup-1x\.png"/);
  assert.match(index, /srcset="\/logo-ale-lockup-2x\.png 2x"/);
});
