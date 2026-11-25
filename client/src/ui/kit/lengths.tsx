import { LAP_MAX_MS } from '../../sync/settings.ts';
import * as s from '../strings.ts';
import form from './form.module.css';
import { Stepper } from './stepper.tsx';

const MIN = 60000;
// Where a stepper stops, in minutes. A lap at its top still fits the clock's four digits with its
// seconds. The schema allows a break of a whole day; past an hour a stepper is not the way there.
const TOP = { work_ms: LAP_MAX_MS / MIN, short_ms: 60, long_ms: 60 };
const NAMES = { work_ms: s.settings.lap, short_ms: s.settings.short, long_ms: s.settings.long };

export type LengthsOf = Record<keyof typeof TOP, number>;

/** A lap, a short break and the long break as three steppers of minutes: the account's in Settings, a task's own in its sheet. */
export function Lengths({ of, onSet }: { of: LengthsOf; onSet: (change: Partial<LengthsOf>) => void }) {
  return (
    <div class={form.stack}>
      {(Object.keys(TOP) as (keyof typeof TOP)[]).map((field) => {
        const name = NAMES[field];
        // A length kept by an earlier build may be over today's top: it is shown and stepped from
        // the top, and nothing is written until the person changes it.
        const minutes = Math.min(TOP[field], Math.round(of[field] / MIN));
        const to = (next: number) => onSet({ [field]: Math.min(TOP[field], Math.max(1, next)) * MIN });
        return (
          <fieldset key={field} class={form.group}>
            <legend>{name}</legend>
            <Stepper
              text={s.settings.minutes(minutes)}
              less={s.settings.less(name)}
              more={s.settings.more(name)}
              onLess={() => to(minutes - 1)}
              onMore={() => to(minutes + 1)}
              typed={{ value: minutes, min: 1, max: TOP[field], label: name, onSet: to }}
            />
          </fieldset>
        );
      })}
    </div>
  );
}
