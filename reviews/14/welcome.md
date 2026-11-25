# Section 14: the welcome

Pass 2026-11-26. `node tools/design-audit.mjs`: 203 states, 0 violations.

Opened at full size: `welcome-phone` light and dark, `signed-out-phone-light`, `signed-out-laptop-light`, `welcome-short` light (both parts), `welcome-zoom-light` (all three parts), `welcome-motion-0` to `-8` light (the lane only), `welcome-motion-8-dark`. Not opened: `welcome-server` in any size, `welcome-laptop`, every `wide` picture, the dark laptop, short and zoom pictures, and the `habits-*` pictures in this folder.

| Rule (DESIGN.md, The welcome) | Verdict |
|---|---|
| The mark and name, the headline, one sentence, one drawing: a day as a race, two lanes on one scale | PASS. Your laps and last week's stand at the same x; last week is a lap shorter; the chip says +25m. |
| Its key on one line that may wrap to two, four marks | PASS. Two lines at 412. |
| Two small drawings side by side, each with one line under it | PASS by the rule; see question 2. |
| Drawn from the kit's own pieces, dark the same drawing | PASS. |
| It moves once: laps fill in turn, the chip last | PASS. Frames 0 to 8. |
| Beside the form from 720px, under it below | PASS. The headline breaks at its sentence in both places now. |
| Layout: "The primary action sits in the lower half, in reach of a thumb." | FAIL at 412x760. |

## FAIL

1. **On a short phone the only button is under the fold.** `welcome-short-light`: at 412x760 the first screen ends inside the two small drawings, and "Connect to a server" is reached by scrolling. DESIGN.md, Layout: "The primary action sits in the lower half, in reach of a thumb." Fix: the last line and its button keep the foot of the screen, as Focus's action row does, and the drawings scroll above them.

## The four questions

1. **No, it could not be another app's.** Two lanes of laps with last week's drawn hollow under them is this product and nothing else, and the headline says the same thing in words. The weakest thing on it is the first half of the sentence, "A focus timer that keeps your tasks and habits", which any such app could print; the second half earns the line. After that, the pair of small drawings.
2. **Yes, the pair reads unfinished.** The week is about 45px tall and the room about 130, so the left column ends 85px before the right and leaves a hole beside the third friend. One change: draw three habits' weeks, one under the other, as Habits lists them. Same pieces, same caption, and the two drawings end on one line.
3. **It reads as a race, not a progress bar.** Two lanes 48px tall, made of separate blocks with breaks between them, and the second lane hollow: a bar has neither parts nor a rival. The key reads as its caption: it is in the label size, directly under, and its marks are the drawing's own.
4. **It sits beside the form, and it is the louder of the two.** Position gives the form the first look (left, top, both headings on y=46); colour gives the welcome the second and longer one, eleven red blocks against one red button. For the one screen whose job is to say what this is, that is the right way round. It would be wrong only if the welcome stood left of the form.
