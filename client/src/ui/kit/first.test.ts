// What holds the sign-in form back on a fresh server: the answer, or 400 ms, whichever is first.
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { first } from './first.ts';

// Lets every promise that can settle, settle.
const settled = () => new Promise((done) => setImmediate(done));

test('no answer: nothing before the wait is over, and nothing at its end', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  let drawn: unknown = 'not yet';
  void first(new Promise<boolean>(() => {}), 400).then((answer) => (drawn = answer));
  await settled();
  assert.equal(drawn, 'not yet', 'the first frame has no form');
  mock.timers.tick(399);
  await settled();
  assert.equal(drawn, 'not yet');
  mock.timers.tick(1);
  await settled();
  assert.equal(drawn, undefined, 'at 400 ms the form is drawn with what is known: nothing');
  mock.timers.reset();
});

test('an answer inside the wait is taken at once, and one that cannot be had is nothing', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  assert.equal(await first(Promise.resolve(true), 400), true);
  assert.equal(await first(Promise.reject(new Error('no server')), 400), undefined);
  mock.timers.reset();
});
