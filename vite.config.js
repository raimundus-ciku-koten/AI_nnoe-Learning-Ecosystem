// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  // Menentukan direktori root file sumber jika diperlukan (default: current directory)
  root: './',
  server: {
    port: 3000,
    open: true, // Otomatis membuka browser saat npm run dev dijalankan
    cors: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Optimasi chunking untuk performa LCP < 2.5s
  }
});