import { signal } from '@preact/signals';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { SAID_MS, UNDO_MS } from '../../sync/focus.ts';
import { Button } from './button.tsx';
import { Kept, useGoing } from './fold.tsx';
import { cx } from './cx.ts';
import { useSidebar } from './wide.ts';
import css from './said.module.css';

/** What the last tap did, in parts, so a long title can be cut short and the rest still read. */
export interface Saying {
  lead: string;
  title: string;
  tail?: string;
  /** The tail goes on in the same sentence: a comma after the title, not a full stop. */
  comma?: boolean;
  undo?: () => void;
}

// One bar for the whole app, drawn by the frame at the bottom of the screen: a screen says what
// a tap did and never places, times or removes the bar itself.
const saying = signal<(Saying & { id: number }) | null>(null);
let ids = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Say what the last tap did, or take it back with null. It goes by itself: after four seconds when it only reports, after ten when it carries an Undo. */
export function say(next: Saying | null) {
  clearTimeout(timer);
  saying.value = next && { ...next, id: ++ids };
  if (next) timer = setTimeout(() => (saying.value = null), next.undo ? UNDO_MS : SAID_MS);
}

function Bar({ said, undo }: { said: Saying; undo: string }) {
  // Beside a sidebar the bar is as wide as the column it speaks for, the one a screen marks
  // with `data-said`: read once, as the bar comes. On a phone it runs from edge to edge.
  const bar = useRef<HTMLParagraphElement>(null);
  const beside = useSidebar();
  useLayoutEffect(() => {
    const column = beside ? document.querySelector('[data-said]')?.getBoundingClientRect() : undefined;
    const frame = bar.current!.offsetParent?.getBoundingClientRect();
    bar.current!.style.left = column && frame ? `${column.left - frame.left}px` : '';
    bar.current!.style.width = column ? `${column.width}px` : '';
  }, [beside]);
  return (
    <p ref={bar} class={cx(css.said, useGoing() && css.going)}>
      <span>
        <span class={css.name}>
          {said.lead} <span class={css.title}>{said.title}{said.comma ? ',' : '.'}</span>
        </span>
        {/* A space in the text itself: a screen reader must not run the two together. */}
        {said.tail && ' '}
        {said.tail && <span class={css.tail}>{said.tail}</span>}
      </span>
      {said.undo && (
        <Button
          kind="link"
          onClick={() => {
            said.undo!();
            say(null);
          }}
        >
          {undo}
        </Button>
      )}
    </p>
  );
}

/** Where the bar stands: laid over the foot of the screen, taking no room in it. The region is always there, so a screen reader hears what arrives in it. */
export function Said({ undo, class: extra }: { undo: string; class?: string }) {
  const said = saying.value;
  return (
    <div class={cx(css.over, extra)} role="status">
      <Kept>{said && <Bar key={said.id} said={said} undo={undo} />}</Kept>
    </div>
  );
}
