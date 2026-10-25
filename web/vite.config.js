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
    rollupOptions: {
      onwarn(warning, warn) {
        const message = warning.message.replaceAll('\\', '/');
        if (
          warning.code === 'MODULE_LEVEL_DIRECTIVE' &&
          message.includes('Module level directives cause errors when bundled, "use client"') &&
          message.includes('in "node_modules/react-router/dist/') &&
          message.includes(' was ignored.')
        ) {
          return;
        }
        warn(warning);
      },
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
