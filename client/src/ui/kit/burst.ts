import css from './burst.module.css';

const HEAT = ['heat-2', 'heat-3', 'you'];
const centre = (el: Element) => {
  const box = el.getBoundingClientRect();
  return [box.left + box.width / 2, box.top + box.height / 2];
};

/**
 * A cheer in motion (DESIGN.md, Motion): six squares out from `from` and fading, or, given `to`,
 * from one circle to the other. Under reduced motion nothing flies: the words that follow are the
 * whole of it.
 */
export function burst(from: Element, to?: Element) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const [x, y] = centre(from);
  const [x1, y1] = to ? centre(to) : [x, y];
  for (let i = 0; i < 6; i++) {
    const square = document.createElement('i');
    square.className = `${css.square} ${to ? css.in : css.out}`;
    square.setAttribute('aria-hidden', 'true');
    square.style.cssText = `--x:${x}px;--y:${y}px;--x1:${x1}px;--y1:${y1}px;--a:${i * 60 + 30}deg;background:var(--${HEAT[i % 3]})`;
    square.addEventListener('animationend', () => square.remove());
    square.addEventListener('animationcancel', () => square.remove());
    document.body.append(square);
  }
}
