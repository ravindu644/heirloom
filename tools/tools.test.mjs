// Usage: node --test tools/
// The checks have to fail when they should. A check that cannot fail is a hope.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { androidColors, build } from './tokens.mjs';
import { check } from './style-check.mjs';

const design = fs.readFileSync('DESIGN.md', 'utf8');
const anyFont = () => true;

test('tokens: DESIGN.md builds, dark values land under the plain names', () => {
  const css = build(design, (f) => fs.existsSync(`design/fonts/${f}`));
  assert.match(css, /:root \{[^}]*--you: #C4321A;/);
  assert.match(css, /prefers-color-scheme: dark[^}]*\{[^}]*--you: #FF6A4D;/);
  // Picked by hand: dark wins over a light system, and light keeps the system's dark set away.
  assert.match(css, /:root\[data-theme="dark"\] \{[^}]*--you: #FF6A4D;/);
  assert.match(css, /:root:not\(\[data-theme="light"\]\) \{[^}]*--you: #FF6A4D;/);
  assert.match(css, /--type-figure-xl: 600 168px\/0\.9 "Barlow Condensed", sans-serif;/);
  assert.match(css, /--motion-press: 100ms;/);
  assert.match(css, /--layout-sidebar: 232px;/);
  assert.match(css, /--state-hover: 12%;/);
  assert.equal(css.match(/@font-face/g).length, 5);
  assert.doesNotMatch(css, /--dark-/);
});

test('tokens: a colour without a dark twin fails', () => {
  assert.throws(() => build(design.replace('  dark-rest: "#5DBE8D"\n', ''), anyFont), /rest has no dark twin/);
});

test('tokens: a dark colour without a light role fails', () => {
  assert.throws(() => build(design.replace('  rest: "#23704E"\n', ''), anyFont), /dark-rest has no light role/);
});

test('tokens: a component naming an unknown role fails', () => {
  assert.throws(() => build(design.replace('{colors.you-tint}', '{colors.yuo-tint}'), anyFont), /unknown role \{colors\.yuo-tint\}/);
});

test('tokens: a missing font file fails', () => {
  assert.throws(() => build(design, (f) => f !== 'barlow-500.woff2'), /design\/fonts\/barlow-500\.woff2/);
});

test('style-check: literals are caught with file and line', () => {
  const bad = {
    'a.css': ['.a { color: #C4321A; }', '.a { background: rgb(0 0 0); }', '.a { color: white; }',
      '.a { font-family: "Inter"; }', '.a { font: 600 16px/1 Georgia; }', '.a { transition: opacity 200ms; }',
      '.a { transition: opacity .2s; }'],
    'a.tsx': ['const c = "#fff";', "el.style.fontFamily = 'Barlow';", "el.animate(k, { duration: '160ms' });"],
  };
  for (const [file, lines] of Object.entries(bad)) {
    for (const line of lines) {
      const found = check(`\n${line}`, file);
      assert.ok(found.length, `missed: ${line}`);
      assert.ok(found[0].startsWith(`${file}:2: `), found[0]);
    }
  }
});

test('style-check: token use passes', () => {
  const good = `.a { color: var(--ink); background: var(--you-tint); font: var(--type-body); }
.a:hover { transition: color var(--motion-press) var(--motion-ease); white-space: nowrap; }
.b { font: inherit; padding: var(--space-md); border: 1px dashed var(--ghost); grid-template-columns: 232px 1fr; }`;
  assert.deepEqual(check(good, 'a.css'), []);
  assert.deepEqual(check('const left = `${m}:${s}`; const laps = 4;', 'a.tsx'), []);
  assert.deepEqual(check('// keep taps under 100ms, fixes #1234\nconst a = 1; // 200ms\n/* was #fff\n and 2s */', 'a.tsx'), []);
  assert.deepEqual(check('/* was #fff */\n.a { color: var(--ink); }', 'a.css'), []);
  // A comment must not hide the code beside it, and line numbers must survive a block comment.
  assert.equal(check('/* one\n two */\n.a { color: #fff; } /* why */', 'a.css')[0].split(' ')[0], 'a.css:3:');
});

test('tokens: the Android shell holds DESIGN.md\'s colours, not copies gone stale', () => {
  for (const [name, xml] of Object.entries(androidColors(design))) {
    assert.equal(fs.readFileSync(`android/app/src/main/res/${name}`, 'utf8'), xml, `${name}: run make tokens`);
  }
  // The notification icon's tint is the one colour Capacitor's own config holds.
  const you = design.match(/^  you: "(#[0-9A-F]{6})"/m)[1];
  assert.equal(JSON.parse(fs.readFileSync('capacitor.config.json', 'utf8')).plugins.LocalNotifications.iconColor, you);
});
