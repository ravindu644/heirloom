import { useEffect, useRef, useState } from 'preact/hooks';
import type { Focus } from '../../sync/focus.ts';
import type { HabitDay, HabitView, Habits } from '../../sync/habits.ts';
import { Button } from '../kit/button.tsx';
import { Check } from '../kit/check.tsx';
import links from '../kit/links.module.css';
import { cx } from '../kit/cx.ts';
import { Panel } from '../kit/panel.tsx';
import { QuickAdd } from '../kit/quick-add.tsx';
import { Race } from '../kit/race.tsx';
import { Said, useSaid } from '../kit/said.tsx';
import { Sheet } from '../kit/sheet.tsx';
import * as s from '../strings.ts';
import { useTick } from '../tick.ts';
import { HabitSheet } from './habit-sheet.tsx';
import css from './habits.module.css';

/** Its run, or after a miss the days kept: never the miss itself. */
const run = (habit: HabitView) => (habit.missed ? s.habits.keptOf(habit.kept, habit.of) : habit.streak > 0 ? s.habits.running(habit.streak) : '');

// A day of the week as a lane: done is filled, a count on its way is filled that far, a rest day
// carries the ring, and a day the habit is not planned for has no lane at all, only its line.
function cell(day: HabitDay, target: number) {
  if (day.done) return <i class={css.done} />;
  if (day.rest) return <i class={css.rest} />;
  if (day.count > 0) return <i class={css.part} style={`--share:${Math.min(1, day.count / target)}`} />;
  return <i class={day.planned ? undefined : css.off} />;
}

/**
 * The routine. The heading is today's count; each habit is a row with the app's one box to check
 * in, its week as seven days, and its run. A habit opens in the sheet a task opens in.
 */
export function HabitsScreen({ focus, habits, onReminderSet }: { focus: Focus; habits: Habits; onReminderSet?: () => void }) {
  useTick(focus);
  const list = habits.list.value;
  const archived = habits.archived.value;
  const deleted = habits.deleted.value;
  const today = habits.today.value;
  const week = habits.week();
  const day = habits.day.value;

  const [open, setOpen] = useState<string | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [shelf, setShelf] = useState<'archived' | 'deleted' | null>(null);
  const [said, setSaid] = useSaid();
  const opened = list.find((habit) => habit.id === open);
  // The open habit went away, here or on another device: its sheet must not come back by itself.
  useEffect(() => {
    if (open && !opened) setOpen(null);
  }, [open, opened]);
  // The sheet hands the focus back to the row that opened it. When that row has gone, it goes to the heading.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open && (!document.activeElement || document.activeElement === document.body)) document.getElementById('habits-title')?.focus();
    wasOpen.current = !!open;
  }, [open]);

  // One tap is one check-in. On a day already done the box takes the latest one back.
  const check = (habit: HabitView) => {
    if (habit.today.done) {
      habits.undo(habit.id);
      return setSaid(null);
    }
    habits.checkIn(habit.id);
    setSaid({
      lead: s.habits.saidIn,
      title: habit.title,
      comma: habit.target > 1,
      tail: habit.target > 1 ? s.habits.saidCount(habit.today.count + 1, habit.target) : undefined,
      undo: () => habits.undo(habit.id),
      row: () => document.querySelector(`[data-habit="${CSS.escape(habit.id)}"]`),
    });
  };
  const archive = (habit: HabitView) => {
    habits.edit(habit.id, { archived: true });
    setSaid({ lead: s.habits.saidArchived, title: habit.title, undo: () => habits.edit(habit.id, { archived: false }) });
  };
  const remove = (habit: HabitView) => {
    habits.remove(habit.id);
    setSaid({ lead: s.today.saidRemoved, title: habit.title, tail: s.today.keeps, undo: () => habits.restore(habit.id) });
  };

  const moves = (habit: HabitView, at: number) => (
    <span class={css.moves}>
      <Button kind="link" aria-label={s.today.upLabel(habit.title)} disabled={at === 0} onClick={() => habits.move(habit.id, list[at - 1]!.id)}>
        {s.today.up}
      </Button>
      <Button kind="link" aria-label={s.today.downLabel(habit.title)} disabled={at === list.length - 1} onClick={() => habits.move(habit.id, list[at + 2]?.id ?? null)}>
        {s.today.down}
      </Button>
    </span>
  );

  const most = Math.max(week.now, week.before, 1);
  const shelved = shelf === 'archived' ? archived : deleted;

  return (
    <div class={css.habits}>
      <header class={css.head}>
        <p>{s.habits.label(day)}</p>
        <h1 id="habits-title" tabIndex={-1}>
          {s.habits.finding(today.done, today.planned, list.length > 0)}
        </h1>
      </header>

      <div class={css.cols}>
        <div class={css.now}>
          <QuickAdd name="habit" label={s.habits.add} hint={s.habits.addHint} onAdd={(text) => habits.add(text, 127, 1) !== null} />

          {list.length === 0 ? (
            <p class={css.quiet}>{s.habits.empty}</p>
          ) : (
            <section aria-label={ordering ? s.habits.ordering : s.habits.list}>
              <div class={css.rows}>
                {list.map((habit, at) => (
                  <div key={habit.id} class={cx(css.row, ordering && css.ordering)} data-habit={habit.id}>
                    <Check checked={habit.today.done} label={s.habits.check(habit.title)} onChange={() => check(habit)} />
                    {/* Everything of the row but its box and its count is one target: it opens the habit. */}
                    <button type="button" class={css.open} onClick={() => setOpen(habit.id)}>
                      <span class={css.words}>
                        <span class={css.title}>{habit.title}</span>
                        <span class={css.meta}>{[s.habits.plan(habit.days), run(habit)].filter(Boolean).join(', ')}</span>
                        {/* A habit done more than once a day says how far it has got. */}
                        {habit.target > 1 && (
                          <span class={css.count}>
                            <b>{habit.today.count}</b>
                            {s.habits.of(habit.target)}
                          </span>
                        )}
                      </span>
                      <span
                        class={css.week}
                        role="img"
                        aria-label={s.habits.weekLabel(habit.week.filter((d) => d.planned && d.done).length, habit.week.filter((d) => d.planned).length)}
                      >
                        {habit.week.map((d, i) => (
                          <span key={d.day} class={cx(d.day === habit.today.day && css.today)}>
                            {s.habits.days[i]}
                            {cell(d, habit.target)}
                          </span>
                        ))}
                      </span>
                    </button>
                    {ordering && <div class={css.end}>{moves(habit, at)}</div>}
                  </div>
                ))}
              </div>
            </section>
          )}

          <div class={links.links}>
            {list.length > 1 && (
              <Button kind="link" onClick={() => setOrdering(!ordering)}>
                {ordering ? s.today.orderKeep : s.today.order}
              </Button>
            )}
            {archived.length > 0 && (
              <Button kind="link" onClick={() => setShelf('archived')}>
                {s.habits.archived(archived.length)}
              </Button>
            )}
            {deleted.length > 0 && (
              <Button kind="link" onClick={() => setShelf('deleted')}>
                {s.today.bin(deleted.length)}
              </Button>
            )}
          </div>

          {said && <Said said={said} undo={s.today.undo} onDone={() => setSaid(null)} />}
        </div>

        <div class={css.then}>
          {list.length > 0 && (
            <Panel title={s.habits.week}>
              <Race
                you={{ label: s.habits.thisWeek, value: String(week.now), share: week.now / most }}
                ghost={{ label: s.habits.lastWeek, value: String(week.before), share: week.before / most }}
              />
              <p>{s.habits.weekLine(week.now, week.before, day)}</p>
            </Panel>
          )}
        </div>
      </div>

      {opened && (
        <HabitSheet
          habit={opened}
          habits={habits}
          run={run(opened)}
          onClose={() => setOpen(null)}
          onArchive={() => archive(opened)}
          onRemove={() => remove(opened)}
          onReminderSet={onReminderSet}
        />
      )}
      {shelf && (
        <Sheet title={shelf === 'archived' ? s.habits.archivedTitle : s.today.binTitle} close={s.task.close} onClose={() => setShelf(null)}>
          <p class={css.quiet}>{shelf === 'archived' ? s.habits.archivedNote : s.habits.binNote}</p>
          <div class={css.rows}>
            {shelved.map((habit) => (
              <div key={habit.id} class={cx(css.row, css.plain)}>
                <div class={css.words}>
                  <span class={css.title}>{habit.title}</span>
                  <span class={css.meta}>{[s.habits.plan(habit.days), habit.deleted === null ? '' : s.today.gone(habit.deleted)].filter(Boolean).join(', ')}</span>
                </div>
                <div class={css.end}>
                  <Button kind="link" onClick={() => (shelf === 'archived' ? habits.edit(habit.id, { archived: false }) : habits.restore(habit.id))}>
                    {shelf === 'archived' ? s.habits.bringBack : s.today.restore}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}
