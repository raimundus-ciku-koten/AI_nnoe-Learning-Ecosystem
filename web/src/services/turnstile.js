const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptLoading;

async function loadTurnstile() {
  if (globalThis.turnstile?.render) return globalThis.turnstile;
  if (typeof document === 'undefined') throw new Error('Pemeriksaan keamanan hanya tersedia di browser.');
  if (!scriptLoading) {
    scriptLoading = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`);
      const script = existing || document.createElement('script');
      const timeout = setTimeout(() => {
        scriptLoading = null;
        script.remove();
        reject(new Error('Cloudflare Turnstile tidak merespons.'));
      }, 15000);
      const cleanup = () => {
        clearTimeout(timeout);
        script.removeEventListener('load', loaded);
        script.removeEventListener('error', failed);
      };
      const loaded = () => {
        cleanup();
        if (!globalThis.turnstile?.render) {
          scriptLoading = null;
          reject(new Error('Cloudflare Turnstile tidak tersedia setelah dimuat.'));
          return;
        }
        resolve(globalThis.turnstile);
      };
      const failed = () => {
        cleanup();
        scriptLoading = null;
        reject(new Error('Cloudflare Turnstile gagal dimuat. Periksa koneksi atau kebijakan jaringan.'));
      };
      script.addEventListener('load', loaded, { once: true });
      script.addEventListener('error', failed, { once: true });
      if (!existing) {
        script.src = TURNSTILE_SCRIPT_URL;
        script.async = true;
        script.defer = true;
        document.head.append(script);
      }
    });
  }
  return scriptLoading;
}

export async function pasangTurnstile(container, siteKey) {
  const key = typeof siteKey === 'string' ? siteKey.trim() : '';
  if (!container || !key) throw new Error('Cloudflare Turnstile belum dikonfigurasi.');
  const turnstile = await loadTurnstile();
  let token = '';
  const widgetId = turnstile.render(container, {
    sitekey: key,
    callback: (value) => { token = value; },
    'error-callback': () => { token = ''; },
    'expired-callback': () => { token = ''; },
    appearance: 'always',
  });
  return {
    token: () => token,
    reset: () => {
      token = '';
      turnstile.reset(widgetId);
    },
    remove: () => {
      token = '';
      turnstile.remove(widgetId);
    },
  };
}
