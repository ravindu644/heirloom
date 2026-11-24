import { createHash } from 'node:crypto';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import preact from '@preact/preset-vite';

// "Works fully offline" has to include opening the app: a laptop with no connection that
// reloads the page must get heirloom, not the browser's error page. So the build writes a
// service worker that keeps every built file. It is made here because only the build knows the
// hashed names. /api/ is never touched: the engine has its own answer to being offline.
const offline = (): Plugin => ({
  name: 'heirloom-offline',
  apply: 'build',
  enforce: 'post',
  generateBundle(_, bundle) {
    const files = ['/', ...Object.keys(bundle).filter((f) => f !== 'index.html').map((f) => `/${f}`)];
    // The names carry content hashes, so the list changes exactly when the app does.
    const version = createHash('sha256').update(files.join()).digest('hex').slice(0, 12);
    this.emitFile({
      type: 'asset',
      fileName: 'sw.js',
      source: `const VERSION = 'heirloom-${version}';
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(caches.match(url.pathname, { cacheName: VERSION }).then((hit) => hit ?? fetch(e.request)));
});
`,
    });
  },
});

export default defineConfig({
  root: 'client',
  plugins: [preact(), offline()],
  // The fonts stay in design/fonts, one copy for the mockups and the app, so the dev server must
  // read above client/. It must never hand out .local/, where the S10's login and the dev database
  // live. The first four are Vite's own defaults, which setting deny replaces.
  server: {
    fs: { allow: ['..'], deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.local/**'] },
    // `make dev` runs heirloomd beside Vite; the app talks to its own origin, as it does when
    // heirloomd serves it for real.
    proxy: { '/api': { target: 'http://127.0.0.1:8787', ws: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
