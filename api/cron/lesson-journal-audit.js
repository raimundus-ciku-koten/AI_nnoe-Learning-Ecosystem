const crypto = require('node:crypto');
const {
  HttpError,
  adminRequest,
  fail,
  requireMethod,
  sendJson,
} = require('../_lib/common.js');
const {
  hapusAuditKedaluwarsaDrive,
  hapusOutboxAuditKedaluwarsa,
  prosesAuditTertunda,
} = require('../_lib/journal-audit.js');

function validasiCron(req) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected || expected.length < 16) {
    throw new HttpError(503, 'Kunci tugas terjadwal belum dikonfigurasi dengan aman.', 'cron_secret_not_configured');
  }
  const authorization = req.headers.authorization || '';
  const match = /^Bearer (.+)$/.exec(authorization);
  if (!match) {
    throw new HttpError(401, 'Otorisasi tugas terjadwal tidak valid.', 'cron_unauthorized');
  }
  const actualBytes = Buffer.from(match[1]);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length ||
      !crypto.timingSafeEqual(actualBytes, expectedBytes)) {
    throw new HttpError(401, 'Otorisasi tugas terjadwal tidak valid.', 'cron_unauthorized');
  }
}

module.exports = async function handler(req, res) {
  try {
    requireMethod(req, ['GET']);
    validasiCron(req);
    const connections = await adminRequest(
      'oauth_connections?service=eq.drive&status=eq.connected&select=user_id&limit=1000',
    );
    if (!Array.isArray(connections)) {
      throw new HttpError(502, 'Daftar koneksi Drive tidak valid.', 'journal_audit_cleanup_failed');
    }
    await hapusOutboxAuditKedaluwarsa();

    let delivered = 0;
    let pending = 0;
    let expiredDeleted = 0;
    const users = [...new Set(connections.map((row) => row.user_id).filter(Boolean))];
    for (const userId of users) {
      try {
        const syncResult = await prosesAuditTertunda(userId, 25);
        delivered += syncResult.delivered;
        pending += syncResult.pending;
        const cleanupResult = await hapusAuditKedaluwarsaDrive(userId);
        expiredDeleted += cleanupResult.deleted;
        if (cleanupResult.hasMore) pending += 1;
      } catch (error) {
        pending += 1;
        console.error('[cron] Journal audit processing failed:', {
          code: error.code || 'journal_audit_cleanup_failed',
        });
      }
    }

    sendJson(res, 200, {
      processedUsers: users.length,
      delivered,
      pending,
      expiredDeleted,
      outboxRetentionApplied: true,
    });
  } catch (error) {
    fail(res, error);
  }
};
