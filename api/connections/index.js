const {
  adminRequest,
  authenticateRequest,
  fail,
  requireMethod,
  requireSameOrigin,
  sendJson,
} = require('../_lib/common.js');

module.exports = async function handler(req, res) {
  try {
    requireMethod(req, ['GET']);
    const { user } = await authenticateRequest(req);
    const [connections, syncStates, conflicts] = await Promise.all([
      adminRequest(
        `oauth_connections?user_id=eq.${encodeURIComponent(user.id)}&select=service,email,granted_scopes,status,connected_at,last_refresh_at,revoked_at`,
      ),
      adminRequest(
        `integration_sync_state?user_id=eq.${encodeURIComponent(user.id)}&select=service,resource,last_started_at,last_success_at,status,retry_count,next_retry_at,last_error_code`,
      ),
      adminRequest(
        `integration_conflicts?user_id=eq.${encodeURIComponent(user.id)}&resolved_at=is.null&select=id,service,resource,remote_id,detected_at`,
      ),
    ]);

    sendJson(res, 200, {
      connections: connections || [],
      sync: syncStates || [],
      unresolvedConflicts: conflicts || [],
    });
  } catch (error) {
    fail(res, error);
  }
};
