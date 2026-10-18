import { supabase } from '../lib/supabase.ts';

export async function simpanKunciPublikPengguna(userId, identity) {
  if (typeof userId !== 'string' || !userId ||
      typeof identity?.publicKey !== 'string' ||
      !/^[a-f0-9]{64}$/.test(identity.fingerprint || '') ||
      !Number.isInteger(identity.keyVersion) || identity.keyVersion < 1) {
    throw new TypeError('Identitas kunci publik tidak valid.');
  }
  const { error } = await supabase.from('user_encryption_keys').upsert({
    user_id: userId,
    public_key: identity.publicKey,
    fingerprint: identity.fingerprint,
    key_version: identity.keyVersion,
    rotated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw error;
}

export async function daftarAdminKunciTenant(tenantId) {
  if (typeof tenantId !== 'string' || !tenantId) {
    throw new TypeError('Tenant perencanaan tidak valid.');
  }
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id,email,nama,tenant_id,active,role')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .eq('role', 'admin_sekolah')
    .order('nama', { ascending: true });
  if (error) throw error;
  if (!Array.isArray(profiles)) throw new Error('Supabase tidak mengembalikan daftar admin yang valid.');
  return profiles;
}

export async function ambilKunciPublikPengguna(userId, tenantId) {
  if (typeof userId !== 'string' || !userId || typeof tenantId !== 'string' || !tenantId) {
    throw new TypeError('Identitas penerima kunci tidak valid.');
  }
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,email,tenant_id,role,active')
    .eq('id', userId)
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .eq('role', 'admin_sekolah')
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile || typeof profile.email !== 'string') {
    throw new Error('Penerima harus admin sekolah aktif pada tenant yang sama.');
  }

  const { data: key, error: keyError } = await supabase
    .from('user_encryption_keys')
    .select('public_key,fingerprint,key_version')
    .eq('user_id', userId)
    .maybeSingle();
  if (keyError) throw keyError;
  if (!key || typeof key.public_key !== 'string' ||
      !/^[a-f0-9]{64}$/.test(key.fingerprint || '') ||
      !Number.isInteger(key.key_version) || key.key_version < 1) {
    throw new Error('Admin sekolah belum menyiapkan kunci publik vault.');
  }
  return {
    userId: profile.id,
    email: profile.email,
    publicKey: key.public_key,
    fingerprint: key.fingerprint,
    keyVersion: key.key_version,
  };
}
