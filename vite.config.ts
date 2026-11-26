import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
// The server's push at a bell (protocol.md section 17). Every open window is told the run has
// rung, so a page whose own late timer fires afterwards stays quiet. A window that is looking
// rings by itself; only when none is does this show the notification.
self.addEventListener('push', (e) => {
  let d = null;
  try { d = e.data.json(); } catch {}
  if (!d || d.t !== 'ring') return;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    // A window that is looking at the timer rings by itself. The "open in another tab" window
    // has no timer, but it cannot be told apart from here, so each window is told whether a
    // notification was shown, and the one with the timer rings if none was.
    const shown = !windows.some((w) => w.visibilityState === 'visible');
    for (const w of windows) w.postMessage({ t: 'rang', run: d.run, at: d.at, shown });
    if (shown) return self.registration.showNotification(d.title, { body: d.body, tag: 'heirloom-ring' });
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((windows) => (windows[0] ? windows[0].focus() : self.clients.openWindow('/'))));
});
`,
    });
  },
});

// What About in Settings names: package.json's version (the one `make bump` sets) and the commit
// the build came from, the same pair in the browser and in the APK. Vite hands VITE_ variables
// from the environment to the app.
process.env.VITE_VERSION ??= JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
process.env.VITE_COMMIT ??= (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
})();

export default defineConfig({
  root: 'client',
  plugins: [preact(), offline()],
  // The fonts stay in design/fonts, one copy for the mockups and the app, so the dev server must
  // read above client/. It must never hand out .local/, where the server's login and the dev database
  // live. The first four are Vite's own defaults, which setting deny replaces.
  server: {
    fs: { allow: ['..'], deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.local/**'] },
    // `make dev` runs heirloomd beside Vite; the app talks to its own origin, as it does when
    // heirloomd serves it for real.
    proxy: { '/api': { target: 'http://127.0.0.1:8787', ws: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
