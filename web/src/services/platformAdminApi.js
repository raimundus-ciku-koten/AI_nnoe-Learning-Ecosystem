import { supabase } from '../lib/supabase.ts';

export async function setPlatformControl(setting) {
  const { data, error } = await supabase.rpc('set_platform_control', {
    p_setting: setting.setting,
    p_enabled: setting.enabled,
    p_feature: setting.feature || null,
  });
  if (error) throw error;
  if (!data || typeof data.changed !== 'boolean' || !data.state) {
    throw new Error('Respons kontrol platform tidak valid.');
  }
  return data;
}
