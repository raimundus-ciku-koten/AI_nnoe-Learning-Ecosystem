// web/src/main.jsx
import './styles/app.css'; //[cite: 11]
import './styles/base.css';

import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx'; //[cite: 11]
import { pasangAudioPembuka } from './services/announcementAudio.js';

pasangAudioPembuka();

// Global Error Handler dari main.js lama[cite: 9]
window.addEventListener('unhandledrejection', (e) => console.error('[unhandled]', e.reason));
window.addEventListener('error', (e) => console.error('[window.error]', e.error || e.message));

createRoot(document.getElementById('app')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

if (import.meta.env.PROD) {
  const mulaiMonitoring = () => {
    console.info('[performance] Monitoring web dinonaktifkan untuk migrasi Supabase.');
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(mulaiMonitoring, { timeout: 4000 });
  } else {
    window.setTimeout(mulaiMonitoring, 0);
  }
}