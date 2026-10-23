// web/src/context/AuthContext.jsx
import React, {
  createContext, useContext, useEffect, useMemo, useState,
} from 'react';
import { getSnapshot, getState, setState, subscribe } from '../state.js';
import {
  pantaulogin, login, logout, masukGoogle, resetPassword, updateProfil, switchRole,
} from '../auth.js';

const AuthContext = createContext(null);

// Jaring pengaman: bila sesi Supabase lambat dipulihkan, jangan tahan UI selamanya.
const BATAS_AUTH_SIAP_MS = 12000;

export function AuthProvider({ children }) {
  const [state, setAuthSnapshot] = useState(getSnapshot);

  useEffect(() => {
    const unsubscribeState = subscribe(() => setAuthSnapshot(getSnapshot()));
    const berhenti = pantaulogin(() => setState({ authReady: true }));
    const timer = setTimeout(() => {
      if (!getState().authReady) setState({ authReady: true });
    }, BATAS_AUTH_SIAP_MS);
    setAuthSnapshot(getSnapshot());
    return () => {
      clearTimeout(timer);
      berhenti();
      unsubscribeState();
    };
  }, []);

  const value = useMemo(() => ({
    user: state.user,
    profile: state.profile,
    role: state.role,
    activeRole: state.activeRole,
    roles: state.roles,
    tenantId: state.tenantId,
    passwordRecovery: state.passwordRecovery,
    loading: !state.authReady,
    login, logout, masukGoogle, resetPassword, updateProfil, switchRole,
  }), [state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam <AuthProvider>.');
  return ctx;
}
