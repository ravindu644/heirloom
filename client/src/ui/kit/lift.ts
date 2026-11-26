import { signal } from '@preact/signals';
import type { RefObject } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { holdStill } from './hold.ts';
// A row's lift is marked in data attributes and styled by them, never by a class: a screen that
// redraws the row while it is carried (Today gives it the Next card's look) writes its whole
// class anew, and a class added here would be gone mid-carry. A data attribute the row does not
// render is one Preact never touches.
import './lift.css';
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


/** Where a row in the hand would land if let go now: as `Placed` names it. Null: where it was. */
export type Carry = { id: string; before: string | null } | null;

/**
 * DESIGN.md, Putting rows in order. Inside `root`, every element marked `data-lift="<id>"` is a
 * row of one list, in the order of the page, whatever stands between them (a heading, another
 * column of parts). Press and hold one and it lifts and follows the finger or the mouse; the rows
 * it passes glide to where they will stand; letting go sets it down and calls `onPlace`. A tap
 * that did not hold still opens the row, and a press that moved first is a swipe and scrolls.
 * With a keyboard, Alt and the up or down arrow move the row that holds the focus by one place.
 *
 * An element marked `data-lift-edge` (a heading between two lists) has a place in the order too:
 * it is never lifted, it glides with the rows a lifted one passes, and it is a wall one way: a
 * row from over it is not carried under it, while one from under it may be set down over it.
 * Let go under it, such a row goes back to where it was, and `onStopped` hears of it.
 * A row whose only place is the one it has does not lift.
 *
 * The list answers before the release. An element marked `data-lift-head="<n>"` (a heading that
 * is no edge: "Later today") stands over whatever row is at place n, and moves with it. `onOver`
 * hears where the row in the hand would land each time that changes, so the screen can draw the
 * rows as they will be (the Next card's outline on the one that would be next); letting go then
 * changes nothing but the shadow.
 */
export function useLift(root: RefObject<HTMLElement | null>, onPlace: Placed, onStopped?: (id: string) => void, onOver?: (carry: Carry) => void) {
  const placed = useRef(onPlace);
  placed.current = onPlace;
  // Told when a row was carried, or stepped, past an edge it may not cross: it went back, and the screen says why.
  const stopped = useRef(onStopped);
  stopped.current = onStopped;
  const over = useRef(onOver);
  over.current = onOver;
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const live = (one: HTMLElement) => !one.closest('[inert]');
    const rows = () => [...el.querySelectorAll<HTMLElement>('[data-lift], [data-lift-edge]')].filter(live);
    const heads = () => [...el.querySelectorAll<HTMLElement>('[data-lift-head]')].filter(live);
    const isEdge = (one: HTMLElement) => one.dataset.liftEdge !== undefined;
    const before = (others: HTMLElement[], to: number) => (others[to] ? (others[to].dataset.lift ?? '') : null);
    const place = (row: HTMLElement, others: HTMLElement[], to: number) => {
      remember();
      const real = (one: HTMLElement) => one.dataset.lift !== undefined;
      placed.current(row.dataset.lift!, before(others, to), others.slice(0, to).filter(real).length + 1, others.filter(real).length + 1);
    };
    // The last place a row may take: just over the first edge under it, or the end of the list.
    const last = (list: HTMLElement[], from: number) => {
      const edge = list.findIndex((one, at) => at > from && isEdge(one));
      return edge < 0 ? list.length - 1 : edge - 1;
    };
    // Where a row, an edge or a heading stands with nothing moved: the top of the box it is the
    // first thing in, which nothing here moves. Its own box may be part way through a glide.
    const natural = (one: HTMLElement) => one.parentElement!.getBoundingClientRect().top;
    // Written only when it changes: this runs every frame a row is up.
    const shift = (one: HTMLElement, by: number) => {
      const to = Math.abs(by) < 0.5 ? '' : `translateY(${Math.round(by * 2) / 2}px)`;
      if (one.style.transform !== to) one.style.transform = to;
    };

    /**
     * Where each row and edge of `list` stands, top to bottom, with the one at `from` set down at
     * `to`: as the page will draw them. Each keeps its own height. Between two rows is the room
     * that was between the two places they now hold, heading and all; an edge keeps the room it
     * had over it and under it; and two rows that meet where an edge stood have the room two
     * rows have, or, where the screen has drawn a heading for them since (`fresh`, its height by
     * the place it stands over), the room a heading takes with an edge's room over and under it.
     */
    const layout = (list: HTMLElement[], rects: DOMRect[], from: number, to: number, fresh = new Map<number, number>()) => {
      const order = list.filter((_, at) => at !== from);
      order.splice(to, 0, list[from]!);
      const room = (at: number) => (at > 0 && at < rects.length ? rects[at]!.top - rects[at - 1]!.bottom : 0);
      const rooms = list.slice(1).flatMap((one, k) => (isEdge(one) || isEdge(list[k]!) ? [] : [room(k + 1)]));
      const between = rooms.length ? Math.min(...rooms) : Math.min(...list.slice(1).map((_, k) => room(k + 1)));
      const edge = list.findIndex(isEdge);
      const heading = (k: number) => (edge < 0 ? between : room(edge) + fresh.get(k)! + room(edge + 1));
      const tops: number[] = [];
      order.forEach((one, k) => {
        if (k === 0) return void tops.push(rects[0]!.top);
        const prev = order[k - 1]!;
        const gap = isEdge(one) ? room(list.indexOf(one)) : isEdge(prev) ? room(list.indexOf(prev) + 1) : isEdge(list[k]!) || isEdge(list[k - 1]!) ? (fresh.has(k) ? heading(k) : between) : room(k);
        tops.push(tops[k - 1]! + prev.getBoundingClientRect().height + gap);
      });
      return { order, tops };
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
      const id = row.dataset.lift!;
      const away = new AbortController();
      const on = <K extends keyof WindowEventMap>(type: K, heard: (event: WindowEventMap[K]) => void, capture = false) => addEventListener(type, heard, { signal: away.signal, capture });
      let y = event.clientY;
      let frame = 0;
      // What is known once the row is up: the rows as they stood, which one it is, where it would stand now.
      let lift: { list: HTMLElement[]; rects: DOMRect[]; heads: { one: HTMLElement; at: number; top: number }[]; from: number; to: number; most: number; past: boolean; scroller: HTMLElement | null; scrolled: number; placed: { order: HTMLElement[]; tops: number[] } } | null = null;
      // Everything moved while the row is up, headings the screen drew meanwhile among them: all let go of together.
      const touched = new Set<HTMLElement>();
      const clear = () => {
        ending = null;
        clearTimeout(timer);
        cancelAnimationFrame(frame);
        away.abort();
        up = false;
        for (const one of touched) {
          delete one.dataset.lifted;
          delete one.dataset.gliding;
          // At once: what stays drawn now stands where it was moved to, and must not glide from there.
          one.style.transition = 'none';
          one.style.transform = '';
        }
        void el.offsetHeight;
        for (const one of touched) one.style.transition = '';
        touched.clear();
        if (lift && lift.to !== lift.from) over.current?.(null);
      };
      // How far the list has scrolled under the row since it lifted.
      const scrolledBy = () => (lift?.scroller ? lift.scroller.scrollTop - lift.scrolled : 0);
      // Everything but the row in the hand to where it will stand: the rows and edges by the
      // layout, each heading with the row it stands over.
      // Where each of them stood with nothing moved, the last time it was arranged.
      const stood = new Map<HTMLElement, number>();
      const arrange = (order: HTMLElement[], tops: number[], fresh: HTMLElement[]) => {
        const { list, rects, heads } = lift!;
        const by = scrolledBy();
        const targets: [HTMLElement, number][] = order.flatMap((one, k) => (one === row ? [] : [[one, tops[k]!] as [HTMLElement, number]]));
        for (const { one, at, top } of heads) targets.push([one, top + (at < tops.length ? tops[at]! - rects[at]!.top : 0)]);
        // A heading drawn since the row lifted stands over its row by the room an edge has under it.
        const edge = list.findIndex(isEdge);
        for (const one of fresh) {
          const at = Number(one.dataset.liftHead);
          if (at < tops.length) targets.push([one, tops[at]! - (edge < 0 ? 0 : rects[edge + 1]!.top - rects[edge]!.bottom) - one.getBoundingClientRect().height]);
        }
        for (const [one, top] of targets) {
          touched.add(one);
          one.dataset.gliding = '';
          const now = natural(one);
          // Measured against the list, not the screen: the list scrolling under the row is no move.
          const was = stood.get(one);
          stood.set(one, now + by);
          // The page moved it, because a card over it changed its height (the Next card's Start
          // came or went): it is put back where it was seen, at once, and glides from there.
          if (was !== undefined && Math.abs(was - now - by) >= 0.5) {
            const seen = new DOMMatrix(getComputedStyle(one).transform).m42;
            one.style.transition = 'none';
            one.style.transform = `translateY(${seen + was - now - by}px)`;
            void one.offsetHeight;
            one.style.transition = '';
          }
          shift(one, top - by - now);
        }
      };
      const follow = () => {
        if (!lift) return;
        const { list, rects, from, most, placed } = lift;
        const moved = y - event.clientY;
        // Its place is the number of other rows whose middle lies above its own as they now stand
        // (a card grows and shrinks as Start comes and goes, so the heights are read now), and
        // never past its wall. One it has just passed has moved out of its way: going back needs
        // a real move back, so a place does not flicker at the line between two. Within its own
        // band of the list as it was, though, it is home whatever has moved: there the row that
        // took its slot would tie with it, and the place would stay one off with the slot empty.
        // That band is read from the list as it stood, which nothing in the carry changes.
        const middle = rects[from]!.top + rects[from]!.height / 2 + moved + scrolledBy();
        const home = list.filter((_, at) => at !== from && rects[at]!.top + rects[at]!.height / 2 < middle).length === from;
        const wanted = home ? from : placed.order.filter((one, k) => one !== row && placed.tops[k]! + one.getBoundingClientRect().height / 2 < middle).length;
        // Carried past its wall it has no place there: let go now, it goes back to where it was.
        lift.past = wanted > most;
        const to = lift.past ? from : wanted;
        if (to !== lift.to) {
          lift.to = to;
          over.current?.(to === from ? null : { id, before: before(list.filter((one) => one !== row), to) });
          // Once more after the screen has drawn what it heard, before that is shown: what it
          // changed (a card's height) is answered in the same frame.
          queueMicrotask(follow);
        }
        // Headings the screen has drawn since the row lifted ("Later today" over the old Next).
        const known = new Set(lift.heads.map((head) => head.one));
        const fresh = heads().filter((one) => !known.has(one));
        const { order, tops } = layout(list, rects, from, to, new Map(fresh.map((one) => [Number(one.dataset.liftHead), one.getBoundingClientRect().height])));
        lift.placed = { order, tops };
        // The row stays under the pointer, wherever the list has come to stand under it.
        const at = rects[from]!.top + moved - natural(row);
        arrange(order, tops, fresh);
        shift(row, at);
      };
      const timer = setTimeout(() => {
        const list = rows();
        const from = list.indexOf(row);
        const most = last(list, from);
        // Its only place is the one it has: there is nothing to do with it in the hand.
        if (most === 0 && from === 0) return clear();
        const scroller = row.closest<HTMLElement>('main, dialog');
        const rects = list.map((one) => one.getBoundingClientRect());
        // A heading stands over the row at its place in the list as it is drawn.
        const marked = heads().map((one) => ({ one, at: Number(one.dataset.liftHead), top: one.getBoundingClientRect().top }));
        lift = { list, rects, heads: marked, from, to: from, most, past: false, scroller, scrolled: scroller?.scrollTop ?? 0, placed: { order: list, tops: rects.map((rect) => rect.top) } };
        touched.add(row);
        up = true;
        row.dataset.lifted = '';
        for (const other of [...list, ...marked.map((head) => head.one)]) if (other !== row) other.dataset.gliding = '';
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
        cancelAnimationFrame(frame);
        // The rows to where the page will draw them, once more as the hand lets go.
        follow();
        const { list, from, to, past, scroller, placed } = lift;
        clearTimeout(timer);
        // The hand is off: nothing the pointer does now moves the rows.
        away.abort();
        // The tap that a release would otherwise be: it opened nothing, it set a row down.
        // Not tied to this press: with no glide to wait for, the press is over before the click
        // comes. It is taken away again shortly, so it cannot eat a click that was really meant.
        const swallow = (click: MouseEvent) => (click.stopPropagation(), click.preventDefault());
        addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => removeEventListener('click', swallow, { capture: true }), CLICK);
        // The rest already stand where the page will draw them. The row glides the last of the
        // way into the place kept open for it, and only then is the list written.
        row.dataset.gliding = '';
        const home = placed.tops[to]! - scrolledBy();
        shift(row, home - natural(row));
        void Promise.allSettled(row.getAnimations().map((one) => one.finished)).then(() => {
          if (to === from) {
            clear();
            if (past) stopped.current?.(id);
            return;
          }
          // The list is drawn anew a frame later (a signal's redraw waits for one). The hand lets
          // go of the rows the moment a row is drawn in its new place, before that frame is
          // shown: let go sooner, the old list would be seen for a frame with nothing moved.
          let held = true;
          const letGo = () => {
            if (!held) return;
            held = false;
            redrawn.disconnect();
            clear();
            // What was set down stays under the finger while the page redraws round it: a heading
            // may come or go over it when a list gains its first row or loses its last.
            if (scroller) holdStill(() => el.querySelector(`[data-lift="${CSS.escape(id)}"]`), home, scroller);
          };
          const isRow = (node: Node) => node instanceof Element && (node.matches('[data-lift]') || !!node.querySelector('[data-lift]'));
          const redrawn = new MutationObserver((changes) => changes.some((change) => [...change.addedNodes].some(isRow)) && letGo());
          redrawn.observe(el, { childList: true, subtree: true });
          // The rows already stand where the list will draw them: it is drawn as it is, with no second glide.
          placedByHand();
          place(row, list.filter((one) => one !== row), to);
          // A write that changed nothing on the page is let go of all the same.
          requestAnimationFrame(() => requestAnimationFrame(letGo));
        });
      });
    };

    // A step with the keys: the rows glide from where they stood to where they are drawn, as a
    // carried row's neighbours do. Drawn by hand, so a row that changes lists (Later to Next) is
    // not shown leaving one and arriving in the other.
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
      const name = (one: HTMLElement) => one.dataset.lift ?? (isEdge(one) ? 'edge' : `head ${one.dataset.liftHead}`);
      const was = new Map([...list, ...heads()].map((one) => [name(one), one.getBoundingClientRect().top]));
      placedByHand();
      place(row, list.filter((one) => one !== row), to);
      focusRow(el, id, (controls) => controls[held]);
      // A frame on, the page is drawn anew and not yet shown.
      requestAnimationFrame(() => {
        for (const one of [...rows(), ...heads()]) {
          const by = (was.get(name(one)) ?? 0) - one.getBoundingClientRect().top;
          if (!was.has(name(one)) || Math.abs(by) < 0.5) continue;
          one.animate([{ transform: `translateY(${by}px)` }, { transform: 'none' }], { duration: motion(one, '--motion-fill'), easing: getComputedStyle(one).getPropertyValue('--motion-ease') });
        }
      });
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
