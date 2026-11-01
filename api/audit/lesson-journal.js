const {
  HttpError,
  authenticateRequest,
  fail,
  requireMethod,
  requireSameOrigin,
  sendJson,
} = require('../_lib/common.js');
const {
  kirimEventAudit,
  prosesAuditTertunda,
  simpanEventAudit,
  validasiEventAudit,
} = require('../_lib/journal-audit.js');

module.exports = async function handler(req, res) {
  try {
    requireMethod(req, ['POST']);
    requireSameOrigin(req);
    const { user } = await authenticateRequest(req);
    const body = req.body;

    if (body && body.retryPending === true && Object.keys(body).length === 1) {
      const result = await prosesAuditTertunda(user.id);
      sendJson(res, result.pending ? 202 : 200, {
        status: result.pending ? 'pending' : 'delivered',
        ...result,
      });
      return;
    }

    const event = validasiEventAudit(body, user.id);
    const row = await simpanEventAudit(event);
    if (row.status === 'delivered') {
      sendJson(res, 200, { status: 'delivered' });
      return;
    }
    if (row.status === 'expired') {
      throw new HttpError(410, 'Catatan audit sudah melewati masa simpan satu tahun.', 'journal_audit_expired');
    }
    const result = await kirimEventAudit(row);
    sendJson(res, result.status === 'delivered' ? 200 : 202, {
      status: result.status,
      ...(result.status === 'pending'
        ? { warning: 'Jurnal tersimpan, tetapi catatan aktivitas masih menunggu pengiriman ke Google Drive.' }
        : {}),
    });
  } catch (error) {
    fail(res, error);
  }
};
