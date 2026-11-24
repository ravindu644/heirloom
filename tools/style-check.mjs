// Usage: node tools/style-check.mjs
// Fails when client/src/ui holds a colour, a font name or a duration that did not come from
// tokens.css. DESIGN.md is the one place those values live.
import fs from 'node:fs';
import path from 'node:path';

const anywhere = [
  ['colour', /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/],
  ['font name', /\b(?:Barlow|Inter|Roboto|Arial|Helvetica|system-ui|sans-serif|monospace)\b/],
  // ponytail: sees 200ms in text, not setTimeout(fn, 200). Review catches a bare number.
  ['duration', /\b\d*\.?\d+m?s\b/],
];
const cssOnly = [
  ['colour', /:[^;{]*\b(?:white|black|red|green|blue|gr[ae]y|orange|yellow|purple|pink|navy|teal|tomato|silver)\b/],
  ['font name', /\bfont(?:-family)?\s*:(?![^;]*(?:var\(--|inherit))/],
];

export function check(text, file) {
  const rules = file.endsWith('.css') ? [...anywhere, ...cssOnly] : anywhere;
  // Comments are for people: "under 100ms" or "fixes #1234" in one is not a style value.
  const code = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/(^|\s)\/\/.*$/gm, '$1');
  return code.split('\n').flatMap((line, i) =>
    rules.filter(([, re]) => re.test(line)).map(([what]) => `${file}:${i + 1}: ${what} literal: ${line.trim()}`));
}

if (import.meta.main) {
  const dir = 'client/src/ui';
  const files = fs.readdirSync(dir, { recursive: true })
    .filter((f) => /\.(css|tsx?)$/.test(f) && f !== 'tokens.css')
    .map((f) => path.join(dir, f));
  const found = files.flatMap((f) => check(fs.readFileSync(f, 'utf8'), f));
  found.forEach((l) => console.error(l));
  console.log(`style-check: ${files.length} files, ${found.length} literals`);
  process.exit(found.length ? 1 : 0);
}
