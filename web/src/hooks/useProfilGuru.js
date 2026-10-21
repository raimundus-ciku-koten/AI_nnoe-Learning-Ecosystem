// web/src/hooks/useProfilGuru.js
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.ts';
import { normalisasiNama } from '../utils/nama.js';

export function useProfilGuru() {
  const [profil, setProfil] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let aktif = true;

    async function muat() {
      setLoading(true);
      setError(null);

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (!aktif) return;
      if (sessionError) {
        setError(sessionError.message);
        setLoading(false);
        return;
      }

      const user = session?.user;
      if (!user) {
        setProfil(null);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (!aktif) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      const profilUser = {
        nama: normalisasiNama(
          data?.nama || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Tanpa Nama',
        ),
        email: data?.email || user.email,
        peran: data?.role || 'Guru',
        ...(data || {}),
      };
      setProfil(profilUser);
      setLoading(false);
    }

    void muat();
    return () => {
      aktif = false;
    };
  }, []);

  return { profil, loading, error };
}