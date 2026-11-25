import { signal } from '@preact/signals';
import type { RefObject } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { holdStill } from './hold.ts';
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

/** Where a row was set down: before which row, by its id ('' before an edge, null at the very end), and its place among how many rows. */
export type Placed = (id: string, before: string | null, at: number, of: number) => void;

const CONTROLS = 'button, a, input, [tabindex]';

/**
 * Hands the focus to a control of a row where the row now stands, when what had the focus is gone.
 * A row set down in another list is a new element there, drawn a moment after the old one left
 * (which stays a while as an inert copy, and a section it needs may have to open first): so this
 * looks for up to half a second of frames. It ends the moment the control has the focus, or the
 * focus is found anywhere of its own: it never takes one from where a person has put it.
 */
export function focusRow(root: HTMLElement, id: string, pick: (controls: HTMLElement[]) => HTMLElement | undefined) {
  let frames = 30;
  const hand = () => {
    const active = document.activeElement;
    if (active && active !== document.body && !active.closest('[inert]')) return;
    const row = [...root.querySelectorAll<HTMLElement>(`[data-lift="${CSS.escape(id)}"]`)].find((one) => !one.closest('[inert]'));
    const control = row && pick([...row.querySelectorAll<HTMLElement>(CONTROLS)]);
    if (control) return control.focus({ preventScroll: true });
    if (--frames > 0) requestAnimationFrame(hand);
  };
  requestAnimationFrame(hand);
}

/**
 * DESIGN.md, Putting rows in order. Inside `root`, every element marked `data-lift="<id>"` is a
 * row of one list, in the order of the page, whatever stands between them (a heading, another
 * column of parts). Press and hold one and it lifts and follows the finger or the mouse; the rows
 * it passes glide out of its way; letting go sets it down and calls `onPlace`. A tap that did not
 * hold still opens the row, and a press that moved first is a swipe and scrolls. With a keyboard,
 * Alt and the up or down arrow move the row that holds the focus by one place.
 *
 * An element marked `data-lift-edge` (a heading between two lists) has a place in the order too:
 * it is never lifted, it glides with the rows a lifted one passes, and it is a wall one way: a
 * row from over it is not carried under it, while one from under it may be set down over it.
 * Let go under it, such a row goes back to where it was, and `onStopped` hears of it.
 * A row whose only place is the one it has does not lift.
 */
export function useLift(root: RefObject<HTMLElement | null>, onPlace: Placed, onStopped?: (id: string) => void) {
  const placed = useRef(onPlace);
  placed.current = onPlace;
  // Told when a row was carried, or stepped, past an edge it may not cross: it went back, and the screen says why.
  const stopped = useRef(onStopped);
  stopped.current = onStopped;
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const rows = () => [...el.querySelectorAll<HTMLElement>('[data-lift], [data-lift-edge]')].filter((row) => !row.closest('[inert]'));
    const place = (row: HTMLElement, others: HTMLElement[], to: number) => {
      remember();
      const real = (one: HTMLElement) => one.dataset.lift !== undefined;
      placed.current(row.dataset.lift!, others[to] ? (others[to].dataset.lift ?? '') : null, others.slice(0, to).filter(real).length + 1, others.filter(real).length + 1);
    };
    // The last place a row may take: just over the first edge under it, or the end of the list.
    const last = (list: HTMLElement[], from: number) => {
      const edge = list.findIndex((one, at) => at > from && one.dataset.liftEdge !== undefined);
      return edge < 0 ? list.length - 1 : edge - 1;
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
      let lift: { list: HTMLElement[]; rects: DOMRect[]; from: number; to: number; most: number; past: boolean; size: number; scroller: HTMLElement | null; scrolled: number } | null = null;
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
        const { list, rects, from, most, size, scroller } = lift;
        const moved = y - event.clientY + ((scroller?.scrollTop ?? 0) - lift.scrolled);
        row.style.transform = `translateY(${moved}px)`;
        // Its place is the number of other rows whose middle lies above its own, and never past its wall.
        const middle = rects[from]!.top + rects[from]!.height / 2 + moved;
        const wanted = list.filter((_, at) => at !== from && rects[at]!.top + rects[at]!.height / 2 < middle).length;
        // Carried past its wall it has no place there: let go now, it goes back to where it was.
        lift.past = wanted > most;
        const to = lift.past ? from : wanted;
        lift.to = to;
        // What it has passed makes room by the room the row took: its height and the gap that
        // goes with it. Rows and a heading among them are not one height, so each moves by the
        // lifted row's measure and not into its neighbour's box.
        list.forEach((other, at) => {
          if (at === from) return;
          const by = at > from && at <= to ? -size : at < from && at >= to ? size : 0;
          other.style.transform = by ? `translateY(${by}px)` : '';
        });
      };
      const timer = setTimeout(() => {
        const list = rows();
        const from = list.indexOf(row);
        const most = last(list, from);
        // Its only place is the one it has: there is nothing to do with it in the hand.
        if (most === 0 && from === 0) return clear();
        const scroller = row.closest<HTMLElement>('main, dialog');
        const rects = list.map((one) => one.getBoundingClientRect());
        // The gap that travels with a row is the one between rows: the smaller of the two beside it, where a heading may stand off further.
        const gaps = [rects[from + 1] && rects[from + 1]!.top - rects[from]!.bottom, rects[from - 1] && rects[from]!.top - rects[from - 1]!.bottom].filter((gap): gap is number => gap !== undefined);
        lift = { list, rects, from, to: from, most, past: false, size: rects[from]!.height + Math.min(...gaps), scroller, scrolled: scroller?.scrollTop ?? 0 };
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
        const { list, rects, from, to, past, size, scroller, scrolled } = lift;
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
        // Its foot on the foot of the place it takes going down; going up its top on that place's
        // top, or, just over an edge, a row's gap under what stands before it: the edge stands off
        // further than a row does.
        const home = to > from ? rects[to]!.bottom - rects[from]!.bottom : list[to]!.dataset.liftEdge !== undefined && to > 0 ? rects[to - 1]!.bottom + size - rects[from]!.height - rects[from]!.top : rects[to]!.top - rects[from]!.top;
        row.style.transform = `translateY(${home}px)`;
        void Promise.allSettled(row.getAnimations().map((one) => one.finished)).then(() => {
          clear();
          if (past) stopped.current?.(row.dataset.lift!);
          if (to === from) return;
          // The rows already stand where the list will draw them: it is drawn as it is, with no second glide.
          placedByHand();
          const id = row.dataset.lift!;
          place(row, list.filter((one) => one !== row), to);
          // What was set down stays under the finger while the page redraws round it: a heading
          // may come or go over it when a list gains its first row or loses its last.
          // Where it stood on the screen as it was let go: the list may have come along under it since it lifted.
          if (scroller) holdStill(() => el.querySelector(`[data-lift="${CSS.escape(id)}"]`), rects[from]!.top + home - (scroller.scrollTop - scrolled), scroller);
        });
      });
    };

    const key = (event: KeyboardEvent) => {
      const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
      const row = (event.target as Element).closest<HTMLElement>('[data-lift]');
      if (!event.altKey || !step || !row) return;
      event.preventDefault();
      const list = rows();
      const from = list.indexOf(row);
      const to = from + step;
      if (to > last(list, from) && to < list.length) return stopped.current?.(row.dataset.lift!);
      if (to < 0 || to >= list.length) return;
      // The focus goes with the row: to the same control of it, where it now stands.
      const held = [...row.querySelectorAll<HTMLElement>(CONTROLS)].indexOf(document.activeElement as HTMLElement);
      const id = row.dataset.lift!;
      place(row, list.filter((one) => one !== row), to);
      focusRow(el, id, (controls) => controls[held]);
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
