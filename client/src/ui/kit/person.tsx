import { useEffect, useState } from 'preact/hooks';
import { avatar } from '../../core/avatar.ts';
import { cx } from './cx.ts';
import css from './person.module.css';

/**
 * A person's circle: their picture, cut round, where they set one, and otherwise their colour
 * and letters, from their username, so they are the same on every screen and device. `pending`
 * says they have a picture: until it has drawn the circle is their colour alone, with no
 * letters to flash before it, and the letters come only if it fails. The picture is the circle's
 * own background, so the circle is the same element with or without one. `size`: `sm` 24px (a
 * note, a lane, the call), the 40px of a chip by default, `lg` 48px (a room's panel on a phone),
 * `xl` 56px (a person's report).
 */
export function Face({ name, picture, pending, size }: { name: string; picture?: string | null; pending?: boolean; size?: 'sm' | 'lg' | 'xl' }) {
  const { hue, letters } = avatar(name);
  // A picture that would not load: the letters stand in for it.
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!picture) return;
    const image = new Image();
    image.onerror = () => setFailed(picture);
    image.src = picture;
    return () => void (image.onerror = null);
  }, [picture]);
  const shown = picture && failed !== picture ? picture : null;
  const waiting = !shown && pending && !(picture && failed === picture);
  return (
    <i
      class={cx(css.face, size && css[size], hue === 'heat-2' && css.inked, (shown || waiting) && css.pictured)}
      style={`background-color:var(--${hue})${shown ? `;background-image:url("${shown}")` : ''}`}
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
export function Person({ name, label, picture, pending }: { name: string; label?: string; picture?: string | null; pending?: boolean }) {
  return (
    <span class={css.person}>
      <Face name={name} picture={picture} pending={pending} />
      <span>{label ?? name}</span>
    </span>
  );
}
