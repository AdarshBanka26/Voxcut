import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const shared = fileURLToPath(new URL('../shared', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@shared': shared } },
  server: {
    port: 5173,
    fs: { allow: ['..'] },
    proxy: { '/api': { target: process.env.VOXCUT_API || 'http://127.0.0.1:4000', changeOrigin: false } }
  }
});
