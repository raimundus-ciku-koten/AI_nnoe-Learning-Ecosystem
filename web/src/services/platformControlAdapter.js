const FEATURES = Object.freeze(['aiAssistant', 'aiGeneration']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidTimestamp = value =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
  Number.isFinite(Date.parse(value));

function parseState(state) {
  if (!state || typeof state !== 'object' || typeof state.maintenance !== 'boolean') {
    throw new Error('Respons state kontrol platform tidak valid.');
  }
  const features = state.features;
  if (!features || typeof features !== 'object' || Array.isArray(features)) {
    throw new Error('Respons fitur kontrol platform tidak valid.');
  }
  const keys = Object.keys(features).sort();
  if (
    keys.join(',') !== [...FEATURES].sort().join(',') ||
    FEATURES.some(feature => typeof features[feature] !== 'boolean')
  ) {
    throw new Error('Respons fitur kontrol platform tidak valid.');
  }
  return {
    maintenance: state.maintenance,
    features: Object.fromEntries(FEATURES.map(feature => [feature, features[feature]])),
  };
}

function validateRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new TypeError('Format pengaturan kontrol platform tidak valid.');
  }
  const keys = Object.keys(request).sort().join(',');
  if (
    request.setting === 'maintenance' &&
    keys === 'enabled,setting' &&
    typeof request.enabled === 'boolean'
  ) {
    return { setting: 'maintenance', enabled: request.enabled, feature: null };
  }
  if (
    request.setting === 'feature' &&
    keys === 'enabled,feature,setting' &&
    FEATURES.includes(request.feature) &&
    typeof request.enabled === 'boolean'
  ) {
    return { setting: 'feature', enabled: request.enabled, feature: request.feature };
  }
  throw new TypeError('Pengaturan kontrol platform tidak dikenal atau nilainya tidak valid.');
}

export function createPlatformControlAdapter(client) {
  if (!client || typeof client.from !== 'function' || typeof client.rpc !== 'function') {
    throw new TypeError('Klien Supabase untuk kontrol platform tidak tersedia.');
  }

  return {
    async getState() {
      const { data, error } = await client
        .from('platform_control')
        .select('id, maintenance, features, updated_by, updated_at')
        .eq('id', 'global')
        .maybeSingle();
      if (error) throw new Error('Gagal memuat kontrol platform dari Supabase.', { cause: error });
      if (!data || data.id !== 'global') {
        throw new Error('Row kontrol platform global belum dikonfigurasi di Supabase.');
      }
      if (
        (data.updated_by !== null && data.updated_by !== undefined &&
          (typeof data.updated_by !== 'string' || !UUID_PATTERN.test(data.updated_by))) ||
        (data.updated_at !== null && data.updated_at !== undefined &&
          !isValidTimestamp(data.updated_at))
      ) {
        throw new Error('Metadata waktu/aktor kontrol platform tidak valid.');
      }
      return {
        ...parseState(data),
        updatedBy: data.updated_by ?? null,
        updatedAt: data.updated_at ?? null,
      };
    },

    async setControl(request) {
      const normalized = validateRequest(request);
      const { data, error } = await client.rpc('set_platform_control', {
        p_setting: normalized.setting,
        p_enabled: normalized.enabled,
        p_feature: normalized.feature,
      });
      if (error) throw new Error('Gagal mengubah kontrol platform di Supabase.', { cause: error });
      if (!data || typeof data.changed !== 'boolean') {
        throw new Error('Respons mutasi kontrol platform tidak valid.');
      }
      return { changed: data.changed, state: parseState(data.state) };
    },
  };
}
