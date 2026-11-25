import { useState } from 'preact/hooks';
import { Button } from './button.tsx';
import css from './twice.module.css';

/**
 * A link for what cannot be taken back: it asks twice. The first tap turns its own words into
 * the question ("Delete for good?"), a second tap does it, and looking away (the focus leaving)
 * takes the question back. Both wordings are always drawn in the one place, one of them unseen,
 * so the link is as wide as the wider and nothing beside it moves when it asks.
 */
export function Twice({ words, ask, onDo }: { words: string; ask: string; onDo: () => void }) {
  const [asking, setAsking] = useState(false);
  return (
    <Button kind="link" aria-label={asking ? ask : words} onBlur={() => setAsking(false)} onClick={() => (asking ? onDo() : setAsking(true))}>
      <span class={css.both} aria-hidden="true">
        <span class={asking ? css.off : undefined}>{words}</span>
        <span class={asking ? undefined : css.off}>{ask}</span>
      </span>
    </Button>
  );
}
