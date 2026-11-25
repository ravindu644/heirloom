import css from './person.module.css';

/** A person: the first letter of their name in a circle, and the name beside it. */
export function Person({ name }: { name: string }) {
  return (
    <span class={css.person}>
      <i aria-hidden="true">{name.charAt(0).toUpperCase()}</i>
      <span>{name}</span>
    </span>
  );
}
