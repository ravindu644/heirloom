package rooms

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"heirloom/server/store"
	"heirloom/server/sync"
)

// The contract's cases for section 7, the same file the TypeScript core runs. A member's
// today_ms and today_laps are exactly one day of this.
func TestFixtureStats(t *testing.T) {
	data, err := os.ReadFile("../../contracts/fixtures/stats.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Cases []struct {
			Name      string
			UTCOffset int `json:"utc_offset_min"`
			Sessions  []Session
			Expect    struct {
				Days     map[string]Day
				Overlaps [][2]string
			}
		}
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	if len(fixture.Cases) == 0 {
		t.Fatal("stats.json has no cases: the fixture moved or changed shape")
	}
	for _, c := range fixture.Cases {
		days, overlaps := Stats(c.Sessions, c.UTCOffset)
		if !reflect.DeepEqual(days, c.Expect.Days) {
			t.Errorf("%s: days = %v, want %v", c.Name, days, c.Expect.Days)
		}
		if !reflect.DeepEqual(overlaps, c.Expect.Overlaps) {
			t.Errorf("%s: overlaps = %v, want %v", c.Name, overlaps, c.Expect.Overlaps)
		}
		// The order sessions arrive in is not the order they ran in.
		backwards := make([]Session, len(c.Sessions))
		for i, s := range c.Sessions {
			backwards[len(backwards)-1-i] = s
		}
		if again, pairs := Stats(backwards, c.UTCOffset); !reflect.DeepEqual(again, days) || !reflect.DeepEqual(pairs, overlaps) {
			t.Errorf("%s: a different order of sessions gave a different answer", c.Name)
		}
	}
}

// A lap ends at its bell or when the person stops it, and either way it is a lap: a
// stopped one is a lap that ended early, however early. Only one set aside is not.
func TestStoppedLapIsALap(t *testing.T) {
	const start = 1_795_581_000_000
	sessions := []Session{
		{ID: "rang", Kind: "work", Started: start, Ended: start + 1_500_000, Outcome: "rang", Device: "a"},
		{ID: "stopped", Kind: "work", Started: start + 2_000_000, Ended: start + 2_600_000, Outcome: "stopped", Device: "a"},
		// Twenty seconds: far under the minute a break must run to leave a row. A lap always leaves one.
		{ID: "stopped at once", Kind: "work", Started: start + 3_000_000, Ended: start + 3_020_000, Outcome: "stopped", Device: "a"},
		{ID: "paused, then stopped", Kind: "work", Started: start + 4_000_000, Ended: start + 4_090_000, PausedMs: 60_000, Outcome: "stopped", Device: "a"},
		{ID: "set aside", Kind: "work", Started: start + 5_000_000, Ended: start + 6_500_000, Outcome: "void", Device: "a"},
		{ID: "a break that rang", Kind: "short", Started: start + 7_000_000, Ended: start + 7_300_000, Outcome: "rang", Device: "a"},
		{ID: "a break stopped", Kind: "long", Started: start + 8_000_000, Ended: start + 8_100_000, Outcome: "stopped", Device: "a"},
	}
	days, _ := Stats(sessions, 0)
	day := days[localDay(start, 0)]
	if len(days) != 1 || day.Laps != 4 {
		t.Errorf("laps = %d over %d days, want 4: the one that rang and the three that were stopped", day.Laps, len(days))
	}
	if want := int64(1_500_000 + 600_000 + 20_000 + 30_000); day.FocusMs != want {
		t.Errorf("focus = %d ms, want %d: the minutes are counted as they always were", day.FocusMs, want)
	}
	// A day of nothing but stopped laps is a day with laps.
	only, _ := Stats(sessions[1:3], 0)
	if got := only[localDay(start, 0)].Laps; got != 2 {
		t.Errorf("two stopped laps and no bell: %d laps, want 2", got)
	}
}

func TestWatchReadsATimerAtAMoment(t *testing.T) {
	const started = 1_795_581_000_000
	const lap = 25 * 60 * 1000
	state := func(phase string, pausedAt any, pausedMs int) json.RawMessage {
		b, _ := json.Marshal(map[string]any{"phase": phase, "run": "r1", "task": "t1", "started": started,
			"paused_at": pausedAt, "paused_ms": pausedMs, "planned_ms": lap, "set_index": 2})
		return b
	}
	for name, c := range map[string]struct {
		state  json.RawMessage
		now    int64
		phase  string
		endsAt int64 // 0 for null
		paused bool
	}{
		"a lap running":                {state("work", nil, 0), started + 1, "work", started + lap, false},
		"the last millisecond of it":   {state("work", nil, 0), started + lap - 1, "work", started + lap, false},
		"the bell has gone":            {state("work", nil, 0), started + lap, "idle", 0, false},
		"long after the bell":          {state("work", nil, 0), started + 9*lap, "idle", 0, false},
		"paused: no end, and no bell":  {state("work", started+60000, 0), started + 9*lap, "work", 0, true},
		"resumed: the end moved by it": {state("work", nil, 90000), started + lap, "work", started + lap + 90000, false},
		"a short break":                {state("short", nil, 0), started + 1, "short", started + lap, false},
		"nobody has written a timer":   {nil, started, "idle", 0, false},
		"a state that is idle":         {json.RawMessage(`{"phase":"idle","run":null,"task":null,"started":null,"paused_at":null,"paused_ms":0,"planned_ms":0,"set_index":2}`), started, "idle", 0, false},
		"a phase from a newer build":   {state("nap", nil, 0), started + 1, "idle", 0, false},
		"a cell that is not a state":   {json.RawMessage(`"work"`), started, "idle", 0, false},
	} {
		p := watch(c.state, c.now)
		ends := int64(0)
		if p.endsAt != nil {
			ends = *p.endsAt
		}
		if p.phase != c.phase || ends != c.endsAt || p.paused != c.paused {
			t.Errorf("%s: %s, ends %d, paused %v; want %s, ends %d, paused %v", name, p.phase, ends, p.paused, c.phase, c.endsAt, c.paused)
		}
		if p.phase == "idle" && p.task != nil {
			t.Errorf("%s: an idle timer still names a task", name)
		}
	}
}

// What follows proves the cost. A room message is built for every device on every
// change, on a phone, so it must not read a member's history: not on a timer push at
// all, and after a session push only the week.

type world struct {
	*Service
	cells *sync.Store
	db    *sql.DB
	now   time.Time
	stamp int
}

// Wednesday 2026-11-25, 10:00 in Colombo. Monday of that week is the 23rd.
var wednesday = time.Date(2026, 11, 25, 4, 30, 0, 0, time.UTC)

func newWorld(t *testing.T) *world {
	t.Helper()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	w := &world{db: db, now: wednesday}
	clock := func() time.Time { return w.now }
	w.cells = sync.New(db, clock)
	w.Service = New(db, w.cells, clock)
	return w
}

func (w *world) account(t *testing.T, name string, offsetMin int) int64 {
	t.Helper()
	res, err := w.db.Exec("insert into account (public_id, username, password, created, utc_offset_min) values (?, ?, '', 0, ?)", "id-"+name, name, offsetMin)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	return id
}

func (w *world) push(t *testing.T, account int64, fields map[[3]string]any) {
	t.Helper()
	var cells []json.RawMessage
	for key, value := range fields {
		w.stamp++
		at := time.Date(2026, 11, 20, 0, 0, 0, 0, time.UTC).Add(time.Duration(w.stamp) * time.Millisecond)
		cell, _ := json.Marshal(map[string]any{"stamp": at.Format("2006-01-02T15:04:05.000Z") + "-0000-a1b2c3d4e5f60718",
			"dataset": key[0], "row": key[1], "field": key[2], "value": value})
		cells = append(cells, cell)
	}
	for len(cells) > 0 {
		n := min(len(cells), sync.MaxCells)
		pushed, err := w.cells.Push(account, cells[:n])
		if err != nil {
			t.Fatal(err)
		}
		w.Pushed(account, pushed.Won)
		cells = cells[n:]
	}
}

// lap is a 25 minute lap that rang, as the cells a device writes for it.
func lap(fields map[[3]string]any, run string, started time.Time) {
	for field, value := range map[string]any{
		"kind": "work", "task": nil, "started": started.UnixMilli(), "ended": started.Add(25 * time.Minute).UnixMilli(),
		"planned_ms": 25 * 60 * 1000, "paused_ms": 0, "outcome": "rang", "device": "a1b2c3d4e5f60718", "note": "what I did",
	} {
		fields[[3]string{"session", run, field}] = value
	}
}

func (w *world) message(t *testing.T, room, viewer int64) *Message {
	t.Helper()
	m, _, err := w.Message(room, viewer)
	if err != nil || m == nil {
		t.Fatalf("message = %v, %v", m, err)
	}
	return m
}

func TestTotalsReadTheWeekNotTheYears(t *testing.T) {
	w := newWorld(t)
	ravi, sachi := w.account(t, "ravi", 330), w.account(t, "sachi", 330)
	_, room, err := w.Create(ravi, "Sachi and me")
	if err != nil {
		t.Fatal(err)
	}
	code := w.message(t, room, ravi).Code
	if _, _, err := w.Join(sachi, code); err != nil {
		t.Fatal(err)
	}

	// Three years of ten laps a day for Ravi: 10950 sessions, 98550 cells.
	history := map[[3]string]any{}
	for day := range 3 * 365 {
		for n := range 10 {
			started := wednesday.AddDate(0, 0, -day-1).Add(time.Duration(n) * 30 * time.Minute)
			lap(history, fmt.Sprintf("old-%d-%d", day, n), started)
		}
	}
	w.push(t, ravi, history)
	// And this week: Monday, Tuesday, and two this morning.
	week := map[[3]string]any{}
	lap(week, "mon", time.Date(2026, 11, 23, 12, 0, 0, 0, time.UTC))
	lap(week, "tue", time.Date(2026, 11, 24, 12, 0, 0, 0, time.UTC))
	lap(week, "wed-1", time.Date(2026, 11, 25, 3, 0, 0, 0, time.UTC))
	lap(week, "wed-2", time.Date(2026, 11, 25, 3, 30, 0, 0, time.UTC))
	w.push(t, ravi, week)

	// The history above reaches back from Tuesday, so the week holds its Monday and
	// Tuesday laps too: 10 each in the morning, plus the four named ones, none overlapping.
	const lapMs = 25 * 60 * 1000
	m := w.message(t, room, sachi)
	got := m.Members[0]
	if got.Name != "ravi" || got.TodayMs != 2*lapMs || got.TodayLaps != 2 || got.WeekMs != (2+11+11)*lapMs {
		t.Fatalf("ravi = today %d ms %d laps, week %d ms; want %d, 2, %d", got.TodayMs, got.TodayLaps, got.WeekMs, 2*lapMs, 24*lapMs)
	}
	if got.Last == nil || got.Last.Run != "wed-2" {
		t.Errorf("last = %+v, want this morning's second lap", got.Last)
	}

	// 1. The week is found through the index on started, not by walking every session.
	rows, err := w.db.Query(`explain query plan select f.row_id, f.field, f.value
		from cell s indexed by cell_session_started
		join cell f on f.account = s.account and f.dataset = 'session' and f.row_id = s.row_id
			and f.field in ('kind', 'started', 'ended', 'paused_ms', 'outcome')
		where s.account = ? and s.dataset = 'session' and s.field = 'started'
			and cast(s.value as integer) >= ? and cast(s.value as integer) < ?`, ravi, 0, 1)
	if err != nil {
		t.Fatal(err)
	}
	var plan []string
	for rows.Next() {
		var id, parent, unused int
		var detail string
		if err := rows.Scan(&id, &parent, &unused, &detail); err != nil {
			t.Fatal(err)
		}
		plan = append(plan, detail)
	}
	rows.Close()
	if joined := strings.Join(plan, "; "); !strings.Contains(joined, "INDEX cell_session_started (account=? AND <expr>>? AND <expr><?)") || strings.Contains(joined, "SCAN") {
		t.Errorf("the plan walks more than the week: %s", joined)
	}
	// And what it returns is the week: 24 sessions of 10954, five fields each.
	monday := time.Date(2026, 11, 22, 18, 30, 0, 0, time.UTC).UnixMilli()
	found, err := w.cells.Sessions(ravi, monday, monday+7*dayMs)
	if err != nil || len(found) != 24 {
		t.Errorf("the week's read returned %d sessions, %v; want 24", len(found), err)
	}
	for id, fields := range found {
		if _, task := fields["task"]; task || len(fields) != 5 {
			t.Fatalf("session %s was read as %d fields: only the five that are counted may be", id, len(fields))
		}
	}

	// 2. Building the message again reads no sessions at all, however often, and neither
	// does a push that is not a session.
	before := w.counts
	for i := range 200 {
		w.push(t, ravi, map[[3]string]any{{"timer", "current", "state"}: map[string]any{"phase": "work", "run": fmt.Sprint("r", i), "task": nil,
			"started": w.now.UnixMilli(), "paused_at": nil, "paused_ms": 0, "planned_ms": lapMs, "set_index": 0}})
		w.push(t, ravi, map[[3]string]any{{"task", "t1", "title"}: fmt.Sprint("draft ", i), {"session", "wed-1", "note"}: "a note is not counted"})
		w.message(t, room, sachi)
		w.message(t, room, ravi)
	}
	if w.counts != before {
		t.Errorf("400 messages after 400 pushes read a week of sessions %d more times, want 0", w.counts-before)
	}

	// 3. A session push makes the next message count that member again, once, and only them.
	more := map[[3]string]any{}
	lap(more, "wed-3", time.Date(2026, 11, 25, 4, 0, 0, 0, time.UTC))
	w.push(t, ravi, more)
	for range 10 {
		m = w.message(t, room, sachi)
	}
	if w.counts != before+1 {
		t.Errorf("a lap pushed by one member cost %d reads over ten messages, want 1", w.counts-before)
	}
	if got := m.Members[0]; got.TodayMs != 3*lapMs || got.TodayLaps != 3 || got.Last.Run != "wed-3" {
		t.Errorf("after the third lap: today %d ms, %d laps, last %s", got.TodayMs, got.TodayLaps, got.Last.Run)
	}

	// 4. When the day turns, yesterday's count is not served as today's.
	w.now = time.Date(2026, 11, 25, 18, 30, 0, 0, time.UTC) // midnight in Colombo
	if got := w.message(t, room, sachi).Members[0]; got.TodayMs != 0 || got.TodayLaps != 0 || got.Last != nil || got.WeekMs != 25*lapMs {
		t.Errorf("at midnight: today %d ms, %d laps, last %v, week %d; want an empty day in the same week", got.TodayMs, got.TodayLaps, got.Last, got.WeekMs)
	}

	// The measurements the report quotes: one message for this room with the counts
	// already made, and one that has to count ravi's week again first.
	const n = 200
	start := time.Now()
	for range n {
		w.message(t, room, sachi)
	}
	warm := time.Since(start) / n
	start = time.Now()
	for range n {
		w.Pushed(ravi, []sync.Cell{{Dataset: "session", Row: "wed-1", Field: "ended"}})
		w.message(t, room, sachi)
	}
	t.Logf("a room message with 10958 sessions behind one member: %v, and %v when his week of 25 is counted again", warm, time.Since(start)/n)
}

// The list of what the server may read is short, and asking for more is an error, not a leak.
func TestOnlyTheListedFieldsAreRead(t *testing.T) {
	w := newWorld(t)
	ravi := w.account(t, "ravi", 0)
	w.push(t, ravi, map[[3]string]any{{"task", "t1", "notes"}: "private", {"task", "t1", "title"}: "Thesis", {"settings", "current", "sound"}: "bell"})
	for _, field := range [][3]string{{"task", "t1", "notes"}, {"settings", "current", "sound"}, {"session", "r1", "note"}, {"session", "r1", "task"}, {"habit", "h1", "title"}, {"day", "2026-11-25", "note"}} {
		if v, err := w.cells.Value(ravi, field[0], field[1], field[2]); err == nil || v != nil {
			t.Errorf("the server read %s.%s: %s", field[0], field[2], v)
		}
	}
	if v, err := w.cells.Value(ravi, "task", "t1", "title"); err != nil || string(v) != `"Thesis"` {
		t.Errorf("a title, which a member may share: %s, %v", v, err)
	}
}

// run is the lap in progress, which the totals leave out, read at server_time by the
// member's own day and week. Colombo is 330 minutes east: its Wednesday began at 18:30
// UTC on the Tuesday, and its week at 18:30 UTC on Sunday the 22nd.
func TestRunIsTheLapInProgress(t *testing.T) {
	w := newWorld(t)
	ravi, sachi := w.account(t, "ravi", 330), w.account(t, "sachi", 330)
	_, room, err := w.Create(ravi, "Sachi and me")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := w.Join(sachi, w.message(t, room, ravi).Code); err != nil {
		t.Fatal(err)
	}
	const lapMs = 25 * 60 * 1000
	timer := func(phase string, started time.Time, pausedAt *time.Time, pausedMs int64) {
		state := map[string]any{"phase": phase, "run": "r1", "task": nil, "started": started.UnixMilli(),
			"paused_at": nil, "paused_ms": pausedMs, "planned_ms": lapMs, "set_index": 0}
		if pausedAt != nil {
			state["paused_at"] = pausedAt.UnixMilli()
		}
		w.push(t, ravi, map[[3]string]any{{"timer", "current", "state"}: state})
	}
	// Both members read the same: ravi's own message carries it too, and his device ignores it.
	sees := func(what string, want *Run) {
		t.Helper()
		for _, viewer := range []int64{sachi, ravi} {
			got := w.message(t, room, viewer).Members[0].Run
			if !reflect.DeepEqual(got, want) {
				t.Errorf("%s, to %d: run = %+v, want %+v", what, viewer, got, want)
			}
		}
	}
	at := func(d time.Duration) *time.Time { m := wednesday.Add(d); return &m }

	sees("nobody has written a timer", nil)

	timer("work", wednesday.Add(-14*time.Minute), nil, 0)
	sees("fourteen minutes in", &Run{Ms: 840000, Today: true, Week: true})

	// Ten minutes run, then a pause. However long it lasts, the lap stands where it stopped.
	w.now = wednesday.Add(-4 * time.Minute)
	timer("work", wednesday.Add(-14*time.Minute), at(-4*time.Minute), 0)
	w.now = wednesday.Add(-time.Minute)
	sees("three minutes into the pause", &Run{Ms: 600000, Today: true, Week: true})
	w.now = wednesday.Add(4 * time.Minute)
	sees("five minutes on", &Run{Ms: 600000, Today: true, Week: true})
	// Resumed after 8 minutes paused, and read 2 minutes later: 12 minutes run.
	timer("work", wednesday.Add(-14*time.Minute), nil, 8*60000)
	w.now = wednesday.Add(6 * time.Minute)
	sees("resumed", &Run{Ms: 720000, Today: true, Week: true})

	// Begun at 23:50 on Tuesday in Colombo, read at 00:10 on Wednesday: not today's, this week's.
	tuesday := time.Date(2026, 11, 24, 18, 20, 0, 0, time.UTC)
	w.now = tuesday.Add(20 * time.Minute)
	timer("work", tuesday, nil, 0)
	sees("over midnight", &Run{Ms: 1200000, Today: false, Week: true})
	// Begun at 23:50 on Sunday, read at 00:10 on Monday: last week's, and not this one's.
	sunday := time.Date(2026, 11, 22, 18, 20, 0, 0, time.UTC)
	w.now = sunday.Add(20 * time.Minute)
	timer("work", sunday, nil, 0)
	sees("over the week's turn", &Run{Ms: 1200000, Today: false, Week: false})

	w.now = wednesday
	timer("work", wednesday.Add(-25*time.Minute), nil, 0)
	sees("the bell has gone: its row is coming", nil)
	timer("short", wednesday.Add(-time.Minute), nil, 0)
	sees("a break", nil)
	w.push(t, ravi, map[[3]string]any{{"timer", "current", "state"}: map[string]any{"phase": "idle", "run": nil, "task": nil,
		"started": nil, "paused_at": nil, "paused_ms": 0, "planned_ms": 0, "set_index": 0}})
	sees("idle", nil)

	timer("work", wednesday.Add(-14*time.Minute), nil, 0)
	w.push(t, ravi, map[[3]string]any{{"settings", "current", "rooms_hidden"}: true})
	sees("away", nil)
}
