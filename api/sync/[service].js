const {
  HttpError,
  adminRequest,
  authenticateRequest,
  fail,
  requireMethod,
  requireSameOrigin,
  sendJson,
} = require('../_lib/common.js');
const { RESOURCE, mutateGoogleItem, syncGoogleService } = require('../_lib/sync.js');

async function updateFailureState(userId, service, error) {
  const resource = RESOURCE[service];
  if (!resource) return;
  const rows = await adminRequest(
    `integration_sync_state?user_id=eq.${encodeURIComponent(userId)}&service=eq.${service}&resource=eq.${resource}&select=retry_count&limit=1`,
  );
  const retryCount = (rows?.[0]?.retry_count || 0) + 1;
  const reauth = error.code === 'google_reauth_required';
  const retryable = error.status === 429 || error.status >= 500 || error.name === 'TypeError';
  const delaySeconds = Number(String(error.code || '').split(':')[1]) || Math.min(3600, 30 * (2 ** Math.min(retryCount - 1, 7)));
  await adminRequest('integration_sync_state?on_conflict=user_id,service,resource', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: {
      user_id: userId,
      service,
      resource,
      status: reauth ? 'reauth_required' : retryable ? 'retry_wait' : 'error',
      retry_count: retryCount,
      next_retry_at: retryable ? new Date(Date.now() + delaySeconds * 1000).toISOString() : null,
      last_error_code: String(error.code || 'sync_failed').slice(0, 80),
      updated_at: new Date().toISOString(),
    },
  });
}

module.exports = async function handler(req, res) {
  let user;
  let service;
  try {
    requireMethod(req, ['GET', 'POST']);
    if (req.method === 'POST') requireSameOrigin(req);
    ({ user } = await authenticateRequest(req));
    service = String(req.query?.service || '');
    if (!RESOURCE[service]) throw new HttpError(400, 'Layanan sinkronisasi tidak dikenal.', 'service_invalid');

    if (req.method === 'GET') {
      const stateRows = await adminRequest(
        `integration_sync_state?user_id=eq.${encodeURIComponent(user.id)}&service=eq.${service}&resource=eq.${RESOURCE[service]}&select=status,last_started_at,last_success_at,retry_count,next_retry_at,last_error_code&limit=1`,
      );
      const state = stateRows?.[0];
      if (state?.next_retry_at && Date.parse(state.next_retry_at) > Date.now()) {
        throw new HttpError(429, 'Sinkronisasi menunggu jeda retry. Coba kembali setelah waktu yang ditampilkan.', 'sync_retry_wait');
      }
      const result = await syncGoogleService(user.id, service);
      sendJson(res, 200, result);
      return;
    }

    const result = await mutateGoogleItem(user.id, service, req.body?.mutation);
    sendJson(res, 200, result);
  } catch (error) {
    if (req.method === 'GET' && user && service) {
      try {
        await updateFailureState(user.id, service, error);
      } catch (stateError) {
        console.error('[api] Sync failure state could not be saved:', stateError?.message || 'Unknown error');
      }
    }
    fail(res, error);
  }
};
