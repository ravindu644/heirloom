import { signal } from '@preact/signals';
import type { RefObject } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import css from './lift.module.css';
import { motion } from './ms.ts';
import { placedByHand } from './parts.ts';

// How long after a row is set down the click that the release makes may still arrive.
const CLICK = 300;
// Travelled this far before the row has lifted, the press was the start of a swipe.
const SLOP = 8;
// Held this near the top or the foot of what scrolls, a lifted row brings the list along, this fast.
const EDGE = 56;
const SPEED = 8;

// Whether this device has ever put a row in order by hand: the one line that says how is shown
// until then. ponytail: localStorage, per device and never synced; a setting if it should travel.
const KEY = 'heirloom.moved';
const read = () => {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
};
export const hasMoved = signal(read());
const remember = () => {
  hasMoved.value = true;
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // A browser that keeps nothing shows the line again next time.
  }
};

/** Where a row was set down: before which row (null at the end), and its place among how many. */
export type Placed = (id: string, before: string | null, at: number, of: number) => void;

/**
 * DESIGN.md, Putting rows in order. Inside `root`, every element marked `data-lift="<id>"` is a
 * row of one list, in the order of the page, whatever stands between them (a heading, another
 * column of parts). Press and hold one and it lifts and follows the finger or the mouse; the rows
 * it passes glide out of its way; letting go sets it down and calls `onPlace`. A tap that did not
 * hold still opens the row, and a press that moved first is a swipe and scrolls. With a keyboard,
 * Alt and the up or down arrow move the row that holds the focus by one place.
 */
export function useLift(root: RefObject<HTMLElement | null>, onPlace: Placed) {
  const placed = useRef(onPlace);
  placed.current = onPlace;
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const rows = () => [...el.querySelectorAll<HTMLElement>('[data-lift]')].filter((row) => !row.closest('[inert]'));
    const place = (row: HTMLElement, others: HTMLElement[], to: number) => {
      remember();
      placed.current(row.dataset.lift!, others[to]?.dataset.lift ?? null, to + 1, others.length + 1);
    };
    // Set while a row is up. A touch that moves then moves the row, not the page: this has to be
    // listening before the touch starts, or the browser has already promised the scroll.
    let up = false;
    // The press in hand, if any: ended without placing when the list leaves the screen.
    let ending: (() => void) | null = null;
    const hold = (event: TouchEvent) => void (up && event.preventDefault());
    el.addEventListener('touchmove', hold, { passive: false });

    const down = (event: PointerEvent) => {
      const row = (event.target as Element).closest<HTMLElement>('[data-lift]');
      if (event.button || up || !row || (event.target as Element).closest('input, textarea')) return;
      const over = new AbortController();
      const on = <K extends keyof WindowEventMap>(type: K, heard: (event: WindowEventMap[K]) => void, capture = false) => addEventListener(type, heard, { signal: over.signal, capture });
      let y = event.clientY;
      let frame = 0;
      // What is known once the row is up: the rows as they stood, which one it is, where it would stand now.
      let lift: { list: HTMLElement[]; rects: DOMRect[]; from: number; to: number; scroller: HTMLElement | null; scrolled: number } | null = null;
      const clear = () => {
        ending = null;
        clearTimeout(timer);
        cancelAnimationFrame(frame);
        over.abort();
        up = false;
        for (const one of lift?.list ?? []) {
          one.classList.remove(css.lifted!, css.gliding!);
          one.style.transform = '';
        }
      };
      const follow = () => {
        if (!lift) return;
        const { list, rects, from, scroller } = lift;
        const moved = y - event.clientY + ((scroller?.scrollTop ?? 0) - lift.scrolled);
        row.style.transform = `translateY(${moved}px)`;
        // Its place is the number of other rows whose middle lies above its own.
        const middle = rects[from]!.top + rects[from]!.height / 2 + moved;
        const to = list.filter((_, at) => at !== from && rects[at]!.top + rects[at]!.height / 2 < middle).length;
        lift.to = to;
        // A row it has passed takes the next place along: its top on the place above, or its foot on the one below.
        list.forEach((other, at) => {
          if (at === from) return;
          const by = at > from && at <= to ? rects[at - 1]!.top - rects[at]!.top : at < from && at >= to ? rects[at + 1]!.bottom - rects[at]!.bottom : 0;
          other.style.transform = by ? `translateY(${by}px)` : '';
        });
      };
      const timer = setTimeout(() => {
        const list = rows();
        const scroller = row.closest<HTMLElement>('main, dialog');
        lift = { list, rects: list.map((one) => one.getBoundingClientRect()), from: list.indexOf(row), to: list.indexOf(row), scroller, scrolled: scroller?.scrollTop ?? 0 };
        up = true;
        row.classList.add(css.lifted!);
        for (const other of list) if (other !== row) other.classList.add(css.gliding!);
        // Near an edge of what scrolls, the list comes along under the row.
        const edge = () => {
          const box = scroller?.getBoundingClientRect();
          if (box && y < box.top + EDGE) scroller!.scrollTop -= SPEED;
          if (box && y > box.bottom - EDGE) scroller!.scrollTop += SPEED;
          follow();
          frame = requestAnimationFrame(edge);
        };
        frame = requestAnimationFrame(edge);
        // How long a finger rests before a row lifts is DESIGN.md's, as every time is: `motion.hold`.
      }, motion(row, '--motion-hold'));

      ending = clear;
      on('pointermove', (move) => {
        if (move.pointerId !== event.pointerId) return;
        y = move.clientY;
        if (lift) follow();
        else if (Math.hypot(move.clientX - event.clientX, move.clientY - event.clientY) > SLOP) clear();
      });
      // A long press must not bring up the browser's own menu over the row.
      on('contextmenu', (menu) => menu.preventDefault());
      on('pointercancel', (cancel) => cancel.pointerId === event.pointerId && clear());
      on('pointerup', (release) => {
        if (release.pointerId !== event.pointerId) return;
        if (!lift) return clear();
        const { list, rects, from, to } = lift;
        cancelAnimationFrame(frame);
        clearTimeout(timer);
        // The tap that a release would otherwise be: it opened nothing, it set a row down.
        // Not tied to this press: with no glide to wait for, the press is over before the click
        // comes. It is taken away again shortly, so it cannot eat a click that was really meant.
        const swallow = (click: MouseEvent) => (click.stopPropagation(), click.preventDefault());
        addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => removeEventListener('click', swallow, { capture: true }), CLICK);
        // It glides the last of the way into its place, and only then is the list written.
        row.classList.add(css.gliding!);
        const home = to > from ? rects[to]!.bottom - rects[from]!.bottom : rects[to]!.top - rects[from]!.top;
        row.style.transform = `translateY(${home}px)`;
        void Promise.allSettled(row.getAnimations().map((one) => one.finished)).then(() => {
          clear();
          if (to === from) return;
          // The rows already stand where the list will draw them: it is drawn as it is, with no second glide.
          placedByHand();
          place(row, list.filter((one) => one !== row), to);
        });
      });
    };

    const key = (event: KeyboardEvent) => {
      const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
      const row = (event.target as Element).closest<HTMLElement>('[data-lift]');
      if (!event.altKey || !step || !row) return;
      event.preventDefault();
      const list = rows();
      const to = list.indexOf(row) + step;
      if (to < 0 || to >= list.length) return;
      const held = document.activeElement as HTMLElement | null;
      place(row, list.filter((one) => one !== row), to);
      // The row is moved in the page, which can cost it the focus: it is handed back where it was.
      requestAnimationFrame(() => held?.isConnected && held.focus({ preventScroll: true }));
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('keydown', key);
    return () => {
      ending?.();
      el.removeEventListener('touchmove', hold);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('keydown', key);
    };
  }, []);
}
