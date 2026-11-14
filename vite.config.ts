import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the project at https://<user>.github.io/<repo>/, while Cloudflare's
// pull request previews (built with WORKERS_CI set) are served from the root of their own host.
const base = process.env.BASE_PATH ?? (process.env.WORKERS_CI ? '/' : '/pwagames/');

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Logic Puzzles',
        short_name: 'Puzzles',
        description: 'Logic puzzle games. Every puzzle has a unique solution you can reach without guessing.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // Only link previews fetch the share picture; the app never shows it.
        globIgnores: ['og.png'],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
