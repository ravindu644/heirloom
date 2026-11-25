import { useState } from 'preact/hooks';
import type { ServerChoice } from '../sync/server.ts';
import { Button } from './kit/button.tsx';
import { ServerStep } from './server.tsx';
import { Shell } from './shell.tsx';
import * as s from './strings.ts';
import css from './welcome.module.css';

/**
 * What heirloom is, for someone who has never seen it: one headline, four lines in the order a
 * day meets them, and where it all lives. Sentences only. `first` is the phone app's first
 * screen, where it is the page's heading; beside the sign-in form it is the second thing.
 */
export function About({ first }: { first?: boolean }) {
  const Heading = first ? 'h1' : 'h2';
  return (
    <section class={first ? css.first : css.about}>
      {/* Two sentences, two lines, wherever it is set. */}
      <Heading>
        {s.welcome.title.split(/(?<=\.) /).map((sentence) => (
          <span key={sentence}>{sentence} </span>
        ))}
      </Heading>
      {s.welcome.lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
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
