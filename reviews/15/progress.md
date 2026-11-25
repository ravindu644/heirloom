# Section 15: Progress

Pass 2026-11-26. `node tools/design-audit.mjs`: 203 states, 0 violations.

Opened at full size: `progress-earlier-phone-light`. Not opened: `progress-day` in any size or theme (the folded state itself), `progress-earlier` dark and laptop.

| Rule | Verdict |
|---|---|
| A day's timeline: over the five latest one link that says how many more, and open it says "Show the latest 5" | PASS for the open state. The folded state was not opened. |
| "Don't count it", "Count it again", "Lap, not counted" | PASS. |

No FAIL in what was opened.

## Question 9

Judged from the open state only. The link is the first thing over the rows, at the list's left edge, and its words are about the list, so it is found and it is the list's. It stands 16px under the lane's hours and 27px over the first row, nearer the axis than the rows; put it `sm` over the first row and nobody will read it as the lane's.
