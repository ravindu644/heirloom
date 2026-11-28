// Safari before 16 has no toSorted, and the app sorts with it from its first render: without
// this the page stays blank on an iPhone that stops at iOS 15. Imported first, before anything
// that might call it while it loads. Defined as the built-ins are, so `for...in` never lists it.
// ponytail: iOS 15.4 is the floor (at, findLast and <dialog> came then); every iPhone on 15 can update to it.
if (!Array.prototype.toSorted) {
  Object.defineProperty(Array.prototype, 'toSorted', {
    value<T>(this: T[], by?: (a: T, b: T) => number) {
      return [...this].sort(by);
    },
    writable: true,
    configurable: true,
  });
}
