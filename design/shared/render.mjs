// Renders a route's screens at phone and laptop size, in light and/or dark.
//   node shared/render.mjs routes/b/screens [--dark] [--only focus,today]
// render-still.mjs renders one size per DESIGN.md; these screens need two sizes and two themes,
// so this is the same playwright call with a viewport loop. It also fails loudly when a face fell
// back, since a fallback silently looks like the default every generated screen has.
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire('/home/ravindu644/Documents/Git/agent-forge-design/package.json');
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const dir = args[0], dark = args.includes('--dark'), lightToo = !args.includes('--dark-only');
const only = (args[args.indexOf('--only') + 1] || '').split(',').filter(s => args.includes('--only') && s);
const sizes = { phone: [412, 915], laptop: [1440, 900] };
const themes = [...(lightToo ? ['light'] : []), ...(dark ? ['dark'] : [])];
const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || '/usr/bin/brave-browser' });
let bad = 0;
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.html'))) {
  const name = f.replace('.html', '');
  if (only.length && !only.includes(name)) continue;
  for (const [size, [w, h]] of Object.entries(sizes)) for (const theme of themes) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('console', m => (m.type() === 'error' || m.type() === 'assert' || /Assertion/.test(m.text())) && errors.push(m.text()));
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve(dir, f)).href + `?theme=${theme}&size=${size}`);
    await page.evaluate(() => document.fonts.ready);
    const fonts = await page.evaluate(() => [...document.fonts].filter(x => x.status === 'loaded').map(x => x.family + ' ' + x.weight));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    const out = path.join(dir, `${name}-${size}-${theme}.png`);
    await page.screenshot({ path: out });
    if (errors.length || overflow) { bad++; console.log('PROBLEM', out, errors, overflow ? 'horizontal overflow' : ''); }
    console.log(out, fonts.join(', '));
    await page.close();
  }
}
await browser.close();
process.exit(bad ? 1 : 0);
