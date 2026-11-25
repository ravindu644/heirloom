// What a time or a day in a row may really be. Rows come from other devices, other builds and
// imported copies, so a number or a string is not yet a moment or a day.

// ponytail: one floor for every dataset. Nothing before 2020 is read: the app did not exist, and
// a clock that died and woke at 1970 would otherwise make every list that starts at "the first
// day" tens of thousands of days long.
const EARLIEST_MS = Date.UTC(2020, 0, 1);
// And a ceiling, far off: past it a date cannot even be written down, and a row must not be able to make one throw.
const LATEST_MS = Date.UTC(2200, 0, 1);

/** A moment a row could really hold, in ms. */
export const isMoment = (v: unknown): v is number => typeof v === 'number' && v >= EARLIEST_MS && v < LATEST_MS;

/**
 * When a row was deleted, in ms, or null while it is alive. Not held to `isMoment`, as other
 * times in a row are: any number here says a person deleted the row, and read as "never deleted"
 * it would bring back what they asked to be gone.
 */
export const asDeleted = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** How long a deleted row can be brought back. After it, and for one deleted for good, the row is on no screen. */
export const KEPT_MS = 30 * 86400000;

/**
 * What `deleted` is written as to delete for good (protocol section 12): the first moment every
 * build takes for a real one, and long past every shelf. Not 1: builds before this one read a
 * time under the floor as "never deleted", and would have shown the row alive again.
 */
export const GONE = EARLIEST_MS;

/** A length a timer could run, in ms: a second to a day, as the schemas have it. Anything else is no length, and the next one in line is used. */
export const isLength = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1000 && v <= 86400000;

/** A time of day a clock could show, `15:30`, 24 hour. */
export const isTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** A real calendar day, `2026-11-24`: the 31st of February is not one, though it has the shape. */
export function isDay(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const ms = Date.parse(v);
  return isMoment(ms) && new Date(ms).toISOString().slice(0, 10) === v;
}
