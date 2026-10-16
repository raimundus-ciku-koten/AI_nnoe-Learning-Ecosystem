// web/vite.config.js
/**
 * Konfigurasi Vite untuk Ainnoe Web (Vite 6 + Rollup).
 *
 * Pemecahan berkas Firebase ke chunk terpisah agar:
 *   1) Browser dapat meng-cache per-modul (SDK auth jarang berubah).
 *   2) Muat awal (login) tidak perlu mengunduh SDK Firestore/Database bila belum dipakai.
 *
 * Pemecahan dilakukan dengan manualChunks objek (Rollup 4 / Vite 6).
 * Bila kelak pindah ke Vite 8 (Rolldown), ganti ke `rolldownOptions.output.codeSplitting`
 * dan pindahkan dropConsole ke `rolldownOptions.output.minify.compress`.
 */
import { defineConfig, loadEnv } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const workerTemplate = readFileSync(
  fileURLToPath(new URL('./src/components/firebase-messaging-sw.js', import.meta.url)),
  'utf8',
);

function firebaseMessagingWorker(firebaseConfig) {
  const source = workerTemplate.replace('__FIREBASE_CONFIG__', JSON.stringify(firebaseConfig));
  const layaniWorker = (request, response, next) => {
    if (request.url?.split('?')[0] !== '/firebase-messaging-sw.js') {
      next();
      return;
    }
    response.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    response.setHeader('Service-Worker-Allowed', '/');
    response.end(source);
  };

  return {
    name: 'firebase-messaging-worker',
    configureServer(server) {
      server.middlewares.use(layaniWorker);
    },
    configurePreviewServer(server) {
      server.middlewares.use(layaniWorker);
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'firebase-messaging-sw.js',
        source,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const region = env.VITE_FUNCTIONS_REGION || 'asia-southeast2';
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  const emulator = env.VITE_USE_EMULATORS === 'true';
  const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
  const wajibProduksi = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_APP_ID',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_DATABASE_URL',
    'VITE_RECAPTCHA_SITE_KEY',
    'VITE_USE_EMULATORS',
  ];
  if (mode === 'production') {
    const kosong = wajibProduksi.filter((key) => !env[key]?.trim());
    if (kosong.length) {
      throw new Error(`[firebase] Konfigurasi produksi wajib diisi: ${kosong.join(', ')}`);
    }
    if (env.VITE_USE_EMULATORS !== 'false') {
      throw new Error('[firebase] VITE_USE_EMULATORS harus false pada build produksi.');
    }
    if (env.VITE_APPCHECK_DEBUG_TOKEN?.trim()) {
      throw new Error('[firebase] VITE_APPCHECK_DEBUG_TOKEN tidak boleh diatur pada build produksi.');
    }
    if (projectId.includes('GANTI-DENGAN')) {
      throw new Error('[firebase] VITE_FIREBASE_PROJECT_ID masih berupa placeholder.');
    }
    const targetDeploy = JSON.parse(
      readFileSync(fileURLToPath(new URL('../.firebaserc', import.meta.url)), 'utf8'),
    ).projects?.default;
    if (targetDeploy !== projectId) {
      throw new Error(
        `[firebase] Project ID frontend (${projectId}) tidak cocok dengan target .firebaserc (${targetDeploy || 'belum diatur'}).`,
      );
    }
  }
  const target = emulator
    ? 'http://127.0.0.1:5001'
    : `https://${region}-${projectId}.cloudfunctions.net`;
  const endpoint = (name) => emulator
    ? `/${projectId}/${region}/${name}`
    : `/${name}`;
  const proxy = (path, name) => ({
    target,
    changeOrigin: true,
    rewrite: (requestPath) => requestPath.replace(new RegExp(`^${path}(?=\\?|$)`), endpoint(name)),
  });

  return {
    plugins: [firebaseMessagingWorker(firebaseConfig)],
    // base: '/',  // aktifkan bila deploy ke sub-path (mis. GitHub Pages)

    server: {
      port: 5173,
      strictPort: true,
      host: true,
      proxy: {
        '/chat-files': proxy('/chat-files', 'chatAttachment'),
        '/profile-files': proxy('/profile-files', 'profilePhoto'),
      },
    },

    preview: {
      port: 4173,
      strictPort: true,
      host: true,
      proxy: {
        '/chat-files': proxy('/chat-files', 'chatAttachment'),
        '/profile-files': proxy('/profile-files', 'profilePhoto'),
      },
    },

    build: {
      outDir: 'dist',
      sourcemap: false,
      target: 'es2020',
      cssCodeSplit: true,
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks: {
            'firebase-app':   ['firebase/app'],
            'firebase-auth':  ['firebase/auth'],
            'firebase-fs':    ['firebase/firestore'],
            'firebase-rtdb':  ['firebase/database'],
            'firebase-fn':    ['firebase/functions'],
            'firebase-st':    ['firebase/storage'],
            'firebase-msg':   ['firebase/messaging'],
            'firebase-ac':    ['firebase/app-check'],
          },
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
        },
      },
    },

    esbuild: {
      drop: ['console', 'debugger'],
      legalComments: 'none',
    },
  };
});