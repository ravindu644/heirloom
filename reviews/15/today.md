# Section 15: Today

Pass 2026-11-26. `node tools/design-audit.mjs`: 203 states, 0 violations.

Opened at full size: `today-upcoming`, `today-moved`, `today-one-ahead` phone light, `today-ahead` phone dark, `today-upcoming-laptop-light`, the strip of `today-360` phone light. Not opened: `today`, `today-one`, `today-lap-over`, the other dark and `wide` pictures.

| Rule | Verdict |
|---|---|
| Putting rows in order: a row carried up out of Upcoming is for today, and the bar says so with Undo | PASS. `today-moved`: "Moved to today." and Undo. |
| Task row: the count at the right edge with its squares, never parted by a control | PASS. In the Next row both stand under Start now. |
| Consistency: "if two things do the same job they look the same" | FAIL, small, below. |
| A count says of what | PASS. "5 of 8 laps today". |

## FAIL

1. **In Later today the squares and count take a third line while the project's line stands half empty.** `today-upcoming-phone-light`: "Exercise 5-3" is 88px tall with "0 of 2" alone on a line under "C"; the Next row puts the same pair on the project's line, and the row beside it, with squares at the side, is 64px. DESIGN.md, Consistency: "if two things do the same job they look the same". Fix: when the squares leave the title's line they take the right end of the project's line, as in the Next row, and a new line only when that line is full.

## Question 8

Balanced enough: the plan is at the left, the record at the right, and an empty right column early in the day is honest. One thing is off: "Done" starts at y=287, level with the Add field, and its first card at 304, while "Next" starts at 351 and its card at 369. Start "Done" level with "Next" and the two lists read as a pair.
