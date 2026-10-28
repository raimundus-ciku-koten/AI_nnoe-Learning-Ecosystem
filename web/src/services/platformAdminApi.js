import { supabase } from '../lib/supabase.ts';

export async function createPlatformTenant(name) {
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  if (normalizedName.length < 2 || normalizedName.length > 160) {
    throw new Error('Nama tenant harus berisi 2 sampai 160 karakter.');
  }

  const { data, error } = await supabase.rpc('create_platform_tenant', {
    p_name: normalizedName,
  });
  if (error) throw error;
  if (typeof data?.id !== 'string' || typeof data?.name !== 'string') {
    throw new Error('Respons pembuatan tenant tidak valid.');
  }
  return data;
}

export async function provisionPlatformSuperadmin({ email, nama }) {
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const normalizedName = typeof nama === 'string' ? nama.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
    throw new Error('Alamat email Super Admin tidak valid.');
  }
  if (normalizedName.length < 2 || normalizedName.length > 120) {
    throw new Error('Nama Super Admin harus berisi 2 sampai 120 karakter.');
  }

  const { data, error } = await supabase.rpc('provision_platform_superadmin', {
    p_email: normalizedEmail,
    p_nama: normalizedName,
  });
  if (error) throw error;
  if (data?.role !== 'superadmin' || data?.email !== normalizedEmail) {
    throw new Error('Respons provisioning Super Admin tidak valid.');
  }
  return data;
}

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
