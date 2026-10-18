'use strict';

const TIPE_LAMPIRAN_CHAT = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);
const BATAS_LAMPIRAN_CHAT = 2 * 1024 * 1024;
const BATAS_PDF_KONVERSI = 25 * 1024 * 1024;
const TIPE_WORD = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

function pathChatValid(path) {
  return typeof path === 'string' &&
    /^chat\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,160}\/[A-Za-z0-9_.-]{1,120}$/.test(path);
}

function createProtectedMediaHandlers({
  admin, logger, randomUUID, wordConverterUrl = () => '', wordConverterToken = () => '',
  converterFetch = fetch
}) {
  async function penggunaTerverifikasi(req, res) {
    const authorization = req.get('authorization') || '';
    const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization);
    if (!match) {
      res.status(401).send('Authentication required');
      return null;
    }

    try {
      return await admin.auth().verifyIdToken(match[1], true);
    } catch {
      res.status(401).send('Authentication required');
      return null;
    }
  }

  async function anggotaChat(chatId, uid) {
    const snapshot = await admin.database().ref(`chats/${chatId}/meta`).get();
    return snapshot.exists() && snapshot.child(`members/${uid}`).val() === true;
  }

  async function sajikanBerkasStorage(
    file,
    res,
    namaDefault,
    { batas, contentTypeDiizinkan, metadata: metadataDiketahui },
  ) {
    let metadata = metadataDiketahui;
    if (!metadata) {
      try {
        [metadata] = await file.getMetadata();
      } catch (error) {
        if (error.code === 404) {
          res.status(404).send('File not found');
          return;
        }
        logger.error('Protected media metadata lookup failed', { name: error?.name });
        res.status(500).send('Unable to read file');
        return;
      }
    }

    const ukuran = Number(metadata.size);
    const contentType = String(metadata.contentType || '');
    if (!Number.isSafeInteger(ukuran) || ukuran <= 0 || ukuran > batas ||
        !contentTypeDiizinkan(contentType)) {
      res.status(415).send('Unsupported file');
      return;
    }

    const nama = String(namaDefault || 'lampiran').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
    res.set({
      'Cache-Control': 'private, no-store',
      'Content-Length': String(ukuran),
      'Content-Disposition': `${contentType.startsWith('image/') ? 'inline' : 'attachment'}; filename="${nama || 'lampiran'}"`,
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    res.type(contentType);

    await new Promise((resolve) => {
      const stream = file.createReadStream();
      stream.once('error', (error) => {
        logger.error('Protected media stream failed', { name: error?.name });
        if (!res.headersSent) res.status(500).end('Unable to read file');
        else res.destroy();
        resolve();
      });
      res.once('finish', resolve);
      stream.pipe(res);
    });
  }

  async function chatAttachment(req, res) {
    res.set('Vary', 'Authorization');
    const token = await penggunaTerverifikasi(req, res);
    if (!token) return;

    const chatId = String(req.query.chatId || '');
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(chatId)) {
      res.status(400).send('Invalid conversation');
      return;
    }

    let anggota;
    try {
      anggota = await anggotaChat(chatId, token.uid);
    } catch (error) {
      logger.error('Chat membership lookup failed', { name: error?.name });
      res.status(503).send('Unable to verify conversation access');
      return;
    }
    if (!anggota) {
      res.status(403).send('Conversation access denied');
      return;
    }

    const bucket = admin.storage().bucket();
    if (req.method === 'POST') {
      const contentType = String(req.get('content-type') || '').toLowerCase();
      const bytes = req.rawBody;
      if (!TIPE_LAMPIRAN_CHAT.has(contentType) || !Buffer.isBuffer(bytes) ||
          bytes.length === 0 || bytes.length > BATAS_LAMPIRAN_CHAT) {
        res.status(400).send('Invalid file');
        return;
      }

      let nama = String(req.get('x-file-name') || 'berkas');
      try {
        nama = decodeURIComponent(nama);
      } catch {
        res.status(400).send('Invalid file name');
        return;
      }
      nama = nama.normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_')
        .replace(/^[._]+/, '').slice(-80) || 'berkas';
      const filePath = `chat/${token.uid}/${chatId}/${Date.now()}_${randomUUID().slice(0, 12)}_${nama}`;

      try {
        await bucket.file(filePath).save(bytes, {
          resumable: false,
          metadata: {
            contentType,
            cacheControl: 'private, no-store',
          },
        });
      } catch (error) {
        logger.error('Protected chat upload failed', { name: error?.name });
        res.status(500).send('Unable to upload file');
        return;
      }

      res.status(201).json({
        filePath,
        fileName: nama,
        fileSize: bytes.length,
        type: contentType.startsWith('image/') ? 'image' : 'file',
      });
      return;
    }

    if (req.method !== 'GET') {
      res.set('Allow', 'GET, POST').status(405).send('Method not allowed');
      return;
    }

    const filePath = req.query.path;
    if (!pathChatValid(filePath) || filePath.split('/')[2] !== chatId) {
      res.status(400).send('Invalid file path');
      return;
    }
    const file = bucket.file(filePath);
    let metadata;
    try {
      [metadata] = await file.getMetadata();
    } catch (error) {
      if (error.code === 404) {
        res.status(404).send('File not found');
        return;
      }
      logger.error('Protected chat attachment metadata lookup failed', { name: error?.name });
      res.status(500).send('Unable to read file');
      return;
    }
    if (TIPE_WORD.has(String(metadata.contentType || '').toLowerCase())) {
      await convertWordAttachment(file, metadata, filePath.split('/').at(-1), res);
      return;
    }
    await sajikanBerkasStorage(file, res, filePath.split('/').at(-1), {
      batas: BATAS_LAMPIRAN_CHAT,
      contentTypeDiizinkan: (type) => TIPE_LAMPIRAN_CHAT.has(type),
      metadata
    });
  }

  async function convertWordAttachment(file, metadata, originalName, res) {
    const size = Number(metadata.size);
    if (!Number.isSafeInteger(size) || size <= 0 || size > BATAS_LAMPIRAN_CHAT) {
      res.status(415).send('Unsupported Word document');
      return;
    }
    const rawUrl = typeof wordConverterUrl === 'function' ? wordConverterUrl() : wordConverterUrl;
    const token = typeof wordConverterToken === 'function' ? wordConverterToken() : wordConverterToken;
    let endpoint;
    try {
      endpoint = new URL('/convert', rawUrl);
    } catch {
      res.status(503).send('Word-to-PDF conversion is not configured');
      return;
    }
    if (endpoint.protocol !== 'https:' || !token) {
      res.status(503).send('Word-to-PDF conversion is not configured');
      return;
    }
    try {
      const [bytes] = await file.download();
      if (!Buffer.isBuffer(bytes) || bytes.length !== size) {
        res.status(422).send('Word document could not be read');
        return;
      }
      const converted = await converterFetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/octet-stream'
        },
        body: bytes,
        signal: AbortSignal.timeout(75_000)
      });
      if (!converted.ok) {
        logger.warn('Word-to-PDF converter rejected a document', { status: converted.status });
        res.status(converted.status === 422 ? 415 : 503).send('Word document could not be converted');
        return;
      }
      const pdf = Buffer.from(await converted.arrayBuffer());
      if (pdf.length === 0 || pdf.length > BATAS_PDF_KONVERSI ||
          converted.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/pdf') {
        logger.warn('Word-to-PDF converter returned an invalid response');
        res.status(502).send('PDF conversion failed');
        return;
      }
      const base = String(originalName || 'document').replace(/\.(docx?)$/i, '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100) || 'document';
      res.set({
        'Cache-Control': 'private, no-store',
        'Content-Length': String(pdf.length),
        'Content-Disposition': `attachment; filename="${base}.pdf"`,
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'same-origin'
      });
      res.type('application/pdf').status(200).send(pdf);
    } catch (error) {
      logger.error('Protected Word conversion failed', { name: error?.name });
      if (!res.headersSent) res.status(503).send('Word-to-PDF conversion is temporarily unavailable');
      else res.destroy();
    }
  }

  async function profilePhoto(req, res) {
    if (req.method !== 'GET') {
      res.set('Allow', 'GET').status(405).send('Method not allowed');
      return;
    }

    const token = await penggunaTerverifikasi(req, res);
    if (!token) return;

    const uid = String(req.query.uid || '');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
      res.status(400).send('Invalid user');
      return;
    }

    const file = admin.storage().bucket().file(`fotoProfil/${uid}.jpg`);
    let metadata;
    try {
      [metadata] = await file.getMetadata();
    } catch (error) {
      if (error.code === 404) {
        res.status(404).send('File not found');
        return;
      }
      logger.error('Protected profile photo lookup failed', { name: error?.name });
      res.status(500).send('Unable to read file');
      return;
    }
    if (metadata.contentType !== 'image/jpeg' || Number(metadata.size) > 2 * 1024 * 1024) {
      res.status(415).send('Unsupported file');
      return;
    }
    await sajikanBerkasStorage(file, res, 'profile.jpg', {
      batas: 2 * 1024 * 1024,
      contentTypeDiizinkan: (type) => type === 'image/jpeg',
      metadata,
    });
  }

  return { chatAttachment, profilePhoto };
}

module.exports = { createProtectedMediaHandlers, pathChatValid };
