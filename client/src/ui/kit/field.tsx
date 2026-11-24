import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'preact';
import css from './field.module.css';

/** A labelled text input. The hint sits inside the label, so a screen reader says it with the name. */
export function Field({ label, hint, ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label class={css.field}>
      <span>{label}</span>
      <input {...input} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

/** The same for a line that may run long: it grows with what is written, and a new line is a space. */
export function LongField({ label, hint, ...area }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  return (
    <label class={css.field}>
      <span>{label}</span>
      <textarea rows={1} {...area} />
      {hint && <small>{hint}</small>}
    </label>
  );
}
