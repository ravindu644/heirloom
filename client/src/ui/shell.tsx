import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { Brand } from './kit/brand.tsx';
import { cx } from './kit/cx.ts';
import { holdTaps } from './kit/hold.ts';
import { useKeyboard } from './kit/keyboard.ts';
import { Person } from './kit/person.tsx';
import { Said, say } from './kit/said.tsx';
import { useSidebar } from './kit/wide.ts';
import css from './shell.module.css';
import * as s from './strings.ts';

// What you tapped stays under your finger, on every screen the frame holds.
holdTaps();

export const DESTINATIONS = ['focus', 'today', 'progress', 'habits', 'room'] as const;
export type Destination = (typeof DESTINATIONS)[number];

interface Props {
  /** Who is signed in. Left out, nobody is: the frame has no person and no destinations. */
  person?: string;
  /** Their picture, where they set one: the circle of the header chip; `pending` while it is on its way. */
  picture?: string;
  pending?: boolean;
  /** The destination being shown, if it is one of the five. */
  at?: Destination;
  /** A name for what is shown when it is not a destination: a change of it is a change of screen, and comes in as one. */
  page?: string;
  /** A destination this person has taken out of their navigation: Room, when rooms are hidden. */
  without?: Destination;
  /** What the connection has to say, or nothing. */
  status?: string;
  /** Keep the status line's space even when it is silent: for a screen with buttons at the bottom of a phone. */
  keepStatus?: boolean;
  /** From 720px the screen draws its own room to the frame's edges (the browser's sign-in, in two halves). */
  bare?: boolean;
  children: ComponentChildren;
}

/**
 * The frame every screen stands in, signed in or not, so nothing jumps between them: the mark
 * and the name in one place, the person at the right of the header (at the foot of the sidebar
 * on a laptop), the screen, what the connection has to say, and the five destinations.
 */
export function Shell({ person, picture, pending, at, page = at, without, status = '', keepStatus, bare, children }: Props) {
  const sidebar = useSidebar();
  // What the last tap did was said of the screen it was made on.
  useEffect(() => () => say(null), [page]);
  // A screen changed (the bar, the sidebar, a link, Back) opens at its top, wherever the last one
  // was scrolled: the one scroller is the frame's and outlives the screens in it. Before the
  // paint, so the new screen is never seen part way down. Nothing within a screen changes `page`,
  // so a tap there, a sheet or a row set down keeps its scroll.
  const main = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (main.current) main.current.scrollTop = 0;
  }, [page]);
  // While the keyboard is up on a phone the tab bar is not drawn: it would ride on the keys and
  // take a row of the little that is left. It is back the moment the keyboard goes.
  const typing = useKeyboard() && !sidebar;
  const brand = (
    <a key="brand" class={css.brand} href="#/focus">
      <Brand name={s.brand} />
    </a>
  );
  const nav = person && (
    <nav key="nav" class={css.nav} aria-label={s.nav.label} hidden={typing}>
      {DESTINATIONS.filter((id) => id !== without).map((id) => (
        <a key={id} href={`#/${id}`} aria-current={id === at ? 'page' : undefined}>
          {id === at ? <b>{s.nav[id]}</b> : s.nav[id]}
        </a>
      ))}
    </nav>
  );
  const screen = (
    <main key="main" ref={main} class={css.main}>
      {/* Keyed by the screen: a new one is a new element, and fades in and rises. */}
      <div key={page} class={css.canvas}>
        {children}
      </div>
    </main>
  );
  const said = (
    <p key="status" class={keepStatus ? css.statusKept : css.status} role="status">
      {status}
    </p>
  );
  // The person is the way to Settings, and to nothing else: one target.
  const who = person && (
    <a key="person" class={css.person} href="#/settings" aria-label={s.settings.open(person)}>
      <Person name={person} picture={picture} pending={pending} />
    </a>
  );
  // CSS places the parts; the page is written in the order the eye meets them, which is what Tab
  // and a screen reader follow. On a phone: the header (the mark, then the person), the screen,
  // then the bottom bar. With a sidebar: the sidebar from top to foot (the mark, the
  // destinations, the status, the person), then the screen. The parts are keyed, so crossing
  // the width moves them and the screen keeps everything it holds.
  const bar = <Said key="said" class={css.over} undo={s.today.undo} />;
  // Signed out there is nothing for a sidebar to hold: the mark stands alone at the top left.
  return <div class={cx(css.shell, !person && css.out, bare && css.bare)}>{sidebar ? [brand, nav, said, who, screen, bar] : [brand, who, screen, bar, said, nav]}</div>;
}
