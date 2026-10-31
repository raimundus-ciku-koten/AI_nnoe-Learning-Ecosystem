import { defineConfig } from 'vite';

export default defineConfig({
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
    // MathLive is an on-demand editor chunk; keep its measured budget explicit.
    chunkSizeWarningLimit: 850,
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
});
