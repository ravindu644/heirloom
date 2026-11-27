import { useId } from 'preact/hooks';
import { Check } from './check.tsx';
import css from './switch.module.css';

/**
 * Something that is on or off: its name, one line on what it means, and the app's one box. The
 * whole row is the target. The box is named by the label alone; the note is its description.
 * `off`: another switch has made this one do nothing; its words go `muted` and nothing takes a press.
 */
export function Switch({ label, note, on, off, onChange }: { label: string; note?: string; on: boolean; off?: boolean; onChange: (on: boolean) => void }) {
  const described = useId();
  return (
    <label class={css.switch} data-off={off || undefined}>
      <span>
        <b data-job="switch">{label}</b>
        {note && <small id={described} data-job="note">{note}</small>}
      </span>
      <Check checked={on} label={label} described={note ? described : undefined} off={off} onChange={onChange} />
    </label>
  );
}
