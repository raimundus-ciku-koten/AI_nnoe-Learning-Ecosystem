import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  hubungkanGoogleCalendarUntukPengguna,
  hubungkanGoogleDriveUntukPengguna,
  hubungkanGoogleMeetUntukPengguna,
  hubungkanGoogleSheetsUntukPengguna,
  hubungkanGoogleTasksUntukPengguna,
  hapusSesiGoogleWorkspace,
  hubungkanGoogleWorkspaceLangsung,
  hubungkanGoogleWorkspaceUntukPengguna,
  tokenGoogleWorkspacePerPengguna,
} from './googleWorkspaceAuth.js';

const clientId = '1234567890-example.apps.googleusercontent.com';
const email = 'teacher@example.edu';

function mockGoogle(callback) {
  const previousGoogle = Object.getOwnPropertyDescriptor(globalThis, 'google');
  const previousFetch = globalThis.fetch;
  let tokenOptions;
  let tokenRequest;
  globalThis.google = {
    accounts: {
      oauth2: {
        initTokenClient(options) {
          tokenOptions = options;
          return {
            requestAccessToken(request) {
              tokenRequest = request;
              callback(options);
            },
          };
        },
      },
    },
  };
  return {
    get tokenOptions() { return tokenOptions; },
    get tokenRequest() { return tokenRequest; },
    restore() {
      if (previousGoogle) Object.defineProperty(globalThis, 'google', previousGoogle);
      else delete globalThis.google;
      globalThis.fetch = previousFetch;
    },
  };
}

test('OAuth Drive hanya meminta identitas dasar dan akses file aplikasi', async () => {
  const googleMock = mockGoogle((options) => {
    options.callback({
      access_token: 'short-lived-token',
      expires_in: 3600,
      scope: options.scope,
    });
  });
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), 'https://www.googleapis.com/oauth2/v3/userinfo');
    assert.equal(options.headers.Authorization, 'Bearer short-lived-token');
    return Response.json({ email, email_verified: true });
  };

  try {
    const result = await hubungkanGoogleWorkspaceLangsung(clientId, email);
    assert.equal(result.email, email);
    assert.equal(result.accessToken, 'short-lived-token');
    assert.ok(result.expiresAt > Date.now());
    assert.equal(googleMock.tokenOptions.client_id, clientId);
    assert.match(googleMock.tokenOptions.scope, /drive\.file/);
    assert.equal(googleMock.tokenOptions.scope, 'openid email https://www.googleapis.com/auth/drive.file');
    assert.equal(googleMock.tokenOptions.include_granted_scopes, false);
    assert.deepEqual(googleMock.tokenRequest, { prompt: 'consent', login_hint: email });
  } finally {
    googleMock.restore();
  }
});

test('OAuth Google Meet meminta cakupan non-sensitif hanya ketika diperlukan', async () => {
  const googleMock = mockGoogle((options) => {
    options.callback({
      access_token: 'meet-only-token',
      expires_in: 3600,
      scope: options.scope,
    });
  });
  globalThis.fetch = async () => Response.json({ email, email_verified: true });

  try {
    const session = await hubungkanGoogleMeetUntukPengguna({
      id: 'app-user-meet',
      email,
    }, clientId);
    assert.equal(session.accessToken, 'meet-only-token');
    assert.equal(session.userId, 'app-user-meet');
    assert.equal(
      googleMock.tokenOptions.scope,
      'openid email https://www.googleapis.com/auth/meetings.space.created',
    );
    assert.equal(googleMock.tokenOptions.include_granted_scopes, false);
    assert.deepEqual(googleMock.tokenRequest, { prompt: 'consent', login_hint: email });
  } finally {
    googleMock.restore();
  }
});

test('koneksi Sheets hanya meminta identitas dasar dan cakupan Sheets', async () => {
  const googleMock = mockGoogle((options) => {
    options.callback({
      access_token: 'sheets-only-token',
      expires_in: 3600,
      scope: options.scope,
    });
  });
  globalThis.fetch = async () => Response.json({ email, email_verified: true });

  try {
    const session = await hubungkanGoogleSheetsUntukPengguna({
      id: 'app-user-sheets',
      email,
    }, clientId);
    assert.equal(session.userId, 'app-user-sheets');
    assert.equal(session.accessToken, 'sheets-only-token');
    assert.equal(
      googleMock.tokenOptions.scope,
      'openid email https://www.googleapis.com/auth/spreadsheets',
    );
    assert.doesNotMatch(googleMock.tokenOptions.scope, /drive\.file|calendar|gmail/);
    assert.equal(googleMock.tokenOptions.include_granted_scopes, false);
  } finally {
    googleMock.restore();
  }
});

test('Calendar dan Tasks meminta cakupan terpisah tanpa mengakumulasi grant lain', async () => {
  const googleMock = mockGoogle((options) => {
    options.callback({
      access_token: 'service-token',
      expires_in: 3600,
      scope: options.scope,
    });
  });
  globalThis.fetch = async () => Response.json({ email, email_verified: true });

  try {
    const calendar = await hubungkanGoogleCalendarUntukPengguna({ id: 'app-user', email }, clientId);
    assert.equal(calendar.userId, 'app-user');
    assert.equal(
      googleMock.tokenOptions.scope,
      'openid email https://www.googleapis.com/auth/calendar.events',
    );
    assert.equal(googleMock.tokenOptions.include_granted_scopes, false);

    const tasks = await hubungkanGoogleTasksUntukPengguna({ id: 'app-user', email }, clientId);
    assert.equal(tasks.userId, 'app-user');
    assert.equal(
      googleMock.tokenOptions.scope,
      'openid email https://www.googleapis.com/auth/tasks',
    );
    assert.equal(googleMock.tokenOptions.include_granted_scopes, false);
  } finally {
    googleMock.restore();
  }
});

test('OAuth Workspace menolak akun Google yang berbeda atau tidak diverifikasi', async () => {
  const googleMock = mockGoogle((options) => {
    options.callback({
      access_token: 'short-lived-token',
      expires_in: 3600,
      scope: options.scope,
    });
  });
  globalThis.fetch = async () => Response.json({
    email: 'someone-else@example.edu',
    email_verified: true,
  });

  try {
    await assert.rejects(
      hubungkanGoogleWorkspaceLangsung(clientId, email),
      /alamat email yang sama/,
    );
  } finally {
    googleMock.restore();
  }
});

test('OAuth Workspace menolak konfigurasi client atau token yang invalid sebelum akses profil', async () => {
  let fetchCalled = false;
  const googleMock = mockGoogle((options) => {
    options.callback({
      access_token: 'expired-token',
      expires_in: 30,
      scope: options.scope,
    });
  });
  globalThis.fetch = async () => {
    fetchCalled = true;
    return Response.json({});
  };

  try {
    await assert.rejects(
      hubungkanGoogleWorkspaceLangsung('', email),
      /VITE_GOOGLE_OAUTH_CLIENT_ID/,
    );
    await assert.rejects(
      hubungkanGoogleWorkspaceLangsung(clientId, email),
      /access token yang valid/,
    );
    assert.equal(fetchCalled, false);
  } finally {
    googleMock.restore();
  }
});

test('sesi token Workspace diikat ke ID pengguna aplikasi dan dapat dicabut', async () => {
  const googleMock = mockGoogle((options) => {
    options.callback({
      access_token: 'bound-token',
      expires_in: 3600,
      scope: options.scope,
    });
  });
  globalThis.fetch = async () => Response.json({ email, email_verified: true });

  try {
    const session = await hubungkanGoogleWorkspaceUntukPengguna({
      id: 'app-user-1',
      email,
    }, clientId);
    assert.equal(session.userId, 'app-user-1');
    assert.equal(tokenGoogleWorkspacePerPengguna('app-user-1'), 'bound-token');
    assert.equal(tokenGoogleWorkspacePerPengguna('other-user'), '');
    assert.equal(tokenGoogleWorkspacePerPengguna('app-user-1'), '');
    hapusSesiGoogleWorkspace('app-user-1');
    assert.equal(tokenGoogleWorkspacePerPengguna('app-user-1'), '');
  } finally {
    googleMock.restore();
  }
});

test('koneksi Drive untuk catatan pribadi hanya meminta cakupan Drive yang dibutuhkan', async () => {
  const googleMock = mockGoogle((options) => {
    options.callback({
      access_token: 'drive-only-token',
      expires_in: 3600,
      scope: options.scope,
    });
  });
  globalThis.fetch = async () => Response.json({ email, email_verified: true });

  try {
    const session = await hubungkanGoogleDriveUntukPengguna({
      id: 'app-user-drive',
      email,
    }, clientId);
    assert.equal(session.accessToken, 'drive-only-token');
    assert.equal(googleMock.tokenOptions.scope, 'https://www.googleapis.com/auth/drive.file');
    assert.equal(googleMock.tokenOptions.include_granted_scopes, false);
  } finally {
    googleMock.restore();
  }
});
