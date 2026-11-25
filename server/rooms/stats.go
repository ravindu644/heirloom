package rooms

import (
	"cmp"
	"encoding/json"
	"slices"
	"time"
)

// The counting of contracts/protocol.md section 7, and the timer's view of section 6.
// client/src/core has the same rules in TypeScript; contracts/fixtures/stats.json and
// timer.json hold both to one answer.

// Session is what the counting needs of a session row.
type Session struct {
	ID       string `json:"id"`
	Kind     string `json:"kind"`
	Started  int64  `json:"started"`
	Ended    int64  `json:"ended"`
	PausedMs int64  `json:"paused_ms"`
	Outcome  string `json:"outcome"`
	Device   string `json:"device"`
}

// Day is one local day's focus: minutes that ran on two devices at once count once.
type Day struct {
	FocusMs int64 `json:"focus_ms"`
	Laps    int   `json:"laps"`
}

// from is where a lap's counted interval begins: its pauses are not focus.
func (s Session) from() int64 { return s.Started + s.PausedMs }

func (s Session) counts() bool { return s.Kind == "work" && s.Outcome != "void" }

// localDay is the day, 2026-11-24, that ms falls in for someone offsetMin minutes east of UTC.
func localDay(ms int64, offsetMin int) string {
	return time.UnixMilli(ms + int64(offsetMin)*60000).UTC().Format(time.DateOnly)
}

// Stats counts sessions by the local day each started in, and lists the pairs that ran
// on two devices at once.
func Stats(sessions []Session, offsetMin int) (days map[string]Day, overlaps [][2]string) {
	counted := slices.DeleteFunc(slices.Clone(sessions), func(s Session) bool { return !s.counts() })
	slices.SortFunc(counted, func(a, b Session) int { return cmp.Compare(a.from(), b.from()) })

	// Walking a day's laps by start, each adds only what reaches past everything before it.
	days, reach := map[string]Day{}, map[string]int64{}
	for _, s := range counted {
		day := localDay(s.Started, offsetMin)
		d := days[day]
		if _, begun := reach[day]; !begun {
			reach[day] = s.from()
		}
		d.FocusMs += max(0, s.Ended-max(reach[day], s.from()))
		reach[day] = max(reach[day], s.Ended)
		// Every counted session is a lap: one that was stopped is a lap that ended early.
		// What is earned by the bell (a cheer, the lap a room shows as the last) is asked
		// for by outcome where it is decided, not here.
		d.Laps++
		days[day] = d
	}

	overlaps = [][2]string{}
	for i, a := range counted {
		for _, b := range counted[i+1:] {
			if b.from() >= a.Ended {
				break
			}
			// More than an instant: back to back on two devices is not an overlap.
			if a.Device != b.Device && min(a.Ended, b.Ended) > b.from() {
				overlaps = append(overlaps, [2]string{min(a.ID, b.ID), max(a.ID, b.ID)})
			}
		}
	}
	slices.SortFunc(overlaps, func(x, y [2]string) int { return cmp.Or(cmp.Compare(x[0], y[0]), cmp.Compare(x[1], y[1])) })
	return days, overlaps
}

// Timer is the timer cell's state. A field a newer build adds is ignored.
type Timer struct {
	Phase     string  `json:"phase"`
	Run       *string `json:"run"`
	Task      *string `json:"task"`
	Started   *int64  `json:"started"`
	PausedAt  *int64  `json:"paused_at"`
	PausedMs  int64   `json:"paused_ms"`
	PlannedMs int64   `json:"planned_ms"`
	SetIndex  int     `json:"set_index"`
}

// ReadTimer reads a timer cell. It says no for no cell, an idle timer, and a shape or a
// phase this build does not know: in all of those nothing is running.
func ReadTimer(state json.RawMessage) (t Timer, running bool) {
	if json.Unmarshal(state, &t) != nil || t.Started == nil || (t.Phase != "work" && t.Phase != "short" && t.Phase != "long") {
		return Timer{SetIndex: clampIndex(t.SetIndex)}, false
	}
	t.SetIndex = clampIndex(t.SetIndex)
	return t, true
}

// Ends is the moment the run's bell goes, by protocol section 6. A paused run has none:
// a paused lap never rings.
func (t Timer) Ends() (at int64, set bool) {
	if t.Started == nil || t.PausedAt != nil {
		return 0, false
	}
	return *t.Started + t.PausedMs + t.PlannedMs, true
}

// presence is what a room sees of a timer at one moment.
type presence struct {
	phase    string
	setIndex int
	endsAt   *int64
	paused   bool
	task     *string // the id of the task a lap is for, not its title
}

// watch reads a timer cell at now. Nothing running, or a run whose bell has gone, is
// idle: nobody is at it right now.
func watch(state json.RawMessage, now int64) presence {
	t, running := ReadTimer(state)
	if !running {
		return presence{phase: "idle", setIndex: t.SetIndex}
	}
	p := presence{phase: t.Phase, setIndex: t.SetIndex, task: t.Task}
	end, set := t.Ends()
	if !set {
		p.paused = true
		return p
	}
	if now >= end {
		return presence{phase: "idle", setIndex: p.setIndex}
	}
	p.endsAt = &end
	return p
}

// A set has four laps. Anything else in the cell is not passed on to a room.
func clampIndex(i int) int {
	if i < 0 || i > 3 {
		return 0
	}
	return i
}
