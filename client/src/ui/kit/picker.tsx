import { hueHex } from './hue.ts';
import css from './picker.module.css';

interface Props {
  hue: number;
  depth: number;
  /** The names of the two sliders: which colour, and from pale to deep. */
  hueLabel: string;
  depthLabel: string;
  onPick: (hue: number, depth: number) => void;
  /** The finger has lifted: the colour under it is the answer. It is given here again, because a tap on a strip moves and lifts in one go, before anything has been drawn anew. */
  onDone?: (hue: number, depth: number) => void;
}

/**
 * The app's own colour picker: two of the browser's sliders, one for which colour and one from
 * pale to deep. Each strip is drawn from the answers the slider would give, at where the other
 * slider stands, so what is under the thumb is what is picked. Those colours are worked out as
 * the page runs and reach the strips through a style attribute, as a picked colour's square does.
 */
export function Picker({ hue, depth, hueLabel, depthLabel, onPick, onDone }: Props) {
  const strip = (stops: string[]) => `--strip:linear-gradient(to right,${stops.join(',')})`;
  return (
    <div class={css.picker}>
      <label>
        {hueLabel}
        <input type="range" name="hue" min={0} max={359} value={hue} style={strip(Array.from({ length: 13 }, (_, at) => hueHex(at * 30, depth)))} onInput={(event) => onPick(Number(event.currentTarget.value), depth)} onChange={(event) => onDone?.(Number(event.currentTarget.value), depth)} />
      </label>
      <label>
        {depthLabel}
        <input type="range" name="depth" min={0} max={100} value={depth} style={strip([0, 25, 50, 75, 100].map((at) => hueHex(hue, at)))} onInput={(event) => onPick(hue, Number(event.currentTarget.value))} onChange={(event) => onDone?.(hue, Number(event.currentTarget.value))} />
      </label>
    </div>
  );
}
