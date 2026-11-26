package rooms

import (
	"encoding/json"
	"os"
	"reflect"
	"slices"
	"testing"
	"time"
)

// The contract's cases for section 8, the file the TypeScript core runs too.
func TestFixtureStreak(t *testing.T) {
	data, err := os.ReadFile("../../contracts/fixtures/streak.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Cases []struct {
			Name   string
			Today  string
			Kept   []string
			Window int
			Mask   *int `json:"days_mask"`
			Expect StreakResult
		}
	}
	if err := json.Unmarshal(data, &fixture); err != nil || len(fixture.Cases) == 0 {
		t.Fatalf("streak.json: %d cases, %v", len(fixture.Cases), err)
	}
	for _, c := range fixture.Cases {
		mask := 127
		if c.Mask != nil {
			mask = *c.Mask
		}
		if got := Streak(c.Today, c.Kept, c.Window, mask, ""); !reflect.DeepEqual(got, c.Expect) {
			t.Errorf("%s: %+v, want %+v", c.Name, got, c.Expect)
		}
	}
}

// at is a moment in UTC on a day of November 2026.
func at(day, hour, minute int) time.Time {
	return time.Date(2026, 11, day, hour, minute, 0, 0, time.UTC)
}

// stopped is lap with another outcome: a lap stopped early, or one set aside.
func stopped(fields map[[3]string]any, run string, started time.Time, outcome string) {
	lap(fields, run, started)
	fields[[3]string{"session", run, "outcome"}] = outcome
	fields[[3]string{"session", run, "ended"}] = started.Add(10 * time.Minute).UnixMilli()
}

// The room's week by day, last week's, last week as far as now, and each member's laps of
// today. Ravi is in UTC; Sachi in Colombo, whose Wednesday began at 18:30 UTC on Tuesday.
func TestTheRoomsWeekAndEachMembersDay(t *testing.T) {
	w := newWorld(t)
	ravi, sachi := w.account(t, "ravi", 0), w.account(t, "sachi", 330)
	_, room, err := w.Create(ravi, "Week")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := w.Join(sachi, w.message(t, room, ravi).Code); err != nil {
		t.Fatal(err)
	}
	const lapMs = 25 * 60 * 1000
	his := map[[3]string]any{}
	lap(his, "last-mon", at(16, 12, 0))
	lap(his, "last-wed-early", at(18, 3, 0)) // before this moment of last week
	lap(his, "last-wed-late", at(18, 5, 0))  // after it
	lap(his, "mon", at(23, 12, 0))
	lap(his, "wed", at(25, 3, 0))
	stopped(his, "wed-short", at(25, 3, 40), "stopped")
	stopped(his, "wed-aside", at(25, 4, 0), "void")
	for field, value := range map[string]any{"kind": "short", "started": at(25, 3, 30).UnixMilli(), "ended": at(25, 3, 35).UnixMilli(),
		"planned_ms": 300000, "paused_ms": 0, "outcome": "rang", "device": "a1b2c3d4e5f60718"} {
		his[[3]string{"session", "wed-break", field}] = value
	}
	w.push(t, ravi, his)
	hers := map[[3]string]any{}
	lap(hers, "her-wed", at(24, 19, 0)) // 00:30 on Wednesday in Colombo
	w.push(t, sachi, hers)

	m := w.message(t, room, sachi)
	short := int64(10 * 60 * 1000)
	if want := [7]int64{lapMs, 0, 2*lapMs + short}; m.Days != want {
		t.Errorf("days = %v, want %v: each lap on its own member's local day", m.Days, want)
	}
	if want := [7]int64{lapMs, 0, 2 * lapMs}; m.LastDays != want {
		t.Errorf("last_days = %v, want %v", m.LastDays, want)
	}
	if want := int64(2 * lapMs); m.LastAtMs != want {
		t.Errorf("last_at_ms = %d, want %d: last Monday's lap and last Wednesday's before 04:30", m.LastAtMs, want)
	}
	// Each member's own, by their own calendar: Sachi's lap is on her Wednesday, Ravi's
	// last week is his alone.
	for _, c := range []struct {
		who            int
		days, lastDays [7]int64
		lastAt         int64
	}{{0, [7]int64{lapMs, 0, lapMs + short}, [7]int64{lapMs, 0, 2 * lapMs}, 2 * lapMs}, {1, [7]int64{0, 0, lapMs}, [7]int64{}, 0}} {
		if got := m.Members[c.who]; got.Days != c.days || got.LastDays != c.lastDays || got.LastAtMs != c.lastAt {
			t.Errorf("%s: days %v, last_days %v, last_at_ms %d; want %v, %v, %d", got.Name, got.Days, got.LastDays, got.LastAtMs, c.days, c.lastDays, c.lastAt)
		}
	}
	want := [][2]int64{{at(25, 3, 0).UnixMilli(), at(25, 3, 25).UnixMilli()}, {at(25, 3, 40).UnixMilli(), at(25, 3, 50).UnixMilli()}}
	if got := m.Members[0].Laps; !reflect.DeepEqual(got, want) {
		t.Errorf("ravi's laps = %v, want his two work laps of today, oldest first, without the break or the lap set aside", got)
	}
	if got := m.Members[1].Laps; len(got) != 1 || got[0][0] != at(24, 19, 0).UnixMilli() {
		t.Errorf("sachi's laps = %v, want her lap of her Wednesday", got)
	}

	// Away: no laps shown, the totals still real.
	w.push(t, sachi, map[[3]string]any{{"settings", "current", "rooms_hidden"}: true})
	away := w.message(t, room, ravi)
	if got := away.Members[1]; got.Laps == nil || len(got.Laps) != 0 || got.TodayMs != lapMs || got.Days != [7]int64{} || got.LastDays != [7]int64{} || got.LastAtMs != 0 {
		t.Errorf("away sachi = %+v, want laps [], days and last week zeros, and her totals", got)
	}
	if away.Days != m.Days {
		t.Errorf("with sachi away the room's days are %v, want %v: what she did still counts", away.Days, m.Days)
	}

	// At most the newest 48.
	many := map[[3]string]any{}
	for n := range 60 {
		stopped(many, "many-"+string(rune('A'+n/26))+string(rune('a'+n%26)), at(25, 0, 0).Add(time.Duration(n)*4*time.Minute), "stopped")
	}
	w.push(t, ravi, many)
	got := w.message(t, room, ravi).Members[0].Laps
	if len(got) != maxLaps || !slices.IsSortedFunc(got, func(a, b [2]int64) int { return int(a[0] - b[0]) }) || got[len(got)-1][0] != at(25, 3, 56).UnixMilli() {
		t.Errorf("%d laps, the last %v; want the newest 48, oldest first", len(got), got[len(got)-1])
	}
}

// A day is the room's when everyone then in it rang a lap on their own local day. Two
// empty days a week are rest, a third a miss. Sachi came in on Wednesday the 18th, so
// the Monday and Tuesday before are Ravi's alone.
func TestTheRoomsStreak(t *testing.T) {
	w := newWorld(t)
	ravi, sachi := w.account(t, "ravi", 0), w.account(t, "sachi", 0)
	w.now = at(16, 8, 0)
	_, room, err := w.Create(ravi, "Streak")
	if err != nil {
		t.Fatal(err)
	}
	code := w.message(t, room, ravi).Code
	w.now = at(18, 10, 0)
	if _, _, err := w.Join(sachi, code); err != nil {
		t.Fatal(err)
	}
	w.now = wednesday // the 25th

	his, hers := map[[3]string]any{}, map[[3]string]any{}
	for _, d := range []int{16, 18, 19, 20, 21, 23, 25} {
		lap(his, "his-"+itoa(d), at(d, 12, 0))
	}
	for _, d := range []int{18, 20, 21, 23} {
		lap(hers, "hers-"+itoa(d), at(d, 13, 0))
	}
	stopped(hers, "hers-22", at(22, 13, 0), "stopped") // a lap that did not ring keeps nothing
	w.push(t, ravi, his)
	w.push(t, sachi, hers)

	want := RoomStreak{Run: 1, Marks: []string{"none", "none", "none", "none", // the 12th to the 15th: no room yet
		"kept", "rest", "kept", "rest", "kept", "kept", "miss", // 16 to 22; the 19th was his alone
		"kept", "rest", "open"}}
	for _, viewer := range []int64{ravi, sachi} {
		if got := w.message(t, room, viewer).Streak; !reflect.DeepEqual(got, want) {
			t.Errorf("streak = %+v, want %+v", got, want)
		}
	}
	today := map[[3]string]any{}
	lap(today, "hers-25", at(25, 3, 0))
	w.push(t, sachi, today)
	want.Run, want.Marks[13] = 2, "kept"
	if got := w.message(t, room, ravi).Streak; !reflect.DeepEqual(got, want) {
		t.Errorf("once sachi rang today: %+v, want %+v", got, want)
	}
}

func itoa(n int) string { b, _ := json.Marshal(n); return string(b) }

// The room next reads differently a minute after a call's start, when it is over.
func TestACallEndsByTime(t *testing.T) {
	w := newWorld(t)
	ravi := w.account(t, "ravi", 0)
	public, room, err := w.Create(ravi, "Call")
	if err != nil {
		t.Fatal(err)
	}
	start := wednesday.Add(5 * time.Minute).UnixMilli() // wednesday is a whole minute
	if _, _, err := w.Call(ravi, public, &start); err != nil {
		t.Fatal(err)
	}
	m, next, err := w.Message(room, ravi)
	if err != nil || m.Call == nil || next != start+callLasts {
		t.Errorf("call %+v, next %d, %v; want the call, and next at %d", m.Call, next, err, start+callLasts)
	}
	w.now = time.UnixMilli(start + callLasts - 1)
	if m := w.message(t, room, ravi); m.Call == nil {
		t.Error("the call is gone before its minute is up")
	}
	w.now = time.UnixMilli(start + callLasts)
	if m := w.message(t, room, ravi); m.Call != nil {
		t.Errorf("a minute after its start the call is still %+v", m.Call)
	}
}
