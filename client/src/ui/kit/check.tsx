import css from './check.module.css';

/** A box to tick: 20px to the eye, 48px to a thumb. `label` says what it marks, for a screen reader; `described` is the id of a note that says more. */
export function Check({ checked, label, described, onChange }: { checked: boolean; label: string; described?: string; onChange: (checked: boolean) => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} aria-describedby={described} class={css.check} onClick={() => onChange(!checked)}>
      <i />
    </button>
  );
}
