import { useEffect } from 'preact/hooks';
import type { Mark, Settings } from '../../sync/settings.ts';
import css from './marks.module.css';

/**
 * What was just achieved, one quiet line each, in the moment it happened. Shown once: when the
 * moment passes (this leaves the screen, or `last` ms go by) they are marked as seen.
 */
export function Marks({ settings, say, last }: { settings: Settings; say: (mark: Mark) => string; last?: number }) {
  const marks = settings.marks.value;
  const any = marks.length > 0;
  useEffect(() => {
    if (!any) return;
    const timer = last === undefined ? undefined : setTimeout(() => settings.seen(), last);
    return () => {
      clearTimeout(timer);
      settings.seen();
    };
  }, [any]);
  if (!any) return null;
  return (
    <ul class={css.marks} role="status">
      {marks.map((mark, i) => (
        <li key={i}>{say(mark)}</li>
      ))}
    </ul>
  );
}
