package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"heirloom/server/rooms"
)

// Rooms, the second pass: notes, calling a lap together, taking a member out, pictures.
// contracts/protocol.md section 15.

// wholeMinute moves the test clock to the next whole minute, so a call's at can be one.
func (w *world) wholeMinute() int64 {
	if rest := w.ms.Load() % 60000; rest != 0 {
		w.pass(time.Duration(60000-rest) * time.Millisecond)
	}
	return w.ms.Load()
}

// drain reads everything on its way to these devices.
func drain(people ...*person) {
	for _, p := range people {
		p.settle()
	}
}

func TestNotesOverHTTP(t *testing.T) {
	w := start(t)
	ravi, sachi, nimal := w.person("ravi", phone, 330), w.person("sachi", laptop, 330), w.person("nimal", tablet, 330)
	room, _ := together(t, "Notes", ravi, sachi)

	first := ravi.ask("note", map[string]any{"room": room, "text": "Back in ten, then chapter 4"}).ok(t, "a note").Note
	for _, p := range []*person{ravi, sachi} {
		if m := p.room(); m.NotesSince == nil || *m.NotesSince != first {
			t.Errorf("%s sees notes_since %v, want %q", p.Username, m.NotesSince, first)
		}
	}
	nimal.still("nimal is in no room")
	w.pass(time.Second)
	// 200 of what a String.length counts, and anything but a line break.
	long := strings.Repeat("é", 198) + "🙂" // 198, and a pair that String.length counts as 2
	second := sachi.ask("note", map[string]any{"room": room, "text": long}).ok(t, "a note of 200").Note
	drain(ravi, sachi)

	notes := sachi.ask("notes", map[string]any{"room": room}).ok(t, "notes").Notes
	if len(notes) != 2 || notes[0].ID != second || notes[1].ID != first || *notes[0].From != sachi.Account || *notes[1].From != ravi.Account ||
		notes[1].Text != "Back in ten, then chapter 4" || notes[1].At != serverTime.UnixMilli() {
		t.Errorf("notes = %+v, want sachi's then ravi's, newest first", notes)
	}
	ravi.still("reading the notes changes nothing")

	for what, text := range map[string]any{
		"an empty note":         "",
		"only spaces":           "   ",
		"201 characters":        strings.Repeat("n", 201),
		"two lines":             "one\ntwo",
		"a carriage return":     "one\rtwo",
		"a line separator":      "one two",
		"not text":              7,
		"201 with a pair at it": strings.Repeat("n", 199) + "🙂",
	} {
		sachi.ask("note", map[string]any{"room": room, "text": text}).refused(t, what, 400, "bad_request")
	}
	ravi.still("every one of those was refused")
	sachi.still("every one of those was refused")

	// A note belongs to the room: when its writer leaves it stays, from nobody.
	ravi.ask("leave", map[string]any{"room": room}).ok(t, "leave")
	drain(ravi, sachi)
	notes = sachi.ask("notes", map[string]any{"room": room}).ok(t, "notes").Notes
	if last := notes[len(notes)-1]; last.ID != first || last.From != nil || last.Text == "" {
		t.Errorf("ravi's note after he left = %+v, want it kept with from null", last)
	}

	// Seven days on they are gone, from the list and from the table at the next note.
	w.pass(7 * 24 * time.Hour)
	if notes := sachi.ask("notes", map[string]any{"room": room}).ok(t, "notes").Notes; len(notes) != 0 {
		t.Errorf("a week later the notes are %+v, want none", notes)
	}
	sachi.ask("note", map[string]any{"room": room, "text": "A new week"}).ok(t, "a note")
	var kept int
	if err := w.db.QueryRow("select count(*) from note").Scan(&kept); err != nil || kept != 1 {
		t.Errorf("%d notes stored a week on, %v; want only the new one", kept, err)
	}
}

// Notes read on one device are read on every device of the account, and only there.
func TestNotesReadOnEveryDevice(t *testing.T) {
	w := start(t)
	ravi, sachi := w.person("ravi", phone, 330), w.person("sachi", laptop, 330)
	room, _ := together(t, "Notes", ravi, sachi)
	tab := &person{w: w, session: w.signIn("ravi", tablet), id: tablet, offset: 330} // ravi's second device
	tab.connect()
	sachi.ask("note", map[string]any{"room": room, "text": "Chapter 4 done"}).ok(t, "a note")
	drain(ravi, sachi, tab)
	at := w.ms.Load()
	w.pass(time.Minute)

	ravi.ask("read", map[string]any{"room": room, "at": at}).ok(t, "read")
	for _, d := range []*person{ravi, tab} {
		if m := d.room(); m.NotesRead != at {
			t.Errorf("ravi's %s: notes_read %d, want %d", d.id, m.NotesRead, at)
		}
	}
	sachi.still("ravi read the notes, not sachi")
	if m := look(sachi); m.NotesRead != 0 {
		t.Errorf("sachi's notes_read = %d, want 0: ravi read them, she did not", m.NotesRead)
	}

	ravi.ask("read", map[string]any{"room": room, "at": at - 1}).ok(t, "reading an older note")
	ravi.ask("read", map[string]any{"room": room, "at": at}).ok(t, "reading the same again")
	tab.still("the mark only moves forward")

	// A fast clock cannot read ahead: the mark stops at now.
	now := w.ms.Load()
	tab.ask("read", map[string]any{"room": room, "at": now + 3_600_000}).ok(t, "read ahead")
	if m := ravi.room(); m.NotesRead != now {
		t.Errorf("read an hour ahead: notes_read %d, want now, %d", m.NotesRead, now)
	}
	drain(ravi, sachi, tab)

	for what, at := range map[string]any{"no at": nil, "a negative at": -1, "not a number": "soon"} {
		fields := map[string]any{"room": room}
		if at != nil {
			fields["at"] = at
		}
		ravi.ask("read", fields).refused(t, what, 400, "bad_request")
	}
	ravi.still("every one of those was refused")
	ravi.ask("read", map[string]any{"room": "made-up-room", "at": now}).refused(t, "a room ravi is not in", 404, "room")
}

func TestThirtyNotesADay(t *testing.T) {
	w := start(t)
	ravi, sachi := w.person("ravi", phone, 0), w.person("sachi", laptop, 0)
	room, _ := together(t, "Chatty", ravi, sachi)
	began := w.ms.Load()
	for n := range 30 {
		ravi.ask("note", map[string]any{"room": room, "text": "note"}).ok(t, "note "+string(rune('a'+n%26)))
		w.pass(time.Minute)
	}
	var refused struct{ Error string }
	status, header := w.post("/api/rooms/note", map[string]any{"token": ravi.Token, "device": ravi.id, "room": room, "text": "one more"}, &refused)
	// The first of the thirty is a day old at began + 24h.
	if want := (began + 24*3600*1000 - w.ms.Load()) / 1000; status != 429 || refused.Error != "slow_down" || header.Get("Retry-After") != itoa(want) {
		t.Errorf("the 31st note = %d %s, Retry-After %q; want 429 slow_down, %d", status, refused.Error, header.Get("Retry-After"), want)
	}
	// The other member has her own thirty.
	sachi.ask("note", map[string]any{"room": room, "text": "mine"}).ok(t, "sachi's first")
	w.pass(24*time.Hour - 30*time.Minute)
	ravi.ask("note", map[string]any{"room": room, "text": "a day on"}).ok(t, "once the first is a day old")
}

func itoa(n int64) string { return strings.TrimSpace(asJSON(n)) }

func TestCallingALapTogether(t *testing.T) {
	w := start(t)
	ravi, sachi, nimal := w.person("ravi", phone, 0), w.person("sachi", laptop, 0), w.person("nimal", tablet, 0)
	room, _ := together(t, "Together", ravi, sachi, nimal)
	now := w.wholeMinute()
	everyone := []*person{ravi, sachi, nimal}
	sees := func(what string, want *rooms.Call) {
		t.Helper()
		for _, p := range everyone {
			got := p.room().Call
			if (got == nil) != (want == nil) || got != nil && (got.ID != want.ID || got.By != want.By || got.At != want.At || !slices.Equal(got.In, want.In)) {
				t.Errorf("%s: %s sees call %+v, want %+v", what, p.Username, got, want)
			}
		}
	}

	for what, at := range map[string]any{
		"now":                     now,
		"half a minute ahead":     now + 30000,
		"not a whole minute":      now + 90000,
		"31 minutes ahead":        now + 31*60000,
		"in the past":             now - 60000,
		"a number that is a text": "soon",
	} {
		ravi.ask("call", map[string]any{"room": room, "at": at}).refused(t, "a call for "+what, 400, "bad_request")
	}
	ravi.ask("call", map[string]any{"room": room}).refused(t, "taking back a call there is not", 404, "call")
	drain(everyone...)

	at := now + 5*60000
	call := ravi.ask("call", map[string]any{"room": room, "at": at}).ok(t, "a call")
	if call.raw != `{"call":"`+call.Call+`"}` || call.Call == "" {
		t.Errorf("call answered %s", call.raw)
	}
	sees("the call", &rooms.Call{ID: call.Call, By: ravi.Account, At: at, In: []string{ravi.Account}})
	sachi.ask("call", map[string]any{"room": room, "at": now + 6*60000}).refused(t, "a second call", 409, "call")
	sachi.ask("call", map[string]any{"room": room, "at": nil}).refused(t, "taking back someone else's call", 404, "call")

	sachi.ask("in", map[string]any{"room": room, "call": call.Call, "in": true}).ok(t, "in")
	sees("sachi is in", &rooms.Call{ID: call.Call, By: ravi.Account, At: at, In: []string{ravi.Account, sachi.Account}})
	sachi.ask("in", map[string]any{"room": room, "call": call.Call, "in": true}).ok(t, "in twice")
	for _, p := range everyone {
		p.still("sachi said she was in twice")
	}
	nimal.ask("in", map[string]any{"room": room, "call": call.Call, "in": true}).ok(t, "in")
	drain(everyone...)
	nimal.ask("in", map[string]any{"room": room, "call": call.Call, "in": false}).ok(t, "out again")
	sees("nimal took it back", &rooms.Call{ID: call.Call, By: ravi.Account, At: at, In: []string{ravi.Account, sachi.Account}})
	nimal.ask("in", map[string]any{"room": room, "call": "made-up", "in": true}).refused(t, "a call that is not this one", 404, "call")
	nimal.ask("in", map[string]any{"room": room, "call": call.Call}).refused(t, "in, saying neither", 400, "bad_request")
	ravi.ask("in", map[string]any{"room": room, "call": call.Call, "in": false}).refused(t, "the caller out", 400, "bad_request")

	// Up to the start, and not at it.
	w.pass(5*time.Minute - time.Millisecond)
	nimal.ask("in", map[string]any{"room": room, "call": call.Call, "in": true}).ok(t, "in at the last moment")
	drain(everyone...)
	w.pass(time.Millisecond)
	nimal.ask("in", map[string]any{"room": room, "call": call.Call, "in": false}).refused(t, "out once it started", 404, "call")
	sachi.ask("call", map[string]any{"room": room, "at": now + 7*60000}).refused(t, "a call while one is starting", 409, "call")

	// A minute past at it is over. The socket's own timer says so at that moment (the
	// rooms tests prove the message names the moment); here a message built then says it.
	w.pass(time.Minute)
	ravi.ask("update", map[string]any{"room": room}).ok(t, "an update of nothing, to look again")
	sees("a minute after the start", nil)
	now = w.wholeMinute()
	second := sachi.ask("call", map[string]any{"room": room, "at": now + 60000}).ok(t, "a call once the last is over").Call
	drain(everyone...)

	// A member who leaves is out of the call; the caller leaving ends it.
	ravi.ask("in", map[string]any{"room": room, "call": second, "in": true}).ok(t, "ravi in")
	drain(everyone...)
	ravi.ask("leave", map[string]any{"room": room}).ok(t, "ravi leaves")
	everyone = []*person{sachi, nimal}
	sees("ravi left", &rooms.Call{ID: second, By: sachi.Account, At: now + 60000, In: []string{sachi.Account}})
	drain(ravi)
	sachi.ask("leave", map[string]any{"room": room}).ok(t, "the caller leaves")
	everyone = []*person{nimal}
	sees("the caller left", nil)
}

// calls makes a call in the room for the next whole minute but one.
func (p *person) calls(t *testing.T, room, what string) {
	t.Helper()
	p.ask("call", map[string]any{"room": room, "at": p.w.wholeMinute() + 60000}).ok(t, what)
}

func (p *person) takesBack(t *testing.T, room, what string) {
	t.Helper()
	p.ask("call", map[string]any{"room": room, "at": nil}).ok(t, what)
}

// over lets a call run its course: a minute to its start and one past it.
func (w *world) over() { w.pass(2 * time.Minute) }

// slowed asks for a call the limit refuses, and checks the wait runs to a day after began.
func (p *person) slowed(t *testing.T, room string, began int64, what string) {
	t.Helper()
	var refused struct{ Error string }
	status, header := p.w.post("/api/rooms/call", map[string]any{"token": p.Token, "device": p.id, "room": room, "at": p.w.wholeMinute() + 60000}, &refused)
	if want := (began + 24*3600*1000 - p.w.ms.Load()) / 1000; status != 429 || refused.Error != "slow_down" || header.Get("Retry-After") != itoa(want) {
		t.Errorf("%s = %d %s, Retry-After %q; want 429 slow_down, %d", what, status, refused.Error, header.Get("Retry-After"), want)
	}
}

// Twenty calls a day for a member, a call taken back before it starts not among them.
func TestTwentyCallsADay(t *testing.T) {
	w := start(t)
	ravi, sachi := w.person("ravi", phone, 0), w.person("sachi", laptop, 0)
	room, _ := together(t, "Calls", ravi, sachi) // ravi keeps it

	sachi.calls(t, room, "a call she takes back")
	sachi.takesBack(t, room, "taken back")
	began := w.wholeMinute()
	for n := range 19 {
		sachi.calls(t, room, fmt.Sprint("call ", n+1))
		w.over()
	}
	sachi.calls(t, room, "the 20th")
	sachi.takesBack(t, room, "the 20th taken back")
	sachi.calls(t, room, "the 20th again: the one taken back freed its place")
	w.over()
	sachi.slowed(t, room, began, "a 21st call")

	// In a room of her own she is its keeper, her 20 spent elsewhere.
	theirs := sachi.ask("create", map[string]any{"name": "Mine"}).ok(t, "create").Room
	sachi.calls(t, theirs, "sachi in the room she keeps")
}

// Calling and taking back on a loop stops at 40 a day.
func TestFortyCallsWithTakeBacks(t *testing.T) {
	w := start(t)
	ravi, sachi := w.person("ravi", phone, 0), w.person("sachi", laptop, 0)
	room, _ := together(t, "Calls", ravi, sachi)
	began := w.wholeMinute()
	for n := range 40 {
		sachi.calls(t, room, fmt.Sprint("call ", n+1))
		sachi.takesBack(t, room, fmt.Sprint("taken back ", n+1))
	}
	sachi.slowed(t, room, began, "a 41st call, none of the 40 standing")
}

// From its start on, a call taken back ends as it always did, and it still counts.
func TestATakeBackAfterTheStartStillCounts(t *testing.T) {
	w := start(t)
	ravi, sachi := w.person("ravi", phone, 0), w.person("sachi", laptop, 0)
	room, _ := together(t, "Calls", ravi, sachi)
	began := w.wholeMinute()
	for n := range 19 {
		sachi.calls(t, room, fmt.Sprint("call ", n+1))
		w.over()
	}
	sachi.calls(t, room, "the 20th")
	w.pass(time.Minute) // at its start
	sachi.takesBack(t, room, "taken back once it had started")
	if m := look(sachi); m.Call != nil {
		t.Errorf("the call taken back at its start still stands: %+v", m.Call)
	}
	sachi.slowed(t, room, began, "a call after one taken back too late to free its place")
}

// A call is the keeper's or not when it is made. When the room passes to someone else,
// nothing that was counted stops being counted, and nothing free starts to be.
func TestCallsStayWhoseTheyWere(t *testing.T) {
	w := start(t)
	ravi, sachi, nimal := w.person("ravi", phone, 0), w.person("sachi", laptop, 0), w.person("nimal", tablet, 0)
	room, _ := together(t, "Ravi's", ravi, sachi)
	other, _ := together(t, "Nimal's", nimal, ravi, sachi)
	for n := range 20 {
		ravi.calls(t, room, fmt.Sprint("the keeper's call ", n+1))
		w.over()
	}
	began := w.wholeMinute()
	for n := range 20 {
		sachi.calls(t, room, fmt.Sprint("sachi's call ", n+1))
		w.over()
	}
	ravi.ask("leave", map[string]any{"room": room}).ok(t, "ravi leaves, and sachi keeps the room")
	if m := look(nimal); len(m.Members) != 3 {
		t.Fatalf("nimal's room = %s", names(m))
	}
	ravi.calls(t, other, "ravi elsewhere: his 20 as the keeper were free, and still are")
	w.over()
	sachi.slowed(t, other, began, "sachi elsewhere: her 20 still count, though she keeps the room now")
	sachi.calls(t, room, "sachi in the room she keeps now: her old calls there are not the keeper's")
}

// A keeper calls freely in their room, up to 100 a day: anyone can make a room.
func TestAKeeperHasAHundred(t *testing.T) {
	w := start(t)
	ravi, sachi := w.person("ravi", phone, 0), w.person("sachi", laptop, 0)
	room, _ := together(t, "Ravi's", ravi, sachi)
	began := w.wholeMinute()
	for n := range 100 {
		ravi.calls(t, room, fmt.Sprint("the keeper's call ", n+1))
		w.over()
	}
	ravi.slowed(t, room, began, "a 101st call in his own room")
	theirs := sachi.ask("create", map[string]any{"name": "Sachi's"}).ok(t, "create").Room
	var code string
	for _, m := range sachi.settle() {
		if m.Room == theirs {
			code = m.Code
		}
	}
	ravi.ask("join", map[string]any{"code": code}).ok(t, "join")
	ravi.calls(t, theirs, "ravi in sachi's room: his 100 took nothing from his 20")
}

// Everybody says they are in at once, twice each, while the caller takes the call back.
// Every answer is one of the two a device can get, and nobody is in twice.
func TestInAtOnceAndACallEnding(t *testing.T) {
	w := start(t)
	people := []*person{w.person("ravi", phone, 0), w.person("sachi", laptop, 0), w.person("nimal", tablet, 0), w.person("mali", pocket, 0)}
	room, _ := together(t, "Rush", people...)
	ravi := people[0]
	call := ravi.ask("call", map[string]any{"room": room, "at": w.wholeMinute() + 60000}).ok(t, "call").Call
	// Each device sees the call, so the end below is news to all of them. (A burst of
	// changes a device was asleep through is one message, or none if it ends where it began.)
	drain(people...)

	var wg sync.WaitGroup
	statuses := make(chan int, 16)
	for _, p := range people[1:] {
		for range 2 {
			wg.Go(func() { statuses <- p.ask("in", map[string]any{"room": room, "call": call, "in": true}).status })
		}
	}
	wg.Wait()
	close(statuses)
	for s := range statuses {
		if s != 200 {
			t.Errorf("in at once answered %d", s)
		}
	}
	var in int
	if err := w.db.QueryRow("select count(*) from call_in").Scan(&in); err != nil || in != 4 {
		t.Errorf("%d rows of who is in, %v; want the four, once each", in, err)
	}

	answers := make(chan answer, 8)
	for _, p := range people[1:] {
		wg.Go(func() { answers <- p.ask("in", map[string]any{"room": room, "call": call, "in": false}) })
	}
	wg.Go(func() { answers <- ravi.ask("call", map[string]any{"room": room, "at": nil}) })
	wg.Wait()
	close(answers)
	for a := range answers {
		if a.status != 200 && !(a.status == 404 && a.Error == "call") {
			t.Errorf("while the call ended: %d %s", a.status, a.raw)
		}
	}
	for _, p := range people {
		if got := p.settle(); len(got) == 0 || got[len(got)-1].Call != nil {
			t.Errorf("%s is left with a call after it was taken back: %d messages", p.Username, len(got))
		}
	}
}

func TestTheKeeperTakesAMemberOut(t *testing.T) {
	w := start(t)
	ravi, sachi, nimal, mali := w.person("ravi", phone, 0), w.person("sachi", laptop, 0), w.person("nimal", tablet, 0), w.person("mali", pocket, 0)
	room, code := together(t, "Ours", ravi, sachi, nimal)
	nimal.ask("note", map[string]any{"room": room, "text": "hello"}).ok(t, "nimal's note")
	call := nimal.ask("call", map[string]any{"room": room, "at": w.wholeMinute() + 60000}).ok(t, "nimal's call").Call
	sachi.ask("in", map[string]any{"room": room, "call": call, "in": true}).ok(t, "in")
	drain(ravi, sachi, nimal)

	sachi.ask("remove", map[string]any{"room": room, "member": nimal.Account}).refused(t, "a member who is not the keeper", 403, "forbidden")
	sachi.ask("remove", map[string]any{"room": room, "member": "nobody"}).refused(t, "not the keeper, and nobody named", 403, "forbidden")
	ravi.ask("remove", map[string]any{"room": room, "member": ravi.Account}).refused(t, "the keeper himself", 400, "bad_request")
	for _, p := range []*person{ravi, sachi, nimal} {
		p.still("nobody was taken out")
	}

	if a := ravi.ask("remove", map[string]any{"room": room, "member": nimal.Account}).ok(t, "remove"); a.raw != "{}" {
		t.Errorf("remove answered %s", a.raw)
	}
	if gone := nimal.room(); gone.raw != `{"type":"room","room":"`+room+`","gone":true}`+"\n" {
		t.Errorf("nimal was sent %s, want gone", gone.raw)
	}
	var fresh string
	for _, p := range []*person{ravi, sachi} {
		m := p.room()
		if names(m) == "" || strings.Contains(names(m), "nimal") || m.Code == code || m.Call != nil {
			t.Errorf("%s sees %s, want nimal out, a new code and nimal's call ended", p.Username, m.raw)
		}
		fresh = m.Code
	}
	notes := ravi.ask("notes", map[string]any{"room": room}).ok(t, "notes").Notes
	if len(notes) != 1 || notes[0].From != nil {
		t.Errorf("nimal's note after he was taken out = %+v, want it kept from nobody", notes)
	}
	nimal.ask("join", map[string]any{"code": code}).refused(t, "the old code", 404, "code")
	ravi.ask("remove", map[string]any{"room": room, "member": nimal.Account}).ok(t, "removing who is already out")
	mali.ask("remove", map[string]any{"room": room, "member": sachi.Account}).refused(t, "someone outside", 404, "room")
	mali.ask("join", map[string]any{"code": fresh}).ok(t, "the new code works")
}

// An outsider asking about a room learns nothing: the answer for a real room they are not
// in is the answer for a room that does not exist, word for word.
func TestRoomsAreNotRevealedToOutsiders(t *testing.T) {
	w := start(t)
	ravi, sachi, nimal := w.person("ravi", phone, 0), w.person("sachi", laptop, 0), w.person("nimal", tablet, 0)
	room, _ := together(t, "Private", ravi, sachi)
	call := ravi.ask("call", map[string]any{"room": room, "at": w.wholeMinute() + 60000}).ok(t, "call").Call
	for _, path := range []string{"note", "notes", "read", "call", "in", "remove", "update", "cheer", "leave"} {
		fields := func(r string) map[string]any {
			return map[string]any{"room": r, "text": "hi", "at": w.ms.Load() + 120000, "call": call, "in": true, "member": sachi.Account, "name": "Mine", "to": sachi.Account, "run": "x"}
		}
		real, made := nimal.ask(path, fields(room)), nimal.ask(path, fields("made-up-room"))
		if real.status != 404 || real.Error != "room" || real.raw != made.raw {
			t.Errorf("%s by an outsider: %d %s for a real room, %d %s for none; want the same 404 room", path, real.status, real.raw, made.status, made.raw)
		}
	}
}

func TestPictures(t *testing.T) {
	w := start(t)
	ravi, sachi, nimal := w.person("ravi", phone, 0), w.person("sachi", laptop, 0), w.person("nimal", tablet, 0)
	together(t, "Faces", ravi, sachi)
	webp := append([]byte("RIFF\x00\x10\x00\x00WEBPVP8 "), bytes.Repeat([]byte{7}, 5000)...)
	set := func(p *person, picture any) (int, map[string]string) {
		var out map[string]string
		status, _ := w.post("/api/me/picture", map[string]any{"token": p.Token, "device": p.id, "picture": picture}, &out)
		return status, out
	}
	get := func(token, hash string) (*http.Response, []byte) {
		req, _ := http.NewRequest(http.MethodGet, w.url+"/api/pictures/"+hash, nil)
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		body, _ := io.ReadAll(res.Body)
		return res, body
	}

	sum := sha256.Sum256(webp)
	hash := hex.EncodeToString(sum[:])
	if status, out := set(ravi, base64.StdEncoding.EncodeToString(webp)); status != 200 || out["picture"] != hash {
		t.Fatalf("set = %d %v, want the sha-256 %s", status, out, hash)
	}
	for _, p := range []*person{ravi, sachi} {
		if got := who(t, p.room(), "ravi").Picture; got == nil || *got != hash {
			t.Errorf("%s sees ravi's picture %v", p.Username, got)
		}
	}
	nimal.still("nimal shares no room with ravi")

	for who, token := range map[string]string{"sachi, in his room": sachi.Token, "ravi himself": ravi.Token} {
		res, body := get(token, hash)
		if res.StatusCode != 200 || !bytes.Equal(body, webp) || res.Header.Get("Content-Type") != "image/webp" ||
			res.Header.Get("Cache-Control") != "private, max-age=31536000, immutable" {
			t.Errorf("%s fetching it: %d %v, %d bytes", who, res.StatusCode, res.Header, len(body))
		}
	}
	if res, _ := get(nimal.Token, hash); res.StatusCode != 404 {
		t.Errorf("nimal, in no room with ravi: %d, want 404", res.StatusCode)
	}
	if res, _ := get(nimal.Token, strings.Repeat("0", 64)); res.StatusCode != 404 {
		t.Errorf("a hash nobody has: %d, want 404", res.StatusCode)
	}
	for what, token := range map[string]string{"no token": "", "a made-up token": "NOTATOKEN"} {
		if res, _ := get(token, hash); res.StatusCode != 401 {
			t.Errorf("%s: %d, want 401", what, res.StatusCode)
		}
	}

	jpeg := append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, bytes.Repeat([]byte{1}, 12000-4)...)
	for what, picture := range map[string]any{
		"12001 bytes":   base64.StdEncoding.EncodeToString(append(jpeg, 0)),
		"a PNG":         base64.StdEncoding.EncodeToString([]byte("\x89PNG\r\n\x1a\n0000")),
		"text":          base64.StdEncoding.EncodeToString([]byte("hello")),
		"empty":         "",
		"not base64":    "!!!!",
		"not even text": 7,
	} {
		if status, _ := set(sachi, picture); status != 400 {
			t.Errorf("a picture that is %s: %d, want 400", what, status)
		}
	}
	if status, out := set(sachi, base64.StdEncoding.EncodeToString(jpeg)); status != 200 || out["picture"] == "" {
		t.Fatalf("a JPEG of 12000 bytes: %d %v", status, out)
	} else if res, _ := get(ravi.Token, out["picture"]); res.Header.Get("Content-Type") != "image/jpeg" {
		t.Errorf("a JPEG is served as %q", res.Header.Get("Content-Type"))
	}
	drain(ravi, sachi)

	if status, out := set(ravi, nil); status != 200 || len(out) != 0 {
		t.Errorf("taking it off = %d %v, want {}", status, out)
	}
	if got := who(t, sachi.room(), "ravi").Picture; got != nil {
		t.Errorf("after ravi took his picture off sachi sees %v", *got)
	}
	if res, _ := get(sachi.Token, hash); res.StatusCode != 404 {
		t.Errorf("a picture taken off is still served: %d", res.StatusCode)
	}
}

// The owner sees the admins' faces in Settings > Admins, with no room between them. Nobody
// else gets an admin's picture for being an admin.
func TestAdminPictures(t *testing.T) {
	w := start(t)
	ravi, mali, sam, nimal := w.person("ravi", phone, 0), w.person("mali", laptop, 0), w.person("sam", tablet, 0), w.person("nimal", phone, 0)
	for _, p := range []*person{mali, sam} {
		w.call(ravi.session, ravi.id, "admins/set", map[string]any{"username": p.Username, "role": "admin"})
	}
	webp := append([]byte("RIFF\x00\x10\x00\x00WEBPVP8 "), bytes.Repeat([]byte{9}, 3000)...)
	var out map[string]string
	if status, _ := w.post("/api/me/picture", map[string]any{"token": mali.Token, "device": mali.id, "picture": base64.StdEncoding.EncodeToString(webp)}, &out); status != 200 {
		t.Fatalf("mali setting a picture = %d", status)
	}
	hash := out["picture"]
	want := `{"admins":[{"username":"ravi","role":"owner","picture":null},{"username":"mali","role":"admin","picture":"` + hash + `"},{"username":"sam","role":"admin","picture":null}]}`
	if status, body := w.call(ravi.session, ravi.id, "admins/list", nil); status != 200 || body != want {
		t.Errorf("admins/list = %d %s, want %s", status, body, want)
	}
	for who, c := range map[string]struct {
		token string
		code  int
	}{"ravi, the owner": {ravi.Token, 200}, "sam, another admin": {sam.Token, 404}, "nimal, a member": {nimal.Token, 404}} {
		req, _ := http.NewRequest(http.MethodGet, w.url+"/api/pictures/"+hash, nil)
		req.Header.Set("Authorization", "Bearer "+c.token)
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if res.StatusCode != c.code || (c.code == 200 && !bytes.Equal(body, webp)) {
			t.Errorf("%s fetching mali's picture: %d, want %d", who, res.StatusCode, c.code)
		}
	}
}

// A lap that ends is in the member's laps at once: its row is news, as today's totals are.
func TestALapEndingSendsTheRoom(t *testing.T) {
	w := start(t)
	ravi, sachi := w.person("ravi", phone, 0), w.person("sachi", laptop, 0)
	together(t, "Laps", ravi, sachi)
	started := w.ms.Load() - lapMs
	ravi.set(sessionCells("run-1", "work", "rang", started, ravi.id))
	if got := who(t, sachi.room(), "ravi").Laps; len(got) != 1 || got[0] != [2]int64{started, started + lapMs} {
		t.Errorf("after ravi's lap rang sachi sees his laps %v", got)
	}
}

// last_at_ms grows while this moment of last week is inside one of last week's laps. That
// alone is not news: a re-tell with nothing else changed sends nothing.
func TestLastWeekMovingIsNotNews(t *testing.T) {
	w := start(t)
	ravi, sachi := w.person("ravi", phone, 0), w.person("sachi", laptop, 0)
	room, _ := together(t, "Pace", ravi, sachi)
	ravi.set(sessionCells("last-week", "work", "rang", w.ms.Load()-7*24*3600*1000-10*60000, ravi.id))
	before := sachi.room().LastAtMs
	ravi.settle()
	w.pass(time.Minute)
	ravi.ask("update", map[string]any{"room": room}).ok(t, "an update of nothing, to look again")
	sachi.still("only last week's pace moved")
	ravi.ask("update", map[string]any{"room": room, "ranked": true}).ok(t, "a real change")
	if m := sachi.room(); m.LastAtMs != before+60000 {
		t.Errorf("with a real change last_at_ms = %d, want %d: it is still sent as it is then", m.LastAtMs, before+60000)
	}
}

// The same picture again, or none when there is none, changes nothing and tells nobody. A
// real change is one of twenty a day.
func TestPictureChangesAreCounted(t *testing.T) {
	w := start(t)
	ravi, sachi := w.person("ravi", phone, 0), w.person("sachi", laptop, 0)
	together(t, "Faces", ravi, sachi)
	picture := func(n int) string {
		return base64.StdEncoding.EncodeToString(append([]byte("RIFF\x00\x10\x00\x00WEBPVP8 "), byte(n)))
	}
	set := func(p any) (int, http.Header, map[string]string) {
		var out map[string]string
		status, header := w.post("/api/me/picture", map[string]any{"token": ravi.Token, "device": ravi.id, "picture": p}, &out)
		return status, header, out
	}
	if status, _, out := set(nil); status != 200 || len(out) != 0 {
		t.Errorf("none when there is none = %d %v", status, out)
	}
	sachi.still("ravi had no picture and still has none")
	began := w.ms.Load()
	_, _, first := set(picture(0))
	drain(ravi, sachi)
	if status, _, again := set(picture(0)); status != 200 || again["picture"] != first["picture"] {
		t.Errorf("the same picture again = %d %v, want the same hash", status, again)
	}
	sachi.still("ravi sent the picture he already had")

	for n := 1; n < 20; n++ {
		w.pass(time.Minute)
		if status, _, _ := set(picture(n)); status != 200 {
			t.Fatalf("change %d = %d", n+1, status)
		}
	}
	var refused map[string]string
	status, header := w.post("/api/me/picture", map[string]any{"token": ravi.Token, "device": ravi.id, "picture": picture(99)}, &refused)
	if want := (began + 24*3600*1000 - w.ms.Load()) / 1000; status != 429 || refused["error"] != "slow_down" || header.Get("Retry-After") != itoa(want) {
		t.Errorf("a 21st change = %d %v, Retry-After %q; want 429 slow_down, %d", status, refused, header.Get("Retry-After"), want)
	}
	if status, _, _ := set(picture(19)); status != 200 {
		t.Errorf("sending the picture he has while at the limit = %d, want 200: it is no change", status)
	}
	w.pass(24 * time.Hour)
	if status, _, _ := set(nil); status != 200 {
		t.Errorf("a day on, taking it off = %d", status)
	}
}
