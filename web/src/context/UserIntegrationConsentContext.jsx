import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { useAuth } from './AuthContext.jsx';
import {
  INTEGRATION_CONSENT_VERSION,
  loadUserIntegrationConsent,
  saveUserIntegrationConsent,
} from '../services/userIntegrationConsent.js';

const UserIntegrationConsentContext = createContext(null);

export function UserIntegrationConsentProvider({ children }) {
  const { user, role } = useAuth();
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const requestId = useRef(0);
  const activeUserId = useRef(user?.uid);
  activeUserId.current = user?.uid;
  const [state, setState] = useState({
    loading: true,
    forUserId: '',
    consent: null,
    error: '',
  });

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    if (!user?.uid || role === 'demo') {
      setState({ loading: false, forUserId: '', consent: null, error: '' });
      setPreferencesOpen(false);
      return;
    }
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const consent = await loadUserIntegrationConsent(user.uid);
      if (currentRequest === requestId.current) {
        setState({ loading: false, forUserId: user.uid, consent, error: '' });
      }
    } catch (error) {
      console.error('[integration-consent] Gagal memuat persetujuan:', error);
      if (currentRequest === requestId.current) {
        setState({
          loading: false,
          forUserId: user.uid,
          consent: null,
          error: 'Persetujuan integrasi tidak dapat diverifikasi. Coba lagi atau hubungi superadmin.',
        });
      }
    }
  }, [role, user?.uid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setPreferencesOpen(false);
  }, [user?.uid]);

  const complete = useCallback(async (services) => {
    const userId = user?.uid;
    if (!userId) throw new Error('Sesi pengguna tidak tersedia.');
    const currentRequest = ++requestId.current;
    const consent = await saveUserIntegrationConsent(userId, services);
    if (activeUserId.current === userId && currentRequest === requestId.current) {
      setState({ loading: false, forUserId: userId, consent, error: '' });
      setPreferencesOpen(false);
    }
  }, [user?.uid]);

  const value = useMemo(() => ({
    ...state,
    needsOnboarding: Boolean(state.consent && state.consent.version !== INTEGRATION_CONSENT_VERSION)
      || (!state.loading && !state.error && !state.consent && Boolean(user?.uid))
      || preferencesOpen,
    openPreferences: () => setPreferencesOpen(true),
    closePreferences: () => setPreferencesOpen(false),
    complete,
    refresh,
  }), [complete, preferencesOpen, refresh, state, user?.uid]);

  return (
    <UserIntegrationConsentContext.Provider value={value}>
      {children}
    </UserIntegrationConsentContext.Provider>
  );
}

export function useUserIntegrationConsent() {
  const context = useContext(UserIntegrationConsentContext);
  if (!context) throw new Error('useUserIntegrationConsent harus dipakai di dalam provider.');
  return context;
}
