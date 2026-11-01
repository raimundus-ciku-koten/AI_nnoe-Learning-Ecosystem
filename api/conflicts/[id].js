const {
  HttpError,
  adminRequest,
  authenticateRequest,
  fail,
  requireMethod,
  requireSameOrigin,
  sendJson,
} = require('../_lib/common.js');
const { mutateGoogleItem } = require('../_lib/sync.js');
const crypto = require('node:crypto');

module.exports = async function handler(req, res) {
  try {
    requireMethod(req, ['POST']);
    requireSameOrigin(req);
    const { user } = await authenticateRequest(req);
    const id = String(req.query?.id || '');
    const resolution = req.body?.resolution;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, 'ID konflik tidak valid.', 'conflict_id_invalid');
    if (!['local', 'remote'].includes(resolution)) throw new HttpError(400, 'Resolusi konflik tidak dikenal.', 'conflict_resolution_invalid');
    const rows = await adminRequest(
      `integration_conflicts?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}&resolved_at=is.null&select=id,service,resource,remote_id,local_snapshot,remote_snapshot&limit=1`,
    );
    const conflict = rows?.[0];
    if (!conflict) throw new HttpError(404, 'Konflik tidak ditemukan atau sudah diselesaikan.', 'conflict_not_found');

    if (resolution === 'local') {
      const snapshot = conflict.local_snapshot || {};
      await mutateGoogleItem(user.id, conflict.service, {
        mutationId: crypto.randomUUID(),
        operation: snapshot.operation,
        remoteId: conflict.remote_id,
        baseEtag: conflict.remote_snapshot?.etag,
        payload: snapshot.payload,
      });
    }

    await adminRequest(
      `integration_conflicts?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}&resolved_at=is.null`,
      {
        method: 'PATCH',
        body: { resolution, resolved_at: new Date().toISOString() },
      },
    );
    sendJson(res, 200, { resolved: true, resolution });
  } catch (error) {
    fail(res, error);
  }
};
