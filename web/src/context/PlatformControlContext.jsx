import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.ts';
import { useAuth } from './AuthContext.jsx';

const DEFAULT_STATE = Object.freeze({
  loading: false,
  maintenance: false,
  features: Object.freeze({ aiAssistant: true, aiGeneration: true }),
  error: '',
});

const PlatformControlContext = createContext(DEFAULT_STATE);

export function PlatformControlProvider({ children }) {
  const { user, role } = useAuth();
  const [state, setState] = useState(DEFAULT_STATE);

  useEffect(() => {
    if (!user) {
      setState(DEFAULT_STATE);
      return undefined;
    }
    if (role === 'demo') {
      setState({
        ...DEFAULT_STATE,
        features: { aiAssistant: false, aiGeneration: false },
      });
      return undefined;
    }

    let active = true;
    setState((current) => ({ ...current, loading: true, error: '' }));

    async function loadPlatformConfig() {
      try {
        const { data, error } = await supabase
          .from('platform_control')
          .select('maintenance, features')
          .eq('id', 'global')
          .maybeSingle();

        if (!active) return;
        if (error) throw error;

        const features = data?.features && typeof data.features === 'object' ? data.features : {};
        setState({
          loading: false,
          maintenance: data?.maintenance === true,
          features: {
            aiAssistant: typeof features.aiAssistant === 'boolean' ? features.aiAssistant : true,
            aiGeneration: typeof features.aiGeneration === 'boolean' ? features.aiGeneration : true,
          },
          error: '',
        });
      } catch (error) {
        console.error('[platform-controls] Gagal memuat konfigurasi runtime:', error);
        if (!active) return;
        setState((current) => ({
          ...current,
          loading: false,
          error: 'Status kontrol platform tidak dapat diperbarui. Perubahan server tetap berlaku.',
        }));
      }
    }

    void loadPlatformConfig();
    return () => {
      active = false;
    };
  }, [user?.uid, role]);

  const value = useMemo(() => state, [state]);
  return (
    <PlatformControlContext.Provider value={value}>
      {children}
    </PlatformControlContext.Provider>
  );
}

export function usePlatformControls() {
  return useContext(PlatformControlContext);
}

export function MaintenanceGuard({ children }) {
  const { role } = useAuth();
  const { maintenance, error } = usePlatformControls();

  if (maintenance && role !== 'superadmin') {
    return (
      <main className="platform-maintenance" role="status">
        <section>
          <p className="platform-tenants-kicker">AI_nnoe Learning Ecosystem</p>
          <h1>Platform sedang dalam pemeliharaan</h1>
          <p>Akses sementara dihentikan oleh administrator. Silakan coba kembali nanti.</p>
        </section>
      </main>
    );
  }

  return (
    <>
      {error && <p className="platform-control-warning" role="status">{error}</p>}
      {children}
    </>
  );
}
