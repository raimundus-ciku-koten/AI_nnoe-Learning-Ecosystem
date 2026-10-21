import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { test } from 'node:test';
import { buatIdentitasEnkripsiDrive } from './driveEncryption.js';
import {
  daftarBerkasTerenkripsiDrive,
  daftarCatatanKerjaTerenkripsiDrive,
  daftarDenahTerenkripsiDrive,
  hapusCatatanKerjaTerenkripsiDrive,
  pulihkanCadanganKunciDariDrive,
  simpanCadanganKunciDrive,
  unggahLampiranChatDrive,
  unggahBerkasTerenkripsiDrive,
  unduhLampiranChatDrive,
  unduhBerkasTerenkripsiDrive,
} from './googleWorkspace.js';

test('mengunggah ciphertext dengan nama Drive generik dan manifest tanpa nama asli', async (t) => {
  const identity = await buatIdentitasEnkripsiDrive();
  const original = new File([new TextEncoder().encode('private assessment data')], 'grades-class-X.json', {
    type: 'application/json',
  });

  await t.test('menyimpan dan memuat catatan workspace hanya melalui kategori vault terenkripsi', async () => {
    const identity = await buatIdentitasEnkripsiDrive();
    const entry = {
      modulePath: '/refleksi/pembelajaran',
      moduleLabel: 'Refleksi',
      judul: 'Catatan rahasia',
      tanggal: '2026-10-18',
      kelas: '',
      mapel: '',
      isi: 'Isi catatan tidak boleh terbaca di Drive.',
      status: 'draf',
      createdAt: '2026-10-18T01:00:00.000Z',
      updatedAt: '2026-10-18T01:00:00.000Z',
    };
    const source = new File([JSON.stringify(entry)], 'workspace-note.json', {
      type: 'application/json',
    });
    const fetchSebelumnya = globalThis.fetch;
    let savedMetadata;
    let savedCiphertext;
    let uploadRequest;
    globalThis.fetch = async (url, options) => {
      const requestUrl = String(url);
      if (options.method === 'POST') {
        uploadRequest = { url: requestUrl, options };
        savedMetadata = JSON.parse(await options.body.get('metadata').text());
        savedCiphertext = new Uint8Array(await options.body.get('file').arrayBuffer());
        return Response.json({
          id: 'drive-workspace-entry',
          ...savedMetadata,
        });
      }
      if (requestUrl.includes('/files?')) {
        assert.match(requestUrl, /aleCategory/);
        return Response.json({
          files: [{
            id: 'drive-workspace-entry',
            ...savedMetadata,
            size: String(savedCiphertext.length),
          }],
        });
      }
      assert.match(requestUrl, /files\/drive-workspace-entry\?alt=media/);
      return new Response(savedCiphertext, { status: 200 });
    };

    try {
      const uploaded = await unggahBerkasTerenkripsiDrive(
        'google-access-token',
        'owner-user-id',
        identity,
        source,
        { category: 'teacher-workspace' },
      );
      const storedFile = uploadRequest.options.body.get('file');
      const decrypted = await daftarCatatanKerjaTerenkripsiDrive(
        'google-access-token',
        identity,
      );

      assert.equal(uploaded.id, 'drive-workspace-entry');
      assert.equal(savedMetadata.appProperties.aleCategory, 'teacher-workspace');
      assert.match(savedMetadata.name, /^ALE-Encrypted-/);
      assert.equal(Buffer.from(savedCiphertext).includes(Buffer.from(entry.isi)), false);
      assert.equal(Buffer.from(await storedFile.arrayBuffer()).includes(Buffer.from(entry.judul)), false);
      assert.deepEqual(decrypted.entries, [{
        id: 'drive-workspace-entry',
        ...entry,
        ciphertextSha256: JSON.parse(savedMetadata.description).ciphertextSha256,
      }]);
      assert.equal(decrypted.nextPageToken, null);
    } finally {
      globalThis.fetch = fetchSebelumnya;
    }
  });
  const fetchSebelumnya = globalThis.fetch;
  let uploadRequest;
  globalThis.fetch = async (url, options) => {
    uploadRequest = { url: String(url), options };
    return Response.json({
      id: 'drive-payload-id',
      name: 'ALE-Encrypted-record.bin',
      appProperties: { aleKind: 'ale-e2e-v1', aleRecord: '3b12f1df-5232-4804-897e-917bf397618a' },
    });
  };

  try {
    const saved = await unggahBerkasTerenkripsiDrive(
      'google-access-token',
      'owner-user-id',
      identity,
      original,
    );
    const metadata = JSON.parse(await uploadRequest.options.body.get('metadata').text());
    const uploadedBytes = new Uint8Array(await uploadRequest.options.body.get('file').arrayBuffer());

    assert.equal(saved.id, 'drive-payload-id');
    assert.match(metadata.name, /^ALE-Encrypted-[0-9a-f-]+\.bin$/);
    assert.equal(metadata.description.includes(original.name), false);
    assert.equal(metadata.appProperties.aleKind, 'ale-e2e-v1');
    assert.equal(Buffer.from(uploadedBytes).includes(Buffer.from('private assessment data')), false);
    assert.equal(uploadRequest.options.body.get('file').type, 'application/octet-stream');
    assert.match(uploadRequest.url, /uploadType=multipart/);
  } finally {
    globalThis.fetch = fetchSebelumnya;
  }
});

test('menyimpan dan memuat denah kelas hanya di kategori vault terenkripsi', async () => {
  const identity = await buatIdentitasEnkripsiDrive();
  const plan = {
    kelas: 'X-Rahasia',
    baris: 2,
    kolom: 2,
    kursi: { '0-0': 'student-private-id' },
    kelompok: { 'student-private-id': 1 },
    jumlahKelompok: 2,
    diperbarui: '2026-10-18T00:00:00.000Z',
  };
  const source = new File([JSON.stringify({
    denah: [plan],
    diperbarui: plan.diperbarui,
  })], 'teacher-seating.json', { type: 'application/json' });
  const fetchSebelumnya = globalThis.fetch;
  let metadata;
  let ciphertext;
  globalThis.fetch = async (url, options) => {
    const requestUrl = String(url);
    if (options.method === 'POST') {
      metadata = JSON.parse(await options.body.get('metadata').text());
      ciphertext = new Uint8Array(await options.body.get('file').arrayBuffer());
      return Response.json({ id: 'drive-seating', ...metadata });
    }
    if (requestUrl.includes('/files?')) {
      assert.match(requestUrl, /aleCategory/);
      return Response.json({
        files: [{
          id: 'drive-seating',
          ...metadata,
          size: String(ciphertext.length),
        }],
      });
    }
    assert.match(requestUrl, /files\/drive-seating\?alt=media/);
    return new Response(ciphertext, { status: 200 });
  };

  try {
    await unggahBerkasTerenkripsiDrive('token', 'owner', identity, source, {
      category: 'teacher-seating',
    });
    const loaded = await daftarDenahTerenkripsiDrive('token', identity);
    assert.equal(metadata.appProperties.aleCategory, 'teacher-seating');
    assert.equal(Buffer.from(ciphertext).includes(Buffer.from('student-private-id')), false);
    assert.deepEqual(loaded.plans, [plan]);
  } finally {
    globalThis.fetch = fetchSebelumnya;
  }
});

test('membuka berkas paket hanya untuk pemilik dan penerima key-envelope eksplisit', async () => {
  const ownerIdentity = await buatIdentitasEnkripsiDrive();
  const adminIdentity = await buatIdentitasEnkripsiDrive();
  const source = new File([JSON.stringify({ mapel: 'Konteks privat' })], 'planning.json', {
    type: 'application/json',
  });
  const fetchSebelumnya = globalThis.fetch;
  let metadata;
  let ciphertext;
  globalThis.fetch = async (url, options) => {
    const requestUrl = String(url);
    if (options.method === 'POST') {
      metadata = JSON.parse(await options.body.get('metadata').text());
      ciphertext = new Uint8Array(await options.body.get('file').arrayBuffer());
      return Response.json({ id: 'drive-planning', ...metadata });
    }
    if (requestUrl.includes('?alt=media')) return new Response(ciphertext, { status: 200 });
    throw new Error(`Unexpected Drive request: ${requestUrl}`);
  };

  try {
    const saved = await unggahBerkasTerenkripsiDrive(
      'token',
      '11111111-1111-4111-8111-111111111111',
      ownerIdentity,
      source,
      {
        category: 'planning-package',
        recipients: [
          {
            userId: '11111111-1111-4111-8111-111111111111',
            publicKey: ownerIdentity.publicKey,
            fingerprint: ownerIdentity.fingerprint,
            keyVersion: ownerIdentity.keyVersion,
          },
          {
            userId: '22222222-2222-4222-8222-222222222222',
            publicKey: adminIdentity.publicKey,
            fingerprint: adminIdentity.fingerprint,
            keyVersion: adminIdentity.keyVersion,
          },
        ],
      },
    );
    const manifest = JSON.parse(metadata.description);
    const file = { id: saved.id, ...metadata, manifest: {
      ...manifest,
      keyEnvelopes: manifest.keyEnvelopes,
    } };
    const opened = await unduhBerkasTerenkripsiDrive('token', file, adminIdentity);
    try {
      assert.equal(new TextDecoder().decode(opened.bytes), '{"mapel":"Konteks privat"}');
    } finally {
      opened.bytes.fill(0);
    }
    await assert.rejects(
      unduhBerkasTerenkripsiDrive('token', file, await buatIdentitasEnkripsiDrive()),
      /key-envelope/,
    );
    assert.equal(manifest.keyEnvelopes.length, 2);
    assert.equal(manifest.keyEnvelope.userId, '11111111-1111-4111-8111-111111111111');
  } finally {
    globalThis.fetch = fetchSebelumnya;
  }
});

test('memperbarui dan menghapus hanya catatan Drive terenkripsi yang cocok dengan kunci aktif', async () => {
  const identity = await buatIdentitasEnkripsiDrive();
  const source = new File([new TextEncoder().encode('workspace plaintext')], 'workspace-note.json', {
    type: 'application/json',
  });
  const fetchSebelumnya = globalThis.fetch;
  let metadata;
  let patchRequest;
  let ciphertextRevision;
  const file = {
    id: 'workspace-file-id',
    appProperties: {
      aleKind: 'ale-e2e-v1',
      aleRecord: '3b12f1df-5232-4804-897e-917bf397618a',
      aleCategory: 'teacher-workspace',
    },
    description: '',
    trashed: false,
  };
  globalThis.fetch = async (url, options) => {
    const requestUrl = String(url);
    if (requestUrl.includes('?fields=id,description,appProperties,trashed')) {
      return Response.json({ ...file, description: metadata.description });
    }
    if (options.method === 'PATCH') {
      patchRequest = { url: requestUrl, options };
      metadata = JSON.parse(await options.body.get('metadata').text());
      return Response.json({ ...file, ...metadata });
    }
    if (options.method === 'DELETE') return new Response(null, { status: 204 });
    if (options.method === 'POST') {
      metadata = JSON.parse(await options.body.get('metadata').text());
      ciphertextRevision = JSON.parse(metadata.description).ciphertextSha256;
      return Response.json({ id: file.id, ...metadata });
    }
    throw new Error(`Unexpected Drive request: ${requestUrl}`);
  };

  try {
    await unggahBerkasTerenkripsiDrive('token', 'owner', identity, source, {
      category: 'teacher-workspace',
    });
    await unggahBerkasTerenkripsiDrive('token', 'owner', identity, source, {
      category: 'teacher-workspace',
      fileId: file.id,
      expectedCiphertextSha256: ciphertextRevision,
    });
    assert.equal(patchRequest.options.method, 'PATCH');
    const patchMetadata = JSON.parse(await patchRequest.options.body.get('metadata').text());
    const patchCiphertext = new Uint8Array(await patchRequest.options.body.get('file').arrayBuffer());
    assert.equal(patchMetadata.appProperties.aleRecord, file.appProperties.aleRecord);
    assert.equal(patchMetadata.appProperties.aleCategory, 'teacher-workspace');
    assert.equal(Buffer.from(patchCiphertext).includes(Buffer.from('workspace plaintext')), false);

    await hapusCatatanKerjaTerenkripsiDrive('token', file.id, identity);
    await assert.rejects(
      unggahBerkasTerenkripsiDrive('token', 'owner', identity, source, {
        category: 'other',
        fileId: file.id,
      }),
      /kategori atau kunci pemilik aktif/,
    );
  } finally {
    globalThis.fetch = fetchSebelumnya;
  }
});

test('membuka file Drive hanya setelah validasi manifest, checksum, dan kunci pemilik', async () => {
  const identity = await buatIdentitasEnkripsiDrive();
  const originalBytes = new TextEncoder().encode('report content');
  const fetchSebelumnya = globalThis.fetch;
  let manifest;
  let uploadedCiphertext;
  globalThis.fetch = async (_url, options) => {
    const metadata = JSON.parse(await options.body.get('metadata').text());
    manifest = JSON.parse(metadata.description);
    uploadedCiphertext = new Uint8Array(await options.body.get('file').arrayBuffer());
    return Response.json({
      id: 'drive-vault-entry',
      name: metadata.name,
      description: metadata.description,
      appProperties: metadata.appProperties,
    });
  };

  try {
    const saved = await unggahBerkasTerenkripsiDrive(
      'google-access-token',
      'owner-user-id',
      identity,
      new File([originalBytes], 'confidential.txt', { type: 'text/plain' }),
    );
    globalThis.fetch = async (url, options) => {
      assert.match(String(url), /files\/drive-vault-entry\?alt=media/);
      assert.equal(options.headers.Authorization, 'Bearer google-access-token');
      return new Response(uploadedCiphertext, { status: 200 });
    };
    const plaintext = await unduhBerkasTerenkripsiDrive('google-access-token', saved, identity);
    assert.deepEqual(plaintext.bytes, originalBytes);
    assert.equal(plaintext.name, 'confidential.txt');
    assert.equal(plaintext.mimeType, 'text/plain');
    assert.equal(manifest.keyEnvelope.recipientKeyFingerprint, identity.fingerprint);
    await assert.rejects(
      unduhBerkasTerenkripsiDrive('google-access-token', saved, identity, {
        recipientId: 'different-recipient',
      }),
      /key-envelope untuk kunci aktif/,
    );
    globalThis.fetch = async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(uploadedCiphertext);
        controller.enqueue(new Uint8Array(uploadedCiphertext.length));
        controller.close();
      },
    }));
    await assert.rejects(
      unduhBerkasTerenkripsiDrive('google-access-token', saved, identity, {
        maxCiphertextSize: manifest.ciphertextSizeBytes,
      }),
      /melebihi batas ukuran/,
    );
  } finally {
    globalThis.fetch = fetchSebelumnya;
  }
});

test('mendaftarkan dan mengambil hanya cadangan kunci terenkripsi milik aplikasi', async () => {
  const identity = await buatIdentitasEnkripsiDrive();
  const backup = identity.encryptedPrivateKeyBackup;
  const fetchSebelumnya = globalThis.fetch;
  let backupBytes;
  let uploadMetadata;
  globalThis.fetch = async (url, options) => {
    uploadMetadata = JSON.parse(await options.body.get('metadata').text());
    backupBytes = await options.body.get('file').arrayBuffer();
    return Response.json({ id: 'drive-key-backup', appProperties: uploadMetadata.appProperties });
  };

  try {
    const stored = await simpanCadanganKunciDrive('google-access-token', backup);
    assert.equal(stored.id, 'drive-key-backup');
    assert.equal(uploadMetadata.appProperties.aleKind, 'ale-key-backup-v1');
    assert.equal(uploadMetadata.name, 'ALE-Recovery-v1.json');
    assert.equal(new TextDecoder().decode(backupBytes).includes(identity.recoveryCode), false);

    globalThis.fetch = async (url) => {
      if (String(url).includes('?fields=id,appProperties,trashed')) {
        return Response.json({
          id: 'drive-key-backup',
          trashed: false,
          appProperties: { aleKind: 'ale-key-backup-v1', aleFingerprint: identity.fingerprint },
        });
      }
      assert.match(String(url), /files\/drive-key-backup\?alt=media/);
      return new Response(backupBytes, { status: 200 });
    };
    const restoredBackup = await pulihkanCadanganKunciDariDrive('google-access-token', stored.id);
    assert.deepEqual(restoredBackup, backup);
  } finally {
    globalThis.fetch = fetchSebelumnya;
  }
});

test('menolak metadata vault yang tidak valid tanpa meminta isi file', async () => {
  const fetchSebelumnya = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ files: [{
    id: 'untrusted',
    appProperties: { aleKind: 'unexpected-kind' },
  }] });
  try {
    await assert.rejects(daftarBerkasTerenkripsiDrive('google-access-token'), /Metadata vault Drive tidak valid/);
  } finally {
    globalThis.fetch = fetchSebelumnya;
  }
});

test('menolak token kosong, ID cadangan invalid, dan error Google non-JSON dengan jelas', async () => {
  const fetchSebelumnya = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response('layanan tidak tersedia', { status: 503 });
  };

  try {
    await assert.rejects(daftarBerkasTerenkripsiDrive(''), /Hubungkan akun Google/);
    await assert.rejects(pulihkanCadanganKunciDariDrive('google-access-token', '../invalid'), /ID cadangan Drive tidak valid/);
    assert.equal(calls, 0);
    await assert.rejects(daftarBerkasTerenkripsiDrive('google-access-token'), /HTTP 503/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = fetchSebelumnya;
  }
});

test('mengunggah lampiran chat terenkripsi dan hanya membagikan ke email peserta', async () => {
  const owner = await buatIdentitasEnkripsiDrive();
  const recipient = await buatIdentitasEnkripsiDrive();
  const source = new File([new TextEncoder().encode('private chat file')], 'rahasia.txt', {
    type: 'text/plain',
  });
  const fetchSebelumnya = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    const requestUrl = String(url);
    requests.push({ url: requestUrl, options });
    if (requestUrl.includes('/upload/')) {
      const metadata = JSON.parse(await options.body.get('metadata').text());
      return Response.json({ id: 'drive-chat-file', ...metadata });
    }
    if (requestUrl.includes('/permissions?')) return Response.json({ id: 'reader-permission' });
    throw new Error(`Unexpected Drive request: ${requestUrl}`);
  };

  try {
    const saved = await unggahLampiranChatDrive(
      'google-access-token',
      'owner-id',
      owner,
      source,
      [{
        userId: 'recipient-id',
        email: 'recipient@example.test',
        publicKey: recipient.publicKey,
        fingerprint: recipient.fingerprint,
        keyVersion: recipient.keyVersion,
      }],
    );
    const uploadMetadata = JSON.parse(
      await requests[0].options.body.get('metadata').text(),
    );
    const permission = requests.find((request) => request.url.includes('/permissions?'));

    assert.equal(saved.driveFileId, 'drive-chat-file');
    assert.equal(uploadMetadata.appProperties.aleCategory, 'communication');
    assert.equal(uploadMetadata.name.includes(source.name), false);
    assert.equal(uploadMetadata.description.includes(source.name), false);
    assert.equal(saved.manifest.keyEnvelopes.length, 2);
    assert.equal(permission.options.body.includes('recipient@example.test'), true);
    assert.match(permission.url, /sendNotificationEmail=false/);
  } finally {
    globalThis.fetch = fetchSebelumnya;
  }
});

test('membersihkan file dan izin Drive bila berbagi lampiran gagal', async () => {
  const owner = { ...(await buatIdentitasEnkripsiDrive()), userId: 'owner-id' };
  const recipientA = await buatIdentitasEnkripsiDrive();
  const recipientB = await buatIdentitasEnkripsiDrive();
  const source = new File([new TextEncoder().encode('private chat file')], 'rahasia.txt', {
    type: 'text/plain',
  });
  const fetchSebelumnya = globalThis.fetch;
  const calls = [];
  let permissionAttempts = 0;
  globalThis.fetch = async (url, options) => {
    const requestUrl = String(url);
    calls.push({ url: requestUrl, options });
    if (requestUrl.includes('/upload/')) {
      const metadata = JSON.parse(await options.body.get('metadata').text());
      return Response.json({ id: 'drive-chat-file', ...metadata });
    }
    if (requestUrl.includes('/permissions?')) {
      permissionAttempts += 1;
      return permissionAttempts === 1
        ? Response.json({ id: 'first-permission' })
        : Response.json({ error: { message: 'share denied' } }, { status: 403 });
    }
    if (requestUrl.endsWith('/files/drive-chat-file?fields=id,description,appProperties,trashed')) {
      const upload = calls.find((call) => call.url.includes('/upload/'));
      const metadata = JSON.parse(await upload.options.body.get('metadata').text());
      return Response.json({ id: 'drive-chat-file', trashed: false, ...metadata });
    }
    if (requestUrl.endsWith('/permissions/first-permission') ||
        requestUrl.endsWith('/files/drive-chat-file')) return new Response(null, { status: 204 });
    throw new Error(`Unexpected Drive request: ${requestUrl}`);
  };

  try {
    await assert.rejects(unggahLampiranChatDrive(
      'google-access-token',
      'owner-id',
      owner,
      source,
      [
        {
          userId: 'recipient-a',
          email: 'recipient-a@example.test',
          publicKey: recipientA.publicKey,
          fingerprint: recipientA.fingerprint,
          keyVersion: recipientA.keyVersion,
        },
        {
          userId: 'recipient-b',
          email: 'recipient-b@example.test',
          publicKey: recipientB.publicKey,
          fingerprint: recipientB.fingerprint,
          keyVersion: recipientB.keyVersion,
        },
      ],
    ), /share denied/);
    assert.ok(calls.some((call) => call.url.endsWith('/permissions/first-permission')));
    assert.ok(calls.some((call) => call.url.endsWith('/files/drive-chat-file')));
  } finally {
    globalThis.fetch = fetchSebelumnya;
  }
});

test('mendekripsi lampiran penerima hanya setelah mencocokkan checksum dan ukuran tersimpan', async () => {
  const owner = await buatIdentitasEnkripsiDrive();
  const recipient = await buatIdentitasEnkripsiDrive();
  const sourceBytes = new TextEncoder().encode('encrypted chat message');
  const source = new File([sourceBytes], 'private-note.txt', { type: 'text/plain' });
  const fetchSebelumnya = globalThis.fetch;
  let metadata;
  let ciphertext;
  globalThis.fetch = async (url, options) => {
    const requestUrl = String(url);
    if (options?.method === 'POST') {
      metadata = JSON.parse(await options.body.get('metadata').text());
      ciphertext = new Uint8Array(await options.body.get('file').arrayBuffer());
      return Response.json({ id: 'drive-chat-file', ...metadata });
    }
    if (requestUrl.endsWith('/files/drive-chat-file?fields=id,description,appProperties,trashed')) {
      return Response.json({ id: 'drive-chat-file', trashed: false, ...metadata });
    }
    if (requestUrl.endsWith('/files/drive-chat-file?alt=media')) {
      return new Response(ciphertext, { status: 200 });
    }
    throw new Error(`Unexpected Drive request: ${requestUrl}`);
  };

  try {
    const uploaded = await unggahBerkasTerenkripsiDrive(
      'google-access-token',
      'owner-id',
      owner,
      source,
      {
        category: 'communication',
        recipients: [
          { userId: 'owner-id', ...owner },
          {
            userId: 'recipient-id',
            publicKey: recipient.publicKey,
            fingerprint: recipient.fingerprint,
            keyVersion: recipient.keyVersion,
          },
        ],
      },
    );
    const content = await unduhLampiranChatDrive(
      'google-access-token',
      'drive-chat-file',
      {
        ciphertextSha256: uploaded.manifest.ciphertextSha256,
        ciphertextSizeBytes: uploaded.manifest.ciphertextSizeBytes,
        encryptionVersion: uploaded.manifest.version,
        fileSize: source.size,
        type: 'file',
        wrappedDataKey: uploaded.manifest.keyEnvelopes.find(
          (entry) => entry.userId === 'recipient-id',
        ).wrappedDataKey,
      },
      { ...recipient, userId: 'recipient-id' },
    );

    assert.deepEqual(content.bytes, sourceBytes);
    assert.equal(content.name, source.name);
    assert.equal(content.mimeType, source.type);
    await assert.rejects(unduhLampiranChatDrive(
      'google-access-token',
      'drive-chat-file',
      {
        ciphertextSha256: '0'.repeat(64),
        ciphertextSizeBytes: uploaded.manifest.ciphertextSizeBytes,
        encryptionVersion: uploaded.manifest.version,
        fileSize: source.size,
        type: 'file',
        wrappedDataKey: uploaded.manifest.keyEnvelopes.find(
          (entry) => entry.userId === 'recipient-id',
        ).wrappedDataKey,
      },
      { ...recipient, userId: 'recipient-id' },
    ), /tidak cocok dengan metadata chat/);
  } finally {
    globalThis.fetch = fetchSebelumnya;
  }
});
