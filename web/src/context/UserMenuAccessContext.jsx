import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { useAuth } from './AuthContext.jsx';
import { loadUserMenuRestrictions } from '../services/userMenuAccess.js';
import { isMenuPathDisabled } from '../services/menuAccessPolicy.js';

const INITIAL_STATE = Object.freeze({
  loading: true,
  disabledKeys: new Set(),
  error: '',
  forUserId: '',
});
const UserMenuAccessContext = createContext(null);

export function UserMenuAccessProvider({ children }) {
  const { user, role } = useAuth();
  const [state, setState] = useState(INITIAL_STATE);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    if (!user?.uid || role === 'demo') {
      setState({ ...INITIAL_STATE, loading: false });
      return;
    }
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const disabledKeys = await loadUserMenuRestrictions(user.uid);
      if (currentRequest === requestId.current) {
        setState({ loading: false, disabledKeys, error: '', forUserId: user.uid });
      }
    } catch (error) {
      console.error('[user-menu-access] Gagal memuat pembatasan menu:', error);
      if (currentRequest === requestId.current) {
        setState({
          loading: false,
          disabledKeys: new Set(),
          error: 'Akses menu tidak dapat diverifikasi dari server. Hubungi superadmin atau coba muat ulang.',
          forUserId: user.uid,
        });
      }
    }
  }, [role, user?.uid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ ...state, refresh }), [refresh, state]);
  return (
    <UserMenuAccessContext.Provider value={value}>
      {children}
    </UserMenuAccessContext.Provider>
  );
}

export function useUserMenuAccess() {
  const context = useContext(UserMenuAccessContext);
  if (!context) throw new Error('useUserMenuAccess harus dipakai di dalam provider.');
  return context;
}
