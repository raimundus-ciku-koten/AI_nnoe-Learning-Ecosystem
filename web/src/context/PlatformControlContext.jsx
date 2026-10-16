import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/index.js';
import { useAuth } from './AuthContext.jsx';

const DEFAULT_STATE = Object.freeze({
  loading: false,
  maintenance: false,
  features: Object.freeze({ aiAssistant: true, aiGeneration: true }),
  error: '',
});

const PlatformControlContext = createContext(DEFAULT_STATE);

export function PlatformControlProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState(DEFAULT_STATE);

  useEffect(() => {
    if (!user) {
      setState(DEFAULT_STATE);
      return undefined;
    }

    setState((current) => ({ ...current, loading: true, error: '' }));
    return onSnapshot(doc(db, 'publicConfig', 'platform'), (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : {};
      const features = data.features && typeof data.features === 'object' ? data.features : {};
      setState({
        loading: false,
        maintenance: data.maintenance === true,
        features: {
          aiAssistant: typeof features.aiAssistant === 'boolean' ? features.aiAssistant : true,
          aiGeneration: typeof features.aiGeneration === 'boolean' ? features.aiGeneration : true,
        },
        error: '',
      });
    }, (error) => {
      console.error('[platform-controls] Gagal memantau konfigurasi runtime:', error);
      setState((current) => ({
        ...current,
        loading: false,
        error: 'Status kontrol platform tidak dapat diperbarui. Perubahan server tetap berlaku.',
      }));
    });
  }, [user?.uid]);

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
