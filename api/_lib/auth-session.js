const {
  HttpError,
  appOrigin,
  cookieValue,
  fail,
  randomToken,
  requireMethod,
  sendJson,
} = require('./common.js');
const crypto = require('node:crypto');

const SESSION_COOKIE = 'ale_auth_session';
const VERIFIER_COOKIE = 'ale_auth_pkce_verifier';
const STATE_COOKIE = 'ale_auth_pkce_state';
const COOKIE_AGE_SECONDS = 60 * 60 * 24 * 30;
const REFRESH_SENTINEL = 'ale-bff-managed-session';

function authConfig() {
  const url = process.env.SUPABASE_URL?.trim()?.replace(/\/+$/, '');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
    || process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new HttpError(503, 'Autentikasi server belum dikonfigurasi.', 'auth_not_configured');
  }
  return { url, key };
}

function secureCookie() {
  return process.env.NODE_ENV === 'production' ? '; Secure' : '';
}

function appendCookie(res, cookie) {
  const existing = res.getHeader('Set-Cookie');
  const cookies = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
  res.setHeader('Set-Cookie', [...cookies, cookie]);
}

function setAuthCookie(res, name, value, maxAge = COOKIE_AGE_SECONDS, path = '/api/auth') {
  appendCookie(
    res,
    `${name}=${encodeURIComponent(value)}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookie()}`,
  );
}

function clearAuthCookie(res, name, path = '/api/auth') {
  setAuthCookie(res, name, '', 0, path);
}

function requireBrowserOrigin(req) {
  const origin = req.headers.origin;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw new HttpError(403, 'Origin permintaan tidak diizinkan.', 'origin_mismatch');
  }
  if (!origin || parsed.origin !== appOrigin()) {
    throw new HttpError(403, 'Origin permintaan tidak diizinkan.', 'origin_mismatch');
  }
}

function requestBody(req) {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) return req.body;
  return {};
}

async function callAuth(path, options = {}) {
  const { url, key } = authConfig();
  let response;
  try {
    response = await fetch(`${url}/auth/v1/${path}`, {
      method: options.method || 'POST',
      headers: {
        apikey: key,
        'Content-Type': 'application/json',
        ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      signal: AbortSignal.timeout(options.timeoutMs || 15000),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new HttpError(504, 'Layanan autentikasi tidak merespons.', 'auth_upstream_timeout');
    }
    throw new HttpError(502, 'Layanan autentikasi tidak dapat dijangkau.', 'auth_upstream_unavailable');
  }

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new HttpError(502, 'Respons layanan autentikasi tidak valid.', 'auth_response_invalid');
    }
  }
  if (!response.ok) {
    const message = payload.error_description || payload.msg || payload.message || payload.error;
    throw new HttpError(
      response.status >= 400 && response.status < 500 ? response.status : 502,
      typeof message === 'string' ? message : 'Layanan autentikasi menolak permintaan.',
      typeof payload.code === 'string' ? payload.code : 'auth_upstream_rejected',
    );
  }
  return payload;
}

function requireSessionPayload(session) {
  if (!session?.access_token || !session?.refresh_token || !session?.user?.id) {
    throw new HttpError(502, 'Layanan autentikasi mengembalikan sesi yang tidak lengkap.', 'auth_session_invalid');
  }
}

function publicSession(session) {
  const expiresIn = Number(session.expires_in) || 3600;
  return {
    access_token: session.access_token,
    refresh_token: REFRESH_SENTINEL,
    token_type: session.token_type || 'bearer',
    expires_in: expiresIn,
    expires_at: Number(session.expires_at) || Math.floor(Date.now() / 1000) + expiresIn,
    user: session.user,
  };
}

function finishSession(res, session) {
  requireSessionPayload(session);
  setAuthCookie(res, SESSION_COOKIE, session.refresh_token);
  return publicSession(session);
}

function getSessionRefreshToken(req) {
  const token = cookieValue(req, SESSION_COOKIE);
  if (!token) throw new HttpError(401, 'Sesi login tidak tersedia.', 'auth_required');
  return token;
}

async function refreshSession(req, res) {
  const refreshToken = getSessionRefreshToken(req);
  try {
    const session = await callAuth('token?grant_type=refresh_token', {
      body: { refresh_token: refreshToken },
    });
    return finishSession(res, session);
  } catch (error) {
    if (error instanceof HttpError && [400, 401, 403].includes(error.status)) {
      clearAuthCookie(res, SESSION_COOKIE);
      throw new HttpError(401, 'Sesi berakhir atau telah dicabut. Silakan masuk kembali.', 'auth_expired');
    }
    throw error;
  }
}

function requireValidCredential(value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new HttpError(400, `${label} tidak valid.`, 'auth_input_invalid');
  }
  return value;
}

async function loginHandler(req, res) {
  try {
    requireMethod(req, ['POST']);
    requireBrowserOrigin(req);
    const body = requestBody(req);
    const email = requireValidCredential(body.email, 'Email', 320).trim();
    const password = requireValidCredential(body.password, 'Kata sandi', 1024);
    const credentials = { email, password };
    if (typeof body.captchaToken === 'string' && body.captchaToken) {
      credentials.gotrue_meta_security = { captcha_token: body.captchaToken };
    }
    const session = await callAuth('token?grant_type=password', { body: credentials });
    sendJson(res, 200, { session: finishSession(res, session) });
  } catch (error) {
    fail(res, error);
  }
}

async function sessionHandler(req, res) {
  try {
    requireMethod(req, ['GET', 'DELETE']);
    if (req.method === 'GET') {
      sendJson(res, 200, { session: await refreshSession(req, res) });
      return;
    }

    requireBrowserOrigin(req);
    const refreshToken = cookieValue(req, SESSION_COOKIE);
    clearAuthCookie(res, SESSION_COOKIE);
    if (refreshToken) {
      try {
        const session = await callAuth('token?grant_type=refresh_token', {
          body: { refresh_token: refreshToken },
        });
        requireSessionPayload(session);
        await callAuth('logout?scope=global', {
          method: 'POST',
          accessToken: session.access_token,
        });
      } catch (error) {
        if (!(error instanceof HttpError) || ![400, 401, 403].includes(error.status)) throw error;
      }
    }
    sendJson(res, 200, { ok: true });
  } catch (error) {
    fail(res, error);
  }
}

async function signupHandler(req, res) {
  try {
    requireMethod(req, ['POST']);
    requireBrowserOrigin(req);
    const body = requestBody(req);
    const email = requireValidCredential(body.email, 'Email', 320).trim();
    const password = requireValidCredential(body.password, 'Kata sandi', 1024);
    const fullName = requireValidCredential(body.fullName, 'Nama', 160);
    if (typeof body.captchaToken !== 'string' || !body.captchaToken) {
      throw new HttpError(400, 'Verifikasi anti-bot wajib diselesaikan.', 'captcha_required');
    }
    const { verifier, challenge } = makePkcePair();
    const redirectTo = new URL('/api/auth/recovery/callback?type=signup', appOrigin()).toString();
    const authResult = await callAuth(`signup?redirect_to=${encodeURIComponent(redirectTo)}`, {
      body: {
        email,
        password,
        data: { full_name: fullName },
        gotrue_meta_security: { captcha_token: body.captchaToken },
        code_challenge: challenge,
        code_challenge_method: 's256',
      },
    });
    const session = authResult.access_token && authResult.refresh_token
      ? finishSession(res, authResult)
      : null;
    if (session) clearAuthCookie(res, VERIFIER_COOKIE, '/api/auth/recovery/callback');
    else setAuthCookie(res, VERIFIER_COOKIE, verifier, 60 * 60 * 24, '/api/auth/recovery/callback');
    sendJson(res, 200, {
      user: authResult.user || null,
      session,
      confirmationRequired: !session,
    });
  } catch (error) {
    fail(res, error);
  }
}

async function recoveryVerifierHandler(req, res) {
  try {
    requireMethod(req, ['POST']);
    requireBrowserOrigin(req);
    const verifier = requireValidCredential(requestBody(req).verifier, 'PKCE verifier', 256);
    if (!verifier.endsWith('/recovery')) {
      throw new HttpError(400, 'Verifier bukan untuk pemulihan kata sandi.', 'recovery_verifier_invalid');
    }
    setAuthCookie(res, VERIFIER_COOKIE, verifier, 60 * 60 * 24, '/api/auth/recovery/callback');
    sendJson(res, 200, { ok: true });
  } catch (error) {
    fail(res, error);
  }
}

async function recoveryCallbackHandler(req, res) {
  try {
    requireMethod(req, ['GET']);
    const callback = new URL(req.url, appOrigin());
    const verifier = cookieValue(req, VERIFIER_COOKIE);
    clearAuthCookie(res, VERIFIER_COOKIE, '/api/auth/recovery/callback');
    const code = callback.searchParams.get('code');
    if (!verifier || !code || code.length > 4096) {
      throw new HttpError(400, 'Tautan autentikasi tidak valid atau telah kedaluwarsa.', 'auth_callback_invalid');
    }
    const isRecovery = verifier.endsWith('/recovery')
      || callback.searchParams.get('type') === 'recovery';
    const session = await callAuth('token?grant_type=pkce', {
      body: { auth_code: code, code_verifier: verifier.replace(/\/recovery$/, '') },
    });
    finishSession(res, session);
    res.statusCode = 302;
    res.setHeader('Location', isRecovery
      ? `${appOrigin()}/?setup-password=1#/login`
      : `${appOrigin()}/#/login`);
    res.setHeader('Cache-Control', 'no-store');
    res.end();
  } catch (error) {
    fail(res, error);
  }
}

function makePkcePair() {
  const verifier = randomToken(48);
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function googleStartHandler(req, res) {
  try {
    requireMethod(req, ['POST']);
    requireBrowserOrigin(req);
    const { url, key } = authConfig();
    const state = randomToken(32);
    const { verifier, challenge } = makePkcePair();
    const callback = new URL('/api/auth/google/callback', appOrigin());
    callback.searchParams.set('state', state);
    const authorization = new URL(`${url}/auth/v1/authorize`);
    authorization.searchParams.set('provider', 'google');
    authorization.searchParams.set('redirect_to', callback.toString());
    authorization.searchParams.set('code_challenge', challenge);
    authorization.searchParams.set('code_challenge_method', 's256');
    authorization.searchParams.set('apikey', key);
    const captchaToken = requestBody(req).captchaToken;
    if (typeof captchaToken === 'string' && captchaToken) {
      authorization.searchParams.set(
        'gotrue_meta_security',
        JSON.stringify({ captcha_token: captchaToken }),
      );
    }
    setAuthCookie(res, VERIFIER_COOKIE, verifier, 600, '/api/auth/google/callback');
    setAuthCookie(res, STATE_COOKIE, state, 600, '/api/auth/google/callback');
    sendJson(res, 200, { authorizationUrl: authorization.toString() });
  } catch (error) {
    fail(res, error);
  }
}

async function googleCallbackHandler(req, res) {
  try {
    requireMethod(req, ['GET']);
    const callback = new URL(req.url, appOrigin());
    const state = callback.searchParams.get('state');
    const expectedState = cookieValue(req, STATE_COOKIE);
    const verifier = cookieValue(req, VERIFIER_COOKIE);
    clearAuthCookie(res, VERIFIER_COOKIE, '/api/auth/google/callback');
    clearAuthCookie(res, STATE_COOKIE, '/api/auth/google/callback');

    if (!state || !expectedState || state !== expectedState || !verifier) {
      throw new HttpError(400, 'Verifikasi OAuth gagal. Silakan mulai login kembali.', 'oauth_state_invalid');
    }
    const providerError = callback.searchParams.get('error_description') || callback.searchParams.get('error');
    if (providerError) {
      throw new HttpError(401, 'Login Google dibatalkan atau gagal.', 'oauth_provider_error');
    }
    const code = callback.searchParams.get('code');
    if (!code || code.length > 4096) {
      throw new HttpError(400, 'Kode OAuth tidak tersedia.', 'oauth_code_invalid');
    }
    const session = await callAuth('token?grant_type=pkce', {
      body: { auth_code: code, code_verifier: verifier },
    });
    finishSession(res, session);
    res.statusCode = 302;
    res.setHeader('Location', `${appOrigin()}/#/dashboard`);
    res.setHeader('Cache-Control', 'no-store');
    res.end();
  } catch (error) {
    fail(res, error);
  }
}

module.exports = {
  REFRESH_SENTINEL,
  googleCallbackHandler,
  googleStartHandler,
  loginHandler,
  publicSession,
  recoveryCallbackHandler,
  recoveryVerifierHandler,
  sessionHandler,
  signupHandler,
};
