import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, link, mkdtemp, open, rm, stat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const MAGIC = Buffer.from('ALEBKP01');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + 1 + IV_LENGTH;
const VERSION = 1;

function readKey(value = process.env.BACKUP_ENCRYPTION_KEY) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    throw new Error('BACKUP_ENCRYPTION_KEY harus berupa base64 dari tepat 32 byte acak.');
  }
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value) {
    throw new Error('BACKUP_ENCRYPTION_KEY tidak valid.');
  }
  return key;
}

async function writeAtomically(outputPath, readable) {
  const output = resolve(outputPath);
  const directory = dirname(output);
  await access(directory);
  const temporaryDirectory = await mkdtemp(resolve(directory, '.ale-backup-'));
  const temporaryPath = resolve(temporaryDirectory, basename(output));
  try {
    await pipeline(readable, createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 }));
    await link(temporaryPath, output);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function encryptBackup(inputPath, outputPath, encodedKey) {
  const key = readKey(encodedKey);
  const input = resolve(inputPath);
  const output = resolve(outputPath);
  if (input === output) throw new Error('Berkas sumber dan hasil harus berbeda.');
  const { size } = await stat(input);
  if (size < 1) throw new Error('Berkas dump database kosong.');
  await access(dirname(output));

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const header = Buffer.concat([MAGIC, Buffer.from([VERSION]), iv]);
  const encrypted = Readable.from((async function* () {
    yield header;
    for await (const chunk of createReadStream(input).pipe(cipher)) yield chunk;
    yield cipher.getAuthTag();
  }()));
  await writeAtomically(output, encrypted);
}

export async function decryptBackup(inputPath, outputPath, encodedKey) {
  const key = readKey(encodedKey);
  const input = resolve(inputPath);
  const output = resolve(outputPath);
  if (input === output) throw new Error('Berkas sumber dan hasil harus berbeda.');
  const { size } = await stat(input);
  if (size <= HEADER_LENGTH + TAG_LENGTH) throw new Error('Berkas cadangan terenkripsi tidak lengkap.');

  const file = await open(input, 'r');
  let header;
  let tag;
  try {
    header = Buffer.alloc(HEADER_LENGTH);
    tag = Buffer.alloc(TAG_LENGTH);
    const headerRead = await file.read(header, 0, HEADER_LENGTH, 0);
    const tagRead = await file.read(tag, 0, TAG_LENGTH, size - TAG_LENGTH);
    if (headerRead.bytesRead !== HEADER_LENGTH || tagRead.bytesRead !== TAG_LENGTH ||
        !header.subarray(0, MAGIC.length).equals(MAGIC) ||
        header[MAGIC.length] !== VERSION) {
      throw new Error('Format atau versi berkas cadangan tidak dikenal.');
    }
  } finally {
    await file.close();
  }

  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(MAGIC.length + 1));
  decipher.setAuthTag(tag);
  const encrypted = createReadStream(input, {
    start: HEADER_LENGTH,
    end: size - TAG_LENGTH - 1,
  }).pipe(decipher);
  await writeAtomically(output, encrypted);
}

async function main(args) {
  const [operation, input, output] = args;
  if (!['encrypt', 'decrypt'].includes(operation) || !input || !output || args.length !== 3) {
    throw new Error('Pemakaian: node scripts/encryptedBackup.mjs <encrypt|decrypt> <sumber> <hasil>');
  }
  if (operation === 'encrypt') await encryptBackup(input, output);
  else await decryptBackup(input, output);
  console.log(`Operasi ${operation} berhasil: ${basename(resolve(output))}`);
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`[encrypted-backup] ${error.message}`);
    process.exitCode = 1;
  });
}
