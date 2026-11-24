# Pomodoist: a beautiful client on a heavy server 🗂️

> [!TIP]
> Pomodoist is an open-source (AGPL-3.0) Flutter app for tasks, Pomodoro and habits, with an
> animated 3D mascot called Pomo. Its client is polished and its feature list is long. Its
> self-hosted server is the full Supabase stack: Postgres, Auth, REST, Realtime, Edge Functions, a
> Kong gateway and the web app, which needs "4 GB RAM and 40 GB free disk as a practical
> minimum". We take its timer model, its achievement wit and its calm look. We leave its weight.

Read 2026-11-24 from its source at commit `0dbf40bd` (2026-11-20) and from pomodoist.com.

## 1. Facts to remember

| | |
|---|---|
| Licence | AGPL-3.0-only |
| Client | One Flutter app for macOS, iOS, Android, Windows, Linux and web; a Chrome extension and a Telegram mini app |
| UI text | 1,469 English strings, 10 languages on the site |
| Server | Supabase self-host: Postgres, GoTrue, PostgREST, Realtime, Edge Functions, Kong, web. "4 GB RAM and 40 GB free disk as a practical minimum" |
| Sync code | 4,746 lines of Dart in `data/services/sync/` alone |
| Price (hosted) | $4.99 a month, $29.99 a year, $89.99 lifetime (promotional), checked by them on 2026-07-26 |

## 2. Every feature, grouped

From the domain models (`apps/flutter/lib/domain/models/`) and the UI folders.

**Focus**
- A focus run has a target number of work intervals and links to a task or project.
- Each interval stores `plannedSeconds`, `startedAt`, `pausedAt`, `pausedTotalSeconds`,
  `completedAt` and `stoppedAt`. The timer is timestamps, never a ticking number.
- Presets: work, short break and long break length, intervals before a long break, auto-start
  breaks, auto-start work, allow pause, strict mode, a linked distraction profile.
- Daily stats: completed tasks, completed and interrupted intervals, planned intervals, focus time.
- Two view modes (full, minimal), two timer styles (bar, circle), three sound sets ("Soft
  kalimba", "Neon pulse", "Orbit bloom").
- Distraction blocking with profiles (desktop and extension).

**Pomo, the companion**
- An animated 3D mascot that floats on the desktop, follows focus sessions, rests on breaks and
  celebrates finished tasks. Quiet and reduced-motion modes.

**Tasks**
- Inbox, Today, Upcoming, projects with sections, sub-projects, colours and 12 icons, labels,
  subtasks, priorities, due dates and deadlines, durations, recurrence (every N days, weeks or
  months), task blocking (prerequisites), manual or automatic pomodoro estimates.
- Views: list, kanban, Eisenhower priority matrix, calendar (day, week, month), timeline.
- Quick add that parses dates, projects and tags as you type; voice capture with AI; CSV import.

**Habits**
- Schedules with weekdays, start and end dates, a target per day, and per-period targets (morning,
  afternoon, evening, night). Check-ins are their own rows. Reminders.

**Reports and achievements**
- Today and the last 7 days: completed tasks, focus intervals, focus time, per project and per task.
- Achievements in three groups (focus, task, combo) with tiers from 1 to 1,000,000. Each has a
  name with a wink: "First tomato", "Red belt", "Tomato singularity", "The list flinched", "Day
  not wasted" (a focus and a task in one day), "No fuss" (5 focuses in a day without stops).

**Collaboration**
- Shared projects with roles (administrator, member, observer), assignees, comments, public
  project links.

**Integrations**
- Google Calendar, Telegram bot, an MCP server for AI agents (OpenClaw), S3 file attachments,
  Stripe and App Store billing, Apple widgets, Watch app, global shortcuts.

## 3. How it syncs

- An outbox queue of local operations, pushed to the server and pulled back by revision.
- Tombstones for deletes, a per-field clock, and recovery code for conflicts.
- Realtime is only a hint: "Realtime hints only accelerate the next pull; persisted sync
  succeeded" (`account_sync_state.dart`).
- The server is Postgres with row-level security doing the authorisation.

## 4. What we take, what we leave

| Take | Why |
|---|---|
| Timer as timestamps (`startedAt`, `pausedTotalSeconds`, `plannedSeconds`) | It syncs without ticking; every product that syncs a timer does this |
| Interrupted intervals counted separately | Matches Cirillo: void, not failed |
| Achievements with names that have a sense of humour | Personality in the words, not in confetti |
| Check-ins as rows | Two devices checking in at once cannot lose one |
| A companion with quiet and reduced-motion modes | Character, with an off switch |
| Calm, uncluttered screens | What the user liked when they chose it |

| Leave | Why |
|---|---|
| The Supabase stack | 4 GB of RAM for one person's timer; our server must idle in tens of MB on a phone |
| Kanban, matrix, calendar, timeline, AI voice, Calendar, Telegram, MCP, files, billing | Each is good, none is what our user asked for. They are why the app feels big |
| Realtime that only hints | We want the timer itself to arrive live |
| Shared projects as the social model | Our user's model is studying side by side, not assigning work |
