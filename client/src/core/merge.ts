// The merge rule: contracts/protocol.md section 3.
// The only place on the client where a cell is compared or applied. A second one would drift from the server's.

import type { Stamp } from './hlc.ts';

/** One field of one row. `value` is any JSON, and unknown datasets and fields are kept like any other. */
export interface Cell {
  stamp: Stamp;
  dataset: string;
  row: string;
  field: string;
  value: unknown;
}

/** The newest cell for each (dataset, row, field). merge.ts owns the keys; read it through `values()`. */
export type Cells = Map<string, Cell>;

/**
 * Keeps `cell` if it is newer than the one held for its field. True when it was kept: that is when
 * the caller saves it, tells the UI, and drops a beaten unsent edit from the outbox.
 */
export function applyCell(cells: Cells, cell: Cell): boolean {
  throw new Error('not built yet: applyCell, roadmap section 1');
}
