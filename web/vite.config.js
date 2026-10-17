import { defineConfig, loadEnv } from 'vite';

function validateSupabaseConfig(url, key) {
  if (!url || !key) {
    throw new Error(
      'Konfigurasi Supabase wajib diisi: VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY.',
    );
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (cause) {
    throw new Error('VITE_SUPABASE_URL harus berupa URL yang valid.', { cause });
  }
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (parsed.protocol !== 'https:' && !localHosts.has(parsed.hostname)) {
    throw new Error('VITE_SUPABASE_URL harus menggunakan HTTPS di luar localhost.');
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim();
  const supabaseKey = (process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (mode === 'production') validateSupabaseConfig(supabaseUrl, supabaseKey);

  return {
    server: {
      port: 5173,
      strictPort: true,
      host: true,
    },
    preview: {
      port: 4173,
      strictPort: true,
      host: true,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      target: 'es2020',
      cssCodeSplit: true,
      emptyOutDir: true,
      rollupOptions: {
        output: {
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
