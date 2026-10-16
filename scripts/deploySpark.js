const { spawnSync } = require('node:child_process');
const { readFile, rm, writeFile } = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const root = path.resolve(__dirname, '..');
  const sourcePath = path.join(root, 'firebase.json');
  const temporaryPath = path.join(root, `.firebase.spark.${process.pid}.json`);
  const config = JSON.parse(await readFile(sourcePath, 'utf8'));

  delete config.functions;
  delete config.storage;
  config.hosting.rewrites = config.hosting.rewrites.filter((rewrite) => !rewrite.function);

  try {
    await writeFile(temporaryPath, JSON.stringify(config, null, 2));
    const firebaseCli = require.resolve('firebase-tools/lib/bin/firebase.js');
    const result = spawnSync(process.execPath, [
      firebaseCli,
      'deploy',
      '--config',
      temporaryPath,
      '--only',
      'hosting,database,firestore:default',
      ...process.argv.slice(2),
    ], { cwd: root, stdio: 'inherit' });

    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
