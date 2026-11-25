# Section 15: Focus

Pass 2026-11-26. `node tools/design-audit.mjs`: 203 states, 0 violations.

Opened at full size, 412, light: the top 230px of `focus-task`, `focus-no-target`, `focus-no-target-running`, `focus-target-reached`, `focus-target-passed`, `focus-yesterday`, `running-task`, `paused`, `break`, `break-over`, `long-break`, `long-break-paused`, `set-done`, `lap-ahead`, `done-for-now`, `stopped-elsewhere`; the top 520px of `focus-360-running`, `focus-100-running`, `focus-99-running`; `focus-360-running` dark (top). Zoom: `focus-360-running` light and dark, `focus-100-running`, `focus-99-running` light. Laptop: `focus-360-running-laptop-light`, cropped. Not opened: `focus-360`, `focus-360-top`, `focus-99`, the dark twins of the sixteen tops, the lower half of any Focus picture, every `wide` picture.

| Rule | Verdict |
|---|---|
| A count the person did not set is not shown: no set, no fifth mark, "Lap 6 of 8 today" and its state | PASS in all sixteen. |
| Past the target "Lap 6 today, 5 planned"; with no target no bar, only "Lap 6 today" | PASS. `focus-target-passed`, `focus-no-target`. |
| At the line's right end "5 min break after" or "15 min break after"; in a break "lap 7 today next" | PASS. |
| A lap runs up to 360 minutes: hours from 100, seven characters at two thirds, one line inside the column | PASS at 412, at 200% and on the laptop. |
| What stands under the digits does not move when a long lap comes under 100 | PASS. The line under is at y=354 at 5:59:59, 1:40:00 and 99:59. |

No FAIL.

Two things seen, neither a FAIL:
- At 200% the line under the long clock wraps ("of 6:00:00, ends at" / "22:40") and its second line is under the fold; under the short clock the same words stay on one line. Measured: the line is 166px wide in the first case and runs to 174 in the second.
- The long clock keeps the short one's baseline, so 98px stand between the task's title and 5:59:59 where 54 stand over 99:59.

## Questions 5, 6 and 7

5. **It reads as intended.** With no target the line "Lap 6 today, next" stands alone and the task's lines move up into the bar's place, so no gap is left to ask about.
6. **Yes, and no.** "5 min break after" needs no set to be understood: after this lap, five minutes. "15 min break after" is explained when it matters by "Four laps in a row!". It does not compete: the count at the left starts in ink and bold, the right end is plain and grey.
7. **Focus keeps its presence.** 5:59:59 is still the largest thing on the screen, about 305 of 372px wide. The step to 99:59 happens once in a long lap, between two seconds, and nothing under it moves; that is a clock rolling over, and acceptable. The cost is the taller gap above the long digits noted above.
