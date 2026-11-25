/**
 * A duration as CSS writes it, in milliseconds: "200ms", "0.2s" and ".2s" are all 200. The
 * build's minifier rewrites the tokens to the shortest spelling, so a value read from a style
 * is never taken for milliseconds as it stands: `parseFloat('.2s')` made every hold and every
 * glide last a fifth of a millisecond in the built app, and only there.
 */
export const toMs = (written: string) => parseFloat(written) * (written.trim().endsWith('ms') ? 1 : 1000) || 0;

/** A `--motion-*` token as it stands on an element, in milliseconds. Every place code needs a duration reads it through here. */
export const motion = (on: Element, token: `--motion-${string}`) => toMs(getComputedStyle(on).getPropertyValue(token));
