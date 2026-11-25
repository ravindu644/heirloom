/**
 * The answer, or nothing once `ms` have passed, whichever is first. For a question whose answer
 * decides what is drawn: the screen waits this long for it and no longer. An answer that cannot
 * be had is nothing too.
 */
export const first = <T>(asked: Promise<T>, ms: number): Promise<T | undefined> =>
  Promise.race([asked.catch(() => undefined), new Promise<undefined>((done) => setTimeout(done, ms))]);
