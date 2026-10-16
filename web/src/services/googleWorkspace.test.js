import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { test } from 'node:test';
import { simpanFotoProfilDiDrive } from './googleWorkspace.js';

test('foto profil mengganti salinan milik pengguna yang sudah ada di Drive', async () => {
  const fetchSebelumnya = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    if (requests.length === 1) {
      return new Response(JSON.stringify({ files: [{ id: 'drive-file-123' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      id: 'drive-file-123',
      name: 'AI_nnoe-profile-photo.jpg',
      webViewLink: 'https://drive.google.com/file/d/drive-file-123/view',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const result = await simpanFotoProfilDiDrive(
      'access-token',
      'user_123',
      new File([new Uint8Array([1, 2, 3])], 'profile.jpg', { type: 'image/jpeg' }),
    );

    assert.equal(result.id, 'drive-file-123');
    assert.equal(requests.length, 2);
    assert.match(requests[0].url, /aleUid.*user_123/);
    assert.match(requests[0].url, /aleKind.*profile-photo/);
    assert.match(requests[1].url, /files\/drive-file-123\?uploadType=multipart/);
    assert.equal(requests[1].options.method, 'PATCH');
    assert.equal(requests[1].options.body.get('file').name, 'profile.jpg');
  } finally {
    globalThis.fetch = fetchSebelumnya;
  }
});

test('salinan foto profil menolak UID yang tidak valid tanpa memanggil Drive', async () => {
  await assert.rejects(
    simpanFotoProfilDiDrive('access-token', '../other-user', new File(
      [new Uint8Array([1])],
      'profile.jpg',
      { type: 'image/jpeg' },
    )),
    /Akun pengguna tidak valid/,
  );
});
