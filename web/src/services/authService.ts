// src/services/authService.ts
import { supabase } from '../lib/supabase';
import { UserDoc, UserRole } from '../types/schema';

export async function loginWithGoogle(): Promise<UserDoc> {
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });

  if (error) throw error;

  const user = data?.user;
  if (!user?.email) throw new Error('Akun Google tidak memiliki alamat email yang valid.');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) throw profileError;

  const role: UserRole = (profile?.role as UserRole) || 'guru';
  const newUserProfile: UserDoc = {
    uid: user.id,
    email: user.email,
    nama: profile?.nama || user.user_metadata?.full_name || 'Guru Pengguna',
    role,
    sekolahId: profile?.tenant_id || 'supabase-default',
    mapelIds: Array.isArray(profile?.mapel_ids) ? profile.mapel_ids : [],
    kelasIds: Array.isArray(profile?.kelas_ids) ? profile.kelas_ids : [],
    fotoUrl: user.user_metadata?.avatar_url || null,
    telepon: null,
    aktif: profile?.active === true,
    lastLogin: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };

  return newUserProfile;
}

export async function logoutUser(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function subscribeAuthChanges(callback: (user: any | null) => void) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
  return subscription;
}