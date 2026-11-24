import css from './brand.module.css';

/** The mark and the name: a solid dot for you, a dashed hollow one for the ghost beside you. */
export function Brand({ name }: { name: string }) {
  return (
    <>
      <span class={css.mark} aria-hidden="true">
        <i />
        <i />
      </span>
      {name}
    </>
  );
}
