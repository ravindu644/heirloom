/** One child of a Fold or a Kept, as it is drawn. */
export interface Part<V> {
  key: unknown;
  vnode: V;
  /** It came after the first draw, so it comes in time. What a screen opens with is just there. */
  fresh: boolean;
  going: boolean;
  /** How many times it has come back from going. Each time, what is in it is made anew: a sheet that had closed itself opens again. */
  life: number;
}

/**
 * What is drawn now: the children given, and among them, where it stood, whatever was here and
 * is given no more. That one is going: it stays until its leaving has played. One already going
 * is passed on as the same object, so whoever waits for it knows it again.
 */
export function keep<V>(was: Part<V>[], now: Part<V>[]): Part<V>[] {
  const next = [...now];
  was.forEach((part, at) => {
    if (now.some((other) => other.key === part.key)) return;
    // After the nearest part before it that is still drawn; with none, first.
    const before = was.slice(0, at).reverse().find((other) => next.some((one) => one.key === other.key));
    next.splice(before ? next.findIndex((one) => one.key === before.key) + 1 : 0, 0, part.going ? part : { ...part, going: true });
  });
  return next;
}

// A list just put in order by hand (kit/lift.ts) already stands as it will be drawn: for that
// one redraw nothing is kept, nothing arrives and nothing glides a second time.
// Kept for two frames: a list redrawn by a signal is redrawn in the next animation frame, after
// anything asked for before the write. Let go in that same frame, the redraw it was meant for
// came after it, and a row that changed lists was shown leaving one and arriving in the other.
let byHand = false;
export const placedByHand = () => {
  byHand = true;
  requestAnimationFrame(() => requestAnimationFrame(() => (byHand = false)));
};
export const wasPlacedByHand = () => byHand;

/** The keys that stand in both lists and are going in neither, in the first one's order: two different answers mean parts changed places. */
export const staying = <V>(list: Part<V>[], among: Part<V>[]) => list.filter((part) => !part.going && among.some((other) => other.key === part.key && !other.going)).map((part) => part.key);
