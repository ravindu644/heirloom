// Usage: node tools/design-audit.mjs [--state <name>] [--size phone|wide|laptop]
// Opens every state of client/demo.html in Chromium at 412x915, 471x1020 (the first real phone)
// and 1440x900, reads what was drawn and holds it to DESIGN.md: type, colour (light and dark),
// shape, space, one left edge, rhythm, touch targets, the header, a page that scrolls, columns
// that run margin to margin under 720px, each job of words (a name, a note, a switch's words,
// a heading, a person) at the one size DESIGN.md gives it, a ticking number in words that moves
// nothing as its digits change, and a row's own links alike in every row of a list. Prints each
// violation once with every state it shows in, exits 1 if there is any. Builds the demo once with
// Vite into a temporary folder, serves it, and ends the server and the browser and removes the
// folder, also on failure or Ctrl-C.
// The rules are pure functions over collected data, so tools/design-audit.test.mjs runs them with
// no browser.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';

const SIZES = { phone: { width: 412, height: 915 }, wide: { width: 471, height: 1020 }, laptop: { width: 1440, height: 900 } };
// Under 720px the sidebar is the bottom bar and the layout is the phone's, whatever the width.
const narrow = (size) => SIZES[size].width < 720;
const near = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;
const r2 = (n) => Math.round(n * 100) / 100;
const pxs = (v) => String(v).split(/\s+/).filter((p) => /^-?[\d.]+px$|^0$/.test(p)).map(parseFloat);

// Colours as [r, g, b, a] with channels 0 to 255: computed styles come back as rgb(), rgba() or,
// for a color-mix, color(srgb 0..1 / a).
export function rgba(v) {
  if (/^#[0-9a-f]{6}$/i.test(v)) return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)).concat(1);
  let m = v.match(/^rgba?\(([\d.]+),? ([\d.]+),? ([\d.]+)(?:,? \/? ?([\d.]+))?\)$/);
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  m = v.match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.]+))?\)$/);
  if (m) return [m[1] * 255, m[2] * 255, m[3] * 255, m[4] === undefined ? 1 : +m[4]];
  return null;
}
const hex = (c) => '#' + c.slice(0, 3).map((n) => Math.round(n).toString(16).padStart(2, '0')).join('').toUpperCase() + (c[3] < 1 ? ` at ${r2(c[3])}` : '');
const mix = (a, b, p) => a.map((n, i) => (i < 3 ? n * (1 - p) + b[i] * p : 1));
// A channel apart is rounding; anything more is another colour.
const same = (a, b) => a.every((n, i) => (i < 3 ? Math.abs(n - b[i]) <= 1 : Math.abs(n - b[i]) <= 0.01));

/** Everything the rules allow, worked out from DESIGN.md's front matter. */
export function spec(designMd) {
  const d = parse(designMd.match(/^---\n([\s\S]*?)\n---/)[1]);
  const pct = (v) => parseFloat(v) / 100;
  const roles = Object.entries(d.typography).map(([name, t]) => {
    const size = parseFloat(t.fontSize);
    return { name, family: t.fontFamily, size, weight: +t.fontWeight, lh: String(t.lineHeight).endsWith('px') ? parseFloat(t.lineHeight) : size * t.lineHeight };
  });
  const palettes = {};
  for (const theme of ['light', 'dark']) {
    const pre = theme === 'dark' ? 'dark-' : '';
    const named = Object.keys(d.colors).filter((k) => !k.startsWith('dark-')).map((k) => ({ name: k, c: rgba(d.colors[pre + k]) }));
    const ink = named.find((n) => n.name === 'ink').c;
    const ground = named.find((n) => n.name === 'ground').c;
    palettes[theme] = [
      ...named,
      ...named.flatMap(({ name, c }) => [
        { name: `${name} with ink at state.hover`, c: mix(c, ink, pct(d.state.hover)) },
        { name: `${name} with ink at state.press`, c: mix(c, ink, pct(d.state.press)) },
      ]),
      { name: 'ground at state.scrim', c: [...ground.slice(0, 3), pct(d.state.scrim)] },
      ...Object.entries(d.shadow).map(([k, v]) => {
        const m = v.match(/rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/);
        return { name: `shadow.${k}`, c: [+m[1], +m[2], +m[3], +m[4]] };
      }),
    ];
  }
  const px = (v) => (String(v).endsWith('px') ? [parseFloat(v)] : []);
  const comp = Object.values(d.components).flatMap((c) => [c.padding, c.height, c.size].filter(Boolean).flatMap(pxs));
  const bearing = Object.fromEntries(Object.entries(d.layout).filter(([k]) => k.startsWith('figure-bearing')).map(([k, v]) => [k.slice(15) || 'any', parseFloat(v)]));
  return {
    families: new Set(roles.map((r) => r.family)),
    roles,
    palettes,
    radii: Object.values(d.rounded).flatMap(px),
    borders: [0, 1, 2],
    steps: Object.values(d.spacing).flatMap(px),
    spaces: [...new Set([...Object.values(d.spacing), ...Object.values(d.layout)].flatMap(px).concat(comp))].sort((a, b) => a - b),
    lg: parseFloat(d.spacing.lg),
    touch: parseFloat(d.layout.touch),
    bearing,
    phone: SIZES.phone.width,
    figureLg: roles.find((r) => r.name === 'figure-lg').size,
  };
}

const v = (rule, el, what, allowed) => ({ rule, path: el.path, text: el.text, what, allowed });

/** 1. The family is DESIGN.md's and size, weight and line height are one role's. */
export function type(el, s, width) {
  if (!el.hasText || !el.font) return [];
  const f = el.font;
  const family = f.family.split(',')[0].trim().replace(/^["']|["']$/g, '');
  if (!s.families.has(family)) return [v('type', el, `font ${family}`, `DESIGN.md has ${[...s.families].join(', ')}`)];
  const fits = (r) => r.family === family && near(f.size, r.size, 0.05) && f.weight === r.weight && f.lh !== null && near(f.lh, r.lh, 0.05);
  // figure-xl is the phone timer and nothing else. Under 720px it keeps its share of the width,
  // figure-xl times the width over 412, so a fixed 168px is wrong at 471. (Under 720 that stays
  // below figure-xxl, the cap DESIGN.md names.)
  // figure-xl-long is the same timer reading hours, two thirds its size, and keeps its share too.
  const share = s.roles.filter((r) => r.name === 'figure-xl' || r.name === 'figure-xl-long');
  const k = width / s.phone;
  const roles = width < 720 ? [...s.roles.filter((r) => !share.includes(r)), ...share.map((r) => ({ ...r, size: r.size * k, lh: r.lh * k }))] : s.roles;
  if (roles.some(fits)) return [];
  const nearest = roles.filter((r) => r.family === family).sort((a, b) => Math.abs(a.size - f.size) - Math.abs(b.size - f.size) || Math.abs(a.weight - f.weight) - Math.abs(b.weight - f.weight))[0];
  const say = (x) => `${r2(x.size)}px ${x.weight} ${x.lh === null ? 'normal' : r2(x.lh) + 'px'}`;
  return [v('type', el, `${family} ${say(f)} is no role`, nearest ? `nearest ${nearest.name} is ${say(nearest)}` : 'no role uses this family')];
}

/** 2. Every painted colour is the theme's palette, one of its defined mixes, or transparent. */
export function colour(el, s, theme) {
  const allowed = s.palettes[theme];
  return el.colours.flatMap(([prop, value]) => {
    const c = rgba(value);
    if (!c) return [v('colour', el, `${prop} ${value}`, 'not an sRGB colour')];
    if (c[3] === 0 || allowed.some((a) => same(a.c, c))) return [];
    const dist = (a) => a.c.slice(0, 3).reduce((sum, n, i) => sum + (n - c[i]) ** 2, 0);
    const best = allowed.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    return [v('colour', el, `${theme} ${prop} ${hex(c)}`, `not a ${theme} colour; nearest ${best.name} ${hex(best.c)}`)];
  });
}

/** 3. Radii from `rounded`, borders 0, 1 or 2px. */
export function shape(el, s) {
  const out = [];
  for (const r of new Set(el.radius)) for (const n of pxs(r).length ? pxs(r) : [r]) {
    if (!s.radii.some((a) => near(a, +n, 0.01))) out.push(v('shape', el, `border-radius ${r}`, `rounded is ${s.radii.join(' ')}px`));
  }
  for (const b of new Set(el.border)) if (!s.borders.some((a) => near(a, b, 0.01))) out.push(v('shape', el, `border ${b}px`, 'borders are 0, 1 or 2px'));
  return out;
}

/** 4. Padding, margin and gap are values DESIGN.md holds. Auto margins never reach here. */
export function space(el, s) {
  return el.space.flatMap(([prop, n]) => {
    const a = Math.abs(n);
    if (a < 0.01 || s.spaces.some((x) => near(x, a, 0.01))) return [];
    // A link in a line: a 48px target that takes no more height than the line, by a negative
    // margin of half the difference. DESIGN.md asks for the target, not for this way of making it.
    if (prop.startsWith('margin') && n < 0 && el.font?.lh && near(n, (el.font.lh - s.touch) / 2, 0.05)) return [];
    if (prop.startsWith('margin') && n < 0 && el.figure && bearings(el, s).some((b) => near(n, b, 0.05))) return [];
    return [v('space', el, `${prop} ${r2(n)}px`, `DESIGN.md holds ${s.spaces.join(' ')}px`)];
  });
}

// How far a figure sits left of the edge. From figure-lg up its ink is put on the edge by the
// general bearing or its leading digit's; at figure-md and under the difference is under a pixel
// and none is applied.
function bearings(el, s) {
  if (el.font.size < s.figureLg - 0.05) return [0];
  const digit = (el.text.match(/\d/) ?? [])[0];
  return [s.bearing.any * el.font.size, ...(digit !== undefined ? [s.bearing[digit] * el.font.size] : [])];
}

/**
 * The columns of a screen: a container whose children in the flow stack one under the other with
 * no two side by side. Rows (a button beside a button) are not columns, so their children never
 * join a column. `main` and an open sheet are always columns, for the space above their content.
 */
export function columns(els) {
  const kids = new Map();
  for (const el of els) if (el.rect && el.parent !== null) (kids.get(el.parent) ?? kids.set(el.parent, []).get(el.parent)).push(el);
  const out = [];
  for (const box of els) {
    if (!box.inScope || !box.rect) continue;
    // A flex row that wraps stacks its lines too; it is still a row.
    if (/flex/.test(box.display) && !box.flexDirection.startsWith('column')) continue;
    // Inside a button the words are centred in a 48px target: that is the button's, not the screen's.
    if (box.inPress) continue;
    const flex = /flex|grid/.test(box.display);
    const blocks = (kids.get(box.i) ?? [])
      .filter((k) => !/absolute|fixed/.test(k.position) && k.float === 'none' && (flex || /^(block|flex|grid|table|list-item|flow-root)/.test(k.display)))
      .sort((a, b) => a.rect.y - b.rect.y);
    if (blocks.length < (box.root ? 1 : 2)) continue;
    if (blocks.some((b, i) => i && b.rect.y < blocks[i - 1].rect.y + blocks[i - 1].rect.h - 0.5)) continue;
    // What a block starts with: its first child, and that one's, while no words come first. The
    // streak's number leads a row ("60 days"), and it is the number that starts the column.
    for (const b of blocks) {
      let at = b;
      // A padded panel is a column of its own, however deep it stands: a figure leading it is
      // measured inside it, not against the column the panel stands in.
      const inset = (e) => e.content && e.content.left > e.rect.x + 0.5;
      while (!inset(at) && !at.figure && !at.textFirst && kids.get(at.i)?.length) at = kids.get(at.i)[0];
      b.lead = at !== b && at.figure ? at : null;
    }
    out.push({ box, blocks });
  }
  return out;
}

/** 5. Every block of a column starts at the column's edge; a figure may sit left by its bearing. */
export function edge(col, s) {
  if (col.blocks.length < 2) return [];
  const x = col.box.content.left;
  return col.blocks.flatMap((block) => {
    const b = block.lead ?? block;
    if (b !== block && !near(block.rect.x, x)) return [v('edge', block, `starts ${r2(block.rect.x - x)}px off its column's edge (${col.box.path})`, 'one left edge: 0')];
    const off = b.rect.x - x;
    const ok = b.figure ? bearings(b, s) : [0];
    if (ok.some((o) => near(off, o))) return [];
    const said = b.figure && ok[0] !== 0 ? `a figure from figure-lg up is pulled back by its bearing, ${ok.map(r2).join(' or ')}px` : '0';
    const at = near(off, 0) ? 'starts on its column\'s box edge' : `starts ${r2(Math.abs(off))}px ${off < 0 ? 'left' : 'right'} of its column's edge`;
    return [v('edge', b, `${at} (${col.box.path})`, `one left edge: ${said}`)];
  });
}

/**
 * 6. The space above the first block and between neighbours is 0 or a step no larger than lg.
 * The one space that may grow lies under the content: below a column's last block (not judged
 * here: that is where it belongs), or, on a phone, between the top group and the bottom one: the
 * action row, or the action row with the sentence that explains it directly above.
 */
export function rhythm(col, s, size, isRoot) {
  const { box, blocks } = col;
  const out = [];
  const spaces = [[blocks[0].rect.y - box.content.top, null, blocks[0]]];
  for (let i = 1; i < blocks.length; i++) spaces.push([blocks[i].rect.y - (blocks[i - 1].rect.y + blocks[i - 1].rect.h), blocks[i - 1], blocks[i]]);
  const last = blocks.at(-1), told = blocks.at(-2);
  const bottom = last?.holdsPress ? [last] : [];
  if (bottom.length && told && told !== blocks[0] && !told.holdsPress && told.text && last.rect.y - (told.rect.y + told.rect.h) <= s.lg + 0.5) bottom.push(told);
  for (const [gap, above, below] of spaces) {
    if (near(gap, 0) || (gap <= s.lg + 0.5 && s.steps.some((st) => near(gap, st)))) continue;
    // Above the first block only floating content counts: words centred in a 48px row are not a gap.
    if (!above && gap <= s.lg) continue;
    const where = above ? `between "${above.text || above.path}" and "${below.text || below.path}"` : `above "${below.text || below.path}", the first block of ${box.path}`;
    if (gap > s.lg) {
      if (narrow(size) && isRoot && above && below === bottom.at(-1)) continue;
      out.push(v('rhythm', below, `${r2(gap)}px ${where}`, `nothing related is further apart than lg (${s.lg}px); the one space that grows lies ${narrow(size) ? 'above the action row and its sentence' : 'below the last block'}`));
    } else out.push(v('rhythm', below, `${r2(gap)}px ${where}`, `spacing steps are ${s.steps.join(' ')}px`));
  }
  return out;
}

/** 7. At least touch by touch to a finger, and a button is a fill or underlined text. */
export function press(el, s) {
  if (!el.pressable || !el.hit) return [];
  const out = [];
  if (el.hit.w < s.touch || el.hit.h < s.touch) out.push(v('press', el, `${el.hit.w}x${el.hit.h}px to a finger`, `layout.touch is ${s.touch}x${s.touch}px`));
  const b = el.button;
  if (b && b.words && !b.underline && !(rgba(b.bg)?.[3] > 0) && !b.border && !b.row) out.push(v('press', el, 'a bare word that can be pressed', 'a button has a fill or is underlined text'));
  return out;
}

/**
 * 9. On a phone the page itself never scrolls: the content scrolls between the header and the
 * bottom bar. Nor does anything scroll sideways, at any size. `doc` names what sticks out furthest.
 */
export function scroll(doc, size) {
  const out = [];
  const at = (e) => ({ path: e?.path ?? 'html', text: e?.text ?? '' });
  if (narrow(size) && doc.scrollH > doc.viewH + 1) out.push(v('scroll', at(doc.lowest), `the page is ${doc.scrollH}px tall in a ${doc.viewH}px screen; this sticks out lowest, to ${doc.lowest ? r2(doc.lowest.edge) : '?'}px`, 'on a phone the page never scrolls; the content scrolls between the header and the bottom bar'));
  if (doc.scrollW > doc.viewW + 1) out.push(v('scroll', at(doc.rightmost), `the page is ${doc.scrollW}px wide in a ${doc.viewW}px screen; this sticks out furthest, to ${doc.rightmost ? r2(doc.rightmost.edge) : '?'}px`, 'nothing scrolls sideways'));
  return out;
}

/**
 * 10. Under 720px every column runs from margin to margin: a block of a column held narrower than
 * the column by its own max-width is a measure that belongs only from 720px up. A block narrower
 * because its content is short (a lone button, a chip) holds no cap and is not judged.
 */
export function fluid(col, size) {
  if (!narrow(size)) return [];
  const w = col.box.content.right - col.box.content.left;
  return col.blocks.flatMap((b) => {
    const cap = /px$/.test(b.maxWidth ?? '') ? parseFloat(b.maxWidth) : Infinity;
    if (!(cap < w - 0.5) || !near(b.rect.w, cap)) return [];
    return [v('fluid', b, `held to ${r2(cap)}px by its max-width in a ${r2(w)}px column`, 'under 720px a column runs margin to margin; a measure caps a line only from 720px up')];
  });
}

/**
 * 11. A size follows the job. The kit marks what its words do (`data-job`, a fieldset's legend is a
 * name), and each job is the one role DESIGN.md's Typography gives it, so the same job is one size
 * on every screen and two peers in one panel or sheet never differ.
 */
const JOBS = { name: 'label', note: 'label', sheet: 'label', switch: 'body', person: 'body', heading: 'body-strong' };
export function job(el, s) {
  if (!el.job || !el.font || el.figure || !JOBS[el.job]) return [];
  const role = s.roles.find((r) => r.name === JOBS[el.job]);
  if (near(el.font.size, role.size, 0.05)) return [];
  return [v('job', el, `a ${el.job} at ${r2(el.font.size)}px`, `a ${el.job} is ${role.name}, ${role.size}px, wherever it stands`)];
}

/**
 * 8. Every signed-in state has the same header at a size. Each state is compared with the header
 * most states share, and the first difference is named.
 */
export function header(byState) {
  const states = Object.entries(byState).filter(([, h]) => h?.length);
  if (states.length < 2) return [];
  const key = (h) => JSON.stringify(h);
  const count = new Map();
  for (const [, h] of states) count.set(key(h), (count.get(key(h)) ?? 0) + 1);
  const [usualKey, n] = [...count].sort((a, b) => b[1] - a[1])[0];
  const usual = JSON.parse(usualKey);
  return states.filter(([, h]) => key(h) !== usualKey).map(([state, h]) => {
    const diff = (a, b, at) => {
      if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return a === b ? null : `${at}: ${JSON.stringify(a)} here, ${JSON.stringify(b)} in ${n} other states`;
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const d = diff(a[k], b[k], at + (Array.isArray(a) ? `[${k}]` : `.${k}`));
        if (d) return d;
      }
      return null;
    };
    return { state, rule: 'header', path: 'header', text: h.map((p) => p.text).join(' | ').slice(0, 30), what: diff(h, usual, 'header'), allowed: 'every screen starts with the same header' };
  });
}

/** Every rule over one state at one size; `dark` is the same page collected in the dark theme. */
export function audit(light, dark, s, size, doc) {
  const width = SIZES[size].width;
  const cols = columns(light);
  const inCol = new Set(cols.flatMap((c) => c.blocks.map((b) => b.i)));
  return [
    ...light.flatMap((el) => [...type(el, s, width), ...colour(el, s, 'light'), ...shape(el, s), ...space(el, s), ...press(el, s), ...job(el, s)]),
    ...dark.flatMap((el) => colour(el, s, 'dark')),
    ...cols.flatMap((c) => [...edge(c, s), ...rhythm(c, s, size, !inCol.has(c.box.i) || c.box.root), ...fluid(c, size)]),
    ...(doc ? scroll(doc, size) : []),
  ];
}

// In the page. One pass over the DOM: what each element is, where it is and how it is drawn.
// `colours`: the second, dark pass, which needs nothing but colour, so it skips the slow parts.
export function collect(colours) {
  const PRESS = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=checkbox], [role=tab], [role=link], [role=switch]';
  const px = (n) => parseFloat(n) || 0;
  const local = (c) => c.replace(/__[0-9a-f]{5}$/, '');
  const name = (el) => el.tagName.toLowerCase() + (el.classList[0] ? '.' + local(el.classList[0]) : '');
  const pathOf = (el) => [el.parentElement?.parentElement, el.parentElement, el].filter((e) => e && e !== document.body && e.id !== 'app').map(name).join(' > ');
  const words = (el) => (el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 30);
  // Measured first, before any scrolling below. What makes the page scroll is found the way the
  // browser finds it: a box that no clipping ancestor of its containing block holds in. A visually
  // hidden element placed absolutely with no positioned ancestor escapes main's scroll this way.
  const root = document.documentElement;
  const doc = { scrollH: root.scrollHeight, viewH: innerHeight, scrollW: root.scrollWidth, viewW: innerWidth, lowest: null, rightmost: null };
  if (!colours && (doc.scrollH > doc.viewH + 1 || doc.scrollW > doc.viewW + 1)) {
    const escapes = (e) => {
      let pos = getComputedStyle(e).position;
      for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
        if (pos === 'fixed') return false;
        const cs = getComputedStyle(a);
        // A static ancestor is not an absolute box's containing block, so its overflow does not hold it.
        if (pos === 'absolute' && cs.position === 'static' && cs.transform === 'none') continue;
        if (cs.overflowY !== 'visible' || cs.overflowX !== 'visible') return false;
        pos = cs.position;
      }
      return pos !== 'fixed';
    };
    for (const e of document.body.querySelectorAll('*')) {
      const r = e.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      const b = r.bottom + scrollY, x = r.right + scrollX;
      if (b > (doc.lowest?.edge ?? doc.viewH + 1) && escapes(e)) doc.lowest = { path: pathOf(e), text: words(e), edge: b };
      if (x > (doc.rightmost?.edge ?? doc.viewW + 1) && escapes(e)) doc.rightmost = { path: pathOf(e), text: words(e), edge: x };
    }
  }
  const clear = (c) => c === 'transparent' || /rgba\(.*, 0\)$|\/ 0\)$/.test(c);
  const SIDES = ['top', 'right', 'bottom', 'left'];
  const modal = document.querySelector('dialog:modal');
  // A stuck block is drawn where the scroll put it, not where the flow did. Static holds the same
  // room in the flow, so for the read nothing else moves and the block is where it belongs.
  const stuck = [...document.querySelectorAll('*')].filter((e) => getComputedStyle(e).position === 'sticky');
  for (const e of stuck) e.style.setProperty('position', 'static', 'important');
  const out = [];
  const drawn = (cs, el, own) => {
    const colours = [];
    if (own) colours.push(['color', cs.color]);
    // A project's picked colour is the person's, not DESIGN.md's: the one place a colour value is
    // written in a style attribute (kit/square.tsx), and the one fill this check lets by.
    if (!clear(cs.backgroundColor) && !/background:\s*(#|rgb)/.test(el.getAttribute('style') ?? '')) colours.push(['background-color', cs.backgroundColor]);
    for (const side of SIDES) if (px(cs[`border-${side}-width`]) > 0 && !/none|hidden/.test(cs[`border-${side}-style`])) colours.push([`border-${side}-color`, cs[`border-${side}-color`]]);
    if (own && cs.textDecorationLine !== 'none') colours.push(['text-decoration-color', cs.textDecorationColor]);
    if (el instanceof SVGElement) {
      if (cs.fill !== 'none' && !cs.fill.startsWith('url')) colours.push(['fill', cs.fill]);
      if (cs.stroke !== 'none' && px(cs.strokeWidth) > 0) colours.push(['stroke', cs.stroke]);
    }
    for (const c of cs.boxShadow.matchAll(/rgba?\([^)]*\)|color\([^)]*\)/g)) colours.push(['box-shadow', c[0]]);
    return {
      colours,
      radius: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius],
      border: SIDES.map((s) => (/none|hidden/.test(cs[`border-${s}-style`]) ? 0 : px(cs[`border-${s}-width`]))),
    };
  };
  const visit = (el, parent, scoped) => {
    const cs = getComputedStyle(el);
    // A box of its own first: checkVisibility is false for display: contents, which has none, and
    // asked first it hid everything a contents wrapper holds (the room's sheet went unread).
    if (cs.display === 'contents') return [...el.children].forEach((c) => visit(c, parent, scoped));
    if (cs.display === 'none' || !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return;
    const r = el.getBoundingClientRect();
    // A screen reader's text: one pixel, clipped. Nothing of it is drawn.
    if (r.width <= 1 && r.height <= 1) return;
    const isRoot = el.tagName === 'MAIN' || (el.tagName === 'DIALOG' && el.open);
    const inScope = scoped || isRoot;
    if (r.width === 0 || r.height === 0) return [...el.children].forEach((c) => visit(c, parent, inScope));
    const field = /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.data).join('').replace(/\s+/g, ' ').trim();
    const i = out.length;
    const tm = el.computedStyleMap();
    const font = { family: cs.fontFamily, size: px(cs.fontSize), weight: +cs.fontWeight, lh: cs.lineHeight === 'normal' ? null : px(cs.lineHeight) };
    const bl = px(cs.borderLeftWidth), bt = px(cs.borderTopWidth), bb = px(cs.borderBottomWidth);
    const space = [];
    for (const s of SIDES) {
      space.push([`padding-${s}`, px(cs[`padding-${s}`])]);
      // An open sheet's margin hangs it in the screen (a share of its height on the laptop): where
      // it stands, not a space between two things.
      if (tm.get(`margin-${s}`).toString() !== 'auto' && !(isRoot && el.tagName === 'DIALOG')) space.push([`margin-${s}`, px(cs[`margin-${s}`])]);
    }
    for (const g of ['row-gap', 'column-gap']) if (cs[g] !== 'normal') space.push([g, px(cs[g])]);
    const pressable = el.matches(PRESS) && !(modal && !modal.contains(el));
    let button = null;
    if (el.tagName === 'BUTTON') {
      const under = (n) => getComputedStyle(n).textDecorationLine.includes('underline') || [...n.children].some(under);
      button = {
        words: !!el.textContent.trim(),
        bg: cs.backgroundColor,
        border: SIDES.some((s) => px(cs[`border-${s}-width`]) > 0 && !clear(cs[`border-${s}-color`])),
        underline: under(el),
        // A row: the words of a task row are a child of the painted row and fill its height, so
        // what is pressed is the row. A bare word on a panel is neither.
        row: (() => {
          const p = el.parentElement, pc = getComputedStyle(p);
          return !clear(pc.backgroundColor) && r.height >= p.getBoundingClientRect().height - px(pc.paddingTop) - px(pc.paddingBottom) - 1;
        })(),
      };
    }
    out.push({
      i, parent, tag: el.tagName.toLowerCase(), role: el.getAttribute('role'),
      path: pathOf(el),
      text: (own || (field ? el.value || el.placeholder : '') || el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 30),
      hasText: !!own || field,
      font,
      // Barlow Condensed is for figures and nothing else.
      figure: /Condensed/.test(cs.fontFamily),
      holdsPress: !!el.querySelector(PRESS),
      textFirst: [...el.childNodes].find((n) => n.nodeType === 1 || n.data.trim())?.nodeType === 3,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      content: { left: r.x + bl + px(cs.paddingLeft), right: r.right - px(cs.borderRightWidth) - px(cs.paddingRight), top: r.y + bt + px(cs.paddingTop) - el.scrollTop, bottom: r.bottom - bb - px(cs.paddingBottom) },
      maxWidth: cs.maxWidth,
      display: cs.display, flexDirection: cs.flexDirection, position: cs.position, float: cs.float,
      inPress: !!el.closest(PRESS),
      inScope, root: isRoot,
      // What the words do, where the kit says so; a fieldset's legend names its group.
      job: el.dataset?.job ?? (el.tagName === 'LEGEND' ? 'name' : null),
      ...drawn(cs, el, !!own || field),
      space, pressable, button, hit: null, el,
    });
    for (const p of ['::before', '::after']) {
      const ps = getComputedStyle(el, p);
      if (ps.content === 'none' || ps.display === 'none' || ps.width === '0px' || ps.height === '0px') continue;
      out.push({ i: out.length, parent: i, path: out[i].path + p, text: '', hasText: false, rect: null, ...drawn(ps, el, false), space: SIDES.flatMap((s) => [[`padding-${s}`, px(ps[`padding-${s}`])], [`margin-${s}`, px(ps[`margin-${s}`])]]), pressable: false });
    }
    if (isRoot && el.tagName === 'DIALOG') out.push({ i: out.length, parent: i, path: out[i].path + '::backdrop', text: '', rect: null, colours: [['background-color', getComputedStyle(el, '::backdrop').backgroundColor]], radius: [], border: [], space: [] });
    if (field && el.placeholder && !el.value) out.push({ i: out.length, parent: i, path: out[i].path + '::placeholder', text: el.placeholder.slice(0, 30), rect: null, colours: [['color', getComputedStyle(el, '::placeholder').color]], radius: [], border: [], space: [] });
    for (const c of el.children) visit(c, i, inScope);
  };
  for (const c of document.body.children) if (!/^(SCRIPT|STYLE|TEMPLATE)$/.test(c.tagName)) visit(c, null, false);

  // What a finger hits, after the geometry above is written down: each target is scrolled to the
  // middle and walked out from its centre, pixel by pixel, while elementFromPoint still finds it
  // (or a label that hands the tap to it).
  const hits = (el, x, y) => {
    const h = document.elementFromPoint(x, y);
    return !!h && (el.contains(h) || h.closest?.('label')?.control === el);
  };
  for (const e of out) {
    if (colours || !e.pressable) continue;
    e.el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = e.el.getBoundingClientRect();
    // Whole pixels: Chromium snaps a point to the pixel, so x.5 would be read as the next one.
    const cx = Math.floor(r.x + r.width / 2), cy = Math.floor(r.y + r.height / 2);
    if (!hits(e.el, cx, cy)) continue; // covered where it is: nothing to measure
    const reach = (dx, dy) => {
      let lo = 0, hi = 49; // ponytail: assumes the region is in one piece around the centre
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (hits(e.el, cx + dx * m, cy + dy * m)) lo = m; else hi = m; }
      return lo;
    };
    e.hit = { w: reach(-1, 0) + reach(1, 0) + 1, h: reach(0, -1) + reach(0, 1) + 1 };
  }

  // The header: the parts of the shell around main, other than the navigation and the status line.
  const shell = document.querySelector('main')?.parentElement;
  const parts = !colours && shell?.querySelector(':scope > nav') ? [...shell.children].filter((c) => !/^(MAIN|NAV|DIALOG)$/.test(c.tagName) && c.getAttribute('role') !== 'status' && c.getBoundingClientRect().height) : [];
  const half = (n) => Math.round(n * 2) / 2;
  const head = parts.map((p) => {
    const pr = p.getBoundingClientRect();
    const box = (r) => [half(r.x - pr.x), half(r.y - pr.y), half(r.width), half(r.height)];
    return {
      tag: p.tagName.toLowerCase(),
      text: p.textContent.trim().slice(0, 30),
      at: [half(pr.x), half(pr.y), half(pr.width), half(pr.height)],
      inside: [...p.querySelectorAll('*')].filter((d) => d.getBoundingClientRect().width > 1).map((d) => {
        const cs = getComputedStyle(d);
        return [d.tagName.toLowerCase(), ...box(d.getBoundingClientRect()), `${cs.fontSize} ${cs.fontWeight} ${cs.lineHeight}`];
      }),
    };
  });
  for (const e of stuck) e.style.removeProperty('position');
  for (const e of out) delete e.el;
  return { els: out, head, doc };
}

// In the page. 12. A number that ticks inside words (`data-live`) is drawn with its digits at
// both ends of their widths, all ones and then all zeros, and nothing on the screen that can be
// pressed, nor the line itself, may move or change size between the two: a countdown whose line
// wraps on one second and not the next makes the button beside it dance. The words are put back.
export function wobble() {
  const live = [...document.querySelectorAll('[data-live]')].filter((e) => e.checkVisibility());
  if (!live.length) return [];
  const nodes = live.flatMap((e) => { const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); const out = []; while (w.nextNode()) if (/\d/.test(w.currentNode.data)) out.push([w.currentNode, w.currentNode.data]); return out; });
  const watched = [...live, ...document.querySelectorAll('button, a[href], input, [role=button], [role=switch]')].filter((e) => e.checkVisibility());
  const boxes = (digit) => {
    for (const [n, was] of nodes) n.data = was.replace(/\d/g, digit);
    return watched.map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 2) / 2).join(' '); });
  };
  const ones = boxes('1'), zeros = boxes('0');
  for (const [n, was] of nodes) n.data = was;
  const name = (e) => e.tagName.toLowerCase() + (e.classList[0] ? '.' + e.classList[0].replace(/__[0-9a-f]{5}$/, '') : '');
  return watched.flatMap((e, i) => (ones[i] === zeros[i] ? [] : [{ rule: 'live', path: [e.parentElement, e].map(name).join(' > '), text: (e.textContent || '').trim().slice(0, 30), what: `moves as a ticking number's digits change: ${ones[i]} with ones, ${zeros[i]} with zeros`, allowed: 'a number that updates is tabular (data-live), and nothing beside it moves' }]));
}

// In the page. 13. A row's own links (`data-links`) stand alike in every row of a list: as far
// from the row's right edge, and all beside the words or all under them. The list is the nearest
// `ul`, `ol` or fold around them, a row its child that holds them.
export function rowLinks() {
  const lists = new Map();
  for (const links of document.querySelectorAll('[data-links]')) {
    if (!links.checkVisibility()) continue;
    const list = links.closest('ul, ol, [class^="fold__"], [class*=" fold__"]');
    const row = list && [...list.children].find((c) => c.contains(links));
    if (!row) continue;
    const r = row.getBoundingClientRect(), l = links.getBoundingClientRect();
    // Beside: the links share a line with what starts the row (the words) rather than standing under it.
    const lead = [...row.querySelectorAll('*')].find((e) => !e.contains(links) && !links.contains(e) && e.getBoundingClientRect().height > 0 && /\S/.test(e.textContent));
    const beside = !!lead && l.top < lead.getBoundingClientRect().bottom - 1;
    (lists.get(list) ?? lists.set(list, []).get(list)).push({ right: Math.round(r.right - l.right), beside, text: (row.textContent || '').trim().slice(0, 30) });
  }
  const name = (e) => e.tagName.toLowerCase() + (e.classList[0] ? '.' + e.classList[0].replace(/__[0-9a-f]{5}$/, '') : '');
  return [...lists].flatMap(([list, rows]) => {
    const odd = rows.find((row) => Math.abs(row.right - rows[0].right) > 1 || row.beside !== rows[0].beside);
    return odd ? [{ rule: 'links', path: [list.parentElement, list].map(name).join(' > '), text: odd.text, what: `its links stand ${odd.right}px from its right edge, ${odd.beside ? 'beside' : 'under'} the words; in "${rows[0].text}" ${rows[0].right}px, ${rows[0].beside ? 'beside' : 'under'}`, allowed: "a row's own links stand alike in every row of a list (DESIGN.md, A row's own links)" }] : [];
  });
}

// In the page: resolves once nothing has changed for 150ms, or after a second whatever happens
// (the clock ticks each second, which is not a tap landing).
function settled() {
  return new Promise((done) => {
    let quiet;
    const stop = () => (watch.disconnect(), done());
    const wait = () => (clearTimeout(quiet), (quiet = setTimeout(stop, 150)));
    const watch = new MutationObserver(wait);
    watch.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    wait();
    setTimeout(stop, 1000);
  });
}

let stopping = false;

async function main() {
  const args = process.argv.slice(2);
  const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const only = opt('--state');
  const sizes = opt('--size') ? [opt('--size')] : Object.keys(SIZES);
  if (sizes.some((z) => !SIZES[z])) throw new Error(`--size is ${Object.keys(SIZES).join(', ')}`);
  const s = spec(fs.readFileSync('DESIGN.md', 'utf8'));
  const started = Date.now();

  const { build, preview } = await import('vite');
  const { chromium } = await import('@playwright/test');
  let server, browser, out;
  const end = async () => {
    await browser?.close().catch(() => {});
    await server?.close().catch(() => {});
    if (out) fs.rmSync(out, { recursive: true, force: true });
  };
  // Interrupted, the pages still open fail as the browser goes: that is not worth a stack trace.
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { stopping = true; end().then(() => process.exit(130)); });
  try {
    // Built, not the dev server: six pages at once each asking the dev server for a hundred modules
    // spent most of the run waiting on its one thread. A build is one file per page, takes half a
    // second, and is what ships. Class names keep their own name, so a path reads `div.face`.
    out = fs.mkdtempSync(path.join(os.tmpdir(), 'heirloom-audit-'));
    const scoped = (name, file) => `${name}__${createHash('sha1').update(path.relative(process.cwd(), file)).digest('hex').slice(0, 5)}`;
    await build({ configFile: 'vite.config.ts', logLevel: 'error', css: { modules: { generateScopedName: scoped } }, build: { outDir: out, emptyOutDir: true, rollupOptions: { input: 'client/demo.html' } } });
    server = await preview({ configFile: 'vite.config.ts', logLevel: 'error', build: { outDir: out }, preview: { port: 0, strictPort: false } });
    const base = server.resolvedUrls.local[0].replace(/\/$/, '');
    browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false });

    // The states are whatever the demo's own index lists, so a new one is audited the day it is added.
    const index = await browser.newPage();
    const broke = [];
    index.on('pageerror', (err) => broke.push(err.message));
    await index.goto(`${base}/demo.html`);
    let states = await index.$$eval('a[href*="state="]', (as) => as.map((a) => a.getAttribute('href')));
    await index.close();
    const nameOf = (href) => new URLSearchParams(href.split('#')[0].split('?')[1]).get('state');
    if (only) states = states.filter((h) => nameOf(h) === only);
    if (!states.length) throw new Error(`${only ? `no demo state named ${only}` : 'the demo lists no states'}${broke.length ? `: the demo failed: ${broke[0]}` : ''}`);

    const found = [];
    const heads = Object.fromEntries(sizes.map((z) => [z, {}]));
    const jobs = sizes.flatMap((size) => states.map((href) => ({ size, href })));
    const worker = async () => {
      const contexts = {};
      for (let job; (job = jobs.shift()); ) {
        const { size, href } = job;
        const state = nameOf(href);
        contexts[size] ??= await browser.newContext({ viewport: SIZES[size], reducedMotion: 'reduce', colorScheme: 'light' });
        const page = await contexts[size].newPage();
        try {
          await page.goto(`${base}/demo.html${href}`);
          // The demo taps for some states 100ms apart after the first paint. Read once the page has
          // been still for longer than that, so the last tap and what it opened have landed.
          await page.evaluate(() => document.fonts.ready);
          await page.evaluate(settled);
          // As one string: Playwright checks a returned object field by field, which was most of the run.
          const read = async (colours) => JSON.parse(await page.evaluate(`JSON.stringify((${collect})(${colours}))`));
          const { els, head, doc } = await read(false);
          for (const x of await page.evaluate(wobble)) found.push({ ...x, state, size });
          for (const x of await page.evaluate(rowLinks)) found.push({ ...x, state, size });
          await page.emulateMedia({ colorScheme: 'dark' });
          const dark = (await read(true)).els;
          heads[size][state] = head;
          for (const x of audit(els, dark, s, size, doc)) found.push({ ...x, state, size });
        } catch (err) {
          found.push({ state, size, rule: 'read', path: '', text: '', what: `could not be read: ${err.message.split('\n')[0]}`, allowed: '' });
        } finally {
          await page.close();
        }
      }
      for (const c of Object.values(contexts)) await c.close();
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    for (const size of sizes) for (const h of header(heads[size])) found.push({ ...h, size });

    // One line per distinct violation, with every state it was found in.
    const lines = new Map();
    for (const f of found) {
      const k = [f.rule, f.size, f.path, f.what, f.allowed].join('|');
      const line = lines.get(k) ?? lines.set(k, { ...f, states: [] }).get(k);
      if (!line.states.includes(f.state)) line.states.push(f.state);
    }
    const sorted = [...lines.values()].sort((a, b) => a.rule.localeCompare(b.rule) || a.size.localeCompare(b.size) || a.path.localeCompare(b.path));
    for (const l of sorted) {
      console.log(`${l.rule} ${l.size} ${l.path}${l.text ? ` "${l.text}"` : ''}: ${l.what}${l.allowed ? `; ${l.allowed}` : ''}`);
      console.log(`  in ${l.states.length === states.length ? 'every state' : l.states.join(' ')}`);
    }
    const by = (key) => Object.entries(Object.groupBy(sorted, (l) => l[key])).map(([k, ls]) => `${k} ${ls.length}`).join(', ');
    console.log(`\ndesign-audit: ${states.length} states, ${sizes.join(' and ')}, ${sorted.length} violations (${found.length} sightings) in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    if (sorted.length) console.log(`by rule: ${by('rule')}`);
    process.exitCode = sorted.length ? 1 : 0;
  } finally {
    await end();
  }
}

if (import.meta.main) main().catch((err) => { if (!stopping) console.error(err); process.exitCode = 1; });
