// Usage: node tools/icons.mjs
// Writes the installable web app's icons and manifest into client/public/: the colon mark (the
// Android launcher's, design/logos/colon.svg) on the dark ground, drawn by Chromium so the PNGs
// match the SVG exactly. Colours are read from DESIGN.md; change them there and run this again.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const root = new URL('..', import.meta.url);
const design = readFileSync(new URL('DESIGN.md', root), 'utf8');
const token = (name) => design.match(new RegExp(`^  ${name}: "(#[0-9A-Fa-f]{6})"`, 'm'))?.[1] ?? fail(name);
function fail(name) {
  throw new Error(`DESIGN.md has no colour ${name}`);
}
const c = { ground: token('dark-ground'), you: token('dark-you'), ghost: token('dark-ghost') };

// The mark on a 512 square. `scale` shrinks it about the middle: a maskable icon must keep it
// inside the 80% circle that any launcher's mask leaves, so it is drawn smaller there.
const mark = (scale) => `
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <circle cx="256" cy="160" r="70" fill="${c.you}"/>
    <circle cx="256" cy="344" r="59" fill="none" stroke="${c.ghost}" stroke-width="22" stroke-dasharray="27.8 18.5" transform="rotate(-13.5 256 344)"/>
  </g>`;
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${body}</svg>`;
// "any": a rounded tile, as the system shows it with nothing cut away (a Windows taskbar, a Linux
// dock). "maskable": the ground to every edge, the launcher cuts its own shape.
const icons = {
  'icon-any': svg(`<rect width="512" height="512" rx="112" fill="${c.ground}"/>${mark(0.82)}`),
  'icon-maskable': svg(`<rect width="512" height="512" fill="${c.ground}"/>${mark(0.7)}`),
};

const out = new URL('client/public/icons/', root);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const [name, body] of Object.entries(icons)) {
  for (const size of [192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${body}`);
    writeFileSync(new URL(`${name}-${size}.png`, out), await page.screenshot({ omitBackground: true }));
    await page.close();
  }
}
await browser.close();

const icon = (name, size, purpose) => ({ src: `/icons/${name}-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose });
writeFileSync(
  new URL('client/public/manifest.webmanifest', root),
  `${JSON.stringify(
    {
      id: '/',
      name: 'heirloom',
      short_name: 'heirloom',
      description: 'Race the you of last week. A Pomodoro, tasks and habits app, your phone and laptop in step.',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: c.ground,
      theme_color: c.ground,
      icons: [icon('icon-any', 192, 'any'), icon('icon-any', 512, 'any'), icon('icon-maskable', 192, 'maskable'), icon('icon-maskable', 512, 'maskable')],
    },
    null,
    2,
  )}\n`,
);
console.log('icons and manifest written to client/public/');
