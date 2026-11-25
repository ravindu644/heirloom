import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keep, staying } from './parts.ts';
import type { Part } from './parts.ts';

const parts = (...keys: string[]): Part<string>[] => keys.map((key) => ({ key, vnode: key, fresh: false, going: false, life: 0 }));
const drawn = (list: Part<string>[]) => list.map((part) => (part.going ? `(${part.key})` : part.key)).join(' ');

test('a part no longer given stays where it stood, going', () => {
  assert.equal(drawn(keep(parts('a', 'b', 'c'), parts('a', 'c'))), 'a (b) c');
  assert.equal(drawn(keep(parts('a', 'b', 'c'), parts('b', 'c'))), '(a) b c');
  assert.equal(drawn(keep(parts('a', 'b', 'c'), parts('a', 'b'))), 'a b (c)');
});

test('the last one of all stays until it has gone', () => {
  assert.equal(drawn(keep(parts('a'), [])), '(a)');
});

test('a going part is the same object the next time round, and a new one comes in beside it', () => {
  const once = keep(parts('a', 'b'), parts('a'));
  const twice = keep(once, parts('a', 'c'));
  assert.equal(drawn(twice), 'a (b) c');
  assert.equal(twice[1], once[1]);
});

test('given again while it is going, it is here and not going', () => {
  const once = keep(parts('a', 'b'), parts('a'));
  assert.equal(drawn(keep(once, parts('a', 'b'))), 'a b');
});

test('parts that change places are told from parts that come and go', () => {
  const was = parts('a', 'b', 'c');
  const gone = keep(was, parts('a', 'c'));
  assert.deepEqual(staying(was, gone), staying(gone, was));
  const moved = keep(was, parts('b', 'a', 'c'));
  assert.notDeepEqual(staying(was, moved), staying(moved, was));
});
