import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { test } from 'node:test';
import {
  bukaPemilihPaketDrive,
  buatSpreadsheetDenganData,
  daftarPaketPerencanaanTerenkripsiDrive,
  simpanFotoProfilDiDrive,
} from './googleWorkspace.js';

test('Google Sheets membuat spreadsheet dan menulis data sebagai nilai mentah', async () => {
  const fetchSebelumnya = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return requests.length === 1
      ? Response.json({
        spreadsheetId: 'sheet_123',
        spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet_123/edit',
        sheets: [{ properties: { sheetId: 0, title: 'Data' } }],
      })
      : Response.json({ updatedCells: 4 });
  };

  try {
    const result = await buatSpreadsheetDenganData('sheets-token', {
      judul: 'Rekap kelas',
      values: [['Nama', 'Catatan'], ['Ayu', '=HYPERLINK("https://example.com")']],
    });
    assert.deepEqual(result, {
      spreadsheetId: 'sheet_123',
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet_123/edit',
    });
    assert.equal(requests.length, 2);
    assert.equal(requests[0].options.method, 'POST');
    assert.match(requests[0].url, /sheets\.googleapis\.com\/v4\/spreadsheets$/);
    assert.match(requests[1].url, /values\/Data!A1\?valueInputOption=RAW$/);
    assert.equal(requests[1].options.method, 'PUT');
    assert.deepEqual(JSON.parse(requests[1].options.body).values[1][1], '=HYPERLINK("https://example.com")');
  } finally {
    globalThis.fetch = fetchSebelumnya;
  }
});

test('Google Sheets menolak matriks terlalu besar sebelum memanggil API', async () => {
  const fetchSebelumnya = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return Response.json({});
  };
  try {
    await assert.rejects(
      buatSpreadsheetDenganData('sheets-token', {
        judul: 'Rekap',
        values: Array.from({ length: 501 }, () => ['data']),
      }),
      /1 sampai 500 baris/,
    );
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = fetchSebelumnya;
  }
});

test('Google Sheets menolak URL hasil API di luar docs.google.com', async () => {
  const fetchSebelumnya = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({
      spreadsheetId: 'sheet_123',
      spreadsheetUrl: 'https://attacker.example/sheet',
      sheets: [{ properties: { sheetId: 0, title: 'Data' } }],
    });
  };

  try {
    await assert.rejects(
      buatSpreadsheetDenganData('sheets-token', {
        judul: 'Rekap kelas',
        values: [['Nama']],
      }),
      /alamat spreadsheet yang tidak aman/,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = fetchSebelumnya;
  }
});

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

test('Google Picker uses narrow OAuth access and returns only valid Drive file IDs', async () => {
  const gapiSebelumnya = globalThis.gapi;
  const googleSebelumnya = globalThis.google;
  let callback;
  let visible = false;
  let appId;
  let developerKey;

  class DocsView {
    constructor(viewId) {
      assert.equal(viewId, 'DOCS');
    }
    setIncludeFolders(value) { assert.equal(value, false); return this; }
    setMimeTypes(value) { assert.equal(value, 'application/octet-stream'); return this; }
    setQuery(value) { assert.equal(value, 'ALE-Encrypted-'); return this; }
  }
  class PickerBuilder {
    addView() { return this; }
    setOAuthToken(value) { assert.equal(value, 'google-token'); return this; }
    setDeveloperKey(value) { developerKey = value; return this; }
    setAppId(value) { appId = value; return this; }
    setTitle(value) { assert.match(value, /paket perencanaan/); return this; }
    enableFeature(value) { assert.equal(value, 'MULTISELECT_ENABLED'); return this; }
    setCallback(value) { callback = value; return this; }
    build() {
      return { setVisible: (value) => { visible = value; } };
    }
  }
  globalThis.gapi = { load: () => assert.fail('Picker API should already be available') };
  globalThis.google = {
    picker: {
      Action: { CANCEL: 'cancel', PICKED: 'picked' },
      DocsView,
      Feature: { MULTISELECT_ENABLED: 'MULTISELECT_ENABLED' },
      PickerBuilder,
      ViewId: { DOCS: 'DOCS' },
    },
  };

  try {
    const selectedPromise = bukaPemilihPaketDrive('google-token', {
      apiKey: 'public-api-key',
      oauthClientId: '1234567890-client.apps.googleusercontent.com',
    });
    await Promise.resolve();
    assert.equal(visible, true);
    assert.equal(appId, '1234567890');
    assert.equal(developerKey, 'public-api-key');
    callback({
      action: 'picked',
      docs: [{ id: 'file_123' }, { id: 'file_123' }, { id: 'file-456' }],
    });
    assert.deepEqual(await selectedPromise, ['file_123', 'file-456']);
  } finally {
    globalThis.gapi = gapiSebelumnya;
    globalThis.google = googleSebelumnya;
  }
});

test('Google Picker fails clearly when its public API key is not configured', async () => {
  await assert.rejects(
    bukaPemilihPaketDrive('google-token', {
      apiKey: '',
      oauthClientId: '1234567890-client.apps.googleusercontent.com',
    }),
    /VITE_GOOGLE_API_KEY/,
  );
});

test('selected Google Picker file is fetched directly and checked as an encrypted planning package', async () => {
  const fetchSebelumnya = globalThis.fetch;
  const requests = [];
  const file = {
    id: 'shared_file_123',
    name: 'ALE-Encrypted-package.bin',
    description: JSON.stringify({
      version: 1,
      iv: 'iv-value',
      ciphertextSha256: 'a'.repeat(64),
      ciphertextSizeBytes: 256,
      keyEnvelopes: [{
        userId: 'owner-1',
        wrappedDataKey: 'wrapped-key',
        recipientKeyFingerprint: 'b'.repeat(64),
        keyVersion: 1,
      }],
    }),
    appProperties: {
      aleKind: 'ale-e2e-v1',
      aleRecord: '22222222-2222-4222-8222-222222222222',
      aleCategory: 'planning-package',
    },
    trashed: false,
  };
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    const result = String(url).includes('/files?') ? { files: [] } : file;
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const files = await daftarPaketPerencanaanTerenkripsiDrive(
      'google-token',
      ['shared_file_123'],
    );
    assert.equal(files.length, 1);
    assert.equal(files[0].id, 'shared_file_123');
    assert.equal(files[0].manifest.keyEnvelopes[0].userId, 'owner-1');
    assert.match(requests[1].url, /files\/shared_file_123/);

    requests.length = 0;
    await daftarPaketPerencanaanTerenkripsiDrive(
      'google-token',
      ['shared_file_123'],
      { includeCreatedFiles: false },
    );
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /files\/shared_file_123/);
  } finally {
    globalThis.fetch = fetchSebelumnya;
  }
});
