import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

const clientRoot = fileURLToPath(new URL('./client/', import.meta.url));

export default defineConfig({
  root: clientRoot,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Elector Security', short_name: 'DG Security', start_url: '/', display: 'standalone',
        background_color: '#f4f8fb', theme_color: '#0b6e87', description: 'Simple, secure duty and attendance for Elector.',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
      },
      workbox: { navigateFallback: '/', runtimeCaching: [{ urlPattern: /\/api\//, handler: 'NetworkOnly' }] }
    })
  ],
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['psychogenetic-hegemonic-gracie.ngrok-free.dev'],
    proxy: { '/api': 'http://localhost:4000' }
  },
  build: { outDir: 'dist', emptyOutDir: true }
});
