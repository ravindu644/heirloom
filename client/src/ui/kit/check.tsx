import css from './check.module.css';

/** A box to tick: 20px to the eye, 48px to a thumb. `label` says what it marks, for a screen reader. */
export function Check({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} class={css.check} onClick={() => onChange(!checked)}>
      <i />
    </button>
  );
}
