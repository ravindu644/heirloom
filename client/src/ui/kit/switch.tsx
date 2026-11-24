import { Check } from './check.tsx';
import css from './switch.module.css';

/**
 * Something that is on or off: its name, one line on what it means, and the app's one box. The
 * whole row is the target.
 */
export function Switch({ label, note, on, onChange }: { label: string; note?: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label class={css.switch}>
      <span>
        <b>{label}</b>
        {note && <small>{note}</small>}
      </span>
      <Check checked={on} label={label} onChange={onChange} />
    </label>
  );
}
