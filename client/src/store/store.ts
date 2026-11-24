// What the sync engine needs from storage, and nothing more. Two things implement it: idb.ts in
// the browser, and memory.ts for Node, where the simulator runs many devices in one process.

import type { Cell } from '../core/merge.ts';

/** Everything a database holds. The engine reads it once at start and works from memory after. */
export interface Snapshot {
  cells: Cell[];
  /** Keys (`cellKey`) of the cells still waiting to be sent, in no order. */
  outbox: string[];
  meta: Record<string, unknown>;
}

/** One transaction: every part lands or none does. Parts apply in the order written. */
export interface Write {
  /** Put by `cellKey`, replacing what is held. */
  cells?: Cell[];
  /** `[key, true]` adds the key to the outbox, `[key, false]` takes it out. */
  outbox?: [key: string, waiting: boolean][];
  /** Set by name. Names left out keep their value. */
  meta?: Record<string, unknown>;
}

export interface Store {
  load(): Promise<Snapshot>;
  write(write: Write): Promise<void>;
  close(): void;
  /** Closes it and deletes the database, for good. A store opened by this name afterwards is new. */
  destroy(): Promise<void>;
}

/** Opens the database with this name, making it if it is new. */
export type OpenStore = (name: string) => Promise<Store>;
