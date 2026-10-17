import { inject, pageview, track } from '@vercel/analytics';

const CONSENT_KEY = 'ainnoe.analytics.consent.v1';
let analyticsInjected = false;

export function getAnalyticsConsent() {
  const consent = localStorage.getItem(CONSENT_KEY);
  if (consent === 'granted') return 'granted';
  if (consent === 'denied') return 'denied';
  return 'unset';
}

function enableAnalytics() {
  if (!analyticsInjected) {
    inject({
      disableAutoTrack: true,
      beforeSend: (event) => getAnalyticsConsent() === 'granted' ? event : null,
    });
    analyticsInjected = true;
  }
  pageview({ path: `${window.location.pathname}${window.location.hash}` });
}

export async function enableBasicAnalytics() {
  localStorage.setItem(CONSENT_KEY, 'granted');
  enableAnalytics();
  track('app_open');
}

export async function disableBasicAnalytics() {
  localStorage.setItem(CONSENT_KEY, 'denied');
}

export async function initializeAnalyticsForConsent() {
  if (getAnalyticsConsent() !== 'granted') return;
  enableAnalytics();
  track('app_open');
}

export function trackAppNavigation() {
  try {
    if (getAnalyticsConsent() !== 'granted') return;
    enableAnalytics();
  } catch (error) {
    console.error('[analytics] Gagal mencatat navigasi yang disetujui:', error);
  }
}
