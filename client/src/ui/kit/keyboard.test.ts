// The rule that takes the tab bar away while a keyboard is up, and only then.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keyboardUp, see } from './keyboard.ts';

test('a field focused and the window shrunk: the keyboard is up; grown back with the focus kept: it is not', () => {
  let seen = see(null, 471, 1020);
  assert.equal(keyboardUp(seen, 1020, true), false, 'focus alone is not a keyboard');
  seen = see(seen, 471, 600);
  assert.equal(keyboardUp(seen, 600, true), true);
  // The back key: the window is whole again and the field still has the focus.
  seen = see(seen, 471, 1020);
  assert.equal(keyboardUp(seen, 1020, true), false);
});

test('a short window that was never taller keeps its tabs, field focused or not', () => {
  const seen = see(null, 600, 500);
  assert.equal(keyboardUp(seen, 500, true), false);
  assert.equal(keyboardUp(seen, 500, false), false);
});

test('shrinking without typing, and a browser bar coming and going, are not a keyboard', () => {
  let seen = see(null, 412, 915);
  seen = see(seen, 412, 600);
  assert.equal(keyboardUp(seen, 600, false), false);
  seen = see(see(null, 412, 915), 412, 859);
  assert.equal(keyboardUp(seen, 859, true), false);
});

test('another width starts again: a turned phone is not a keyboard', () => {
  let seen = see(null, 471, 1020);
  seen = see(seen, 1020, 471);
  assert.equal(keyboardUp(seen, 471, true), false);
  seen = see(seen, 1020, 200);
  assert.equal(keyboardUp(seen, 200, true), true);
});
