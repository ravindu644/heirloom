// The merge rule: contracts/protocol.md section 3.
// The only place on the client where a cell is compared or applied. A second one would drift from the server's.

import { ZERO, see, stamp } from './hlc.ts';
import type { Clock, Stamp } from './hlc.ts';

/** One field of one row. `value` is any JSON, and unknown datasets and fields are kept like any other. */
export interface Cell {
  stamp: Stamp;
  dataset: string;
  row: string;
  field: string;
  value: unknown;
}

/** The newest cell for each (dataset, row, field), keyed by `cellKey`. */
export type Cells = Map<string, Cell>;

/** Names hold only `A-Z a-z 0-9 _ -`, so a slash cannot make two fields collide. */
export const cellKey = (cell: Pick<Cell, 'dataset' | 'row' | 'field'>): string =>
  `${cell.dataset}/${cell.row}/${cell.field}`;

/**
 * Keeps `cell` if it is newer than the one held for its field. True when it was kept: that is when
 * the caller saves it, tells the UI, and drops a beaten unsent edit from the outbox.
 */
export function applyCell(cells: Cells, cell: Cell): boolean {
  const key = cellKey(cell);
  const held = cells.get(key);
  if (held && held.stamp >= cell.stamp) return false;
  cells.set(key, cell);
  return true;
}

/**
 * After the server refused a push for its clock (protocol section 2, Drift): a fresh clock sees
 * every cell that is not waiting to be sent, then each unsent cell gets a new stamp at `now`, in
 * the order it was made, and replaces the old one. The old stamps are higher, so applyCell would
 * refuse the new cells: this is the one place a lower stamp wins.
 * Returns the clock to keep and the replaced cells to save.
 */
export function restamp(
  cells: Cells,
  unsent: ReadonlySet<string>,
  now: number,
  device: string,
): { clock: Clock; cells: Cell[] } {
  let clock = ZERO;
  const waiting: Cell[] = [];
  for (const [key, cell] of cells) {
    if (unsent.has(key)) waiting.push(cell);
    else clock = see(clock, cell.stamp);
  }
  // One device made them all, so stamp order is the order they were made.
  waiting.sort((a, b) => (a.stamp < b.stamp ? -1 : 1));
  const replaced = waiting.map((old) => {
    const made = stamp(clock, now, device);
    clock = made.clock;
    const cell = { ...old, stamp: made.stamp };
    cells.set(cellKey(cell), cell);
    return cell;
  });
  return { clock, cells: replaced };
}
