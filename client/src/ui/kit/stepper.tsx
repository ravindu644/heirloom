import { Button } from './button.tsx';
import css from './stepper.module.css';

interface Props {
  /** What is being counted, for a screen reader. */
  label: string;
  /** The value as words: "4 laps". */
  text: string;
  /** What the two buttons do, for a screen reader: "One lap less", "One lap more". */
  less: string;
  more: string;
  onLess: () => void;
  onMore: () => void;
}

/** A number changed one step at a time. The caller keeps it inside its bounds. */
export function Stepper({ label, text, less, more, onLess, onMore }: Props) {
  return (
    <div class={css.stepper} role="group" aria-label={label}>
      {/* The signs are drawings, like the tick in a box: the labels carry the words. */}
      <Button aria-label={less} onClick={onLess}>
        −
      </Button>
      <output>{text}</output>
      <Button aria-label={more} onClick={onMore}>
        +
      </Button>
    </div>
  );
}
