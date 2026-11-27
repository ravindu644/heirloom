import css from './check.module.css';

/** A box to tick: 20px to the eye, 48px to a thumb. `label` says what it marks, for a screen reader; `described` is the id of a note that says more. `off`: it can do nothing now and takes no press. */
export function Check({ checked, label, described, off, onChange }: { checked: boolean; label: string; described?: string; off?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} aria-describedby={described} disabled={off} class={css.check} onClick={() => onChange(!checked)}>
      <i />
    </button>
  );
}
