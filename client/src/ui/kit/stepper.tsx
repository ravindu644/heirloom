import { Button } from './button.tsx';
import css from './stepper.module.css';

interface Props {
  /** The value as words: "4 laps". */
  text: string;
  /** What the two buttons do, for a screen reader: "One lap less", "One lap more". */
  less: string;
  more: string;
  onLess: () => void;
  onMore: () => void;
}

/**
 * A number changed one step at a time. The caller keeps it inside its bounds, and names what is
 * counted in the section it sits in: named here as well, a screen reader would say it twice.
 */
export function Stepper({ text, less, more, onLess, onMore }: Props) {
  return (
    <div class={css.stepper}>
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
