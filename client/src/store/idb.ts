// The browser's store: one IndexedDB database per name, one transaction per write.

import { cellKey } from '../core/merge.ts';
import type { OpenStore, Snapshot, Store, Write } from './store.ts';

const STORES = ['cells', 'outbox', 'meta'];

// Without this the browser may clear the database when the disk fills up, unsent work included.
const askBrowser = () => navigator.storage?.persist?.();

/** `factory` and `persist` are handed in so Node tests can run this on fake-indexeddb. */
export function idbStores(factory: IDBFactory = indexedDB, persist: () => unknown = askBrowser): OpenStore {
  let asked = false;
  const askOnce = () => {
    if (asked) return;
    asked = true;
    // Asked when there is first something worth keeping. A no is fine: the data is on the server too.
    Promise.resolve()
      .then(persist)
      .catch(() => {});
  };

  return (name) =>
    new Promise<Store>((resolve, reject) => {
      const req = factory.open(name, 1);
      req.onupgradeneeded = () => STORES.forEach((s) => req.result.createObjectStore(s));
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(wrap(req.result, askOnce));
    });
}

function wrap(db: IDBDatabase, askOnce: () => void): Store {
  return {
    load: () =>
      new Promise<Snapshot>((resolve, reject) => {
        const tx = db.transaction(STORES, 'readonly');
        const cells = tx.objectStore('cells').getAll();
        const outbox = tx.objectStore('outbox').getAllKeys();
        // Both come back in key order, so name i belongs to value i.
        const names = tx.objectStore('meta').getAllKeys();
        const values = tx.objectStore('meta').getAll();
        tx.oncomplete = () =>
          resolve({
            cells: cells.result,
            outbox: outbox.result.map(String),
            meta: Object.fromEntries(names.result.map((name, i) => [String(name), values.result[i]])),
          });
        tx.onabort = () => reject(tx.error);
      }),

    write: (write: Write) =>
      new Promise<void>((resolve, reject) => {
        // strict: the write is on disk when this resolves. A lap must not vanish because the battery died a second later.
        const tx = db.transaction(STORES, 'readwrite', { durability: 'strict' });
        let failed: unknown;
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(failed ?? tx.error);
        try {
          for (const cell of write.cells ?? []) tx.objectStore('cells').put(cell, cellKey(cell));
          for (const [key, waiting] of write.outbox ?? []) {
            waiting ? tx.objectStore('outbox').put(1, key) : tx.objectStore('outbox').delete(key);
          }
          for (const [name, value] of Object.entries(write.meta ?? {})) tx.objectStore('meta').put(value, name);
          if (write.cells?.length) askOnce();
        } catch (err) {
          // A value IndexedDB cannot store throws here, after earlier puts were queued: take them all back.
          failed = err;
          tx.abort();
        }
      }),

    close: () => db.close(),
  };
}
