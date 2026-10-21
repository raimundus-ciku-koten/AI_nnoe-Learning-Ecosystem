'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable, Writable } = require('node:stream');
const { createProtectedMediaHandlers, pathChatValid } = require('../lib/protectedMedia');

function buatLingkungan({
  anggota = true,
  metadata = null,
  konten = Buffer.from('berkas'),
  converterUrl = '',
  converterToken = '',
  converterFetch = async () => { throw new Error('unexpected converter call'); }
} = {}) {
  const log = [];
  const fileCalls = [];
  const databaseCalls = [];
  const file = {
    save: async (bytes, options) => { fileCalls.push({ jenis: 'save', bytes, options }); },
    getMetadata: async () => {
      fileCalls.push({ jenis: 'metadata' });
      if (!metadata) return [{ size: konten.length, contentType: 'image/jpeg' }];
      return [metadata];
    },
    createReadStream: () => {
      fileCalls.push({ jenis: 'stream' });
      return Readable.from(konten);
    },
    download: async () => [konten],
  };
  const admin = {
    auth: () => ({
      verifyIdToken: async (token, cekPencabutan) => {
        assert.equal(cekPencabutan, true);
        if (token !== 'valid-token') throw new Error('token invalid');
        return { uid: 'guru-a' };
      },
    }),
    database: () => ({
      ref: (path) => ({
        get: async () => {
          databaseCalls.push(path);
          return {
            exists: () => anggota,
            child: () => ({ val: () => anggota }),
          };
        },
      }),
    }),
    storage: () => ({
      bucket: () => ({
        file: (path) => {
          fileCalls.push({ jenis: 'file', path });
          return file;
        },
      }),
    }),
  };
  const handlers = createProtectedMediaHandlers({
    admin,
    logger: { error: (...args) => log.push(args) },
    randomUUID: () => '12345678-1234-1234-1234-123456789abc',
    wordConverterUrl: converterUrl,
    wordConverterToken: converterToken,
    converterFetch,
  });
  return { ...handlers, fileCalls, databaseCalls, log };
}

function buatRes() {
  const chunks = [];
  const headers = {};
  const res = new Writable({
    write(chunk, encoding, callback) {
      res.headersSent = true;
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  res.statusCode = 200;
  res.headersSent = false;
  res.headers = headers;
  res.set = (name, value) => {
    if (typeof name === 'string') headers[name.toLowerCase()] = value;
    else Object.entries(name).forEach(([key, item]) => { headers[key.toLowerCase()] = item; });
    return res;
  };
  res.status = (code) => { res.statusCode = code; return res; };
  res.type = (value) => { headers['content-type'] = value; return res; };
  res.send = (body) => { res.end(body); return res; };
  res.json = (value) => { res.bodyJson = value; res.end(JSON.stringify(value)); return res; };
  res.destroy = () => { res.destroyedByHandler = true; };
  res.body = () => Buffer.concat(chunks).toString();
  return res;
}

function buatReq(method, { token = 'valid-token', query = {}, rawBody, headers = {} } = {}) {
  return {
    method,
    query,
    rawBody,
    get: (name) => name.toLowerCase() === 'authorization'
      ? (token ? `Bearer ${token}` : undefined)
      : headers[name.toLowerCase()],
  };
}

test('validasi path lampiran hanya menerima segmen yang aman', () => {
  assert.equal(pathChatValid('chat/guru-a/d_guru-a_guru-b/file.pdf'), true);
  assert.equal(pathChatValid('chat/guru-a/d_guru-a_guru-b/../file.pdf'), false);
  assert.equal(pathChatValid('chat/guru-a/d_guru-a_guru-b/file.pdf/extra'), false);
});

test('menolak permintaan media tanpa token dan token yang tidak valid', async () => {
  const { chatAttachment } = buatLingkungan();
  for (const token of [null, 'bad-token']) {
    const res = buatRes();
    await chatAttachment(buatReq('GET', { token, query: { chatId: 'chat-a' } }), res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body(), 'Authentication required');
  }
});

test('menolak unggahan dan unduhan oleh pengguna yang bukan anggota sebelum mengakses Storage', async () => {
  const handlers = buatLingkungan({ anggota: false });
  const res = buatRes();
  await handlers.chatAttachment(buatReq('POST', {
    query: { chatId: 'chat-a' },
    rawBody: Buffer.from('file'),
    headers: { 'content-type': 'text/plain' },
  }), res);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(handlers.fileCalls, []);
});

test('unggahan anggota memakai nama aman dan metadata privat', async () => {
  const handlers = buatLingkungan();
  const res = buatRes();
  await handlers.chatAttachment(buatReq('POST', {
    query: { chatId: 'chat-a' },
    rawBody: Buffer.from('file'),
    headers: {
      'content-type': 'application/pdf',
      'x-file-name': encodeURIComponent('../laporan final.pdf'),
    },
  }), res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.bodyJson.fileName, 'laporan_final.pdf');
  assert.match(res.bodyJson.filePath, /^chat\/guru-a\/chat-a\/\d+_12345678-123_laporan_final\.pdf$/);
  assert.equal(res.bodyJson.type, 'file');
  const saved = handlers.fileCalls.find((call) => call.jenis === 'save');
  assert.deepEqual(saved.bytes, Buffer.from('file'));
  assert.equal(saved.options.metadata.contentType, 'application/pdf');
  assert.equal(saved.options.metadata.cacheControl, 'private, no-store');
});

test('unggahan tepat 2 MiB masih diizinkan', async () => {
  const handlers = buatLingkungan();
  const res = buatRes();
  await handlers.chatAttachment(buatReq('POST', {
    query: { chatId: 'chat-a' },
    rawBody: Buffer.alloc(2 * 1024 * 1024),
    headers: { 'content-type': 'application/pdf' },
  }), res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.bodyJson.fileSize, 2 * 1024 * 1024);
});

test('unggahan menolak tipe tak didukung, data kosong, dan ukuran melampaui batas', async () => {
  const handlers = buatLingkungan();
  const cases = [
    { type: 'image/svg+xml', body: Buffer.from('<svg/>') },
    { type: 'text/plain', body: Buffer.alloc(0) },
    { type: 'text/plain', body: Buffer.alloc(2 * 1024 * 1024 + 1) },
  ];
  for (const item of cases) {
    const res = buatRes();
    await handlers.chatAttachment(buatReq('POST', {
      query: { chatId: 'chat-a' },
      rawBody: item.body,
      headers: { 'content-type': item.type },
    }), res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(handlers.fileCalls.some((call) => call.jenis === 'save'), false);
});

test('unduhan anggota memvalidasi path dan mengirim berkas tanpa cache publik', async () => {
  const handlers = buatLingkungan({
    metadata: { size: 6, contentType: 'image/jpeg' },
    konten: Buffer.from('secret'),
  });
  const res = buatRes();
  await handlers.chatAttachment(buatReq('GET', {
    query: {
      chatId: 'chat-a',
      path: 'chat/guru-a/chat-a/1700000000000_file.jpg',
    },
  }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body(), 'secret');
  assert.equal(res.headers['cache-control'], 'private, no-store');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['content-disposition'], 'inline; filename="1700000000000_file.jpg"');
  assert.equal(handlers.fileCalls.filter((call) => call.jenis === 'metadata').length, 1);
  assert.equal(handlers.fileCalls.filter((call) => call.jenis === 'stream').length, 1);

  const invalid = buatRes();
  await handlers.chatAttachment(buatReq('GET', {
    query: { chatId: 'chat-b', path: 'chat/guru-a/chat-a/file.jpg' },
  }), invalid);
  assert.equal(invalid.statusCode, 400);
});

test('Word attachments are converted to permission-restricted PDF instead of being sent as Word', async () => {
  const word = Buffer.from('PK\x03\x04mock-docx');
  const pdf = Buffer.from('%PDF-locked');
  let called = false;
  const handlers = buatLingkungan({
    metadata: {
      size: word.length,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    },
    konten: word,
    converterUrl: 'https://converter.example.run.app',
    converterToken: 'private-token',
    converterFetch: async (url, options) => {
      called = true;
      assert.equal(url.toString(), 'https://converter.example.run.app/convert');
      assert.equal(options.headers.authorization, 'Bearer private-token');
      assert.deepEqual(options.body, word);
      return {
        ok: true,
        headers: { get: (name) => name === 'content-type' ? 'application/pdf' : null },
        arrayBuffer: async () => pdf
      };
    }
  });
  const res = buatRes();
  await handlers.chatAttachment(buatReq('GET', {
    query: { chatId: 'chat-a', path: 'chat/guru-a/chat-a/soal.docx' }
  }), res);

  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(Buffer.from(res.body()), pdf);
  assert.equal(res.headers['content-type'], 'application/pdf');
  assert.equal(res.headers['content-disposition'], 'attachment; filename="soal.pdf"');
  assert.equal(res.headers['cache-control'], 'private, no-store');
});

test('Word attachments fail closed when PDF conversion is not configured', async () => {
  const word = Buffer.from('PK\x03\x04mock-docx');
  const handlers = buatLingkungan({
    metadata: {
      size: word.length,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    },
    konten: word
  });
  const res = buatRes();
  await handlers.chatAttachment(buatReq('GET', {
    query: { chatId: 'chat-a', path: 'chat/guru-a/chat-a/soal.docx' }
  }), res);
  assert.equal(res.statusCode, 503);
  assert.match(res.body(), /conversion is not configured/);
  assert.equal(handlers.fileCalls.some((call) => call.jenis === 'stream'), false);
});

test('foto profil hanya melayani JPEG yang ukurannya dalam batas', async () => {
  const valid = buatLingkungan({
    metadata: { size: 6, contentType: 'image/jpeg' },
    konten: Buffer.from('photo!'),
  });
  const res = buatRes();
  await valid.profilePhoto(buatReq('GET', { query: { uid: 'siswa-a' } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body(), 'photo!');
  assert.equal(valid.fileCalls.filter((call) => call.jenis === 'metadata').length, 1);
  assert.deepEqual(valid.fileCalls.find((call) => call.jenis === 'file').path, 'fotoProfil/siswa-a.jpg');

  for (const metadata of [
    { size: 6, contentType: 'image/png' },
    { size: 2 * 1024 * 1024 + 1, contentType: 'image/jpeg' },
  ]) {
    const invalid = buatLingkungan({ metadata });
    const rejected = buatRes();
    await invalid.profilePhoto(buatReq('GET', { query: { uid: 'siswa-a' } }), rejected);
    assert.equal(rejected.statusCode, 415);
    assert.equal(invalid.fileCalls.some((call) => call.jenis === 'stream'), false);
  }
});
