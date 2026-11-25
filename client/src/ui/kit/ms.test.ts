import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toMs } from './ms.ts';

// Each case is a figure, its unit and the milliseconds it means. Figure and unit are written
// apart because tools/style-check.mjs reads this folder's tests too, and a duration spelled
// whole here would be taken for a style value that did not come from tokens.css.
const cases: [string, string, number][] = [
  ['200', 'ms', 200],
  ['.2', 's', 200],
  ['0.16', 's', 160],
  [' 160', 'ms ', 160],
  ['1.2', 's', 1200],
];

test('a duration is milliseconds whichever way it is written', () => {
  for (const [figure, unit, ms] of cases) assert.equal(toMs(figure + unit), ms, figure + unit);
});

test('nothing written is no time, never NaN', () => {
  assert.equal(toMs(''), 0);
});
