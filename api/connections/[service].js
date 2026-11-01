const {
  HttpError,
  adminRequest,
  authenticateRequest,
  decryptSecret,
  fail,
  requireMethod,
  requireSameOrigin,
  sendJson,
} = require('../_lib/common.js');

module.exports = async function handler(req, res) {
  try {
    requireMethod(req, ['DELETE']);
    requireSameOrigin(req);
    const { user } = await authenticateRequest(req);
    const service = String(req.query?.service || '');
    if (!['drive', 'tasks', 'calendar'].includes(service)) {
      throw new HttpError(400, 'Layanan integrasi tidak dikenal.', 'service_invalid');
    }

    const rows = await adminRequest(
      `oauth_connections?user_id=eq.${encodeURIComponent(user.id)}&service=eq.${service}&select=id,refresh_token_ciphertext&limit=1`,
    );
    const connection = rows?.[0];
    if (!connection) {
      sendJson(res, 200, { disconnected: true });
      return;
    }

    const refreshToken = decryptSecret(connection.refresh_token_ciphertext);
    await adminRequest(
      `oauth_connections?id=eq.${encodeURIComponent(connection.id)}&user_id=eq.${encodeURIComponent(user.id)}`,
      { method: 'DELETE' },
    );

    const response = await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      console.error('[api] Google token revocation failed:', response.status);
      throw new HttpError(502, 'Koneksi lokal sudah dihapus, tetapi Google gagal mengonfirmasi pencabutan izin. Cabut akses aplikasi dari pengaturan akun Google.', 'google_revoke_failed');
    }
    sendJson(res, 200, { disconnected: true });
  } catch (error) {
    fail(res, error);
  }
};
