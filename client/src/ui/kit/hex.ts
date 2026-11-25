/**
 * A colour token as `#rrggbb`, which is the only spelling a colour field takes. Asked of the
 * browser, not read from the token's text: a build may shorten that text to three digits or to
 * a name.
 */
export function hexOf(token: string) {
  const probe = document.createElement('i');
  probe.style.color = `var(--${token})`;
  document.body.append(probe);
  const [r = 0, g = 0, b = 0] = getComputedStyle(probe).color.match(/\d+/g)?.map(Number) ?? [];
  probe.remove();
  return `#${[r, g, b].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}
