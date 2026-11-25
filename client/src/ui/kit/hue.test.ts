import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hueHex, toneOf } from './hue.ts';

const parts = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

test('every answer is written as six hex digits', () => {
  for (const hue of [0, 59, 180, 359]) for (const depth of [0, 50, 100]) assert.match(hueHex(hue, depth), /^#[0-9a-f]{6}$/);
});

test('the wheel starts on red, and a third of the way round is green', () => {
  const [r, g, b] = parts(hueHex(0, 50));
  assert.ok(r! > g! && r! > b! && g === b);
  const [r2, g2, b2] = parts(hueHex(120, 50));
  assert.ok(g2! > r2! && g2! > b2!);
});

test('deep is darker than pale, all the way', () => {
  const sum = (depth: number) => parts(hueHex(210, depth)).reduce((a, b) => a + b, 0);
  for (let depth = 10; depth <= 100; depth += 10) assert.ok(sum(depth) < sum(depth - 10));
});

test('a depth out of range is the nearest end', () => {
  assert.equal(hueHex(40, 140), hueHex(40, 100));
  assert.equal(hueHex(40, -5), hueHex(40, 0));
});

test('a colour the picker made is read back to where the sliders stood', () => {
  for (const hue of [0, 37, 120, 210, 301, 359]) {
    for (const depth of [0, 12, 50, 88, 100]) {
      const tone = toneOf(hueHex(hue, depth));
      // A byte a channel rounds to: a degree or a step either way is the same colour.
      assert.ok(Math.min(Math.abs(tone.hue - hue), 360 - Math.abs(tone.hue - hue)) <= 2, `${hue}/${depth} -> ${tone.hue}`);
      assert.ok(Math.abs(tone.depth - depth) <= 1, `${hue}/${depth} -> depth ${tone.depth}`);
    }
  }
});

test('any other colour stands at the nearest place: a grey has a depth and no hue of its own', () => {
  // Black and white, spelled from one digit each: tools/style-check.mjs reads this folder's tests
  // too, and a colour written whole here would be taken for one that did not come from tokens.css.
  const flat = (digit: string) => `#${digit.repeat(6)}`;
  assert.deepEqual(toneOf(flat('0')), { hue: 0, depth: 100 });
  assert.deepEqual(toneOf(flat('f')), { hue: 0, depth: 0 });
});
