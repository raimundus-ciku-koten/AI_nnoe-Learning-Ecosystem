// public/firebase-messaging-sw.js
/**
 * Service worker FCM.
 *
 * Penting:
 *   - File ini di-serve statis dari `/public` — TIDAK melewati pipeline
 *     Vite, sehingga import.meta.env / [[VITE_*]] TIDAK tersedia di sini.
 *     Semua nilai di bawah WAJIB diisi manual.
 *   - Isi blok firebaseConfig di bawah harus SAMA PERSIS dengan
 *     firebaseConfig di src/firebase.js (biar pesan latar & foreground
 *     memakai app/project yang sama).
 *   - Ganti [[VERSI-FIREBASE]] dengan versi paket 'firebase' di package.json
 *     (cek: `npm ls firebase`).
 *   - Ganti [[ISI-ANDA]] dengan nilai dari Firebase Console →
 *     Project settings → General → Your apps → SDK setup and configuration.
 *   - File ini TIDAK BOLEH di-cache selamanya; header no-cache diatur di
 *     firebase.json.
 */

importScripts('https://www.gstatic.com/firebasejs/[[VERSI-FIREBASE]]/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/[[VERSI-FIREBASE]]/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            '[[ISI-ANDA]]',
  authDomain:        '[[ISI-ANDA]]',
  projectId:         '[[ISI-ANDA]]',
  storageBucket:     '[[ISI-ANDA]]',
  messagingSenderId: '[[ISI-ANDA]]',
  appId:             '[[ISI-ANDA]]'
});

const messaging = firebase.messaging();

// Pesan hanya berisi "data", jadi tampilan sepenuhnya dikendalikan di sini.
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {};
  self.registration.showNotification(d.judul || 'Pesan baru', {
    body: d.isi || '',
    icon: '/logo-ale.jpg',
    tag:  d.chatId,                       // pesan dari chat yang sama saling menggantikan
    data: { link: d.link || '/#/chat' }   // hash router → butuh '/' sebelum '#'
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/#/chat';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((daftar) => {
      for (const jendela of daftar) {
        if ('focus' in jendela) {
          jendela.navigate(link);
          return jendela.focus();
        }
      }
      return clients.openWindow(link);
    })
  );
});