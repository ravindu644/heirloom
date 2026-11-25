// Usage: node design/logos/make.mjs
// Draws the five logo concepts as SVG (one file each, dark tile) and sheet.html, which shows every
// one on three grounds and at icon sizes. Colours are DESIGN.md's; change a shape here, run again.
import { writeFileSync } from 'node:fs';

const here = new URL('.', import.meta.url);
const themes = {
  dark: { bg: '#0E100E', you: '#FF6A4D', ghost: '#7C827B', ink: '#F0F2EE' },
  chalk: { bg: '#EEF0EC', you: '#C4321A', ghost: '#8A9089', ink: '#121412' },
  tomato: { bg: '#C4321A', you: '#EEF0EC', ghost: '#EEF0EC', ink: '#121412' },
};
const n = (x) => Math.round(x * 10) / 10;
const polar = (r, deg, cx = 256, cy = 256) => [n(cx + r * Math.cos((deg * Math.PI) / 180)), n(cy + r * Math.sin((deg * Math.PI) / 180))];

// A ring cut into `count` equal dashes, a dash and a gap filling the circle exactly.
const dashes = (r, count, share = 0.6) => {
  const period = (2 * Math.PI * r) / count;
  return `${n(period * share)} ${n(period * (1 - share))}`;
};

const concepts = {
  // The colon of the big timer. Its two dots are the two runners: you, and the ghost under you.
  colon: (c) => `
    <circle cx="256" cy="160" r="70" fill="${c.you}"/>
    <circle cx="256" cy="344" r="59" fill="none" stroke="${c.ghost}" stroke-width="22" stroke-dasharray="${dashes(59, 8)}" transform="rotate(-13.5 256 344)"/>`,

  // The race on the Focus screen: your lane, the mark where you are now, and the ghost's lane behind.
  lanes: (c) => `
    <rect x="80" y="168" width="330" height="76" rx="6" fill="${c.you}"/>
    <rect x="410" y="146" width="18" height="120" fill="${c.ink}"/>
    <rect x="90" y="300" width="200" height="56" rx="4" fill="none" stroke="${c.ghost}" stroke-width="20" stroke-dasharray="34 22.9"/>`,

  // A slice of an heirloom tomato, ribbed and a little flat as they are, with four chambers: a set
  // of four laps, three run and the fourth still a dashed line.
  slice: (c) => {
    const pts = [];
    for (let i = 0; i < 240; i++) {
      const t = (i / 240) * 2 * Math.PI;
      const r = 176 * (0.935 + 0.065 * Math.abs(Math.cos(4.5 * t + 0.5)) ** 0.6) * (1 + 0.04 * Math.cos(2 * t - 0.6));
      pts.push(polar(r, (t * 180) / Math.PI).join(' '));
    }
    const wedge = (i, r0, r1, a) => {
      const a0 = 14 + 90 * i + a;
      const a1 = 14 + 90 * i + 90 - a;
      return `M${polar(r0, a0)} L${polar(r1, a0)} A${r1} ${r1} 0 0 1 ${polar(r1, a1)} L${polar(r0, a1)} A${r0} ${r0} 0 0 0 ${polar(r0, a0)} Z`;
    };
    return `
    <g transform="translate(0 20.5) scale(1 .92)">
    <path d="M${pts.join(' L')} Z" fill="${c.you}"/>
    ${[1, 2, 3].map((i) => `<path d="${wedge(i, 66, 98, 25)}" fill="${c.bg}" stroke="${c.bg}" stroke-width="34" stroke-linejoin="round"/>`).join('\n    ')}
    <path d="${wedge(0, 54, 110, 15)}" fill="none" stroke="${c.bg}" stroke-width="11" stroke-linejoin="round" stroke-dasharray="20 12.6"/>
    </g>`;
  },

  // The same letter twice: the ghost's h a stride behind, its last stroke hidden behind yours.
  h: (c) => `
    <path d="M119 396 V108 M119 286 A61 64 0 0 1 241 286" fill="none" stroke="${c.ghost}" stroke-width="26" stroke-dasharray="30 18"/>
    <path d="M241 396 V108 M241 286 A64 64 0 0 1 369 286 V396" fill="none" stroke="${c.you}" stroke-width="58"/>`,

  // The track from above, since a lap is a lap: your lane outside, the ghost's inside, one start line.
  track: (c) => `
    <rect x="80" y="140" width="352" height="232" rx="116" fill="none" stroke="${c.you}" stroke-width="46"/>
    <rect x="141" y="201" width="230" height="110" rx="55" fill="none" stroke="${c.ghost}" stroke-width="22" stroke-dasharray="29 19.8"/>
    <rect x="296" y="300" width="16" height="95" fill="${c.ink}"/>`,
};

// Where each mark's ink lies, for setting it beside the name without the tile's air around it.
const boxes = { colon: [176, 80, 160, 344], lanes: [70, 136, 368, 240], slice: [76, 84, 360, 344], h: [106, 100, 292, 304], track: [50, 110, 412, 292] };

const svg = (name, theme, { size = 512, tile = true } = {}) => {
  const c = themes[theme];
  const [x, y, w, h] = tile ? [0, 0, 512, 512] : boxes[name];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${n((size * w) / h)}" height="${size}" role="img" aria-label="heirloom, ${name}">${
    tile ? `\n    <rect width="512" height="512" rx="112" fill="${c.bg}"/>` : ''
  }${concepts[name](c)}\n</svg>\n`;
};

for (const name of Object.keys(concepts)) writeFileSync(new URL(`${name}.svg`, here), svg(name, 'dark'));

const words = {
  colon: ['The colon', 'The colon out of the big timer. Its two dots are the two runners: you, and the ghost.'],
  lanes: ['The lanes', 'The race from the Focus screen: your lane, the mark where you are now, the ghost a little behind.'],
  slice: ['The slice', 'An heirloom tomato cut across, ribbed as they are. Four chambers for a set of four laps: three run, one still dashed.'],
  h: ['The h', 'The h of heirloom, twice: the ghost a stride behind, its last stroke hidden behind yours.'],
  track: ['The track', 'A lap is a lap. Your lane outside, the ghost inside, one start line.'],
};

const row = (name, i) => `
<section>
  <header><b>${i + 1}</b><h2>${words[name][0]}</h2><p>${words[name][1]}</p></header>
  <div class="tiles">${Object.keys(themes).map((t) => svg(name, t, { size: 168 })).join('')}</div>
  <div class="small">${['dark', 'chalk'].map((t) => `<span class="${t}">${[64, 32, 16].map((s) => svg(name, t, { size: s })).join('')}</span>`).join('')}</div>
  <div class="lockups">${['chalk', 'dark'].map((t) => `<span class="${t}">${svg(name, t, { size: 34, tile: false })}heirloom</span>`).join('')}</div>
</section>`;

writeFileSync(
  new URL('sheet.html', here),
  `<!doctype html><meta charset="utf-8"><title>heirloom logos</title>
<style>
@font-face { font-family: Barlow; font-weight: 400; src: url(../fonts/barlow-400.woff2); }
@font-face { font-family: Barlow; font-weight: 600; src: url(../fonts/barlow-600.woff2); }
@font-face { font-family: "Barlow Condensed"; font-weight: 600; src: url(../fonts/barlow-condensed-600.woff2); }
body { margin: 0; padding: 40px 48px; width: 1500px; background: #EEF0EC; color: #121412; font: 400 17px/1.4 Barlow, sans-serif; }
h1 { margin: 0 0 4px; font: 600 34px/1.1 Barlow; letter-spacing: -0.02em; }
h1 + p { margin: 0 0 20px; color: #474C47; }
section { display: grid; grid-template-columns: 250px auto auto 1fr; gap: 32px; align-items: center; padding: 22px 0; border-top: 1px solid #D5D9D3; }
header b { font: 600 44px/1 "Barlow Condensed"; color: #C4321A; }
h2 { margin: 6px 0 6px; font: 600 22px/1.2 Barlow; }
header p { margin: 0; color: #474C47; font-size: 15px; }
svg { display: block; }
.tiles { display: flex; gap: 16px; }
.tiles svg:nth-child(2) { outline: 1px solid #D5D9D3; outline-offset: -1px; border-radius: 22%; }
.small, .lockups { display: grid; gap: 12px; }
.small span { display: flex; gap: 14px; align-items: center; padding: 12px 16px; border-radius: 8px; }
.small .dark { background: #232623; } .small .chalk { background: #FFFFFF; }
.small .chalk svg { outline: 1px solid #D5D9D3; outline-offset: -1px; border-radius: 22%; }
.lockups span { display: flex; align-items: center; gap: 12px; padding: 16px 22px; border-radius: 8px; font: 600 30px/1 Barlow; letter-spacing: -0.01em; }
.lockups .chalk { background: #FFFFFF; } .lockups .dark { background: #0E100E; color: #F0F2EE; }
</style>
<h1>heirloom: five marks</h1>
<p>Each on the dark ground, on chalk and on tomato; then at 64, 32 and 16 px; then beside the name.</p>
${Object.keys(concepts).map(row).join('')}
`,
);
console.log('wrote', Object.keys(concepts).length, 'marks and sheet.html');
