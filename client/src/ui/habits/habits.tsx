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
import { Fold, Kept } from '../kit/fold.tsx';
import { hasMoved, useLift } from '../kit/lift.ts';
import { say } from '../kit/said.tsx';
import { Twice } from '../kit/twice.tsx';
import said from '../kit/said.module.css';
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
export function HabitsScreen({ focus, habits, onReminderSet, app }: { focus: Focus; habits: Habits; onReminderSet?: () => void; app?: boolean }) {
  useTick(focus);
  const list = habits.list.value;
  const archived = habits.archived.value;
  const deleted = habits.deleted.value;
  const today = habits.today.value;
  const week = habits.week();
  const day = habits.day.value;

  const [open, setOpen] = useState<string | null>(null);
  const [shelf, setShelf] = useState<'archived' | 'deleted' | null>(null);
  const opened = list.find((habit) => habit.id === open);
  // The open habit went away, here or on another device: its sheet must not come back by itself.
  useEffect(() => {
    if (open && !opened) setOpen(null);
  }, [open, opened]);
  // The sheet hands the focus back to the row that opened it. When that row has gone, it goes to the heading.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open && (!document.activeElement || document.activeElement === document.body)) document.getElementById('habits-title')?.focus({ preventScroll: true });
    wasOpen.current = !!open;
  }, [open]);

  // One tap is one check-in. On a day already done the box takes the latest one back.
  const check = (habit: HabitView) => {
    if (habit.today.done) {
      habits.undo(habit.id);
      return say(null);
    }
    habits.checkIn(habit.id);
    say({
      lead: s.habits.saidIn,
      title: habit.title,
      comma: habit.target > 1,
      tail: habit.target > 1 ? s.habits.saidCount(habit.today.count + 1, habit.target) : undefined,
      undo: () => habits.undo(habit.id),
    });
  };
  const archive = (habit: HabitView) => {
    habits.edit(habit.id, { archived: true });
    say({ lead: s.habits.saidArchived, title: habit.title, undo: () => habits.edit(habit.id, { archived: false }) });
  };
  const remove = (habit: HabitView) => {
    habits.remove(habit.id);
    say({ lead: s.today.saidRemoved, title: habit.title, tail: s.today.keeps, undo: () => habits.restore(habit.id) });
  };

  // A habit is put in order by pressing and holding its row.
  const lists = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState('');
  useLift(lists, (id, before, at, of) => {
    habits.move(id, before);
    setPlaced(s.today.nowAt(list.find((habit) => habit.id === id)?.title ?? '', at, of));
  });

  // A shelf closes with its last row: there is nothing left on it to look at.
  const shelved = shelf === 'archived' ? archived : deleted;
  useEffect(() => {
    if (shelf && shelved.length === 0) setShelf(null);
  }, [shelf, shelved.length]);

  const most = Math.max(week.now, week.before, 1);
  // Said on the bar, as a task added is.
  const add = (text: string) => {
    if (habits.add(text, 127, 1) === null) return false;
    say({ lead: s.today.saidAdded, title: text.trim() });
    return true;
  };

  return (
    <div class={cx(css.habits, said.room)}>
      <header class={css.head}>
        <p>{s.habits.label(day)}</p>
        <h1 id="habits-title" tabIndex={-1}>
          {s.habits.finding(today.done, today.planned, list.length > 0)}
        </h1>
        <p class="sr" role="status">
          {placed}
        </p>
      </header>

      <div class={css.cols} ref={lists}>
        <Fold gap="md" data-said>
          <QuickAdd key="add" name="habit" label={s.habits.add} hint={s.habits.addHint} example={s.habits.addExample} go={s.today.addGo} said onAdd={add} />

          {list.length === 0 ? (
            <p key="empty" class={css.quiet}>
              {s.habits.empty}
            </p>
          ) : (
            <section key="list" aria-label={s.habits.list}>
              <Fold gap="sm">
                {list.map((habit) => (
                  <div key={habit.id} class={css.row} data-habit={habit.id} data-lift={habit.id}>
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
                  </div>
                ))}
              </Fold>
            </section>
          )}

          {list.length > 1 && !hasMoved.value && (
            <p key="hint" class={css.hint}>
              {s.habits.holdHint}
            </p>
          )}
          {(archived.length > 0 || deleted.length > 0) && (
          <div key="links" class={links.links}>
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
          )}
        </Fold>

        <Fold>
          {list.length > 0 && (
            <Panel key="week" title={s.habits.week}>
              <Race
                you={{ label: s.habits.thisWeek, value: String(week.now), share: week.now / most }}
                ghost={{ label: s.habits.lastWeek, value: String(week.before), share: week.before / most }}
              />
              <p>{s.habits.weekLine(week.now, week.before, day)}</p>
            </Panel>
          )}
        </Fold>
      </div>

      <Kept>
      {opened && (
        <HabitSheet
          habit={opened}
          habits={habits}
          run={run(opened)}
          onClose={() => setOpen(null)}
          onArchive={() => archive(opened)}
          onRemove={() => remove(opened)}
          onReminderSet={onReminderSet}
          app={app}
        />
      )}
      {shelf && (
        <Sheet key="shelf" title={shelf === 'archived' ? s.habits.archivedTitle : s.today.binTitle} close={s.task.close} onClose={() => setShelf(null)}>
          <p class={css.quiet}>{shelf === 'archived' ? s.habits.archivedNote : s.habits.binNote}</p>
          <Fold gap="sm">
            {shelved.map((habit) => (
              <div key={habit.id} class={cx(css.row, css.plain, shelf === 'deleted' && css.shelved)}>
                <div class={css.words}>
                  <span class={css.title}>{habit.title}</span>
                  <span class={css.meta}>{[s.habits.plan(habit.days), habit.deleted === null ? '' : s.today.gone(habit.deleted)].filter(Boolean).join(', ')}</span>
                </div>
                <div class={cx(css.end, links.links)}>
                  <Button kind="link" onClick={() => (shelf === 'archived' ? habits.edit(habit.id, { archived: false }) : habits.restore(habit.id))}>
                    {s.today.restore}
                  </Button>
                  {/* It cannot be taken back, so it asks twice. */}
                  {shelf === 'deleted' && <Twice words={s.today.purge} ask={s.today.purgeAsk} onDo={() => habits.purge(habit.id)} />}
                </div>
              </div>
            ))}
          </Fold>
        </Sheet>
      )}
      </Kept>
    </div>
  );
}
