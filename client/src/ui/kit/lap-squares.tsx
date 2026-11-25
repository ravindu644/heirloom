import css from './lap-squares.module.css';

/**
 * A task's laps as small squares, oldest first: 1 is a lap that rang, a share is one stopped or
 * still running, and empty ones run up to the estimate. Laps may pass the estimate; then there are
 * more squares, in the same colour. The count beside them says the same, so this is a picture only:
 * past twelve squares it is not drawn at all, and the count stands alone.
 */
const MOST = 12;

export function LapSquares({ squares, estimate }: { squares: number[]; estimate: number | null }) {
  const count = Math.max(squares.length, estimate ?? 0);
  if (!count || count > MOST) return null;
  return (
    // All of them or none: where they do not fit beside a title they are not drawn, never some of them.
    <span class={css.fit} style={`--n:${count}`} data-squares aria-hidden="true">
      <span class={css.squares}>
        {Array.from({ length: count }, (_, i) => (
          <i key={i} style={`--share:${Math.min(1, squares[i] ?? 0)}`} />
        ))}
      </span>
    </span>
  );
}
