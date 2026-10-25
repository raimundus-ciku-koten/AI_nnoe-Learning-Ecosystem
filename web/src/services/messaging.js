import { supabase } from '../lib/supabase.ts';
import { WEB_PUSH_PUBLIC_KEY } from '../config.js';

export const statusNotifikasi = () =>
  typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;

function kunciAplikasiServer(encodedKey) {
  const padding = '='.repeat((4 - encodedKey.length % 4) % 4);
  const base64 = (encodedKey + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function daftarkanSW() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Peramban ini belum mendukung notifikasi Web Push.');
  }
  return navigator.serviceWorker.register('/push-service-worker.js');
}

export async function muatStatusNotifikasi(uid) {
  if (typeof Notification === 'undefined' ||
      typeof navigator === 'undefined' ||
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)) {
    return {
      supported: false,
      configured: Boolean(WEB_PUSH_PUBLIC_KEY),
      permission: 'unsupported',
      subscribed: false,
    };
  }

  const permission = Notification.permission;
  const registration = await navigator.serviceWorker.getRegistration('/push-service-worker.js');
  const subscription = await registration?.pushManager.getSubscription();
  if (!uid || !subscription?.endpoint) {
    return {
      supported: true,
      configured: Boolean(WEB_PUSH_PUBLIC_KEY),
      permission,
      subscribed: false,
    };
  }

  const { data, error } = await supabase
    .from('web_push_subscriptions')
    .select('endpoint')
    .eq('user_id', uid)
    .eq('endpoint', subscription.endpoint)
    .maybeSingle();
  if (error) throw error;
  return {
    supported: true,
    configured: Boolean(WEB_PUSH_PUBLIC_KEY),
    permission,
    subscribed: Boolean(data),
  };
}

async function simpanLangganan(uid, subscription) {
  const data = subscription.toJSON();
  const p256dh = data.keys?.p256dh;
  const authSecret = data.keys?.auth;
  if (!subscription.endpoint || !p256dh || !authSecret) {
    throw new Error('Langganan Web Push tidak lengkap.');
  }
  const { error } = await supabase
    .from('web_push_subscriptions')
    .upsert({
      user_id: uid,
      endpoint: subscription.endpoint,
      p256dh,
      auth_secret: authSecret,
    }, { onConflict: 'user_id,endpoint' });
  if (error) throw error;
}

export async function aktifkanNotifikasi(uid) {
  if (typeof uid !== 'string' || !uid.trim()) {
    throw new Error('Sesi pengguna tidak tersedia untuk mengaktifkan notifikasi.');
  }
  if (typeof Notification === 'undefined') {
    throw new Error('Peramban ini belum mendukung notifikasi.');
  }
  if (!WEB_PUSH_PUBLIC_KEY) {
    throw new Error('Kunci publik VAPID belum dikonfigurasi (VITE_WEB_PUSH_PUBLIC_KEY).');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Izin notifikasi tidak diberikan.');

  const registration = await daftarkanSW();
  const subscription = await registration.pushManager.getSubscription()
    || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: kunciAplikasiServer(WEB_PUSH_PUBLIC_KEY),
    });
  await simpanLangganan(uid, subscription);
  return subscription;
}

export async function dengarkanForeground(callback) {
  if (!('serviceWorker' in navigator)) return () => {};
  const onMessage = (event) => callback(event.data);
  navigator.serviceWorker.addEventListener('message', onMessage);
  return () => navigator.serviceWorker.removeEventListener('message', onMessage);
}

export async function lepaskanPerangkat(uid) {
  if (typeof uid !== 'string' || !uid.trim()) {
    throw new Error('Sesi pengguna tidak tersedia untuk menonaktifkan notifikasi.');
  }
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/push-service-worker.js');
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const { error } = await supabase
    .from('web_push_subscriptions')
    .delete()
    .eq('user_id', uid)
    .eq('endpoint', subscription.endpoint);
  if (error) throw error;
  await subscription.unsubscribe();
}
