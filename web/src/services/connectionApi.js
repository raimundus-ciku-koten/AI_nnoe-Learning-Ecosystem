import { supabase } from '../lib/supabase.ts';

async function request(path, { method = 'GET', body } = {}) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Sesi login berakhir. Silakan masuk kembali.');

  const response = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorResult = new Error(result.error || 'Permintaan integrasi gagal.');
    errorResult.code = result.code || 'integration_request_failed';
    errorResult.status = response.status;
    throw errorResult;
  }
  return result;
}

export function getConnectionStatus() {
  return request('/api/connections');
}

export async function beginGoogleConnection(service) {
  if (!['drive', 'tasks', 'calendar'].includes(service)) {
    throw new TypeError('Layanan Google tidak dikenal.');
  }
  const result = await request('/api/connections/start', {
    method: 'POST',
    body: { service },
  });
  const authorizationUrl = new URL(result.authorizationUrl);
  if (authorizationUrl.origin !== 'https://accounts.google.com') {
    throw new Error('URL persetujuan Google tidak valid.');
  }
  window.location.assign(authorizationUrl.toString());
}

export function disconnectGoogleService(service) {
  if (!['drive', 'tasks', 'calendar'].includes(service)) {
    throw new TypeError('Layanan Google tidak dikenal.');
  }
  return request(`/api/connections/${encodeURIComponent(service)}`, { method: 'DELETE' });
}

export function syncGoogleService(service) {
  if (!['drive', 'tasks', 'calendar'].includes(service)) {
    throw new TypeError('Layanan Google tidak dikenal.');
  }
  return request(`/api/sync/${encodeURIComponent(service)}`);
}

export function applyGoogleMutation(service, mutation) {
  if (!['drive', 'tasks', 'calendar'].includes(service)) {
    throw new TypeError('Layanan Google tidak dikenal.');
  }
  return request(`/api/sync/${encodeURIComponent(service)}`, {
    method: 'POST',
    body: { mutation },
  });
}

export async function resolveSyncConflict(conflictId, resolution) {
  if (!['local', 'remote'].includes(resolution)) throw new TypeError('Resolusi konflik tidak dikenal.');
  return request(`/api/conflicts/${encodeURIComponent(conflictId)}`, {
    method: 'POST',
    body: { resolution },
  });
}
