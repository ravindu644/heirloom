// Usage: node --test tools/design-audit.test.mjs
// The audit's rules on hand-made elements, no browser: each one has to fire on what breaks it and
// stay quiet on what does not, or the audit's silence means nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { colour, columns, edge, fluid, header, press, rhythm, scroll, shape, space, spec, type } from './design-audit.mjs';

const s = spec(fs.readFileSync('DESIGN.md', 'utf8'));
let n = 0;
const el = (more = {}) => ({
  i: n++, parent: null, path: 'p', text: 'words', hasText: true, figure: false,
  font: { family: 'Barlow, sans-serif', size: 16, weight: 400, lh: 23.2 },
  colours: [], radius: ['0px'], border: [0, 0, 0, 0], space: [],
  display: 'block', flexDirection: 'row', position: 'static', float: 'none', inScope: true, root: false, inPress: false,
  ...more,
});
// A block of a column, `y` to `y + h`, `x` right of the edge at 20.
const block = (y, h, more = {}) => el({ rect: { x: 20, y, w: 300, h }, ...more });
const column = (...blocks) => ({ box: el({ path: 'col', content: { left: 20, top: blocks[0].rect.y } }), blocks });

test('spec: the allowed sets come from DESIGN.md', () => {
  assert.deepEqual(s.steps, [4, 8, 16, 24, 40]);
  assert.deepEqual(s.radii, [0, 4, 8, 999]);
  assert.ok(s.spaces.includes(20) && s.spaces.includes(14), 'layout.margin and task-row padding are spaces');
  assert.equal(s.bearing.any, -0.047);
  assert.equal(s.bearing['1'], -0.066);
});

test('space: a spacing step passes, 13px fails', () => {
  assert.deepEqual(space(el({ space: [['padding-left', 16], ['row-gap', 24], ['margin-top', -8]] }), s), []);
  assert.match(space(el({ space: [['padding-left', 13]] }), s)[0].what, /padding-left 13px/);
});

test('space: a link in a line may overhang its line by half the rest of a 48px target', () => {
  const link = el({ font: { family: 'Barlow', size: 13, weight: 500, lh: 16.9 } });
  assert.deepEqual(space({ ...link, space: [['margin-top', (16.9 - 48) / 2]] }, s), []);
  assert.equal(space({ ...link, space: [['margin-top', -15]] }, s).length, 1);
});

test('colour: a palette colour passes in its own theme and fails in the other', () => {
  const you = el({ colours: [['background-color', 'rgb(196, 50, 26)']] });
  assert.deepEqual(colour(you, s, 'light'), []);
  assert.match(colour(you, s, 'dark')[0].what, /dark background-color #C4321A/);
  assert.deepEqual(colour(el({ colours: [['color', 'rgb(255, 106, 77)']] }), s, 'dark'), []);
});

test('colour: the hover mix of you, the scrim and the shadow pass; a grey does not', () => {
  const ok = el({ colours: [
    ['background-color', 'color(srgb 0.684863 0.181961 0.0981961)'],
    ['background-color', 'color(srgb 0.933333 0.941176 0.92549 / 0.48)'],
    ['box-shadow', 'rgba(18, 20, 18, 0.18)'],
    ['background-color', 'rgba(0, 0, 0, 0)'],
  ] });
  assert.deepEqual(colour(ok, s, 'light'), []);
  assert.equal(colour(el({ colours: [['color', 'rgb(136, 136, 136)']] }), s, 'light').length, 1);
  assert.equal(colour(el({ colours: [['color', 'oklch(0.5 0.1 30)']] }), s, 'light').length, 1);
  // Close is not the same: one step past rounding is another colour.
  assert.equal(colour(el({ colours: [['color', 'rgb(196, 53, 26)']] }), s, 'light').length, 1);
});

test('type: a role passes; a weight, a line height or a family of no role fails', () => {
  assert.deepEqual(type(el(), s, 412), []);
  assert.match(type(el({ font: { family: 'Barlow', size: 16, weight: 700, lh: 23.2 } }), s, 412)[0].allowed, /nearest body/);
  assert.equal(type(el({ font: { family: 'Barlow Condensed', size: 14, weight: 600, lh: 16 } }), s, 412).length, 1);
  assert.match(type(el({ font: { family: 'Inter', size: 16, weight: 400, lh: 23.2 } }), s, 412)[0].what, /font Inter/);
  assert.deepEqual(type(el({ hasText: false, font: { family: 'Inter', size: 9, weight: 100, lh: 1 } }), s, 412), []);
});

test('type: under 720px the timer is figure-xl times the width over 412', () => {
  const at = (size) => el({ font: { family: 'Barlow Condensed', size, weight: 600, lh: size * 0.9 } });
  assert.deepEqual(type(at((168 * 360) / 412), s, 360), []);
  assert.deepEqual(type(at(168), s, 412), []);
  assert.equal(type(at(160), s, 412).length, 1);
  assert.deepEqual(type(at((168 * 471) / 412), s, 471), []);
  assert.equal(type(at(168), s, 471).length, 1, 'on the wide phone 168px is the wrong share');
});

test('shape: radii from rounded, borders of 0, 1 or 2px', () => {
  assert.deepEqual(shape(el({ radius: ['4px', '8px', '999px', '0px'], border: [1, 2, 0, 0] }), s), []);
  assert.match(shape(el({ radius: ['6px'] }), s)[0].what, /border-radius 6px/);
  assert.equal(shape(el({ radius: ['50%'] }), s).length, 1);
  assert.match(shape(el({ border: [3, 0, 0, 0] }), s)[0].what, /border 3px/);
});

test('press: 48 to a finger, and a button is a fill or underlined text', () => {
  const button = (hit, b) => el({ pressable: true, hit, button: { words: true, bg: 'rgba(0, 0, 0, 0)', border: false, underline: false, row: false, ...b } });
  assert.deepEqual(press(button({ w: 120, h: 48 }, { bg: 'rgb(196, 50, 26)' }), s), []);
  assert.deepEqual(press(button({ w: 48, h: 48 }, { underline: true }), s), []);
  assert.deepEqual(press(button({ w: 300, h: 64 }, { row: true }), s), []);
  assert.match(press(button({ w: 40, h: 48 }, { underline: true }), s)[0].what, /40x48px/);
  assert.match(press(button({ w: 80, h: 48 }), s)[0].what, /bare word/);
  // A box to tick has no words: it is a box, not a bare word.
  assert.deepEqual(press(button({ w: 48, h: 48 }, { words: false }), s), []);
});

test('columns: blocks stacked one under another; a wrapped row is not a column', () => {
  const box = el({ rect: { x: 20, y: 0, w: 300, h: 200 }, content: { left: 20, top: 0 }, display: 'flex', flexDirection: 'column' });
  const kids = [block(0, 40), block(64, 40)].map((k) => ({ ...k, parent: box.i }));
  assert.equal(columns([box, ...kids]).length, 1);
  assert.equal(columns([{ ...box, flexDirection: 'row' }, ...kids]).length, 0);
  // Side by side: a row of a grid.
  assert.equal(columns([{ ...box, display: 'grid' }, kids[0], { ...kids[1], rect: { x: 200, y: 0, w: 100, h: 40 } }]).length, 0);
});

test('edge: a figure may sit left by its bearing; 3px off is not one edge', () => {
  const digits = (x, text) => block(80, 150, { figure: true, text, rect: { x, y: 80, w: 300, h: 150 }, font: { family: 'Barlow Condensed', size: 168, weight: 600, lh: 151.2 } });
  const ok = (b) => edge(column(block(0, 40), b, block(250, 40)), s);
  assert.deepEqual(ok(digits(20 + -0.066 * 168, '18:42')), []);
  assert.deepEqual(ok(digits(20 + -0.047 * 168, '18:42')), []);
  assert.equal(ok(digits(20, '18:42')).length, 1, 'from figure-lg up the bearing is required');
  assert.equal(ok(digits(20 + -0.066 * 168, '25:00')).length, 1, "a 2 leads: the 1's bearing is wrong");
  // The streak's 60 in figure-lg, 2px right of the dots under it.
  const lg = (x) => block(80, 44, { figure: true, text: '60', rect: { x, y: 80, w: 60, h: 44 }, font: { family: 'Barlow Condensed', size: 44, weight: 600, lh: 44 } });
  assert.deepEqual(ok(lg(20 + -0.057 * 44)), []);
  assert.match(ok(lg(22))[0].allowed, /pulled back by its bearing/);
  // At figure-md and under none is applied.
  const md = (x) => block(80, 29, { figure: true, text: '2h 11m', rect: { x, y: 80, w: 60, h: 29 }, font: { family: 'Barlow Condensed', size: 26, weight: 500, lh: 28.6 } });
  assert.deepEqual(ok(md(20)), []);
  assert.equal(ok(md(20 + -0.047 * 26)).length, 1);
  assert.match(ok(block(80, 40, { rect: { x: 23, y: 80, w: 300, h: 40 } }))[0].what, /starts 3px right/);
  assert.equal(ok(block(80, 40, { rect: { x: 20 + -0.047 * 168, y: 80, w: 300, h: 40 } })).length, 1, 'only a figure has a bearing');
});

test('rhythm: one space that grows, above the action row on a phone', () => {
  const a = block(0, 100), b = block(124, 100), actions = block(500, 48, { holdsPress: true });
  assert.deepEqual(rhythm(column(a, b, actions), s, 'phone', true), []);
  // On a laptop the space grows below the last block, never above it.
  assert.equal(rhythm(column(a, b, actions), s, 'laptop', true).length, 1);
  // Inside a panel it is not the screen's action row.
  assert.equal(rhythm(column(a, b, actions), s, 'phone', false).length, 1);
});

test('rhythm: on a phone the space may lie above the sentence that explains the action row', () => {
  const top = block(0, 100), sentence = block(400, 24, { text: 'Start now and it ends at 09:30.' }), actions = block(432, 48, { holdsPress: true });
  assert.deepEqual(rhythm(column(top, sentence, actions), s, 'phone', true), []);
  assert.deepEqual(rhythm(column(top, sentence, actions), s, 'wide', true), []);
  // A sentence left at the top while its button waits at the bottom splits the group.
  const split = rhythm(column(block(0, 100), block(124, 24, { text: 'Take five.' }), actions), s, 'phone', true);
  assert.deepEqual(split, [], 'the space right above the action row is still the one allowed');
  const far = rhythm(column(top, block(300, 24, { text: 'Take five.' }), block(400, 48, { holdsPress: true })), s, 'phone', true);
  assert.equal(far.length, 1, 'a sentence 76px above its row is not directly above it: it floats');
  assert.match(far[0].what, /^200px between/);
});

test('rhythm: two large spaces, or one with a smaller one after it, are violations', () => {
  const actions = (y) => block(y, 48, { holdsPress: true });
  const two = rhythm(column(block(0, 100), block(200, 100), actions(600)), s, 'phone', true);
  assert.equal(two.length, 1);
  assert.match(two[0].what, /^100px between/);
  const early = rhythm(column(block(0, 100), block(300, 100), block(416, 100), actions(540)), s, 'phone', true);
  assert.equal(early.length, 1);
  assert.match(early[0].what, /^200px/);
});

test('rhythm: every space is a step; content does not float in the middle', () => {
  assert.match(rhythm(column(block(0, 40), block(53, 40)), s, 'phone', false)[0].allowed, /spacing steps/);
  assert.deepEqual(rhythm(column(block(0, 40), block(40, 40), block(88, 40)), s, 'phone', false), []);
  const floating = column(block(300, 40), block(364, 40));
  floating.box.content.top = 0;
  assert.match(rhythm(floating, s, 'laptop', true)[0].what, /^300px above/);
  // Words centred in a 48px row leave a sliver above them: that is not a gap between blocks.
  const centred = column(block(2, 20), block(26, 20));
  centred.box.content.top = 0;
  assert.deepEqual(rhythm(centred, s, 'phone', false), []);
});

test('header: a state whose header differs from the others is named', () => {
  const h = (w) => [{ tag: 'a', text: 'heirloom', at: [0, 0, w, 48], inside: [] }];
  const found = header({ a: h(300), b: h(300), c: h(280), signin: [] });
  assert.equal(found.length, 1);
  assert.equal(found[0].state, 'c');
  assert.match(found[0].what, /header\[0\]\.at\[2\]: 280 here, 300 in 2 other states/);
  assert.deepEqual(header({ a: h(300), b: h(300) }), []);
});

test('scroll: on a phone the page never scrolls, and nothing scrolls sideways', () => {
  const doc = (more) => ({ scrollH: 915, viewH: 915, scrollW: 412, viewW: 412, lowest: null, rightmost: null, ...more });
  assert.deepEqual(scroll(doc(), 'phone'), []);
  assert.deepEqual(scroll(doc({ scrollH: 915.6 }), 'phone'), [], 'within a pixel');
  const tall = scroll(doc({ scrollH: 1403, lowest: { path: 'section > p.sr', text: 'streak', edge: 1403 } }), 'wide');
  assert.equal(tall.length, 1);
  assert.equal(tall[0].path, 'section > p.sr');
  assert.match(tall[0].what, /1403px tall in a 915px screen/);
  // A laptop page may scroll down; nothing scrolls sideways anywhere.
  assert.deepEqual(scroll(doc({ scrollH: 1403, viewW: 1440, scrollW: 1440 }), 'laptop'), []);
  assert.match(scroll(doc({ scrollW: 430, rightmost: { path: 'div.year', text: '', edge: 430 } }), 'phone')[0].what, /430px wide/);
});

test('fluid: under 720px a block held narrower by its max-width is a violation; short content is not', () => {
  const col = (b) => ({ box: el({ path: 'col', content: { left: 20, right: 451, top: 0 } }), blocks: [block(0, 40), b] });
  const capped = block(64, 80, { maxWidth: '352px', rect: { x: 20, y: 64, w: 352, h: 80 } });
  assert.match(fluid(col(capped), 'wide')[0].what, /held to 352px by its max-width in a 431px column/);
  assert.deepEqual(fluid(col(capped), 'laptop'), [], 'from 720px a measure may cap a line');
  assert.deepEqual(fluid(col(block(64, 48, { maxWidth: 'none', rect: { x: 20, y: 64, w: 120, h: 48 } })), 'phone'), [], 'a lone button');
  assert.deepEqual(fluid(col(block(64, 80, { maxWidth: '500px', rect: { x: 20, y: 64, w: 431, h: 80 } })), 'phone'), [], 'a cap wider than the column');
  assert.deepEqual(fluid(col(block(64, 80, { maxWidth: '100%', rect: { x: 20, y: 64, w: 100, h: 80 } })), 'phone'), [], 'a percentage is not a measure');
});

test('edge: a big figure that leads a row starts the column, so it carries its bearing', () => {
  const box = el({ rect: { x: 20, y: 0, w: 300, h: 200 }, content: { left: 20, right: 320, top: 0 }, display: 'grid' });
  const dots = { ...block(0, 12), parent: box.i };
  const row = { ...block(28, 44, { display: 'flex', textFirst: false }), parent: box.i };
  const sixty = (x, more) => ({ ...block(28, 44, { figure: true, text: '60', rect: { x, y: 28, w: 40, h: 44 }, font: { family: 'Barlow Condensed', size: 44, weight: 600, lh: 44 }, ...more }), parent: row.i });
  const run = (...rest) => columns([box, dots, ...rest]).flatMap((c) => edge(c, s));
  assert.match(run({ ...row }, sixty(20))[0].allowed, /pulled back by its bearing/, 'the streak at 0 is 2px right of its dots');
  assert.deepEqual(run({ ...row }, sixty(20 + -0.057 * 44)), []);
  // Words before the number: the words start the column, not the figure.
  assert.deepEqual(run({ ...row, textFirst: true }, sixty(80)), []);
});
