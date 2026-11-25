import css from './person.module.css';

/**
 * A person: the first letter of their username in a circle, and beside it the username, or
 * `label` where other words stand for them ("You"). The circle is who it is, everywhere: it
 * never takes its letter from the words.
 */
export function Person({ name, label }: { name: string; label?: string }) {
  return (
    <span class={css.person}>
      <i aria-hidden="true">{name.charAt(0).toUpperCase()}</i>
      <span>{label ?? name}</span>
    </span>
  );
}
