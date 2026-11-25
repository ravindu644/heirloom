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

/** A real calendar day, `2026-11-24`: the 31st of February is not one, though it has the shape. */
export function isDay(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const ms = Date.parse(v);
  return isMoment(ms) && new Date(ms).toISOString().slice(0, 10) === v;
}
