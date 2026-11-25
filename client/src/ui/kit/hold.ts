import { motion } from './ms.ts';

/**
 * DESIGN.md, Motion: what you tapped stays under your finger. After any tap inside a scroller
 * (the screen, a sheet) the tapped control is held where it was while the page redraws around
 * it and for as long as anything in that scroller is still opening or closing: the scroll is
 * corrected in the same frame the control would have moved. One listener for the whole app, so
 * no screen can forget it. Two kinds of tap are let go: one on a control marked `data-moves`,
 * whose tap is a move to another place (Up, Down), and one on a field, which the keyboard and
 * the browser bring into view themselves.
 */
export function holdTaps() {
  // A new screen starts with the page it has, and no more.
  addEventListener('hashchange', () => document.querySelector('main')?.style.removeProperty('--slack'));
  addEventListener(
    'click',
    (event) => {
      const tapped = event.target instanceof Element ? (event.target.closest('button, a, label, input, textarea') ?? event.target) : null;
      const scroller = tapped?.closest<HTMLElement>('main, dialog');
      if (!tapped || !scroller || tapped.matches('label, input, textarea') || tapped.closest('[data-moves]')) return;
      const top = tapped.getBoundingClientRect().top;
      // At least a sheet's time, in which the redraw and what it starts have begun; then for as
      // long as something in the scroller still moves, and never past twenty times that.
      const sheet = motion(scroller, '--motion-sheet');
      const from = performance.now();
      // A scroll the person starts is theirs, and so is a window that changes size.
      // They are listened for only while the hold lasts: left on, each tap would keep its
      // listeners, and the element tapped, alive for the life of the page.
      const ended = new AbortController();
      const free = () => ended.abort();
      for (const type of ['wheel', 'touchmove', 'resize']) addEventListener(type, free, { passive: true, signal: ended.signal });
      const off = () => tapped.getBoundingClientRect().top - top;
      const hold = () => {
        if (ended.signal.aborted) return;
        if (!tapped.isConnected) return free();
        scroller.scrollTop += off();
        // Still too low: the page has come to its end and has nothing left to scroll. It is given
        // that much more of an end. A row that moves up the list from the last screenful would
        // otherwise push everything under the finger down by its own height.
        const short = off();
        if (short >= 1) {
          slacken(scroller, short);
          scroller.scrollTop += short;
        }
        const now = performance.now();
        if (now < from + sheet || (now < from + 20 * sheet && scroller.getAnimations({ subtree: true }).length > 0)) requestAnimationFrame(hold);
        else free();
      };
      requestAnimationFrame(hold);
    },
    true,
  );
}

// The extra end a page was given (base.css draws it from `--slack`). It is taken back as the
// person scrolls away from it, by as much as is out of sight below, so nothing is seen to go.
const slack = (scroller: HTMLElement) => parseFloat(scroller.style.getPropertyValue('--slack')) || 0;
const trimmed = new WeakSet<HTMLElement>();
function slacken(scroller: HTMLElement, more: number) {
  scroller.style.setProperty('--slack', `${slack(scroller) + more}px`);
  if (trimmed.has(scroller)) return;
  trimmed.add(scroller);
  scroller.addEventListener(
    'scroll',
    () => {
      const below = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
      if (below >= 1 && slack(scroller) > 0) scroller.style.setProperty('--slack', `${Math.max(0, slack(scroller) - below)}px`);
    },
    { passive: true },
  );
}
