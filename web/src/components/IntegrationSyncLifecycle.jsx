import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { getConnectionStatus, syncGoogleService } from '../services/connectionApi.js';
import { kirimUlangMutasiAntrean } from '../services/offlineSync.js';

const SERVICES = ['drive', 'tasks', 'calendar'];

export default function IntegrationSyncLifecycle() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.uid) return undefined;
    let active = true;
    let running = false;

    const synchronize = async () => {
      if (!active || running || globalThis.navigator?.onLine === false) return;
      running = true;
      try {
        if (globalThis.indexedDB) await kirimUlangMutasiAntrean(user.uid);
        const status = await getConnectionStatus();
        const connected = new Set(
          (status.connections || [])
            .filter((connection) => connection.status === 'connected')
            .map((connection) => connection.service),
        );
        for (const service of SERVICES) {
          if (!active || !connected.has(service)) continue;
          let result;
          for (let batch = 0; batch < 3; batch += 1) {
            result = await syncGoogleService(service);
            if (!result.hasMore) break;
          }
          if (result?.hasMore) {
            console.info(`[integrations] ${service} sync berlanjut saat aplikasi aktif berikutnya.`);
          }
        }
      } catch (error) {
        console.error('[integrations] Sinkronisasi otomatis gagal:', error);
      } finally {
        running = false;
      }
    };

    const onForeground = () => {
      if (document.visibilityState === 'visible') void synchronize();
    };
    void synchronize();
    window.addEventListener('online', synchronize);
    document.addEventListener('visibilitychange', onForeground);
    return () => {
      active = false;
      window.removeEventListener('online', synchronize);
      document.removeEventListener('visibilitychange', onForeground);
    };
  }, [user?.uid]);

  return null;
}
