import css from './brand.module.css';

/**
 * The mark and the name. The mark is the colon of the big timer, and its two dots are the two
 * runners: the upper one is you, filled; the lower is the ghost, as wide, hollow and dashed. One
 * drawing, in the proportions of `design/logos/colon.svg`, so the dashes are the same on every
 * screen and do not turn to mush as a dashed border does at this size. Six dashes: beside the
 * name the mark is under 24px, where eight run together. The ring is as wide as the dot over it
 * and its line a little heavier than in the icon (28 of 140, not 22): at nine pixels across,
 * on a screen of one pixel to the point, the lighter line fades into the ground.
 */
export function Brand({ name }: { name: string }) {
  return (
    <>
      <svg class={css.mark} viewBox="0 0 140 324" aria-hidden="true">
        <circle class={css.you} cx="70" cy="70" r="70" />
        <circle class={css.ghost} cx="70" cy="254" r="56" stroke-width="28" stroke-dasharray="35.2 23.4" transform="rotate(-15 70 254)" />
      </svg>
      {name}
    </>
  );
}
