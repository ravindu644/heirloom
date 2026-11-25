import { useEffect, useRef, useState } from 'preact/hooks';
import { UNDO_MS } from '../../sync/focus.ts';
import { Button } from './button.tsx';
import css from './said.module.css';

/** What the last tap did, in parts, so a long title can be cut short and the rest still read. */
export interface Saying {
  lead: string;
  title: string;
  tail?: string;
  /** The tail goes on in the same sentence: a comma after the title, not a full stop. */
  comma?: boolean;
  /** The row it speaks of, looked up when the bar appears: the bar never covers it. */
  row?: () => Element | null | undefined;
  undo?: () => void;
}

/** A saying lasts as long as any Undo does, and then goes without a word. */
export function useSaid() {
  const [said, setSaid] = useState<Saying | null>(null);
  useEffect(() => {
    if (!said) return;
    const timer = setTimeout(() => setSaid(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [said]);
  return [said, setSaid] as const;
}

/** The ink bar at the foot of a list: one line, and a quiet Undo when the tap can be taken back. */
export function Said({ said, undo, onDone }: { said: Saying; undo: string; onDone: () => void }) {
  // A row that lies under the bar is nudged clear of it.
  const bar = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const row = said.row?.()?.getBoundingClientRect();
    const mine = bar.current!.getBoundingClientRect();
    if (row && row.bottom > mine.top && row.top < mine.bottom) bar.current!.closest('main')?.scrollBy(0, row.bottom - mine.top + mine.height / 4);
  }, [said]);
  return (
    <p class={css.said} role="status" ref={bar}>
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
            onDone();
          }}
        >
          {undo}
        </Button>
      )}
    </p>
  );
}
