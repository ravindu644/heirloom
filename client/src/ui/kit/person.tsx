import { useEffect, useState } from 'preact/hooks';
import { cx } from './cx.ts';
import css from './person.module.css';

/**
 * A person's circle: their picture, cut round, where they set one and it loads, and otherwise
 * the first letter of their username. The picture is the circle's own background, shown once it
 * has loaded, so one that fails leaves the letter and never a broken image, and the circle is
 * the same element with or without one. `size`: `sm` 24px (a note, a lane, the call), the
 * 40px of a chip by default, `lg` 48px (a room's row on a phone).
 */
export function Face({ name, picture, size }: { name: string; picture?: string | null; size?: 'sm' | 'lg' }) {
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    setShown(null);
    if (!picture) return;
    const image = new Image();
    image.onload = () => setShown(picture);
    image.src = picture;
    return () => void (image.onload = null);
  }, [picture]);
  return (
    <i class={cx(css.face, size && css[size], shown && css.pictured)} style={shown ? `background-image:url("${shown}")` : undefined} aria-hidden="true">
      {name.charAt(0).toUpperCase()}
    </i>
  );
}

/**
 * A person: their circle, and beside it the username, or `label` where other words stand for
 * them ("You"). The circle is who it is, everywhere: it never takes its letter from the words.
 */
export function Person({ name, label, picture }: { name: string; label?: string; picture?: string | null }) {
  return (
    <span class={css.person}>
      <Face name={name} picture={picture} />
      <span>{label ?? name}</span>
    </span>
  );
}
