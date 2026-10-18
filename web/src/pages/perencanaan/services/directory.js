import { supabase } from '../../../lib/supabase.ts';

export async function daftarGuruPerencanaan(tenantId = '') {
  let query = supabase
    .from('profiles')
    .select('id,nama,tenant_id')
    .eq('role', 'guru')
    .eq('active', true);
  if (tenantId) query = query.eq('tenant_id', tenantId);

  const { data, error } = await query.order('nama', { ascending: true });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Supabase tidak mengembalikan direktori guru yang valid.');
  return data.map((profile) => ({
    uid: profile.id,
    nama: profile.nama || '',
    tenantId: profile.tenant_id || '',
  }));
}
