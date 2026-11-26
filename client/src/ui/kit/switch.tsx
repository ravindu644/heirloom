import { useId } from 'preact/hooks';
import { Check } from './check.tsx';
import css from './switch.module.css';

/**
 * Something that is on or off: its name, one line on what it means, and the app's one box. The
 * whole row is the target. The box is named by the label alone; the note is its description.
 */
export function Switch({ label, note, on, onChange }: { label: string; note?: string; on: boolean; onChange: (on: boolean) => void }) {
  const described = useId();
  return (
    <label class={css.switch}>
      <span>
        <b data-job="switch">{label}</b>
        {note && <small id={described} data-job="note">{note}</small>}
      </span>
      <Check checked={on} label={label} described={note ? described : undefined} onChange={onChange} />
    </label>
  );
}
