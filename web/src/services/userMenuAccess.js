import { supabase } from '../lib/supabase.ts';

export async function loadUserMenuRestrictions(userId) {
  if (!userId) throw new Error('ID pengguna tidak tersedia untuk memuat pembatasan menu.');
  const { data, error } = await supabase
    .from('user_menu_access')
    .select('menu_key')
    .eq('user_id', userId);
  if (error) throw error;
  if (!Array.isArray(data) || data.some((row) => typeof row.menu_key !== 'string')) {
    throw new Error('Data pembatasan menu dari server tidak valid.');
  }
  return new Set(data.map((row) => row.menu_key));
}

export async function loadManageableUsers() {
  let query = await supabase
    .from('profiles')
    .select('id,email,nama,role,roles,active')
    .eq('active', true)
    .neq('role', 'superadmin')
    .order('email')
    .limit(500);
  if (
    query.error &&
    (query.error.code === '42703' || /column .*roles.* does not exist/i.test(query.error.message || ''))
  ) {
    console.warn('[user-menu-access] Skema peran majemuk belum diterapkan; menggunakan peran utama.');
    query = await supabase
      .from('profiles')
      .select('id,email,nama,role,active')
      .eq('active', true)
      .neq('role', 'superadmin')
      .order('email')
      .limit(500);
  }
  if (query.error) throw query.error;
  if (!Array.isArray(query.data)) throw new Error('Daftar akun tidak valid.');
  return query.data
    .map((user) => ({
      ...user,
      roles: [...new Set([
        ...(Array.isArray(user.roles) ? user.roles.filter((role) => typeof role === 'string') : []),
        ...(user.role ? [user.role] : []),
      ])],
    }))
    .filter((user) => !user.roles.includes('superadmin'));
}

export async function saveUserMenuRestrictions(userId, disabledKeys) {
  if (!userId || !Array.isArray(disabledKeys) ||
      disabledKeys.some((key) => typeof key !== 'string')) {
    throw new TypeError('Target pengguna atau daftar menu tidak valid.');
  }
  const { data, error } = await supabase.rpc('set_user_menu_access', {
    p_user_id: userId,
    p_disabled_keys: disabledKeys,
  });
  if (error) throw error;
  if (!data || typeof data.changed !== 'boolean' ||
      data.userId !== userId || !Array.isArray(data.disabledKeys)) {
    throw new Error('Respons pembatasan menu dari server tidak valid.');
  }
  return data;
}
