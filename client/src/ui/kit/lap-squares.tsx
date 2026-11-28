import css from './lap-squares.module.css';

/**
 * A task's laps as small squares, oldest first: 1 is a lap that rang, a share is one stopped or
 * still running, and empty ones run up to the estimate. Laps may pass the estimate; then there are
 * more squares, in the same colour. Eight stand on a line and there are four lines at most, each
 * ending at the right edge, the newest at the foot. The count beside them says the same, so this
 * is a picture only: past what four lines hold it is not drawn, and the count stands alone.
 */
const LINE = 8;
const LINES = 4;

/** One lap alone, 12px: filled as far as it ran (`share`), hollow in `you` when it is not counted. */
export function LapSquare({ share, hollow }: { share: number; hollow?: boolean }) {
  return <i class={hollow ? css.hollow : css.one} style={`--share:${Math.min(1, share)}`} aria-hidden="true" />;
}

export function LapSquares({ squares, estimate }: { squares: number[]; estimate: number | null }) {
  const count = Math.max(squares.length, estimate ?? 0);
  if (!count || count > LINE * LINES) return null;
  return (
    <span class={css.squares} style={`--n:${Math.min(count, LINE)}`} data-squares aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i key={i} style={`--share:${Math.min(1, squares[i] ?? 0)}`} />
      ))}
    </span>
  );
}
