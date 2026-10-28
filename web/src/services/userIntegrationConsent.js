import { supabase } from '../lib/supabase.ts';

export const INTEGRATION_CONSENT_VERSION = '2026-10-25';
export const AVAILABLE_CONSENTED_SERVICES = Object.freeze([
  'drive',
  'sheets',
  'meet',
  'calendar',
  'tasks',
]);

export async function loadUserIntegrationConsent(userId) {
  if (!userId) throw new Error('ID pengguna tidak tersedia untuk memuat persetujuan integrasi.');
  const { data, error } = await supabase
    .from('user_integration_consents')
    .select('consent_version,selected_services')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (typeof data.consent_version !== 'string' || !Array.isArray(data.selected_services)) {
    throw new Error('Data persetujuan integrasi dari server tidak valid.');
  }
  if (data.selected_services.some((service) => !AVAILABLE_CONSENTED_SERVICES.includes(service))) {
    throw new Error('Persetujuan memuat layanan yang tidak didukung.');
  }
  return {
    version: data.consent_version,
    services: [...data.selected_services],
  };
}

export async function saveUserIntegrationConsent(userId, services) {
  if (!userId) throw new Error('ID pengguna tidak tersedia untuk menyimpan persetujuan.');
  if (!Array.isArray(services) ||
      services.some((service) => !AVAILABLE_CONSENTED_SERVICES.includes(service))) {
    throw new TypeError('Pilihan integrasi tidak valid.');
  }
  const { data, error } = await supabase.rpc('save_user_integration_consent', {
    p_selected_services: [...new Set(services)],
    p_consent_version: INTEGRATION_CONSENT_VERSION,
  });
  if (error) throw error;
  if (!data || data.version !== INTEGRATION_CONSENT_VERSION ||
      data.userId !== userId ||
      !Array.isArray(data.services) ||
      data.services.some((service) => !AVAILABLE_CONSENTED_SERVICES.includes(service))) {
    throw new Error('Respons persetujuan integrasi dari server tidak valid.');
  }
  return { version: data.version, services: data.services };
}
