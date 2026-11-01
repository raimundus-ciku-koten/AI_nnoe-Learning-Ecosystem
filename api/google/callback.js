const crypto = require('node:crypto');
const {
  HttpError,
  adminRequest,
  appOrigin,
  cookieValue,
  encryptSecret,
  encryptionKeyVersion,
  fail,
  hash,
  sendJson,
  setCookie,
} = require('../_lib/common.js');
const {
  SCOPES,
  exchangeAuthorizationCode,
  getGoogleIdentity,
} = require('../_lib/google.js');

function redirect(res, status, message) {
  const destination = new URL('/#/pengaturan/koneksi', appOrigin());
  if (status) destination.hash = `/pengaturan/koneksi?integration=${encodeURIComponent(status)}`;
  if (message) destination.hash += `&message=${encodeURIComponent(message)}`;
  res.statusCode = 302;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Location', destination.toString());
  res.end();
}

module.exports = async function handler(req, res) {
  let state = '';
  try {
    if (req.method !== 'GET') throw new HttpError(405, 'Metode HTTP tidak diizinkan.', 'method_not_allowed');
    state = String(req.query?.state || '');
    const cookieState = cookieValue(req, 'ale_oauth_state');
    setCookie(res, 'ale_oauth_state', '', 0);
    const stateMatches = state.length === cookieState.length && state.length > 0
      && crypto.timingSafeEqual(Buffer.from(state), Buffer.from(cookieState));
    if (!stateMatches) {
      throw new HttpError(400, 'State OAuth tidak cocok. Mulai ulang proses koneksi.', 'oauth_state_invalid');
    }
    if (req.query?.error) {
      throw new HttpError(400, 'Persetujuan Google dibatalkan atau ditolak.', 'oauth_consent_denied');
    }
    const code = String(req.query?.code || '');
    if (!code || code.length > 4096) throw new HttpError(400, 'Authorization code tidak valid.', 'oauth_code_invalid');

    const digest = hash(state);
    const pendingRows = await adminRequest(
      `oauth_pending?state_hash=eq.${digest}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=state_hash,user_id,user_email,service,code_verifier_ciphertext&limit=1`,
    );
    const pending = pendingRows?.[0];
    if (!pending) throw new HttpError(400, 'Permintaan OAuth kedaluwarsa atau sudah digunakan.', 'oauth_state_expired');

    const { decryptSecret } = require('../_lib/common.js');
    const tokens = await exchangeAuthorizationCode(code, decryptSecret(pending.code_verifier_ciphertext));
    if (!tokens.refresh_token || !tokens.access_token) {
      throw new HttpError(400, 'Google tidak menerbitkan refresh token. Cabut izin aplikasi lalu coba hubungkan ulang.', 'google_refresh_token_missing');
    }
    const identity = await getGoogleIdentity(tokens.access_token);
    const accountEmail = String(pending.user_email || '').trim().toLowerCase();
    if (!accountEmail || identity.email !== accountEmail) {
      throw new HttpError(403, 'Gunakan akun Google terverifikasi yang sama dengan email akun aplikasi.', 'google_account_mismatch');
    }
    const grantedScopes = new Set(String(tokens.scope || '').split(/\s+/).filter(Boolean));
    if (!grantedScopes.has(SCOPES[pending.service])) {
      throw new HttpError(403, 'Google tidak memberikan scope yang dibutuhkan layanan.', 'google_scope_missing');
    }

    await adminRequest('oauth_connections?on_conflict=user_id,service', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: {
        user_id: pending.user_id,
        service: pending.service,
        provider_subject: identity.subject,
        email: identity.email,
        refresh_token_ciphertext: encryptSecret(tokens.refresh_token),
        key_version: encryptionKeyVersion(),
        granted_scopes: [...grantedScopes].filter((scope) => scope === 'openid' || scope === 'email' || scope === SCOPES[pending.service]),
        status: 'connected',
        connected_at: new Date().toISOString(),
        last_refresh_at: new Date().toISOString(),
        revoked_at: null,
      },
    });
    await adminRequest(`oauth_pending?state_hash=eq.${digest}`, { method: 'DELETE' });
    redirect(res, 'connected', pending.service);
  } catch (error) {
    try {
      if (state) await adminRequest(`oauth_pending?state_hash=eq.${hash(state)}`, { method: 'DELETE' });
    } catch (cleanupError) {
      console.error('[api] OAuth state cleanup failed:', cleanupError?.message || 'Unknown error');
    }
    if (error instanceof HttpError) {
      redirect(res, 'error', error.code);
      return;
    }
    console.error('[api] Google OAuth callback failed:', error?.message || 'Unknown error');
    redirect(res, 'error', 'oauth_callback_failed');
  }
};
