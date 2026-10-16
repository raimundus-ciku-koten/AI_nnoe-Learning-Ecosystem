import { useEffect, useRef } from 'react';

const clientId = import.meta.env.VITE_ADSENSE_CLIENT_ID?.trim() || '';
const slotId = import.meta.env.VITE_ADSENSE_SLOT_ID?.trim() || '';
export const AD_SENSE_ENABLED = /^ca-pub-\d{16}$/.test(clientId) && /^\d+$/.test(slotId);

export default function AdSenseBanner() {
  const adRef = useRef(null);

  useEffect(() => {
    if (!AD_SENSE_ENABLED || !adRef.current || adRef.current.dataset.requested === 'true') return;

    let script = document.querySelector('script[data-ale-adsense]');
    if (!script) {
      script = document.createElement('script');
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.dataset.aleAdsense = 'true';
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
      document.head.appendChild(script);
    }

    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
      adRef.current.dataset.requested = 'true';
    } catch (error) {
      console.error('[adsense] Gagal menyiapkan slot iklan:', error);
    }
  }, []);

  if (!AD_SENSE_ENABLED) return null;

  return (
    <aside className="ale-ad-footer" aria-label="Iklan">
      <span className="ale-ad-label">Iklan</span>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: 'block', width: '100%', height: 'calc(100% - 0.9rem)' }}
        data-ad-client={clientId}
        data-ad-slot={slotId}
        data-ad-format="horizontal"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
