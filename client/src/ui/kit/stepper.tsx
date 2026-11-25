import { useEffect, useState } from 'preact/hooks';
import { Button } from './button.tsx';
import css from './stepper.module.css';

interface Props {
  /** The value as words: "4 laps". With `typed`, only the unit: "minutes". */
  text: string;
  /** What the two buttons do, for a screen reader: "One lap less", "One lap more". */
  less: string;
  more: string;
  onLess: () => void;
  onMore: () => void;
  /** A figure large enough to be typed: its value, its bounds, its name for a screen reader, and what a typed value does. */
  typed?: { value: number; min: number; max: number; label: string; onSet: (value: number) => void };
}

/**
 * A number changed one step at a time: minus, the figure, plus. A small count is text. A length
 * is a field, so 25 to 50 is typed once and the buttons are for nudging; it is saved when the
 * field is left or Enter is pressed, and a value that is not a whole number in its bounds is put
 * back. The caller names what is counted in the section it sits in.
 */
export function Stepper({ text, less, more, onLess, onMore, typed }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  // A value that changed elsewhere (a button here, another device) replaces what was half typed.
  useEffect(() => setDraft(null), [typed?.value]);
  const keep = () => {
    const value = Number(draft);
    if (typed && draft !== null && Number.isInteger(value) && value >= typed.min && value <= typed.max) typed.onSet(value);
    setDraft(null);
  };
  return (
    <div class={css.stepper}>
      {/* The signs are drawings, like the tick in a box: the labels carry the words. */}
      <Button aria-label={less} onClick={onLess}>
        −
      </Button>
      {typed ? (
        <input
          type="number"
          inputMode="numeric"
          min={typed.min}
          max={typed.max}
          step={1}
          aria-label={typed.label}
          value={draft ?? typed.value}
          onInput={(event) => setDraft(event.currentTarget.value)}
          onBlur={keep}
          onKeyDown={(event) => event.key === 'Enter' && keep()}
        />
      ) : (
        <output>{text}</output>
      )}
      <Button aria-label={more} onClick={onMore}>
        +
      </Button>
      {typed && <span>{text}</span>}
    </div>
  );
}
