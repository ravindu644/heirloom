import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'preact';
import { useId } from 'preact/hooks';
import css from './field.module.css';

/**
 * A labelled text input. The label is the field's name and nothing more; the hint under it is
 * the field's description, so a screen reader says "Invite" and then, as a description, what an
 * invite looks like, and a test finds the field by its name alone.
 */
export function Field({ label, hint, ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const described = useId();
  return (
    <div class={css.field}>
      <label>
        <span>{label}</span>
        <input aria-describedby={hint ? described : undefined} {...input} />
      </label>
      {hint && <small id={described}>{hint}</small>}
    </div>
  );
}

/** The same for a line that may run long: it grows with what is written, and a new line is a space. */
export function LongField({ label, hint, ...area }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  const described = useId();
  return (
    <div class={css.field}>
      <label>
        <span>{label}</span>
        <textarea rows={1} aria-describedby={hint ? described : undefined} {...area} />
      </label>
      {hint && <small id={described}>{hint}</small>}
    </div>
  );
}
