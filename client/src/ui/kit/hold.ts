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
      // So is anything pressed next, a key or a pointer: a new press is a new act (Page Down, an
      // arrow, the scrollbar), and the hold of the last one must not pull its scroll back.
      for (const type of ['wheel', 'touchmove', 'resize', 'keydown', 'pointerdown']) addEventListener(type, free, { passive: true, capture: true, signal: ended.signal });
      const off = () => tapped.getBoundingClientRect().top - top;
      const hold = () => {
        if (ended.signal.aborted) return;
        if (!tapped.isConnected) return free();
        // Held by scrolling and by nothing else: the browser stops the scroll at the page's own
        // ends, so a page is never scrolled past its content and one that fits is never scrolled.
        // There the control moves with what opens or closes beside it, in time.
        scroller.scrollTop += off();
        const now = performance.now();
        if (now < from + sheet || (now < from + 20 * sheet && scroller.getAnimations({ subtree: true }).length > 0)) requestAnimationFrame(hold);
        else free();
      };
      requestAnimationFrame(hold);
    },
    true,
  );
}
