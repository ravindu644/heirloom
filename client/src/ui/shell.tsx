import type { ComponentChildren } from 'preact';
import { Brand } from './kit/brand.tsx';
import { useKeyboard } from './kit/keyboard.ts';
import { Person } from './kit/person.tsx';
import { useSidebar } from './kit/wide.ts';
import css from './shell.module.css';
import * as s from './strings.ts';

export const DESTINATIONS = ['focus', 'today', 'progress', 'habits', 'room'] as const;
export type Destination = (typeof DESTINATIONS)[number];

interface Props {
  /** Who is signed in. Left out, nobody is: the frame has no person and no destinations. */
  person?: string;
  /** The destination being shown, if it is one of the five. */
  at?: Destination;
  /** A destination this person has taken out of their navigation: Room, when rooms are hidden. */
  without?: Destination;
  /** What the connection has to say, or nothing. */
  status?: string;
  /** Keep the status line's space even when it is silent: for a screen with buttons at the bottom of a phone. */
  keepStatus?: boolean;
  children: ComponentChildren;
}

/**
 * The frame every screen stands in, signed in or not, so nothing jumps between them: the mark
 * and the name in one place, the person at the right of the header (at the foot of the sidebar
 * on a laptop), the screen, what the connection has to say, and the five destinations.
 */
export function Shell({ person, at, without, status = '', keepStatus, children }: Props) {
  const sidebar = useSidebar();
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
    <main key="main" class={css.main}>
      <div class={css.canvas}>{children}</div>
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
      <Person name={person} />
    </a>
  );
  // CSS places the parts; the page is written in the order the eye meets them, which is what Tab
  // and a screen reader follow. On a phone: the header (the mark, then the person), the screen,
  // then the bottom bar. With a sidebar: the sidebar from top to foot (the mark, the
  // destinations, the status, the person), then the screen. The parts are keyed, so crossing
  // the width moves them and the screen keeps everything it holds.
  return <div class={css.shell}>{sidebar ? [brand, nav, said, who, screen] : [brand, who, screen, said, nav]}</div>;
}
