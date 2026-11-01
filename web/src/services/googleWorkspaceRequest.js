export async function requestGoogle(url, token, options = {}) {
  if (typeof token !== 'string' || !token.trim()) throw new Error('Hubungkan akun Google untuk melanjutkan.');
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(30000),
  });
  const raw = await response.text();
  let result = {};
  if (raw) {
    try {
      result = JSON.parse(raw);
    } catch (error) {
      if (response.ok) throw new Error('Respons Google API tidak dapat dibaca.');
    }
  }
  if (!response.ok) {
    const detail = result.error?.message || `Permintaan Google ditolak (HTTP ${response.status}).`;
    const error = new Error(detail);
    error.code = result.error?.status || 'google/api-error';
    error.status = response.status;
    throw error;
  }
  return result;
}
