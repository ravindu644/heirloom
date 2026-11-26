import { useState } from 'preact/hooks';
import type { ServerChoice } from '../sync/server.ts';
import { Button } from './kit/button.tsx';
import { ServerStep } from './server.tsx';
import { Shell } from './shell.tsx';
import * as s from './strings.ts';
import css from './welcome.module.css';

// Seven weeks of days, oldest first, a column a week with Monday on top, as Progress draws a
// year. A digit is the day's heat step, 0 (no lap) to 4 (the fullest); `r` is a day of no laps
// that was a rest day. Darker toward today, the last day drawn: the user chose this pattern.
const WEEKS = ['10210r0', '212r10r', '2213201', '3r321r1', '3324r30', '434321r', '3442'];
// A square and the space to the next, in the drawing's own px: 48 apart by 6.
const CELL = 48;
const STEP = 54;
const SIDE = STEP * WEEKS.length - (STEP - CELL);
const HEAT = [css.h0, css.h1, css.h2, css.h3, css.h4];

/**
 * The drawing: one picture to a screen reader, still, every colour a token, so dark is the same
 * drawing on the dark tokens. A rest day carries the rest mark as the heat grid draws it, a ring
 * two thirds of the square across; today carries the heat grid's hair outline in ink, drawn inside its square.
 */
function Days() {
  const last = WEEKS.length - 1;
  const today = WEEKS[last]!.length - 1;
  return (
    <svg class={css.days} viewBox={`0 0 ${SIDE} ${SIDE}`} width={SIDE} height={SIDE} role="img" aria-label={s.welcome.drawn}>
      {WEEKS.flatMap((week, w) =>
        [...week].map((day, d) => (
          <g key={`${w}-${d}`}>
            <rect class={HEAT[day === 'r' ? 0 : Number(day)]} x={w * STEP} y={d * STEP} width={CELL} height={CELL} />
            {day === 'r' && <circle class={css.rest} cx={w * STEP + CELL / 2} cy={d * STEP + CELL / 2} r={CELL / 3 - 1} />}
          </g>
        )),
      )}
      {/* Today's outline is Progress's: a hair, inside the square. */}
      <rect class={css.today} x={last * STEP + 0.5} y={today * STEP + 0.5} width={CELL - 1} height={CELL - 1} />
    </svg>
  );
}

/**
 * What heirloom is, for someone who has never seen it: one drawing, the title and one sentence.
 * `first` is the phone app's first screen, where the title is the page's heading and stands at
 * the foot with the button; beside the sign-in form it is the second thing on the page.
 */
export function About({ first }: { first?: boolean }) {
  const Heading = first ? 'h1' : 'h2';
  const words = (
    <>
      <Heading>{s.welcome.title}</Heading>
      <p>{s.welcome.what}</p>
    </>
  );
  return first ? (
    <>
      <Days />
      {/* The free space lies between the drawing and the words, which stand in reach of the thumb. */}
      <div class={css.words}>{words}</div>
    </>
  ) : (
    <section class={css.about}>
      <Days />
      <div class={css.words}>{words}</div>
    </section>
  );
}

/**
 * The phone app before it has a server: the welcome, then the server step, whose Back returns
 * here. It is shown until a server is chosen, which is once: from then on the app starts on
 * its server and never comes this way again.
 */
export function FirstRun({ choice }: { choice: ServerChoice }) {
  const [asking, setAsking] = useState(false);
  if (asking) return <ServerStep choice={choice} onBack={() => setAsking(false)} />;
  return (
    <Shell page="welcome">
      <div class={css.welcome}>
        <About first />
        <div class={css.go}>
          <Button kind="primary" onClick={() => setAsking(true)}>
            {s.welcome.go}
          </Button>
        </div>
      </div>
    </Shell>
  );
}
