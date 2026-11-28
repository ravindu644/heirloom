import { useEffect, useRef, useState } from 'preact/hooks';
import type { Focus } from '../../sync/focus.ts';
import type { HabitView, Habits } from '../../sync/habits.ts';
import { Button } from '../kit/button.tsx';
import { Check } from '../kit/check.tsx';
import links from '../kit/links.module.css';
import { cx } from '../kit/cx.ts';
import { Panel } from '../kit/panel.tsx';
import { QuickAdd } from '../kit/quick-add.tsx';
import { Race } from '../kit/race.tsx';
import { Fold, Kept } from '../kit/fold.tsx';
import { hasMoved, useLift } from '../kit/lift.ts';
import { Week } from '../kit/day-box.tsx';
import { say } from '../kit/said.tsx';
import { Twice } from '../kit/twice.tsx';
import said from '../kit/said.module.css';
import { Note } from '../kit/note.tsx';
import { Laps } from '../kit/laps.tsx';
import { Opens, Short, Shorts, isOpen, toggle } from '../kit/opens.tsx';
import { Sheet } from '../kit/sheet.tsx';
import * as s from '../strings.ts';
import { useTick } from '../tick.ts';
import { HabitSheet } from './habit-sheet.tsx';
import css from './habits.module.css';

/** Its run, or after a miss the days kept: never the miss itself. */
const run = (habit: HabitView) => (habit.missed ? s.habits.keptOf(habit.kept, habit.of) : s.habits.running(habit.streak, habit.target > 1));


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

  // A box is ticked and unticked where it stands, and says so itself: no bar, no Undo (the box is
  // the way back). A habit done once a day has one round; a counted one's times are ticked each on
  // its own, in any order, so the box tapped is the one that changes.
  const round = (habit: HabitView, r: number, ticked: boolean) => void (ticked ? habits.takeBack(habit.id, r) : habits.checkIn(habit.id, r));
  // How far a counted day has got, as a task's laps are drawn: beside the title where there is
  // room, at the end of the line under it on a phone.
  const count = (habit: HabitView, where: string | undefined) => (
    <span class={cx(css.count, where)} data-count>
      <Laps laps={habit.today.count} estimate={habit.target} of={s.habits.of(habit.target)} />
    </span>
  );
  // A press on the row opens the habit; a press on its count opens its times, as the arrow does.
  // Worked out here, not by a second button: the arrow is the one control a keyboard and a screen reader meet.
  const press = (habit: HabitView, event: MouseEvent) => {
    const onCount = [...(event.currentTarget as HTMLElement).parentElement!.querySelectorAll('[data-count]')].some((el) => {
      const box = el.getBoundingClientRect();
      return box.width > 0 && event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    });
    if (onCount) toggle(habit.id);
    else setOpen(habit.id);
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
                {list.map((habit) => {
                  const counted = habit.target > 1;
                  return (
                  <div key={habit.id} class={css.row} data-habit={habit.id} data-lift={habit.id}>
                    {/* The control column: a habit done once a day has its box; one done more often, the arrow to its times. */}
                    {counted ? (
                      <Opens id={habit.id} label={s.habits.rounds(habit.today.count, habit.target)} />
                    ) : (
                      <Check checked={habit.today.done} label={s.habits.check(habit.title)} onChange={() => round(habit, 1, habit.today.done)} />
                    )}
                    {/* Everything of the row but its controls opens the habit: this target is laid over the whole row, named by its words. */}
                    <button type="button" class={css.open} data-grip aria-labelledby={`h-${habit.id} hm-${habit.id}`} onClick={(event) => press(habit, event)} />
                    <span class={css.words}>
                      <span class={css.line}>
                        <span class={css.title} id={`h-${habit.id}`}>
                          {habit.title}
                        </span>
                        {counted && count(habit, css.beside)}
                      </span>
                      <span class={css.under}>
                        <span class={css.meta} id={`hm-${habit.id}`}>
                          {[s.habits.plan(habit.days), run(habit)].filter(Boolean).join(', ')}
                        </span>
                        {counted && count(habit, css.after)}
                      </span>
                    </span>
                    {counted && (
                      <Fold class={css.rounds}>
                        {isOpen(habit.id) && (
                          <Shorts key="rounds">
                            {habit.today.rounds.map((r) => {
                              const time = habit.reminds[r.round - 1];
                              return (
                                <Short key={r.round} checked={!!r.checkin} label={s.habits.roundCheck(habit.title, time, r.round)} onChange={() => round(habit, r.round, !!r.checkin)}>
                                  {time ? <span class={css.time}>{time}</span> : <span class={css.none}>{s.habits.nth(r.round)}</span>}
                                  {r.at !== null && <small class={css.at}>{s.habits.doneAt(r.at)}</small>}
                                </Short>
                              );
                            })}
                          </Shorts>
                        )}
                      </Fold>
                    )}
                    <span class={css.week}>
                      <Week
                        label={s.habits.weekLabel(habit.week.filter((d) => d.planned && d.done).length, habit.week.filter((d) => d.planned).length)}
                        days={habit.week.map((d, i) => ({ letter: s.habits.days[i]!, done: d.done, rest: d.rest, share: d.count / habit.target, off: !d.planned, today: d.day === habit.today.day }))}
                      />
                    </span>
                  </div>
                  );
                })}
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
          <Note>{shelf === 'archived' ? s.habits.archivedNote : s.habits.binNote}</Note>
          <Fold gap="sm" class={css.shelf}>
            {shelved.map((habit) => (
              <div key={habit.id} class={cx(css.row, css.plain, css.shelved)}>
                <div class={css.words}>
                  <span class={css.title}>{habit.title}</span>
                  <span class={css.meta}>{[s.habits.plan(habit.days), habit.deleted === null ? '' : s.today.gone(habit.deleted)].filter(Boolean).join(', ')}</span>
                </div>
                <div class={cx(css.end, links.links)} data-links>
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
