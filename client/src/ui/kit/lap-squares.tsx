import css from './lap-squares.module.css';

/**
 * A task's laps as small squares, oldest first: 1 is a lap that rang, a share is one stopped or
 * still running, and empty ones run up to the estimate. Laps may pass the estimate; then there are
 * more squares, in the same colour. The count beside them says the same, so this is a picture only.
 */
export function LapSquares({ squares, estimate }: { squares: number[]; estimate: number | null }) {
  const count = Math.max(squares.length, estimate ?? 0);
  if (!count) return null;
  return (
    <span class={css.squares} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i key={i} style={`--share:${Math.min(1, squares[i] ?? 0)}`} />
      ))}
    </span>
  );
}
