const crypto = require('node:crypto');
const {
  HttpError,
  adminRequest,
  appOrigin,
  authenticateRequest,
  encryptSecret,
  fail,
  hash,
  randomToken,
  requireMethod,
  requireSameOrigin,
  sendJson,
  setCookie,
} = require('../_lib/common.js');
const { SCOPES, googleConfig } = require('../_lib/google.js');

module.exports = async function handler(req, res) {
  try {
    requireMethod(req, ['POST']);
    requireSameOrigin(req);
    const { user } = await authenticateRequest(req);
    const service = String(req.body?.service || '');
    const scope = SCOPES[service];
    if (!scope) throw new HttpError(400, 'Layanan integrasi tidak dikenal.', 'service_invalid');
    const { clientId, redirectUri } = googleConfig();
    const state = randomToken(32);
    const verifier = randomToken(48);
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await adminRequest('oauth_pending', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        state_hash: hash(state),
        user_id: user.id,
        user_email: user.email,
        service,
        code_verifier_ciphertext: encryptSecret(verifier),
        expires_at: expiresAt,
      },
    });
    const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorization.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: `openid email ${scope}`,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'false',
      login_hint: user.email,
    }).toString();
    setCookie(res, 'ale_oauth_state', state, 300);
    sendJson(res, 200, { authorizationUrl: authorization.toString() });
  } catch (error) {
    fail(res, error);
  }
};
