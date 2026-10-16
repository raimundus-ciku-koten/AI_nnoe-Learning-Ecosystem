// web/src/main.jsx
import './styles/app.css'; //[cite: 11]
import './styles/base.css';

import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { pulihkanSideTutup } from './ui.js'; //[cite: 11]
import App from './App.jsx'; //[cite: 11]
import {
  initializeAnalyticsForConsent,
  trackAppNavigation
} from './services/analyticsConsent.js';

// Terapkan preferensi sidebar sebelum render pertama (tanpa kedip)[cite: 11]
pulihkanSideTutup(); 

// Global Error Handler dari main.js lama[cite: 9]
window.addEventListener('unhandledrejection', (e) => console.error('[unhandled]', e.reason));
window.addEventListener('error', (e) => console.error('[window.error]', e.error || e.message));

createRoot(document.getElementById('app')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

void initializeAnalyticsForConsent().catch((err) => {
  console.error('[analytics] Tidak dapat memulihkan persetujuan Analytics:', err?.message || err);
});
window.addEventListener('hashchange', trackAppNavigation);

if (import.meta.env.PROD) {
  const mulaiMonitoring = () => {
    import('./firebase/core/performance.js')
      .then(({ mulaiPerformanceMonitoring }) => mulaiPerformanceMonitoring())
      .catch((err) => {
        console.error('[firebase/performance] Monitoring web tidak aktif:', err?.code || err?.message || err);
      });
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(mulaiMonitoring, { timeout: 4000 });
  } else {
    window.setTimeout(mulaiMonitoring, 0);
  }
}