import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { muatMenuNonaktifSaya } from '../services/platformMenuAccess.js';

const DEFAULT_VALUE = Object.freeze({
    disabledMenuKeys: [],
    loading: false,
    error: '',
    reload: async () => {},
});
const MenuAccessContext = createContext(DEFAULT_VALUE);

export function MenuAccessProvider({ children }) {
    const { user, role } = useAuth();
    const [disabledMenuKeys, setDisabledMenuKeys] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [reloadId, setReloadId] = useState(0);

    useEffect(() => {
        if (!user || role === 'demo') {
            setDisabledMenuKeys([]);
            setLoading(false);
            setError('');
            return undefined;
        }

        let active = true;
        setLoading(true);
        setError('');
        muatMenuNonaktifSaya()
            .then((keys) => {
                if (active) setDisabledMenuKeys(keys);
            })
            .catch((cause) => {
                console.error('[menu-access] Gagal memuat hak menu pengguna:', cause);
                if (!active) return;
                setDisabledMenuKeys([]);
                setError('Pengaturan menu per pengguna belum dapat dimuat. Menu bawaan peran tetap digunakan.');
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, [user?.uid, role, reloadId]);

    const reload = useCallback(async () => {
        setReloadId((value) => value + 1);
    }, []);
    const value = useMemo(() => ({
        disabledMenuKeys,
        loading,
        error,
        reload,
    }), [disabledMenuKeys, loading, error, reload]);

    return <MenuAccessContext.Provider value={value}>{children}</MenuAccessContext.Provider>;
}

export function useMenuAccess() {
    return useContext(MenuAccessContext);
}
