import { useEffect, useState } from 'preact/hooks';
import { avatar } from '../../core/avatar.ts';
import { cx } from './cx.ts';
import css from './person.module.css';

/**
 * A person's circle: their picture, cut round, where they set one and it loads, and otherwise
 * their colour and letters, from their username, so they are the same on every screen and device.
 * The picture is the circle's own background, shown once it has loaded, so one that fails leaves
 * the letters and never a broken image, and the circle is the same element with or without one.
 * `size`: `sm` 24px (a note, a lane, the call), the 40px of a chip by default, `lg` 48px (a
 * room's panel on a phone), `xl` 56px (a person's report).
 */
export function Face({ name, picture, size }: { name: string; picture?: string | null; size?: 'sm' | 'lg' | 'xl' }) {
  const { hue, letters } = avatar(name);
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
    <i
      class={cx(css.face, size && css[size], hue === 'heat-2' && css.inked, shown && css.pictured)}
      style={shown ? `background-image:url("${shown}")` : `background-color:var(--${hue})`}
      aria-hidden="true"
    >
      {letters}
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
