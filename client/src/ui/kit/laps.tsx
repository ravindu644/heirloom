import css from './laps.module.css';
import { LapSquares } from './lap-squares.tsx';

interface Props {
  /** Laps that rang: the "2" of "2 of 4". */
  laps: number;
  /** One number per square, oldest first. Left out, every lap that rang is a whole square. */
  squares?: number[];
  estimate: number | null;
  /** After the number: " of 4", or nothing when there is no estimate. */
  of: string;
}

/** Laps as small squares with the count they picture beside them, in `figure-sm`. Past the estimate nothing changes colour. */
export function Laps({ laps, squares, estimate, of }: Props) {
  return (
    <span class={css.laps}>
      <LapSquares squares={squares ?? Array.from({ length: laps }, () => 1)} estimate={estimate} />
      <span class={css.count}>
        <b>{laps}</b>
        {of}
      </span>
    </span>
  );
}
