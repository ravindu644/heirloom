import css from './race.module.css';
import { cx } from './cx.ts';

/** One runner: the name, the total as words ("2h 11m") and how far along the shared scale, 0 to 1. */
export interface Lane {
  label: string;
  value: string;
  share: number;
}

interface Props {
  you: Lane;
  /** Past you. Left out, there is no ghost lane at all. */
  ghost?: Lane | null;
  /** The result of a lap: tall lanes, each ending on a finish line. */
  big?: boolean;
  /** The lap-done moment: where your bar stood when the lap began, 0 to 1. Your bar runs from there, once. */
  from?: number;
}

const pct = (share: number) => `${Math.min(1, Math.max(0, share)) * 100}%`;

/** You over the ghost on one scale. Read aloud it is "You 2h 11m, Ghost 2h 30m": the bars add nothing a number has not said. */
export function Race({ you, ghost, big, from }: Props) {
  const running = from !== undefined && you.share > 0;
  return (
    <div class={cx(css.race, big && css.big)}>
      <span class={css.who}>{you.label}</span>
      <div class={cx(css.lane, running && css.running)}>
        <div class={css.bar} style={`width:${pct(you.share)};--from:${running ? from / you.share : 1}`} />
        {big && <i class={css.line} style={`left:${pct(you.share)}`} />}
      </div>
      <span class={cx(css.value, css.yours)}>{you.value}</span>
      {ghost && (
        <>
          <span class={css.who}>{ghost.label}</span>
          <div class={cx(css.lane, css.ghost)}>
            <div class={css.bar} style={`width:${pct(ghost.share)}`} />
            {big && <i class={css.line} style={`left:${pct(ghost.share)}`} />}
          </div>
          <span class={css.value}>{ghost.value}</span>
        </>
      )}
    </div>
  );
}

/** The split between you and the ghost. The sign and the word carry it; the colour only agrees. */
export function SplitChip({ text, tone, turning }: { text: string; tone: 'behind' | 'ahead' | 'level'; turning?: boolean }) {
  return <span class={cx(css.chip, css[tone], turning && css.turning)}>{text}</span>;
}
