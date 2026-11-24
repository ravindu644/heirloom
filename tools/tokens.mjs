// Usage: node tools/tokens.mjs
// Writes client/src/ui/tokens.css from the front matter of DESIGN.md: colours (the dark set under
// prefers-color-scheme), type, spacing, radii, layout sizes, motion, and one @font-face per family and weight.
// Fails on a colour without a dark twin, a reference to a role that does not exist, or a font
// file missing from design/fonts.
import fs from 'node:fs';
import { parse } from 'yaml';

const kebab = (s) => s.toLowerCase().replaceAll(' ', '-');
const block = (lines) => lines.map((l) => `  ${l}`).join('\n');

export function build(designMd, fontExists) {
  const front = designMd.match(/^---\n([\s\S]*?)\n---/);
  if (!front) throw new Error('DESIGN.md has no front matter');
  const d = parse(front[1]);
  const errors = [];

  const light = [], dark = [];
  for (const [name, value] of Object.entries(d.colors)) {
    if (name.startsWith('dark-')) {
      if (!(name.slice(5) in d.colors)) errors.push(`colour ${name} has no light role ${name.slice(5)}`);
      dark.push(`--${name.slice(5)}: ${value};`);
    } else {
      if (!(`dark-${name}` in d.colors)) errors.push(`colour ${name} has no dark twin dark-${name}`);
      light.push(`--${name}: ${value};`);
    }
  }

  // A component that names a role nobody defined is a typo that would ship as an unset variable.
  for (const [, group, key] of JSON.stringify(d.components).matchAll(/\{(\w+)\.([\w-]+)\}/g)) {
    if (!(key in (d[group] ?? {}))) errors.push(`unknown role {${group}.${key}} in components`);
  }

  const faces = new Map(), type = [];
  for (const [name, t] of Object.entries(d.typography)) {
    const file = `${kebab(t.fontFamily)}-${t.fontWeight}.woff2`;
    if (!fontExists(file)) errors.push(`typography ${name} needs design/fonts/${file}`);
    // swap: words show at once in the fallback and settle when the face arrives.
    faces.set(file, `@font-face { font-family: "${t.fontFamily}"; font-weight: ${t.fontWeight}; font-style: normal; font-display: swap; src: url("../../../design/fonts/${file}") format("woff2"); }`);
    // The generic family is what shows until the face arrives. Without it that is the browser's serif.
    type.push(`--type-${name}: ${t.fontWeight} ${t.fontSize}/${t.lineHeight} "${t.fontFamily}", sans-serif;`);
    if (t.letterSpacing) type.push(`--tracking-${name}: ${t.letterSpacing};`);
    if (t.fontFeature) type.push(`--feature-${name}: ${t.fontFeature};`);
  }

  if (errors.length) throw new Error(errors.join('\n'));
  const vars = (prefix, map) => Object.entries(map ?? {}).map(([k, v]) => `--${prefix}${k}: ${v};`);
  return `/* generated from DESIGN.md by tools/tokens.mjs: edit that, not this */
${[...faces.values()].join('\n')}
:root {
  color-scheme: light dark;
${block([...light, ...type, ...vars('space-', d.spacing), ...vars('radius-', d.rounded), ...vars('layout-', d.layout), ...vars('state-', d.state), ...vars('shadow-', d.shadow), ...vars('motion-', d.motion)])}
}
@media (prefers-color-scheme: dark) {
  :root {
${block(block(dark).split('\n'))}
  }
}
`;
}

// The Android shell draws the mark before any CSS exists (the icon, the splash, the status bar
// icon's tint), so it needs the same three colours as resources. Light and dark, as two files.
const ANDROID_ROLES = ['ground', 'you', 'ghost'];
export function androidColors(designMd) {
  const { colors } = parse(designMd.match(/^---\n([\s\S]*?)\n---/)[1]);
  const file = (prefix) => `<?xml version="1.0" encoding="utf-8"?>
<!-- generated from DESIGN.md by tools/tokens.mjs: edit that, not this -->
<resources>
${ANDROID_ROLES.map((role) => `    <color name="${role}">${colors[prefix + role]}</color>`).join('\n')}
</resources>
`;
  return { 'values/colors.xml': file(''), 'values-night/colors.xml': file('dark-') };
}

if (import.meta.main) {
  const design = fs.readFileSync('DESIGN.md', 'utf8');
  const css = build(design, (f) => fs.existsSync(`design/fonts/${f}`));
  fs.mkdirSync('client/src/ui', { recursive: true });
  fs.writeFileSync('client/src/ui/tokens.css', css);
  const res = 'android/app/src/main/res';
  if (fs.existsSync(res)) for (const [name, xml] of Object.entries(androidColors(design))) fs.writeFileSync(`${res}/${name}`, xml);
  console.log(`tokens.css: ${css.match(/--/g).length} variables`);
}
