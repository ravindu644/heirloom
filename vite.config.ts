import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  root: 'client',
  plugins: [preact()],
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
