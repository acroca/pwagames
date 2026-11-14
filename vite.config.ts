import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the project at https://<user>.github.io/<repo>/, while Cloudflare's
// pull request previews (built with WORKERS_CI set) are served from the root of their own host.
const base = process.env.BASE_PATH ?? (process.env.WORKERS_CI ? '/' : '/pwagames/');

/**
 * A file from public/ with a hash of its content as `?v=`. Phones, browsers and link previews
 * cache icons and the share picture by URL for a long time; this gives a changed file a new one.
 */
function versioned(file: string): string {
  const hash = createHash('sha256').update(readFileSync(new URL(`./public/${file}`, import.meta.url)));
  return `${file}?v=${hash.digest('hex').slice(0, 8)}`;
}

/** Pictures that index.html links to. */
const HTML_PICTURES = ['favicon.svg', 'apple-touch-icon.png', 'og.png'];

export default defineConfig({
  base,
  plugins: [
    {
      name: 'version-pictures',
      transformIndexHtml: (html) =>
        HTML_PICTURES.reduce((out, file) => out.replaceAll(`/${file}"`, `/${versioned(file)}"`), html),
    },
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
          { src: versioned('pwa-192x192.png'), sizes: '192x192', type: 'image/png' },
          { src: versioned('pwa-512x512.png'), sizes: '512x512', type: 'image/png' },
          { src: versioned('maskable-512x512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // Only link previews fetch the share picture; the app never shows it.
        globIgnores: ['og.png'],
        // Serve the versioned pictures from the precache, which stores them without `?v=`.
        ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^v$/],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
