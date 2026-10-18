// Contoh di file: src/services/userService.ts
import { supabase } from '../lib/supabase';
import { UserDoc } from '../types/schema';

export async function getUserProfile(uid: string): Promise<UserDoc | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', uid)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    uid: data.id,
    email: data.email,
    nama: data.nama,
    role: data.role,
    sekolahId: data.tenant_id || 'supabase-default',
    mapelIds: Array.isArray(data.mapel_ids) ? data.mapel_ids : [],
    kelasIds: Array.isArray(data.kelas_ids) ? data.kelas_ids : [],
    fotoUrl: data.photo_url || null,
    telepon: data.telepon || null,
    aktif: data.active === true,
    lastLogin: data.last_login || new Date().toISOString(),
    createdAt: data.created_at || new Date().toISOString(),
    updatedAt: data.updated_at || new Date().toISOString(),
    deletedAt: null,
  } as UserDoc;
}