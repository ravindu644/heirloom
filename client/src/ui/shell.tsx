import type { ComponentChildren } from 'preact';
import { Brand } from './kit/brand.tsx';
import { Person } from './kit/person.tsx';
import css from './shell.module.css';
import * as s from './strings.ts';

export const DESTINATIONS = ['focus', 'today', 'progress', 'habits', 'room'] as const;
export type Destination = (typeof DESTINATIONS)[number];

interface Props {
  /** Who is signed in. Left out, nobody is: the frame has no person and no destinations. */
  person?: string;
  /** The destination being shown, if it is one of the five. */
  at?: Destination;
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
export function Shell({ person, at, status = '', keepStatus, children }: Props) {
  return (
    <div class={css.shell}>
      <a class={css.brand} href="#/focus">
        <Brand name={s.brand} />
      </a>
      {person && (
        <nav class={css.nav} aria-label={s.nav.label}>
          {DESTINATIONS.map((id) => (
            <a key={id} href={`#/${id}`} aria-current={id === at ? 'page' : undefined}>
              {id === at ? <b>{s.nav[id]}</b> : s.nav[id]}
            </a>
          ))}
        </nav>
      )}
      <main class={css.main}>
        <div class={css.canvas}>{children}</div>
      </main>
      <p class={keepStatus ? css.statusKept : css.status} role="status">
        {status}
      </p>
      {/* The person is the way to Settings, and to nothing else: one target. */}
      {person && (
        <a class={css.person} href="#/settings" aria-label={s.settings.open(person)}>
          <Person name={person} />
        </a>
      )}
    </div>
  );
}
