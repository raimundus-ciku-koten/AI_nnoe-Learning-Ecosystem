import { supabase } from '../lib/supabase.ts';

export async function setPlatformControl(setting) {
  const { data, error } = await supabase.rpc('set_platform_control', {
    p_setting: setting.setting,
    p_enabled: setting.enabled,
    p_feature: setting.feature || null,
  });
  if (error) throw error;
  if (!data || typeof data.changed !== 'boolean' || !data.state) {
    throw new Error('Respons kontrol platform Supabase tidak valid.');
  }
  return data;
}

export async function createPlatformUser(input) {
  const { data, error } = await supabase.functions.invoke('create-platform-user', {
    body: input,
  });
  if (error) throw error;
  if (!data || typeof data.uid !== 'string' || typeof data.email !== 'string' ||
      typeof data.role !== 'string' || typeof data.tenantId !== 'string') {
    throw new Error('Respons pembuatan akun Supabase tidak valid.');
  }

  return { ...data, resetEmailSent: data.invitationEmailSent === true };
}
