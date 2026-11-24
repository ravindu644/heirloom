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

/** The same, for more than one line. */
export function Area({ label, ...area }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label class={css.field}>
      <span>{label}</span>
      <textarea {...area} />
    </label>
  );
}
