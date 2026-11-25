# Section 13: Habits

Pass 2026-11-25. `node tools/design-audit.mjs`: 182 states, 0 violations. Opened at full size at 412: the pictures named below, in the theme named. Laptop: only `today-laps-17-laptop-light` and `focus-task-laptop-dark`, cropped. The 471 set was not opened; the rest of the laptop set rests on the audit.
Opened: `habits-adding` phone light (top), `habits-sheet-thrice`, `habits-sheet-20`, `habits-sheet-20-set` phone light, `habits-sheet-20-set` phone dark (the fields), `keyboard-2-reminder` light. Not opened: `habits`, `habits-sheet-twice`, `keyboard-1-habit-*`, any laptop picture.

| Rule | Verdict |
|---|---|
| A hint is an example | PASS. "Add a habit", and in use "It starts as once a day, every day. Open it to change that." |
| What is done more than once shows how far it has got and the way to take one back | PASS. "3 of 20 today." with "Take one back". |
| A reminder for each time in the day | PASS. Fields "1st reminder" to "20th reminder", two to a line; unset, only the set ones and one empty show. |
| A field being typed in never touches the keyboard | PASS. `keyboard-2-reminder`. |
| A sheet says there is no Save, and what each way out keeps | PASS. |

No FAIL.

## Question 4

Yes, it is still one sheet. Twenty times a day is the person's own extreme, the fields are numbered and two to a line, and the sheet shows twenty only when twenty are set. What it costs is 850px before "Since the first check-in"; that is fair for someone who asked for twenty bells.
