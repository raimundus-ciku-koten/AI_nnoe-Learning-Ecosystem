const {
  HttpError,
  adminRequest,
  appOrigin,
  decryptSecret,
  encryptionKeyVersion,
  encryptSecret,
} = require('./common.js');

const SCOPES = Object.freeze({
  drive: 'https://www.googleapis.com/auth/drive.file',
  tasks: 'https://www.googleapis.com/auth/tasks',
  calendar: 'https://www.googleapis.com/auth/calendar.events.owned',
});

function googleConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new HttpError(503, 'OAuth Google server belum dikonfigurasi.', 'google_oauth_not_configured');
  }
  return {
    clientId,
    clientSecret,
    redirectUri: `${appOrigin()}/api/google/callback`,
  };
}

async function postTokenForm(params) {
  const { clientId, clientSecret, redirectUri } = googleConfig();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      ...(params.grant_type === 'authorization_code' ? { redirect_uri: redirectUri } : {}),
      ...params,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const invalidGrant = body.error === 'invalid_grant';
    throw new HttpError(
      invalidGrant ? 401 : 502,
      invalidGrant ? 'Google meminta pengguna menghubungkan ulang layanan.' : 'Google OAuth gagal memproses permintaan.',
      invalidGrant ? 'google_reauth_required' : 'google_oauth_failed',
    );
  }
  return body;
}

async function exchangeAuthorizationCode(code, codeVerifier) {
  return postTokenForm({
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
  });
}

async function requestGoogle(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    signal: options.signal || AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new HttpError(502, 'Respons Google API tidak valid.', 'google_response_invalid');
    }
  }
  if (!response.ok) {
    const code = data?.error?.errors?.[0]?.reason || data?.error?.status || '';
    if (response.status === 410) {
      throw new HttpError(410, 'Cursor Google kedaluwarsa; sinkronisasi penuh diperlukan.', 'google_sync_token_invalid');
    }
    if (response.status === 401) {
      throw new HttpError(401, 'Google meminta pengguna menghubungkan ulang layanan.', 'google_reauth_required');
    }
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after')) || 0;
      throw new HttpError(429, 'Batas permintaan Google tercapai. Coba kembali nanti.', `google_rate_limited:${retryAfter}`);
    }
    console.error('[api] Google API error:', response.status, code || 'unknown');
    throw new HttpError(response.status >= 500 ? 502 : 400, 'Google API menolak operasi integrasi.', 'google_api_failed');
  }
  if (data && typeof data === 'object' && !data.etag && response.headers.get('etag')) {
    data.etag = response.headers.get('etag');
  }
  return { data, headers: response.headers };
}

async function getConnection(userId, service) {
  const rows = await adminRequest(
    `oauth_connections?user_id=eq.${encodeURIComponent(userId)}&service=eq.${encodeURIComponent(service)}&select=id,user_id,service,provider_subject,email,refresh_token_ciphertext,key_version,granted_scopes,status&limit=1`,
  );
  const connection = rows?.[0];
  if (!connection || connection.status !== 'connected') {
    throw new HttpError(409, 'Hubungkan layanan Google ini terlebih dahulu.', 'connection_required');
  }
  return connection;
}

async function accessTokenForConnection(connection) {
  const refreshToken = decryptSecret(connection.refresh_token_ciphertext);
  let token;
  try {
    token = await postTokenForm({
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
  } catch (error) {
    if (error.code === 'google_reauth_required') {
      await adminRequest(
        `oauth_connections?id=eq.${encodeURIComponent(connection.id)}`,
        { method: 'PATCH', body: { status: 'reauth_required' } },
      );
    }
    throw error;
  }
  if (token.refresh_token) {
    await adminRequest(
      `oauth_connections?id=eq.${encodeURIComponent(connection.id)}`,
      {
        method: 'PATCH',
        body: {
          refresh_token_ciphertext: encryptSecret(token.refresh_token),
          key_version: encryptionKeyVersion(),
          last_refresh_at: new Date().toISOString(),
        },
      },
    );
  } else {
    await adminRequest(
      `oauth_connections?id=eq.${encodeURIComponent(connection.id)}`,
      { method: 'PATCH', body: { last_refresh_at: new Date().toISOString() } },
    );
  }
  return token.access_token;
}

async function getGoogleIdentity(accessToken) {
  const { data } = await requestGoogle('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const email = String(data?.email || '').trim().toLowerCase();
  if (!data?.sub || !email || data.email_verified !== true) {
    throw new HttpError(403, 'Akun Google tidak memiliki email terverifikasi.', 'google_identity_invalid');
  }
  return { subject: String(data.sub), email };
}

module.exports = {
  SCOPES,
  accessTokenForConnection,
  exchangeAuthorizationCode,
  getConnection,
  getGoogleIdentity,
  googleConfig,
  postTokenForm,
  requestGoogle,
};
