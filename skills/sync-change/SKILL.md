---
name: sync-change
description: How to add or change a synced dataset or field in heirloom without breaking offline devices or losing data. Load before touching contracts/, client/src/core, server/sync, or anything that writes cells.
---

# Changing what syncs

A device can be offline for weeks and come back running last month's build. Every change to what
syncs has to survive that.

## The order, always
1. **Contract first.** The lead edits `contracts/protocol.md`, the dataset's schema and the fixtures.
   A new field gets a fixture row showing two concurrent writes and the winner.
2. **Core.** `client/src/core/` reads and writes the field through the merge function. Fixtures pass.
3. **Server.** `server/sync/` stores it as an ordinary cell. It needs no code unless the server must
   read the field (rooms, presence, push). Fixtures pass in Go.
4. **UI** reads it through the core's signals.
5. **e2e:** two devices change it at once, online and offline; both end equal; nothing lost.

## Rules
- **Add, never rename or repurpose.** An old client still writes the old field. A new meaning gets a
  new field name; the old one is read for a release, then ignored.
- **Unknown datasets and fields pass through.** A client keeps and forwards cells it does not
  understand, so a newer device's data survives an older one.
- **Created-once things are rows, not counters.** A pomodoro, a check-in, a cheer: one row each with
  its own id. Never read-modify-write a number across devices; two offline +1s become +1.
- **Things that must change together are one field.** The timer state is one JSON cell so it can
  never be half paused. Ask: could these fields be torn by two devices writing half each?
- **Deletes are a field** (`deleted`), restorable for 30 days.
- **Order is a fractional index** in one field; ties break by row id.
- **Stamps come from `core/hlc.ts` only.** Never `Date.now()` as a stamp; server-corrected time goes
  through the clock.
- **Test the offline case for every new field:** device A and B offline, both write, reconnect in
  both orders, assert the same result and that no completed work vanished.

## Things that went wrong elsewhere (from docs/research/sync.md)
- Wall-clock LWW let a device with a fast clock silently win for days (Jepsen, 2013).
- Actual Budget's history grew until a "reset sync" threw away other devices' unsynced changes. We
  keep only the newest cell per field, so there is nothing to reset.
- Toggl and Clockify lose unsynced entries on logout. Logging out here first flushes the outbox, and
  refuses (with a reason) while offline with unsent work.
