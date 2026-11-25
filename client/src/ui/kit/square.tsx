import type { ProjectColor } from '../../sync/today.ts';
import css from './square.module.css';

/**
 * A project's colour: a small square before its name, and nothing else. One of the twelve named
 * colours is a token; one the person picked is the colour itself, the one place a colour value
 * reaches a style attribute, inside a hair line so a pale one still shows on a pale ground.
 * Whoever draws it sets its size.
 */
export function Square({ color }: { color: ProjectColor }) {
  const picked = color.startsWith('#');
  return <i class={picked ? css.picked : undefined} style={`background:${picked ? color : `var(--${color})`}`} />;
}
