// src/services/authService.ts
import { supabase } from '../lib/supabase';

export async function loginWithGoogle(): Promise<void> {
  const response = await fetch('/api/auth/google/start', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Login Google tidak dapat dimulai.');
  const target = new URL(result.authorizationUrl);
  const supabaseOrigin = import.meta.env.VITE_SUPABASE_URL
    ? new URL(import.meta.env.VITE_SUPABASE_URL).origin
    : '';
  if (!supabaseOrigin || target.origin !== supabaseOrigin || target.pathname !== '/auth/v1/authorize') {
    throw new Error('URL OAuth Google server tidak valid.');
  }
  window.location.assign(target.toString());
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