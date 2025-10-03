import { readFileSync } from 'fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const manifestPath = fileURLToPath(new URL('./public/manifest.webmanifest', import.meta.url));
const webManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      manifest: webManifest,
      registerType: 'autoUpdate',
      includeAssets: ['img/icon-192.png', 'img/icon-512.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}']
      },
      devOptions: {
        enabled: true
      }
    })
  ]
});
