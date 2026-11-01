const crypto = require('node:crypto');

class HttpError extends Error {
  constructor(status, message, code = 'request_failed') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function fail(res, error) {
  if (error instanceof HttpError) {
    sendJson(res, error.status, { error: error.message, code: error.code });
    return;
  }
  console.error('[api] Integration request failed:', error?.message || 'Unknown error');
  sendJson(res, 500, { error: 'Layanan integrasi mengalami kesalahan.' });
}

function requireMethod(req, methods) {
  if (!methods.includes(req.method)) {
    throw new HttpError(405, 'Metode HTTP tidak diizinkan.', 'method_not_allowed');
  }
}

function requireSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw new HttpError(403, 'Origin permintaan tidak valid.', 'origin_invalid');
  }
  const expectedHost = req.headers['x-forwarded-host'] || req.headers.host;
  if (!expectedHost || parsed.host.toLowerCase() !== String(expectedHost).toLowerCase()) {
    throw new HttpError(403, 'Permintaan lintas origin ditolak.', 'origin_mismatch');
  }
}

function readSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new HttpError(503, 'Integrasi server belum dikonfigurasi.', 'integration_not_configured');
  }
  return { url: url.replace(/\/+$/, ''), key };
}

async function authenticateRequest(req) {
  const authorization = req.headers.authorization || '';
  const match = /^Bearer ([\w.-]+)$/.exec(authorization);
  if (!match) throw new HttpError(401, 'Sesi login tidak tersedia.', 'auth_required');
  const { url, key } = readSupabaseConfig();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${match[1]}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new HttpError(401, 'Sesi login kedaluwarsa. Silakan masuk kembali.', 'auth_expired');
  const user = await response.json();
  if (!user?.id || !user?.email) throw new HttpError(401, 'Identitas akun tidak valid.', 'auth_invalid');
  return { user, accessToken: match[1] };
}

async function adminRequest(path, options = {}) {
  const { url, key } = readSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.prefer ? { Prefer: options.prefer } : {}),
      ...(options.headers || {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    signal: AbortSignal.timeout(options.timeoutMs || 15000),
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new HttpError(502, 'Respons penyimpanan integrasi tidak valid.', 'storage_response_invalid');
    }
  }
  if (!response.ok) {
    console.error('[api] Supabase storage error:', response.status, data?.code || data?.message || 'unknown');
    throw new HttpError(502, 'Penyimpanan integrasi gagal memproses permintaan.', 'storage_request_failed');
  }
  return data;
}

function encryptionKeyVersion() {
  const version = Number(process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY_VERSION || 1);
  if (!Number.isInteger(version) || version < 1 || version > 32767) {
    throw new HttpError(503, 'Versi kunci enkripsi token integrasi tidak valid.', 'encryption_key_version_invalid');
  }
  return version;
}

function keyMaterial(version = encryptionKeyVersion()) {
  const versionedName = `INTEGRATION_TOKEN_ENCRYPTION_KEY_V${version}`;
  const encoded = process.env[versionedName]?.trim()
    || (version === encryptionKeyVersion() ? process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY?.trim() : '');
  if (!encoded) {
    throw new HttpError(503, `Kunci enkripsi token integrasi versi ${version} belum dikonfigurasi.`, 'encryption_not_configured');
  }
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) {
    throw new HttpError(503, 'Kunci enkripsi token integrasi harus berupa 32 byte base64.', 'encryption_key_invalid');
  }
  return key;
}

function encryptSecret(value) {
  const version = encryptionKeyVersion();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyMaterial(version), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return [
    `v${version}`,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

function decryptSecret(value) {
  const [version, ivText, tagText, encryptedText, ...extra] = String(value || '').split('.');
  const versionNumber = /^v([1-9]\d*)$/.exec(version || '');
  if (!versionNumber || !ivText || !tagText || !encryptedText || extra.length) {
    throw new HttpError(500, 'Token terenkripsi memiliki format yang tidak valid.', 'ciphertext_invalid');
  }
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      keyMaterial(Number(versionNumber[1])),
      Buffer.from(ivText, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new HttpError(500, 'Token integrasi tidak dapat didekripsi. Periksa versi kunci enkripsi.', 'decryption_failed');
  }
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function cookieValue(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  for (const cookie of cookies) {
    const separator = cookie.indexOf('=');
    if (separator > 0 && cookie.slice(0, separator).trim() === name) {
      return decodeURIComponent(cookie.slice(separator + 1).trim());
    }
  }
  return '';
}

function setCookie(res, name, value, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/api/google/callback; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

function appOrigin() {
  const value = process.env.APP_ORIGIN?.trim();
  if (!value) throw new HttpError(503, 'APP_ORIGIN server belum dikonfigurasi.', 'app_origin_not_configured');
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new HttpError(503, 'APP_ORIGIN server tidak valid.', 'app_origin_invalid');
  }
  if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
    throw new HttpError(503, 'APP_ORIGIN harus memakai HTTPS.', 'app_origin_insecure');
  }
  return parsed.origin;
}

module.exports = {
  HttpError,
  adminRequest,
  appOrigin,
  authenticateRequest,
  cookieValue,
  decryptSecret,
  encryptionKeyVersion,
  encryptSecret,
  fail,
  hash,
  randomToken,
  requireMethod,
  requireSameOrigin,
  sendJson,
  setCookie,
};
