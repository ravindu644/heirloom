/** Class names, with the falsy ones dropped. */
export const cx = (...names: unknown[]): string => names.filter(Boolean).join(' ');
