// The store for Node: tests, the simulator, many devices in one process. It keeps the promises
// IndexedDB keeps (all or nothing, copies in and out, nothing after close) so code that is right
// here is right in the browser.

import { cellKey } from '../core/merge.ts';
import type { Cell } from '../core/merge.ts';
import { StoreGone } from './store.ts';
import type { OpenStore, Write } from './store.ts';

/** One device's disk. Open the same name twice and the second sees what the first wrote. */
export function memoryStores(): OpenStore {
  const disk = new Map<string, { cells: Map<string, Cell>; outbox: Set<string>; meta: Map<string, unknown>; gone: boolean }>();
  return async (name) => {
    let db = disk.get(name);
    if (!db) disk.set(name, (db = { cells: new Map(), outbox: new Set(), meta: new Map(), gone: false }));
    const held = db;
    let open = true;
    const mustBeOpen = () => {
      // Deleted through another open store, as another tab would: this one must not write into nothing.
      if (held.gone) throw new StoreGone(`store ${name} was deleted`);
      if (!open) throw new Error(`store ${name} is closed`);
    };
    return {
      async load() {
        mustBeOpen();
        return structuredClone({
          cells: [...held.cells.values()],
          outbox: [...held.outbox],
          meta: Object.fromEntries(held.meta),
        });
      },
      async write(write: Write) {
        mustBeOpen();
        // The copy is made before anything changes: a value that cannot be stored fails the whole write.
        const w = structuredClone(write);
        for (const cell of w.cells ?? []) held.cells.set(cellKey(cell), cell);
        for (const [key, waiting] of w.outbox ?? []) waiting ? held.outbox.add(key) : held.outbox.delete(key);
        for (const [key, value] of Object.entries(w.meta ?? {})) held.meta.set(key, value);
      },
      close() {
        open = false;
      },
      async destroy() {
        open = false;
        held.gone = true;
        disk.delete(name);
      },
    };
  };
}
