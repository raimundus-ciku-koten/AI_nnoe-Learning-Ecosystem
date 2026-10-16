import { app } from '../firebase/core/app.js';

const CONSENT_KEY = 'ainnoe.analytics.consent.v1';
let analyticsInstance;
let analyticsModule;

export function getAnalyticsConsent() {
  const consent = localStorage.getItem(CONSENT_KEY);
  if (consent === 'granted') return 'granted';
  if (consent === 'denied') return 'denied';
  return 'unset';
}

async function loadAnalytics() {
  if (!app.options.measurementId) {
    throw new Error('Measurement ID Firebase Analytics belum dikonfigurasi.');
  }
  if (!analyticsModule) analyticsModule = import('firebase/analytics');
  const analytics = await analyticsModule;
  if (!await analytics.isSupported()) {
    throw new Error('Firebase Analytics tidak didukung di peramban ini.');
  }
  if (!analyticsInstance) {
    analyticsInstance = analytics.initializeAnalytics(app, {
      config: {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false
      }
    });
  }
  return { analytics, instance: analyticsInstance };
}

export async function enableBasicAnalytics() {
  const { analytics, instance } = await loadAnalytics();
  localStorage.setItem(CONSENT_KEY, 'granted');
  analytics.setAnalyticsCollectionEnabled(instance, true);
  analytics.logEvent(instance, 'app_open');
}

export async function disableBasicAnalytics() {
  if (analyticsInstance) {
    const analytics = await analyticsModule;
    analytics.setAnalyticsCollectionEnabled(analyticsInstance, false);
  }
  localStorage.setItem(CONSENT_KEY, 'denied');
}

export async function initializeAnalyticsForConsent() {
  if (getAnalyticsConsent() !== 'granted') return;
  const { analytics, instance } = await loadAnalytics();
  analytics.setAnalyticsCollectionEnabled(instance, true);
  analytics.logEvent(instance, 'app_open');
}

export function trackAppNavigation() {
  try {
    if (getAnalyticsConsent() !== 'granted' || !analyticsInstance) return;
    analyticsModule.then(({ logEvent }) => logEvent(analyticsInstance, 'app_navigation'))
      .catch((error) => {
        console.error('[analytics] Gagal mencatat navigasi umum:', error);
      });
  } catch (error) {
    console.error('[analytics] Gagal memeriksa persetujuan navigasi:', error);
  }
}
