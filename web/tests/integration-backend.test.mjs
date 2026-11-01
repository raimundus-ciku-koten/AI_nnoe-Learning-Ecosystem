import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const {
  decryptSecret,
  encryptSecret,
  hash,
} = require('../../api/_lib/common.js');
const { containsLikelyPersonalData } = require('../../api/_lib/privacy.js');
const { normalizeItem } = require('../../api/_lib/sync.js');
const { SCOPES } = require('../../api/_lib/google.js');
const {
  googleCallbackHandler: authGoogleCallbackHandler,
  googleStartHandler: authGoogleStartHandler,
  loginHandler: authLoginHandler,
  recoveryCallbackHandler,
  sessionHandler: authSessionHandler,
  signupHandler: authSignupHandler,
} = require('../../api/_lib/auth-session.js');
const aiHandler = require('../../api/ai.js');
const startGoogleHandler = require('../../api/connections/start.js');
const googleCallbackHandler = require('../../api/google/callback.js');

function createResponseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name] = value; },
    getHeader(name) { return this.headers[name]; },
    end(value = '') { this.body = value; },
  };
}

function cookieFromResponse(res, name) {
  const setCookies = Array.isArray(res.headers['Set-Cookie'])
    ? res.headers['Set-Cookie']
    : [res.headers['Set-Cookie']];
  const cookie = setCookies.find((value) => value?.startsWith(`${name}=`));
  return cookie?.split(';', 1)[0].slice(name.length + 1);
}

function withEncryptionKey(action) {
  const previous = process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY;
  process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  try {
    return action();
  } finally {
    if (previous === undefined) delete process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY;
    else process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY = previous;
  }
}

function saveEnv(names) {
  return Object.fromEntries(names.map((name) => [name, process.env[name]]));
}

function restoreEnv(values) {
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function setupIntegrationEnv() {
  process.env.SUPABASE_URL = 'https://supabase.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key';
  process.env.APP_ORIGIN = 'https://app.example';
  process.env.GOOGLE_OAUTH_CLIENT_ID = '123.apps.googleusercontent.com';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'google-secret';
  process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY_VERSION = '1';
}

test('refresh token memakai AES-256-GCM dan ciphertext tidak deterministik', () => withEncryptionKey(() => {
  const first = encryptSecret('google-refresh-token');
  const second = encryptSecret('google-refresh-token');
  assert.notEqual(first, second);
  assert.equal(decryptSecret(first), 'google-refresh-token');
  assert.equal(decryptSecret(second), 'google-refresh-token');
  assert.throws(() => decryptSecret(`${first.slice(0, -2)}aa`), /tidak dapat didekripsi/);
}));

test('kunci enkripsi token invalid ditolak dengan error eksplisit', () => {
  const previous = process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY;
  process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString('base64');
  try {
    assert.throws(() => encryptSecret('token'), /harus berupa 32 byte base64/);
  } finally {
    if (previous === undefined) delete process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY;
    else process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY = previous;
  }
});

test('OAuth Google meminta scope terpisah dan paling terbatas sesuai layanan', () => {
  assert.equal(SCOPES.drive, 'https://www.googleapis.com/auth/drive.file');
  assert.equal(SCOPES.tasks, 'https://www.googleapis.com/auth/tasks');
  assert.equal(SCOPES.calendar, 'https://www.googleapis.com/auth/calendar.events.owned');
  assert.equal(new Set(Object.values(SCOPES)).size, 3);
});

test('BFF password login menyimpan refresh token di HttpOnly cookie dan hanya mengembalikan sentinel', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = saveEnv([
    'SUPABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'APP_ORIGIN',
  ]);
  process.env.SUPABASE_URL = 'https://supabase.example';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  process.env.APP_ORIGIN = 'https://app.example';
  let upstream;
  globalThis.fetch = async (url, options) => {
    upstream = { url: String(url), options };
    return Response.json({
      access_token: 'short-lived-access',
      refresh_token: 'server-only-refresh',
      expires_in: 3600,
      user: { id: 'user-1', email: 'teacher@example.edu' },
    });
  };
  try {
    const res = createResponseRecorder();
    await authLoginHandler({
      method: 'POST',
      headers: { origin: 'https://app.example' },
      body: { email: 'teacher@example.edu', password: 'strong-password', captchaToken: 'captcha' },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(upstream.url, 'https://supabase.example/auth/v1/token?grant_type=password');
    assert.deepEqual(JSON.parse(upstream.options.body), {
      email: 'teacher@example.edu',
      password: 'strong-password',
      gotrue_meta_security: { captcha_token: 'captcha' },
    });
    const responseBody = JSON.parse(res.body);
    assert.equal(responseBody.session.access_token, 'short-lived-access');
    assert.equal(responseBody.session.refresh_token, 'ale-bff-managed-session');
    assert.doesNotMatch(res.body, /server-only-refresh/);
    assert.match(cookieFromResponse(res, 'ale_auth_session'), /server-only-refresh/);
    assert.match(res.headers['Set-Cookie'].join(';'), /HttpOnly; SameSite=Lax/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(originalEnv);
  }
});

test('BFF signup forwards CAPTCHA and stores the PKCE verifier only in an HttpOnly cookie', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = saveEnv([
    'SUPABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'APP_ORIGIN',
  ]);
  process.env.SUPABASE_URL = 'https://supabase.example';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  process.env.APP_ORIGIN = 'https://app.example';
  let upstream;
  globalThis.fetch = async (url, options) => {
    upstream = { url: String(url), body: JSON.parse(options.body) };
    return Response.json({ user: { id: 'user-1', email: 'teacher@example.edu' } });
  };
  try {
    const res = createResponseRecorder();
    await authSignupHandler({
      method: 'POST',
      headers: { origin: 'https://app.example' },
      body: {
        email: 'teacher@example.edu',
        password: 'strong-password',
        fullName: 'Guru Test',
        captchaToken: 'captcha',
        role: 'superadmin',
        tenant_id: 'attacker-tenant',
      },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.match(upstream.url, /\/auth\/v1\/signup\?redirect_to=/);
    assert.equal(upstream.body.data.full_name, 'Guru Test');
    assert.equal(upstream.body.gotrue_meta_security.captcha_token, 'captcha');
    assert.equal('role' in upstream.body.data, false);
    assert.equal('tenant_id' in upstream.body.data, false);
    const verifier = decodeURIComponent(cookieFromResponse(res, 'ale_auth_pkce_verifier'));
    assert.equal(
      upstream.body.code_challenge,
      crypto.createHash('sha256').update(verifier).digest('base64url'),
    );
    assert.equal(JSON.parse(res.body).confirmationRequired, true);
    assert.doesNotMatch(res.body, /refresh_token|verifier/);
    assert.match(res.headers['Set-Cookie'].join(';'), /HttpOnly; SameSite=Lax/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(originalEnv);
  }
});

test('BFF session refresh rotates the HttpOnly cookie and strips refresh token from JSON', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = saveEnv([
    'SUPABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'APP_ORIGIN',
  ]);
  process.env.SUPABASE_URL = 'https://supabase.example';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  process.env.APP_ORIGIN = 'https://app.example';
  let upstreamBody;
  globalThis.fetch = async (_url, options) => {
    upstreamBody = JSON.parse(options.body);
    return Response.json({
      access_token: 'rotated-access',
      refresh_token: 'rotated-refresh',
      expires_in: 3600,
      user: { id: 'user-1', email: 'teacher@example.edu' },
    });
  };
  try {
    const res = createResponseRecorder();
    await authSessionHandler({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: 'ale_auth_session=old-refresh' },
    }, res);
    assert.deepEqual(upstreamBody, { refresh_token: 'old-refresh' });
    assert.equal(JSON.parse(res.body).session.refresh_token, 'ale-bff-managed-session');
    assert.doesNotMatch(res.body, /rotated-refresh/);
    assert.match(cookieFromResponse(res, 'ale_auth_session'), /rotated-refresh/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(originalEnv);
  }
});

test('BFF logout revokes the server session and clears the browser cookie', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = saveEnv([
    'SUPABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'APP_ORIGIN',
  ]);
  process.env.SUPABASE_URL = 'https://supabase.example';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  process.env.APP_ORIGIN = 'https://app.example';
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('grant_type=refresh_token')) {
      return Response.json({
        access_token: 'logout-access',
        refresh_token: 'rotated-before-revoke',
        expires_in: 3600,
        user: { id: 'user-1', email: 'teacher@example.edu' },
      });
    }
    return Response.json({});
  };
  try {
    const res = createResponseRecorder();
    await authSessionHandler({
      method: 'DELETE',
      headers: {
        origin: 'https://app.example',
        cookie: 'ale_auth_session=logout-refresh',
      },
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(calls.length, 2);
    assert.match(calls[1].url, /\/auth\/v1\/logout\?scope=global$/);
    assert.equal(calls[1].options.headers.Authorization, 'Bearer logout-access');
    assert.match(res.headers['Set-Cookie'].join(';'), /Max-Age=0/);
    assert.deepEqual(JSON.parse(res.body), { ok: true });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(originalEnv);
  }
});

test('BFF Google OAuth callback binds state and PKCE verifier to HttpOnly cookies', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = saveEnv([
    'SUPABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'APP_ORIGIN',
    'NODE_ENV',
  ]);
  process.env.SUPABASE_URL = 'https://supabase.example';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  process.env.APP_ORIGIN = 'https://app.example';
  delete process.env.NODE_ENV;
  try {
    const startResponse = createResponseRecorder();
    await authGoogleStartHandler({
      method: 'POST',
      headers: { origin: 'https://app.example' },
      body: {},
    }, startResponse);
    assert.equal(startResponse.statusCode, 200);
    const authorize = new URL(JSON.parse(startResponse.body).authorizationUrl);
    assert.equal(authorize.origin, 'https://supabase.example');
    assert.equal(authorize.pathname, '/auth/v1/authorize');
    assert.equal(authorize.searchParams.get('code_challenge_method'), 's256');
    const state = new URL(authorize.searchParams.get('redirect_to')).searchParams.get('state');
    const verifier = decodeURIComponent(cookieFromResponse(startResponse, 'ale_auth_pkce_verifier'));
    const cookieState = decodeURIComponent(cookieFromResponse(startResponse, 'ale_auth_pkce_state'));
    assert.equal(state, cookieState);
    assert.equal(
      authorize.searchParams.get('code_challenge'),
      crypto.createHash('sha256').update(verifier).digest('base64url'),
    );
    assert.match(startResponse.headers['Set-Cookie'].join(';'), /HttpOnly/);

    let exchange;
    globalThis.fetch = async (url, options) => {
      exchange = { url: String(url), body: JSON.parse(options.body) };
      return Response.json({
        access_token: 'oauth-access',
        refresh_token: 'oauth-refresh-server-only',
        expires_in: 3600,
        user: { id: 'user-2', email: 'teacher@example.edu' },
      });
    };
    const callbackResponse = createResponseRecorder();
    await authGoogleCallbackHandler({
      method: 'GET',
      url: `/api/auth/google/callback?code=auth-code&state=${state}`,
      headers: {
        cookie: `ale_auth_pkce_verifier=${encodeURIComponent(verifier)}; ale_auth_pkce_state=${cookieState}`,
      },
    }, callbackResponse);
    assert.equal(exchange.url, 'https://supabase.example/auth/v1/token?grant_type=pkce');
    assert.deepEqual(exchange.body, { auth_code: 'auth-code', code_verifier: verifier });
    assert.equal(callbackResponse.statusCode, 302);
    assert.equal(callbackResponse.headers.Location, 'https://app.example/#/dashboard');
    assert.doesNotMatch(callbackResponse.body, /oauth-refresh-server-only/);
    assert.match(cookieFromResponse(callbackResponse, 'ale_auth_session'), /oauth-refresh-server-only/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(originalEnv);
  }
});

test('BFF recovery callback strips recovery suffix before PKCE exchange', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = saveEnv([
    'SUPABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'APP_ORIGIN',
  ]);
  process.env.SUPABASE_URL = 'https://supabase.example';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  process.env.APP_ORIGIN = 'https://app.example';
  let exchangeBody;
  globalThis.fetch = async (_url, options) => {
    exchangeBody = JSON.parse(options.body);
    return Response.json({
      access_token: 'recovery-access',
      refresh_token: 'recovery-refresh',
      expires_in: 3600,
      user: { id: 'user-3', email: 'teacher@example.edu' },
    });
  };
  try {
    const res = createResponseRecorder();
    await recoveryCallbackHandler({
      method: 'GET',
      url: '/api/auth/recovery/callback?code=recovery-code',
      headers: { cookie: 'ale_auth_pkce_verifier=verifier%2Frecovery' },
    }, res);
    assert.deepEqual(exchangeBody, { auth_code: 'recovery-code', code_verifier: 'verifier' });
    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.Location, 'https://app.example/?setup-password=1#/login');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(originalEnv);
  }
});

test('OAuth start memakai PKCE, state HttpOnly, dan scope hanya untuk satu layanan', async () => {
  const previousFetch = globalThis.fetch;
  const previousEnv = saveEnv([
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'APP_ORIGIN',
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_SECRET',
    'INTEGRATION_TOKEN_ENCRYPTION_KEY',
    'INTEGRATION_TOKEN_ENCRYPTION_KEY_VERSION',
  ]);
  setupIntegrationEnv();
  let inserted;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith('/auth/v1/user')) {
      return Response.json({ id: 'user-1', email: 'teacher@example.edu' });
    }
    if (String(url).includes('/rest/v1/oauth_pending')) {
      inserted = JSON.parse(options.body);
      return new Response(null, { status: 201 });
    }
    throw new Error(`Unexpected request ${url}`);
  };
  try {
    const res = createResponseRecorder();
    await startGoogleHandler({
      method: 'POST',
      headers: { origin: 'https://app.example', host: 'app.example', authorization: 'Bearer access-test-token' },
      body: { service: 'tasks' },
    }, res);
    const result = JSON.parse(res.body);
    const authorization = new URL(result.authorizationUrl);
    assert.equal(res.statusCode, 200);
    assert.equal(authorization.searchParams.get('response_type'), 'code');
    assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
    assert.match(authorization.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
    assert.equal(authorization.searchParams.get('include_granted_scopes'), 'false');
    assert.equal(authorization.searchParams.get('scope'), `openid email ${SCOPES.tasks}`);
    assert.match(res.headers['Set-Cookie'], /HttpOnly; SameSite=Lax/);
    assert.ok(inserted.state_hash);
    assert.notEqual(inserted.code_verifier_ciphertext, authorization.searchParams.get('code_challenge'));
    assert.equal(result.authorizationUrl.includes('google-secret'), false);
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv(previousEnv);
  }
});

test('OAuth callback menyimpan refresh token terenkripsi tanpa mengembalikannya', async () => {
  const previousFetch = globalThis.fetch;
  const previousEnv = saveEnv([
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'APP_ORIGIN',
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_SECRET',
    'INTEGRATION_TOKEN_ENCRYPTION_KEY',
    'INTEGRATION_TOKEN_ENCRYPTION_KEY_VERSION',
  ]);
  setupIntegrationEnv();
  const state = 'signed-state-value';
  let savedConnection;
  globalThis.fetch = async (url, options = {}) => {
    const address = String(url);
    if (address.includes('/rest/v1/oauth_pending?')) {
      return Response.json([{
        state_hash: hash(state),
        user_id: 'user-1',
        user_email: 'teacher@example.edu',
        service: 'drive',
        code_verifier_ciphertext: encryptSecret('expected-verifier'),
      }]);
    }
    if (address === 'https://oauth2.googleapis.com/token') {
      const body = new URLSearchParams(options.body);
      assert.equal(body.get('code'), 'one-time-code');
      assert.equal(body.get('code_verifier'), 'expected-verifier');
      return Response.json({
        access_token: 'short-lived-google-access',
        refresh_token: 'long-lived-google-refresh',
        scope: `openid email ${SCOPES.drive}`,
      });
    }
    if (address === 'https://openidconnect.googleapis.com/v1/userinfo') {
      return Response.json({
        sub: 'google-subject',
        email: 'teacher@example.edu',
        email_verified: true,
      });
    }
    if (address.includes('/rest/v1/oauth_connections?')) {
      savedConnection = JSON.parse(options.body);
      return new Response(null, { status: 201 });
    }
    if (address.includes('/rest/v1/oauth_pending?')) return new Response(null, { status: 204 });
    throw new Error(`Unexpected request ${address}`);
  };
  try {
    const res = createResponseRecorder();
    await googleCallbackHandler({
      method: 'GET',
      query: { state, code: 'one-time-code' },
      headers: { cookie: `ale_oauth_state=${state}` },
    }, res);
    assert.equal(res.statusCode, 302);
    assert.match(res.headers.Location, /integration=connected/);
    assert.equal(savedConnection.service, 'drive');
    assert.equal(decryptSecret(savedConnection.refresh_token_ciphertext), 'long-lived-google-refresh');
    assert.notEqual(savedConnection.refresh_token_ciphertext, 'long-lived-google-refresh');
    assert.match(res.headers['Set-Cookie'], /Max-Age=0/);
    assert.equal(res.headers.Location.includes('long-lived-google-refresh'), false);
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv(previousEnv);
  }
});

test('normalisasi event tidak menyalin attendee email atau properti tidak terpilih', () => {
  const normalized = normalizeItem('calendar', {
    id: 'event-1',
    etag: '"rev-2"',
    summary: 'Rapat',
    attendees: [{ email: 'student@example.edu' }],
    organizer: { email: 'teacher@example.edu' },
    updated: '2026-01-01T10:00:00Z',
    start: { dateTime: '2026-01-01T11:00:00Z' },
  });
  assert.equal(normalized.id, 'event-1');
  assert.equal(normalized.payload.summary, 'Rapat');
  assert.equal('attendees' in normalized.payload, false);
  assert.equal('organizer' in normalized.payload, false);
});

test('deteksi cloud menandai pola identitas dan tidak mengirimnya', () => {
  assert.equal(containsLikelyPersonalData('Contoh umum untuk pembelajaran.'), false);
  assert.equal(containsLikelyPersonalData('Hubungi siswa di siswa@example.edu'), true);
  assert.equal(containsLikelyPersonalData('NIP: 199211222019031001'), true);
  assert.equal(containsLikelyPersonalData('Nomor 081234567890'), true);
});

test('endpoint AI menolak permintaan sensitif sebelum memanggil provider', async () => {
  const originalFetch = globalThis.fetch;
  const originalConfig = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    endpoint: process.env.CLOUD_AI_API_URL,
    apiKey: process.env.CLOUD_AI_API_KEY,
    model: process.env.CLOUD_AI_MODEL,
  };
  let cloudCalled = false;
  process.env.SUPABASE_URL = 'https://supabase.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key';
  process.env.CLOUD_AI_API_URL = 'https://cloud.example/v1/chat/completions';
  process.env.CLOUD_AI_API_KEY = 'cloud-test-key';
  process.env.CLOUD_AI_MODEL = 'test-model';
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/auth/v1/user')) {
      return Response.json({ id: 'user-1', email: 'teacher@example.edu' });
    }
    cloudCalled = true;
    return Response.json({ choices: [{ message: { content: 'unexpected' } }] });
  };

  try {
    const req = {
      method: 'POST',
      headers: { origin: 'https://app.example', host: 'app.example', authorization: 'Bearer test-access-token' },
      body: {
        workflow: 'assistant',
        prompt: 'NIP: 199211222019031001',
        allowCloud: true,
        sensitivity: 'non_sensitive',
      },
    };
    const res = createResponseRecorder();
    await aiHandler(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(JSON.parse(res.body).code, 'personal_data_blocked');
    assert.equal(cloudCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries({
      SUPABASE_URL: originalConfig.url,
      SUPABASE_SERVICE_ROLE_KEY: originalConfig.key,
      CLOUD_AI_API_URL: originalConfig.endpoint,
      CLOUD_AI_API_KEY: originalConfig.apiKey,
      CLOUD_AI_MODEL: originalConfig.model,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('endpoint AI menolak consent cloud yang tidak eksplisit', async () => {
  const originalFetch = globalThis.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://supabase.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key';
  globalThis.fetch = async () => Response.json({ id: 'user-1', email: 'teacher@example.edu' });
  try {
    const res = createResponseRecorder();
    await aiHandler({
      method: 'POST',
      headers: { origin: 'https://app.example', host: 'app.example', authorization: 'Bearer test-access-token' },
      body: { workflow: 'assistant', prompt: 'A general prompt', allowCloud: false, sensitivity: 'non_sensitive' },
    }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(JSON.parse(res.body).code, 'cloud_consent_required');
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test('endpoint AI cloud memerlukan quota server dan membatasi output', async () => {
  const originalFetch = globalThis.fetch;
  const originalConfig = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    endpoint: process.env.CLOUD_AI_API_URL,
    apiKey: process.env.CLOUD_AI_API_KEY,
    model: process.env.CLOUD_AI_MODEL,
  };
  const calls = [];
  process.env.SUPABASE_URL = 'https://supabase.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key';
  process.env.CLOUD_AI_API_URL = 'https://cloud.example/v1/chat/completions';
  process.env.CLOUD_AI_API_KEY = 'cloud-test-key';
  process.env.CLOUD_AI_MODEL = 'test-model';
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/auth/v1/user')) {
      return Response.json({ id: 'user-1', email: 'teacher@example.edu' });
    }
    if (String(url).endsWith('/rpc/consume_cloud_ai_quota')) return Response.json(true);
    if (String(url) === process.env.CLOUD_AI_API_URL) {
      return Response.json({ choices: [{ message: { content: 'Jawaban.' } }] });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const res = createResponseRecorder();
    await aiHandler({
      method: 'POST',
      headers: { origin: 'https://app.example', host: 'app.example', authorization: 'Bearer integration-test-token' },
      body: {
        workflow: 'assistant',
        prompt: 'Jelaskan konsep umum.',
        allowCloud: true,
        sensitivity: 'non_sensitive',
      },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).text, 'Jawaban.');
    const quotaRequest = calls.find(({ url }) => url.endsWith('/rpc/consume_cloud_ai_quota'));
    assert.ok(quotaRequest);
    assert.deepEqual(JSON.parse(quotaRequest.options.body), { p_user_id: 'user-1' });
    const cloudRequest = calls.find(({ url }) => url === process.env.CLOUD_AI_API_URL);
    assert.equal(JSON.parse(cloudRequest.options.body).max_tokens, 1200);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries({
      SUPABASE_URL: originalConfig.url,
      SUPABASE_SERVICE_ROLE_KEY: originalConfig.key,
      CLOUD_AI_API_URL: originalConfig.endpoint,
      CLOUD_AI_API_KEY: originalConfig.apiKey,
      CLOUD_AI_MODEL: originalConfig.model,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('endpoint AI menolak provider cloud saat quota harian habis', async () => {
  const originalFetch = globalThis.fetch;
  const originalConfig = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    endpoint: process.env.CLOUD_AI_API_URL,
    apiKey: process.env.CLOUD_AI_API_KEY,
    model: process.env.CLOUD_AI_MODEL,
  };
  let cloudCalled = false;
  process.env.SUPABASE_URL = 'https://supabase.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key';
  process.env.CLOUD_AI_API_URL = 'https://cloud.example/v1/chat/completions';
  process.env.CLOUD_AI_API_KEY = 'cloud-test-key';
  process.env.CLOUD_AI_MODEL = 'test-model';
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/auth/v1/user')) {
      return Response.json({ id: 'user-1', email: 'teacher@example.edu' });
    }
    if (String(url).endsWith('/rpc/consume_cloud_ai_quota')) return Response.json(false);
    cloudCalled = true;
    return Response.json({ choices: [{ message: { content: 'unexpected' } }] });
  };

  try {
    const res = createResponseRecorder();
    await aiHandler({
      method: 'POST',
      headers: { origin: 'https://app.example', host: 'app.example', authorization: 'Bearer integration-test-token' },
      body: {
        workflow: 'assistant',
        prompt: 'Jelaskan konsep umum.',
        allowCloud: true,
        sensitivity: 'non_sensitive',
      },
    }, res);
    assert.equal(res.statusCode, 429);
    assert.equal(JSON.parse(res.body).code, 'cloud_ai_daily_limit');
    assert.equal(cloudCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries({
      SUPABASE_URL: originalConfig.url,
      SUPABASE_SERVICE_ROLE_KEY: originalConfig.key,
      CLOUD_AI_API_URL: originalConfig.endpoint,
      CLOUD_AI_API_KEY: originalConfig.apiKey,
      CLOUD_AI_MODEL: originalConfig.model,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('schema membuat seluruh tabel token dan sync tidak dapat diakses client', async () => {
  const sql = await readFile(new URL('../../supabase/migrations/20261103000100_integrations_sync.sql', import.meta.url), 'utf8');
  assert.match(sql, /refresh_token_ciphertext text not null/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /from anon, authenticated/);
  assert.match(sql, /to service_role/);
  assert.match(sql, /unique \(user_id, service, resource, remote_id\)/);
  assert.match(sql, /consume_cloud_ai_quota/);
  assert.match(sql, /requests < 10/);
});

test('hash state OAuth menggunakan SHA-256 heksadesimal', () => {
  assert.match(hash('sample-state'), /^[a-f0-9]{64}$/);
  assert.equal(hash('sample-state'), hash('sample-state'));
});
