// One suite, both stores. The engine is written against the interface, so the two must not differ
// in anything it relies on: all or nothing, copies, survival across a close.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import type { Cell } from '../core/merge.ts';
import { idbStores } from './idb.ts';
import { memoryStores } from './memory.ts';
import type { OpenStore, Snapshot } from './store.ts';

const cell = (row: string, field: string, value: unknown, stamp = '2026-11-24T04:30:00.000Z-0000-a1b2c3d4e5f60718'): Cell => ({
  stamp,
  dataset: 'task',
  row,
  field,
  value,
});

const sorted = (snap: Snapshot): Snapshot => ({
  cells: snap.cells.toSorted((a, b) => (a.row + a.field < b.row + b.field ? -1 : 1)),
  outbox: snap.outbox.toSorted(),
  meta: snap.meta,
});

const kinds: [string, () => OpenStore][] = [
  ['memory store', () => memoryStores()],
  ['IndexedDB store', () => idbStores(new IDBFactory(), () => {})],
];

for (const [kind, make] of kinds) {
  describe(kind, () => {
    it('a new database is empty', async () => {
      const store = await make()('a');
      assert.deepEqual(await store.load(), { cells: [], outbox: [], meta: {} });
    });

    it('one write holds cells, outbox entries and meta, and load gives them back', async () => {
      const store = await make()('a');
      const title = cell('t1', 'title', 'Pointers');
      const state = cell('t1', 'repeat', { every: 2, days: [1, 3], until: null });
      await store.write({
        cells: [title, state],
        outbox: [['task/t1/title', true]],
        meta: { cursor: 7, clock: { ms: 5, counter: 1 } },
      });
      assert.deepEqual(sorted(await store.load()), {
        cells: [state, title],
        outbox: ['task/t1/title'],
        meta: { cursor: 7, clock: { ms: 5, counter: 1 } },
      });
    });

    it('a later cell for the same field replaces the earlier one, and other meta stays', async () => {
      const store = await make()('a');
      await store.write({ cells: [cell('t1', 'title', 'one')], meta: { cursor: 1, offset: 20 } });
      const two = cell('t1', 'title', 'two', '2026-11-24T04:31:00.000Z-0000-a1b2c3d4e5f60718');
      await store.write({ cells: [two], meta: { cursor: 2 } });
      const snap = await store.load();
      assert.deepEqual(snap.cells, [two]);
      assert.deepEqual(snap.meta, { cursor: 2, offset: 20 });
    });

    it('outbox entries are added and taken out in the order written', async () => {
      const store = await make()('a');
      await store.write({ outbox: [['k1', true], ['k2', true], ['k3', true]] });
      await store.write({ outbox: [['k2', false], ['k1', false], ['k1', true], ['gone', false]] });
      assert.deepEqual((await store.load()).outbox.toSorted(), ['k1', 'k3']);
    });

    it('a write is all or nothing: one value that cannot be stored takes the rest back', async () => {
      const store = await make()('a');
      await store.write({ cells: [cell('t1', 'title', 'kept')], outbox: [['task/t1/title', true]], meta: { cursor: 1 } });
      await assert.rejects(
        store.write({
          cells: [cell('t2', 'title', 'never'), cell('t3', 'title', () => 'functions cannot be stored')],
          outbox: [['task/t1/title', false], ['task/t2/title', true]],
          meta: { cursor: 2 },
        }),
      );
      assert.deepEqual(await store.load(), {
        cells: [cell('t1', 'title', 'kept')],
        outbox: ['task/t1/title'],
        meta: { cursor: 1 },
      });
      // And the store still works after the failure.
      await store.write({ meta: { cursor: 3 } });
      assert.equal((await store.load()).meta.cursor, 3);
    });

    it('data survives a close and a reopen, and each name is its own database', async () => {
      const open = make();
      const first = await open('account-a');
      await first.write({ cells: [cell('t1', 'title', 'mine')], outbox: [['task/t1/title', true]], meta: { cursor: 4 } });
      first.close();

      const again = await open('account-a');
      assert.deepEqual(await again.load(), {
        cells: [cell('t1', 'title', 'mine')],
        outbox: ['task/t1/title'],
        meta: { cursor: 4 },
      });
      assert.deepEqual(await (await open('account-b')).load(), { cells: [], outbox: [], meta: {} });
    });

    it('nothing is written after close', async () => {
      const open = make();
      const store = await open('a');
      store.close();
      await assert.rejects(store.write({ meta: { cursor: 9 } }));
      assert.deepEqual((await (await open('a')).load()).meta, {});
    });

    it('what goes in and what comes out are copies', async () => {
      const store = await make()('a');
      const value = { phase: 'work', set_index: 1 };
      await store.write({ cells: [cell('current', 'state', value)] });
      value.set_index = 3;
      const got = (await store.load()).cells[0]!;
      assert.deepEqual(got.value, { phase: 'work', set_index: 1 });
      (got.value as { set_index: number }).set_index = 2;
      assert.deepEqual((await store.load()).cells[0]!.value, { phase: 'work', set_index: 1 });
    });
  });
}

describe('IndexedDB store, persist()', () => {
  it('is asked for once, when there are first cells to keep', async () => {
    let asked = 0;
    const open = idbStores(new IDBFactory(), () => asked++);
    const install = await open('heirloom');
    await install.write({ meta: { device: 'a1b2c3d4e5f60718' } });
    assert.equal(asked, 0);
    const account = await open('heirloom-acct');
    await account.write({ cells: [cell('t1', 'title', 'one')] });
    await account.write({ cells: [cell('t2', 'title', 'two')] });
    await (await open('heirloom-other')).write({ cells: [cell('t3', 'title', 'three')] });
    assert.equal(asked, 1);
  });
});
