import type { ComponentChild } from 'preact';
import { useState } from 'preact/hooks';
import type { ServerChoice } from '../sync/server.ts';
import { Button } from './kit/button.tsx';
import { Week } from './kit/day-box.tsx';
import { Laps } from './kit/laps.tsx';
import { Person } from './kit/person.tsx';
import { DayRace, LapLane } from './kit/race.tsx';
import { ServerStep } from './server.tsx';
import { Shell } from './shell.tsx';
import * as s from './strings.ts';
import css from './welcome.module.css';

// The drawing: six laps of yours, the sixth still running, over the five of a week ago.
const YOU = { laps: 6, part: 0.6 };
const BEFORE = { laps: 5 };

// The key to the race, as its caption: only what the race draws, each mark the piece the screens draw, with its words.
const KEY: [mark: ComponentChild, words: string][] = [
  [<LapLane small laps={1} />, s.welcome.key.lap],
  [<LapLane small />, s.welcome.key.rest],
  [<LapLane small ghost laps={1} />, s.welcome.key.ghost],
];

// A habit's week: five days kept and two of rest, one of them in the middle, where it breaks nothing.
const WEEK = s.habits.days.map((letter, day) => ({ letter, done: day !== 3 && day !== 6, rest: day === 3 || day === 6 }));
// A room: two friends on a lap with the time left on it, in ms, and one on a break.
const LEFT = [18 * 60000 + 42000, 7 * 60000 + 10000];

// The time left on a lap in the Room's own words, "18:42 left": bare, the figure read as a time of
// day. The figure keeps its face and the word after it stands small.
function Left({ ms }: { ms: number }) {
  const [figure, ...word] = s.room.left(ms).split(' ');
  return (
    <span class={css.left}>
      <b>{figure}</b> {word.join(' ')}
    </span>
  );
}

// The drawing moves once in a session: coming back to it, it stands as it ended.
let played = false;

/**
 * What heirloom is, for someone who has never seen it, shown and not explained: the headline, one
 * sentence, a day drawn as a race with its key as a caption, and two small drawings, a habit's
 * week and a room. `first` is the phone app's first
 * screen, where it is the page's heading; beside the sign-in form it is the second thing, and
 * says where it all lives itself.
 */
export function About({ first }: { first?: boolean }) {
  const Heading = first ? 'h1' : 'h2';
  const [playing] = useState(() => !played);
  played = true;
  return (
    <section class={first ? css.first : css.about}>
      {/* Two sentences, two lines, wherever it is set. */}
      <Heading>
        {s.welcome.title.split(/(?<=\.) /).map((sentence) => (
          <span key={sentence}>{sentence} </span>
        ))}
      </Heading>
      <p>{s.welcome.what}</p>
      {/* The race and its key are one block: the key is its caption. */}
      <div class={css.race}>
      <DayRace you={{ label: s.welcome.you, ...YOU }} ghost={{ label: s.welcome.before, ...BEFORE }} split={s.welcome.ahead} label={s.welcome.drawn} playing={playing} />
      <ul class={css.key}>
        {KEY.map(([mark, words]) => (
          <li key={words}>
            <span class={css.mark} aria-hidden="true">
              {mark}
            </span>
            {words}
          </li>
        ))}
      </ul>
      </div>
      {/* Small drawings in two columns that end on one line, each one picture with its line under it. They do not move. */}
      <div class={css.pair}>
        <div class={css.stack}>
          <figure>
            <Week days={WEEK} label={s.welcome.weekDrawn} />
            <figcaption>{s.welcome.week}</figcaption>
          </figure>
          <figure>
            <span class={css.task} role="img" aria-label={s.welcome.tasksDrawn}>
              <Laps laps={2} estimate={3} of={s.today.of(3)} />
            </span>
            <figcaption>{s.welcome.tasks}</figcaption>
          </figure>
        </div>
        <figure>
          {/* The Room's own row is a card 48px tall with more lines in it: here its circle and
              name, and its figure of the time left, as it sets them. */}
          <div class={css.room} role="img" aria-label={s.welcome.roomDrawn}>
            {s.welcome.friends.map((name, at) => (
              <span key={name}>
                <Person name={name} />
                {at < LEFT.length ? <Left ms={LEFT[at]!} /> : <em>{s.room.shortBreak}</em>}
              </span>
            ))}
          </div>
          <figcaption>{s.welcome.room}</figcaption>
        </figure>
      </div>
      {!first && <p class={css.where}>{s.welcome.where}</p>}
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
        {/* The sentence that explains the button stands directly over it. */}
        <div class={css.go}>
          <p class={css.where}>{s.welcome.where}</p>
          <Button kind="primary" onClick={() => setAsking(true)}>
            {s.welcome.go}
          </Button>
        </div>
      </div>
    </Shell>
  );
}
