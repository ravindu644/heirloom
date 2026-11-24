package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"reflect"
	"regexp"
	"slices"
	"strings"
	"testing"
	"time"

	"heirloom/server/hub"
	"heirloom/server/rooms"
)

// Rooms, the way devices meet them: requests over HTTP, the room message on a socket
// and in the POST reply. contracts/protocol.md section 15.

const (
	lapMs  = 25 * 60 * 1000
	pocket = "d4e5f60718293041" // a fourth device
)

// person is an account with one device: its token, its socket and its offset from UTC.
type person struct {
	w *world
	session
	id     string
	offset int
	cursor int64
	*device
}

func (w *world) person(name, id string, offsetMin int) *person {
	w.t.Helper()
	p := &person{w: w, session: w.signUp(name, id), id: id, offset: offsetMin}
	p.connect()
	return p
}

// connect opens the socket and returns what came with the welcome: the room messages.
func (p *person) connect() []msg {
	p.w.t.Helper()
	first := hello(p.Token, p.id, 1<<40) // a cursor past the head would be sent everything; the head itself is not known here
	first["cursor"] = p.cursor
	first["utc_offset_min"] = p.offset
	p.device = p.w.dial()
	p.say(first)
	p.want("welcome")
	return p.settle()
}

type answer struct {
	status      int
	Room, Error string
	raw         string
}

// ask makes a rooms request as this person's device.
func (p *person) ask(path string, fields map[string]any) answer {
	p.w.t.Helper()
	return p.w.ask(p.Token, p.id, path, fields)
}

func (w *world) ask(token, id, path string, fields map[string]any) answer {
	w.t.Helper()
	body := map[string]any{"token": token, "device": id}
	for k, v := range fields {
		body[k] = v
	}
	res, err := http.Post(w.url+"/api/rooms/"+path, "application/json", strings.NewReader(asJSON(body)))
	if err != nil {
		w.t.Fatal(err)
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(res.Body)
	a := answer{status: res.StatusCode, raw: strings.TrimSpace(string(data))}
	if err := json.Unmarshal(data, &a); err != nil {
		w.t.Fatalf("%s answered %d with %q", path, res.StatusCode, data)
	}
	return a
}

func (a answer) ok(t *testing.T, what string) answer {
	t.Helper()
	if a.status != 200 {
		t.Fatalf("%s: %d %s", what, a.status, a.raw)
	}
	return a
}

func (a answer) refused(t *testing.T, what string, status int, code string) {
	t.Helper()
	if a.status != status || a.Error != code {
		t.Errorf("%s: %d %s, want %d %s", what, a.status, a.raw, status, code)
	}
}

// set pushes cells for these fields, each with a stamp later than every one before, over
// POST, and returns the reply. A map key is dataset, row, field.
func (p *person) set(fields map[[3]string]any) hub.SyncReply {
	p.w.t.Helper()
	var cells []json.RawMessage
	for key, value := range fields {
		at := serverTime.Add(-24*time.Hour + time.Duration(p.w.stamps.Add(1))*time.Millisecond)
		cells = append(cells, json.RawMessage(asJSON(map[string]any{"stamp": at.Format("2006-01-02T15:04:05.000Z") + "-0000-" + p.id,
			"dataset": key[0], "row": key[1], "field": key[2], "value": value})))
	}
	var reply hub.SyncReply
	status, _ := p.w.post("/api/sync", syncBody{p.Token, p.id, p.cursor, &pushBody{"b", cells}, p.offset}, &reply)
	if status != 200 || reply.Ack == nil {
		p.w.t.Fatalf("push = %d, ack %v, nack %v", status, reply.Ack, reply.Nack)
	}
	p.cursor = reply.To
	return reply
}

// The timer cell, as a device writes it.
func timerCell(state map[string]any) map[[3]string]any {
	return map[[3]string]any{{"timer", "current", "state"}: state}
}

func running(phase, run string, task any, started, plannedMs int64, setIndex int) map[string]any {
	return map[string]any{"phase": phase, "run": run, "task": task, "started": started, "paused_at": nil, "paused_ms": 0, "planned_ms": plannedMs, "set_index": setIndex}
}

var idle = map[string]any{"phase": "idle", "run": nil, "task": nil, "started": nil, "paused_at": nil, "paused_ms": 0, "planned_ms": 0, "set_index": 0}

// A session row, as the cells a device writes when a run ends.
func sessionCells(run, kind, outcome string, started int64, id string) map[[3]string]any {
	cells := map[[3]string]any{}
	for field, value := range map[string]any{"kind": kind, "task": nil, "started": started, "ended": started + lapMs,
		"planned_ms": lapMs, "paused_ms": 0, "outcome": outcome, "device": id} {
		cells[[3]string{"session", run, field}] = value
	}
	return cells
}

func setting(field string, value any) map[[3]string]any {
	return map[[3]string]any{{"settings", "current", field}: value}
}

// room waits for the next room message on this device. Cells and acks may pass meanwhile.
func (d *device) room() msg {
	d.t.Helper()
	for {
		m, err := d.read()
		if err != nil {
			d.t.Fatalf("waiting for a room message: %v", err)
		}
		if m.Type == "room" {
			return m
		}
	}
}

// settle reads everything that is on its way and returns the room messages among it.
// The server writes a room's news before any frame queued after the room changed, so
// once the answer to this ping is here, nothing older is still to come.
func (d *device) settle() (roomMessages []msg) {
	d.t.Helper()
	d.say(`{"type":"ping","t":1}`)
	for {
		m, err := d.read()
		if err != nil {
			d.t.Fatalf("settling: %v", err)
		}
		switch m.Type {
		case "pong":
			return roomMessages
		case "room":
			roomMessages = append(roomMessages, m)
		}
	}
}

// still proves no room message is on its way to this device.
func (d *device) still(why string) {
	d.t.Helper()
	if got := d.settle(); len(got) != 0 {
		d.t.Errorf("%s, and yet this device was sent %d room message(s): %s", why, len(got), got[0].raw)
	}
}

func who(t *testing.T, m msg, name string) rooms.Member {
	t.Helper()
	for _, member := range m.Members {
		if member.Name == name {
			return member
		}
	}
	t.Fatalf("no %s in %s", name, m.raw)
	return rooms.Member{}
}

func names(m msg) string {
	var out []string
	for _, member := range m.Members {
		name := member.Name
		if member.You {
			name += "(you)"
		}
		out = append(out, name)
	}
	return strings.Join(out, " ")
}

// together makes a room of these people, first to last, and lets its messages settle.
func together(t *testing.T, name string, people ...*person) (room, code string) {
	t.Helper()
	room = people[0].ask("create", map[string]any{"name": name}).ok(t, "create").Room
	code = people[0].room().Code
	for _, p := range people[1:] {
		p.ask("join", map[string]any{"code": code}).ok(t, "join")
	}
	for _, p := range people {
		p.settle()
	}
	return room, code
}

func TestRoomCreateJoinLeave(t *testing.T) {
	w := start(t)
	ravi, sachi := w.person("ravi", phone, 330), w.person("sachi", laptop, 330)

	created := ravi.ask("create", map[string]any{"name": "Sachi and me"}).ok(t, "create")
	m := ravi.room()
	if m.Room != created.Room || m.Room == "" || m.Name != "Sachi and me" || m.TargetMs != 0 || m.Ranked || m.ServerTime != serverTime.UnixMilli() {
		t.Errorf("the new room = %s", m.raw)
	}
	if !regexp.MustCompile(`^[A-HJ-NP-Z2-9]{8}$`).MatchString(m.Code) {
		t.Errorf("code %q is not 8 of A-Z 2-9 without I and O", m.Code)
	}
	if me := m.Members; len(me) != 1 || !reflect.DeepEqual(me[0], rooms.Member{ID: ravi.Account, Name: "ravi", You: true, Phase: "idle"}) {
		t.Errorf("members = %s, want only ravi, idle, with nothing counted", m.raw)
	}
	sachi.still("a room was made that sachi is not in")

	sachi.ask("join", map[string]any{"code": "ZZZZ9999"}).refused(t, "a code no room has", 404, "code")
	sachi.ask("join", map[string]any{}).refused(t, "no code", 404, "code")
	// Typed from a friend's screen: lower case, a space after it.
	joined := sachi.ask("join", map[string]any{"code": strings.ToLower(m.Code) + " "}).ok(t, "join")
	if joined.Room != created.Room || joined.raw != fmt.Sprintf(`{"room":%q}`, created.Room) {
		t.Errorf("join answered %s, want the room's id and nothing else", joined.raw)
	}
	if got := names(ravi.room()); got != "ravi(you) sachi" {
		t.Errorf("ravi sees %q, want both in joining order", got)
	}
	if got := sachi.room(); names(got) != "ravi sachi(you)" || got.Code != m.Code {
		t.Errorf("sachi sees %s, want both, herself marked, and the code any member may read", got.raw)
	}

	// Joining a room one is in already is the same answer and changes nothing.
	if again := sachi.ask("join", map[string]any{"code": m.Code}).ok(t, "join twice"); again.raw != joined.raw {
		t.Errorf("joining twice answered %s then %s", joined.raw, again.raw)
	}
	ravi.still("sachi joined a room she was already in")
	sachi.still("sachi joined a room she was already in")

	// Leaving: one last message that says gone and nothing else, then silence.
	if left := sachi.ask("leave", map[string]any{"room": created.Room}).ok(t, "leave"); left.raw != "{}" {
		t.Errorf("leave answered %s, want {}", left.raw)
	}
	if gone := sachi.room(); gone.raw != fmt.Sprintf(`{"type":"room","room":%q,"gone":true}`, created.Room)+"\n" {
		t.Errorf("after leaving sachi was sent %s, want gone and nothing else", gone.raw)
	}
	sachi.still("sachi has left")
	if got := names(ravi.room()); got != "ravi(you)" {
		t.Errorf("after sachi left ravi sees %q", got)
	}
	sachi.ask("leave", map[string]any{"room": created.Room}).refused(t, "leaving a room one is not in", 404, "room")

	// The last member leaving ends the room: its code opens nothing.
	ravi.ask("leave", map[string]any{"room": created.Room}).ok(t, "the last member leaves")
	if gone := ravi.room(); !gone.Gone || len(gone.Members) != 0 {
		t.Errorf("the last member was sent %s, want gone", gone.raw)
	}
	sachi.ask("join", map[string]any{"code": m.Code}).refused(t, "the code of a room that ended", 404, "code")
	var left int
	if err := w.db.QueryRow("select (select count(*) from room) + (select count(*) from member)").Scan(&left); err != nil || left != 0 {
		t.Errorf("%d rows of the room are still stored, %v", left, err)
	}
}

func TestRoomIsFullAtEightAndAnAccountAtFive(t *testing.T) {
	w := start(t)
	ravi := w.person("ravi", phone, 0)
	_, code := together(t, "Batch of 26", ravi)
	var eighth session
	for i := range 7 {
		eighth = w.signUp(fmt.Sprintf("friend_%d", i), laptop)
		w.ask(eighth.Token, laptop, "join", map[string]any{"code": code}).ok(t, "join")
	}
	if got := ravi.settle(); len(got) == 0 || len(got[len(got)-1].Members) != 8 {
		t.Fatalf("the room holds %d members, want 8", len(got[len(got)-1].Members))
	}
	ninth := w.signUp("one_too_many", laptop)
	w.ask(ninth.Token, laptop, "join", map[string]any{"code": code}).refused(t, "a ninth member", 409, "full")
	ravi.still("a ninth was turned away")
	// Someone already inside is not turned away from their own room.
	w.ask(eighth.Token, laptop, "join", map[string]any{"code": code}).ok(t, "a member joining a full room again")

	// Five rooms an account, whether made or joined.
	for i := range 4 {
		ravi.ask("create", map[string]any{"name": fmt.Sprint("room ", i)}).ok(t, "create")
	}
	ravi.ask("create", map[string]any{"name": "a sixth"}).refused(t, "a sixth room", 409, "full")
	other := w.person("sachi", pocket, 0)
	_, sixth := together(t, "Sachi's", other)
	ravi.ask("join", map[string]any{"code": sixth}).refused(t, "joining a sixth room", 409, "full")
	// Leaving one makes room for it.
	ravi.ask("leave", map[string]any{"room": ravi.settle()[0].Room}).ok(t, "leave")
	ravi.ask("join", map[string]any{"code": sixth}).ok(t, "joining after leaving one")
}

func TestAnyMemberMayUpdateARoom(t *testing.T) {
	w := start(t)
	ravi, sachi, nimal := w.person("ravi", phone, 0), w.person("sachi", laptop, 0), w.person("nimal", tablet, 0)
	room, _ := together(t, "Sachi and me", ravi, sachi)

	// Not the one who made it, and only one field: the others stay.
	if raw := sachi.ask("update", map[string]any{"room": room, "target_ms": 36000000}).ok(t, "update").raw; raw != "{}" {
		t.Errorf("update answered %s, want {}", raw)
	}
	for _, p := range []*person{ravi, sachi} {
		if m := p.room(); m.TargetMs != 36000000 || m.Name != "Sachi and me" || m.Ranked {
			t.Errorf("%s sees %s, want the target set and the rest as it was", p.Username, m.raw)
		}
	}
	ravi.ask("update", map[string]any{"room": room, "name": "Finals week", "ranked": true}).ok(t, "update")
	if m := sachi.room(); m.Name != "Finals week" || !m.Ranked || m.TargetMs != 36000000 {
		t.Errorf("sachi sees %s", m.raw)
	}
	ravi.room()
	// 0 is no target. Saying what is already so sends nobody anything.
	ravi.ask("update", map[string]any{"room": room, "target_ms": 0, "ranked": true}).ok(t, "update")
	if m := sachi.room(); m.TargetMs != 0 || !m.Ranked {
		t.Errorf("sachi sees %s", m.raw)
	}
	ravi.room()
	ravi.ask("update", map[string]any{"room": room, "ranked": true}).ok(t, "update")
	ravi.ask("update", map[string]any{"room": room}).ok(t, "an update of nothing")
	sachi.still("nothing about the room changed")

	for what, fields := range map[string]map[string]any{
		"an empty name":           {"room": room, "name": ""},
		"a name of 41":            {"room": room, "name": strings.Repeat("n", 41)},
		"a target below zero":     {"room": room, "target_ms": -1},
		"a target past any week":  {"room": room, "target_ms": 8*7*24*3600*1000 + 1},
		"a name that is not text": {"room": room, "name": 7},
	} {
		ravi.ask("update", fields).refused(t, what, 400, "bad_request")
	}
	nimal.ask("update", map[string]any{"room": room, "name": "Mine now"}).refused(t, "an update by someone outside", 404, "room")
	sachi.still("every one of those was refused")
	ravi.ask("create", map[string]any{}).refused(t, "a room with no name", 400, "bad_request")
	ravi.ask("create", map[string]any{"name": strings.Repeat("n", 41)}).refused(t, "a room name of 41", 400, "bad_request")
}

func TestPresenceFollowsTheTimer(t *testing.T) {
	w := start(t)
	ravi, sachi := w.person("ravi", phone, 330), w.person("sachi", laptop, 330)
	together(t, "Sachi and me", ravi, sachi)
	now := func() int64 { return w.ms.Load() }
	sees := func(what string, phase string, setIndex int, endsAt int64, paused bool) {
		t.Helper()
		got := who(t, sachi.room(), "ravi")
		ends := int64(0)
		if got.EndsAt != nil {
			ends = *got.EndsAt
		}
		if got.Phase != phase || got.SetIndex != setIndex || ends != endsAt || got.Paused != paused {
			t.Errorf("%s: sachi sees %s lap %d, ends %d, paused %v; want %s lap %d, ends %d, paused %v",
				what, got.Phase, got.SetIndex, ends, got.Paused, phase, setIndex, endsAt, paused)
		}
	}

	started := now()
	state := running("work", "run-1", nil, started, lapMs, 1)
	ravi.set(timerCell(state))
	sees("start", "work", 1, started+lapMs, false)
	if mine := who(t, ravi.room(), "ravi"); mine.Phase != "work" || !mine.You {
		t.Errorf("ravi's own devices are told too: %+v", mine)
	}

	w.pass(time.Minute)
	state["paused_at"] = now()
	ravi.set(timerCell(state))
	sees("pause", "work", 1, 0, true)

	w.pass(30 * time.Second)
	state["paused_at"], state["paused_ms"] = nil, 30000
	ravi.set(timerCell(state))
	sees("resume", "work", 1, started+30000+lapMs, false)

	// Ravi's phone goes into a pocket. The alarm is still set, so he is still focusing.
	ravi.settle()
	ravi.ws.CloseNow()
	sachi.still("ravi only lost his connection")

	stopped := map[string]any{"phase": "idle", "run": nil, "task": nil, "started": nil, "paused_at": nil, "paused_ms": 0, "planned_ms": 0, "set_index": 2}
	ravi.set(timerCell(stopped))
	sees("stop", "idle", 2, 0, false)

	// A lap that ends by time alone: nobody pushes anything when the bell goes, and the
	// room must still say idle.
	started = now()
	ravi.set(timerCell(running("short", "run-2", nil, started, 300, 2)))
	sees("a break", "short", 2, started+300, false)
	w.pass(299 * time.Millisecond)
	w.pass(time.Millisecond)
	sees("the bell, with no push", "idle", 2, 0, false)
	sachi.still("the lap is over and nothing else has happened")
}

func TestTitleIsSentOnlyWhileItsOwnerSharesIt(t *testing.T) {
	w := start(t)
	ravi, sachi := w.person("ravi", phone, 330), w.person("sachi", laptop, 330)
	together(t, "Sachi and me", ravi, sachi)
	// Everything sachi's device is ever sent, to search for the title afterwards.
	var transcript strings.Builder
	sachiSees := func() msg {
		t.Helper()
		m := sachi.room()
		transcript.WriteString(m.raw)
		return m
	}
	never := func(when string) {
		t.Helper()
		if strings.Contains(transcript.String(), "Secret") {
			t.Fatalf("%s, and the title reached sachi's device: %s", when, transcript.String())
		}
		transcript.Reset()
	}
	task := func(m msg) string {
		if got := who(t, m, "ravi").Task; got != nil {
			return *got
		}
		return "<null>"
	}

	// Sachi has a task with the very same id. It is hers and is never read for ravi's lap.
	sachi.set(map[[3]string]any{{"task", "t1", "title"}: "Sachi's own"})
	ravi.set(map[[3]string]any{{"task", "t1", "title"}: "Secret thesis", {"task", "t2", "title"}: "Secret shopping"})
	sachi.still("a title was written and no lap is running")
	state := running("work", "run-1", "t1", w.ms.Load(), lapMs, 0)
	ravi.set(timerCell(state))
	if got := task(sachiSees()); got != "<null>" {
		t.Errorf("share_task was never switched on, and the room shows %q", got)
	}
	ravi.set(map[[3]string]any{{"task", "t1", "title"}: "Secret thesis, chapter 2"})
	sachi.still("the title changed while it is not shared")
	never("before ravi shared anything")

	ravi.set(setting("share_task", true))
	if got := task(sachiSees()); got != "Secret thesis, chapter 2" {
		t.Errorf("shared: the room shows %q", got)
	}
	ravi.set(map[[3]string]any{{"task", "t1", "title"}: "Secret thesis, chapter 3"})
	if got := task(sachiSees()); got != "Secret thesis, chapter 3" {
		t.Errorf("the shared title was edited: the room shows %q", got)
	}
	ravi.set(map[[3]string]any{{"task", "t2", "title"}: "Secret shopping list"})
	sachi.still("a task the lap is not for was renamed")
	if strings.Contains(transcript.String(), "shopping") || strings.Contains(transcript.String(), "Sachi's own") {
		t.Errorf("a title of another task was sent: %s", transcript.String())
	}
	// Paused is still a lap: the title stays.
	state["paused_at"] = w.ms.Load()
	ravi.set(timerCell(state))
	if got := task(sachiSees()); got != "Secret thesis, chapter 3" {
		t.Errorf("paused: the room shows %q", got)
	}
	transcript.Reset()

	// Switched off: gone from the very next message, and from everything after.
	ravi.set(setting("share_task", false))
	if got := task(sachiSees()); got != "<null>" {
		t.Errorf("share_task was switched off, and the next message still shows %q", got)
	}
	ravi.set(map[[3]string]any{{"task", "t1", "title"}: "Secret thesis, chapter 4"})
	sachi.still("the title changed while it is not shared")
	state["paused_at"], state["paused_ms"] = nil, 1000
	ravi.set(timerCell(state))
	sachiSees()
	// The POST road gives the same room, with the same nothing in it.
	var raw json.RawMessage
	w.post("/api/sync", syncBody{sachi.Token, sachi.id, sachi.cursor, nil, sachi.offset}, &raw)
	transcript.Write(raw)
	if !strings.Contains(string(raw), `"task":null`) || !strings.Contains(string(raw), `"rooms":[{`) {
		t.Errorf("the POST reply does not carry the room: %s", raw)
	}
	for _, m := range sachi.connect() { // and so does the message after a welcome
		transcript.WriteString(m.raw)
	}
	never("after ravi stopped sharing")

	// Shared again, but on a break: a break is for no task.
	ravi.set(setting("share_task", true))
	if got := task(sachiSees()); got != "Secret thesis, chapter 4" {
		t.Errorf("shared again: the room shows %q", got)
	}
	ravi.set(timerCell(running("short", "run-2", "t1", w.ms.Load(), lapMs, 0)))
	if got := task(sachiSees()); got != "<null>" {
		t.Errorf("on a break the room shows %q", got)
	}
	if mine := who(t, look(sachi), "sachi"); mine.Task != nil {
		t.Errorf("sachi, who is idle, is shown with a task: %q", *mine.Task)
	}
}

// look asks for the one room this person is in over POST: a reading that waits on nothing.
func look(p *person) msg {
	var reply struct{ Rooms []json.RawMessage }
	p.w.post("/api/sync", syncBody{p.Token, p.id, p.cursor, nil, p.offset}, &reply)
	if len(reply.Rooms) != 1 {
		p.w.t.Fatalf("the POST reply holds %d rooms, want 1", len(reply.Rooms))
	}
	m := msg{raw: string(reply.Rooms[0])}
	if err := json.Unmarshal(reply.Rooms[0], &m); err != nil {
		p.w.t.Fatal(err)
	}
	return m
}

func TestAwayIsNotWatchedButStillCounts(t *testing.T) {
	w := start(t)
	ravi, sachi := w.person("ravi", phone, 330), w.person("sachi", laptop, 330)
	room, _ := together(t, "Sachi and me", ravi, sachi)
	now := w.ms.Load()
	ravi.set(sessionCells("run-rang", "work", "rang", now-2*lapMs, ravi.id))
	ravi.set(map[[3]string]any{{"task", "t1", "title"}: "Secret thesis", {"settings", "current", "share_task"}: true})
	ravi.set(timerCell(running("work", "run-now", "t1", now, lapMs, 3)))
	sachi.ask("cheer", map[string]any{"room": room, "to": ravi.Account, "run": "run-rang"}).ok(t, "cheer")
	before := who(t, look(sachi), "ravi")
	if before.Away || before.Phase != "work" || before.Task == nil || before.Last == nil || len(before.Last.Cheers) != 1 || before.TodayMs != lapMs {
		t.Fatalf("before hiding: %+v", before)
	}
	sachi.settle()

	ravi.set(setting("rooms_hidden", true))
	m := sachi.room()
	want := rooms.Member{ID: ravi.Account, Name: "ravi", Away: true, Phase: "idle", TodayMs: lapMs, TodayLaps: 1, WeekMs: lapMs}
	if got := who(t, m, "ravi"); !reflect.DeepEqual(got, want) {
		t.Errorf("hidden: %+v\nwant no phase, no lap number, no end, no task, no last lap, and the totals: %+v", got, want)
	}
	if strings.Contains(m.raw, "Secret") || strings.Contains(m.raw, "run-rang") || strings.Contains(m.raw, "run-now") {
		t.Errorf("a hidden member's title or run is in the message: %s", m.raw)
	}
	// What ravi does while hidden moves nothing but the totals.
	ravi.set(timerCell(idle))
	ravi.set(map[[3]string]any{{"task", "t1", "title"}: "Secret thesis 2"})
	sachi.still("a hidden member stopped a timer and renamed a task")
	ravi.set(sessionCells("run-hidden", "work", "rang", now-4*lapMs, ravi.id))
	if got := who(t, sachi.room(), "ravi"); got.TodayMs != 2*lapMs || got.Last != nil || got.Phase != "idle" {
		t.Errorf("a hidden member's lap: %+v, want it counted and not shown", got)
	}
	// Nothing of theirs can be cheered, and the answer does not say a lap is there.
	sachi.ask("cheer", map[string]any{"room": room, "to": ravi.Account, "run": "run-hidden"}).refused(t, "cheering a hidden member", 404, "run")

	ravi.set(setting("rooms_hidden", false))
	if got := who(t, sachi.room(), "ravi"); got.Away || got.Last == nil || got.Last.Run != "run-rang" {
		t.Errorf("shown again: %+v", got)
	}
}

// One room, two members, two clocks. Each one's today and week are their own.
func TestTotalsFollowEachMembersOwnDayAndWeek(t *testing.T) {
	w := start(t)
	at := func(day, hour, minute int) int64 {
		return time.Date(2026, 11, day, hour, minute, 0, 0, time.UTC).UnixMilli()
	}
	// 300 ms before midnight on Sunday the 29th in Colombo (+05:30). In New York (-05:00)
	// it is Sunday afternoon.
	w.ms.Store(at(29, 18, 30) - 300)
	ravi, sam := w.person("ravi", phone, 330), w.person("sam", laptop, -300)
	together(t, "Across the sea", ravi, sam)

	laps := func(p *person, runs map[string]int64) {
		cells := map[[3]string]any{}
		for run, started := range runs {
			for k, v := range sessionCells(run, "work", "rang", started, p.id) {
				cells[k] = v
			}
		}
		p.set(cells)
	}
	laps(ravi, map[string]int64{
		"r-today":     at(29, 3, 0),  // Sunday 08:30 in Colombo
		"r-after-12":  at(28, 19, 0), // Sunday 00:30 there, still Saturday in UTC
		"r-yesterday": at(28, 18, 0), // Saturday 23:30 there
		"r-last-week": at(22, 18, 0), // Sunday the 22nd, 23:30 there
		"r-this-week": at(22, 19, 0), // Monday the 23rd, 00:30 there: this week, though Sunday in UTC
	})
	laps(sam, map[string]int64{
		"s-today":     at(29, 6, 0),  // Sunday 01:00 in New York
		"s-yesterday": at(29, 4, 0),  // Saturday 23:00 there, though Sunday in UTC
		"s-last-week": at(23, 4, 30), // Sunday the 22nd, 23:30 there, though Monday in UTC
		"s-this-week": at(23, 5, 30), // Monday the 23rd, 00:30 there
	})
	check := func(when string, m msg, name string, todayMs int64, todayLaps int, weekMs int64, last string) {
		t.Helper()
		got := who(t, m, name)
		run := "<null>"
		if got.Last != nil {
			run = got.Last.Run
		}
		if got.TodayMs != todayMs || got.TodayLaps != todayLaps || got.WeekMs != weekMs || run != last {
			t.Errorf("%s, %s: today %d ms %d laps, week %d ms, last %s; want %d, %d, %d, %s", when, name, got.TodayMs, got.TodayLaps, got.WeekMs, run, todayMs, todayLaps, weekMs, last)
		}
	}
	ravi.settle()
	for _, viewer := range []*person{ravi, sam} {
		m := look(viewer)
		check("Sunday night in Colombo", m, "ravi", 2*lapMs, 2, 4*lapMs, "r-today")
		check("Sunday afternoon in New York", m, "sam", 1*lapMs, 1, 3*lapMs, "s-today")
	}
	sam.settle()

	// Midnight in Colombo, by time alone: ravi's Monday, and his new week, begin. Sam's
	// Sunday goes on.
	w.pass(300 * time.Millisecond)
	for _, viewer := range []*person{ravi, sam} {
		m := viewer.room()
		check("Monday 00:00 in Colombo", m, "ravi", 0, 0, 0, "<null>")
		check("still Sunday in New York", m, "sam", 1*lapMs, 1, 3*lapMs, "s-today")
	}
	sam.still("nothing happened after midnight")

	// A device of sam's says it is now in Colombo too: his day moves at once.
	sam.offset = 330
	sam.set(map[[3]string]any{{"task", "t1", "notes"}: "landed"})
	check("sam, now on Colombo time", ravi.room(), "sam", 0, 0, 0, "<null>")
}

func TestCheerOncePerPersonPerRun(t *testing.T) {
	w := start(t)
	ravi, sachi, mali, nimal := w.person("ravi", phone, 330), w.person("sachi", laptop, 330), w.person("mali", tablet, 330), w.person("nimal", pocket, 330)
	room, _ := together(t, "Three of us", ravi, sachi, mali)
	now := w.ms.Load()
	cells := sessionCells("run-rang", "work", "rang", now-3*lapMs, ravi.id)
	for k, v := range sessionCells("run-stopped", "work", "stopped", now-2*lapMs, ravi.id) {
		cells[k] = v
	}
	for k, v := range sessionCells("run-break", "short", "rang", now-lapMs, ravi.id) {
		cells[k] = v
	}
	ravi.set(cells)
	last := who(t, sachi.room(), "ravi").Last
	if last == nil || last.Run != "run-rang" || last.Ended != now-2*lapMs || last.Cheers == nil || len(last.Cheers) != 0 {
		t.Fatalf("last = %+v, want the lap that rang, with nobody cheering yet", last)
	}
	ravi.settle()
	mali.settle()

	cheer := func(p *person, to, run string) answer {
		return p.ask("cheer", map[string]any{"room": room, "to": to, "run": run})
	}
	if raw := cheer(sachi, ravi.Account, "run-rang").ok(t, "cheer").raw; raw != "{}" {
		t.Errorf("cheer answered %s, want {}", raw)
	}
	for _, p := range []*person{ravi, sachi, mali} {
		if got := who(t, p.room(), "ravi").Last.Cheers; !slices.Equal(got, []string{sachi.Account}) {
			t.Errorf("%s sees cheers %v, want sachi's", p.Username, got)
		}
	}
	// A second is the same answer, and nobody is told anything new.
	if raw := cheer(sachi, ravi.Account, "run-rang").ok(t, "cheer twice").raw; raw != "{}" {
		t.Errorf("the second cheer answered %s", raw)
	}
	ravi.still("sachi cheered the same lap twice")
	cheer(mali, ravi.Account, "run-rang").ok(t, "another member cheers")
	if got := who(t, ravi.room(), "ravi").Last.Cheers; !slices.Equal(got, []string{sachi.Account, mali.Account}) {
		t.Errorf("cheers = %v, want sachi then mali", got)
	}
	var stored int
	if err := w.db.QueryRow("select count(*) from cheer").Scan(&stored); err != nil || stored != 2 {
		t.Errorf("%d cheers stored, want one per person", stored)
	}

	cheer(nimal, ravi.Account, "run-rang").refused(t, "a cheer from outside the room", 404, "room")
	cheer(sachi, nimal.Account, "run-rang").refused(t, "a cheer for someone outside the room", 404, "run")
	cheer(sachi, "", "run-rang").refused(t, "a cheer for nobody", 404, "run")
	cheer(sachi, ravi.Account, "run-stopped").refused(t, "a cheer for a lap that was stopped", 404, "run")
	cheer(sachi, ravi.Account, "run-break").refused(t, "a cheer for a break", 404, "run")
	cheer(sachi, ravi.Account, "run-nobody-ran").refused(t, "a cheer for a run that is not there", 404, "run")
	cheer(sachi, ravi.Account, "").refused(t, "a cheer for no run", 404, "run")
	cheer(ravi, ravi.Account, "run-rang").refused(t, "a cheer for oneself", 400, "bad_request")
	for _, p := range []*person{ravi, sachi, mali, nimal} {
		p.settle()
	}

	// Mali leaves. Her cheer is hers, not the room's: it is no longer listed here.
	mali.ask("leave", map[string]any{"room": room}).ok(t, "leave")
	if got := who(t, ravi.room(), "ravi").Last.Cheers; !slices.Equal(got, []string{sachi.Account}) {
		t.Errorf("after mali left, cheers = %v", got)
	}
}

func TestRoomsComeWithTheWelcomeAndInThePOSTReply(t *testing.T) {
	w := start(t)
	ravi, sachi, mali := w.person("ravi", phone, 330), w.person("sachi", laptop, 330), w.person("mali", tablet, 330)
	first, _ := together(t, "Sachi and me", ravi, sachi)
	second, _ := together(t, "Mali and me", ravi, mali)
	sachi.set(timerCell(running("work", "run-1", nil, w.ms.Load(), lapMs, 0)))
	ravi.settle()

	// A fresh socket: the welcome names both rooms, and both follow it, in the order ravi
	// joined them.
	ravi.ws.CloseNow()
	if _, welcome := w.connect(ravi.Token, ravi.id, 0); !slices.Equal(welcome.Rooms, []string{first, second}) {
		t.Errorf("the welcome names rooms %v, want %v", welcome.Rooms, []string{first, second})
	}
	after := ravi.connect()
	if len(after) != 2 || after[0].Room != first || after[1].Room != second {
		t.Fatalf("after the welcome: %d room messages, want the two rooms in order", len(after))
	}
	if who(t, after[0], "sachi").Phase != "work" || names(after[1]) != "ravi(you) mali" {
		t.Errorf("the rooms after a welcome: %s\n%s", after[0].raw, after[1].raw)
	}
	// Mali is in one of them and is sent one.
	mali.ws.CloseNow()
	if got := mali.connect(); len(got) != 1 || got[0].Room != second {
		t.Errorf("mali was sent %d room messages after her welcome, want only her room", len(got))
	}

	// The POST reply carries the same objects.
	reply := ravi.set(map[[3]string]any{{"task", "t9", "notes"}: "nothing a room shows"})
	if len(reply.Rooms) != 2 {
		t.Fatalf("the POST reply holds %d rooms, want 2", len(reply.Rooms))
	}
	for i, m := range reply.Rooms {
		var socket rooms.Message
		if err := json.Unmarshal([]byte(after[i].raw), &socket); err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(*m, socket) {
			t.Errorf("room %d over POST: %+v\non the socket: %+v", i, *m, socket)
		}
	}
	// Someone in no room gets an empty list, not a missing one, by both roads.
	nimal := w.signUp("nimal", pocket)
	var raw json.RawMessage
	w.post("/api/sync", syncBody{nimal.Token, pocket, 0, nil, 0}, &raw)
	if !strings.Contains(string(raw), `"rooms":[]`) {
		t.Errorf("a POST reply for someone in no room: %s", raw)
	}
	if _, welcome := w.connect(nimal.Token, pocket, 0); !strings.Contains(welcome.raw, `"rooms":[]`) {
		t.Errorf("a welcome for someone in no room: %s", welcome.raw)
	}
}

// A device that was away when its account left a room never heard "gone". The next
// welcome, and every POST reply, names the rooms that are left, and it drops the rest.
func TestWelcomeNamesTheRoomsThatAreLeft(t *testing.T) {
	w := start(t)
	ravi, sachi := w.person("ravi", phone, 330), w.person("sachi", laptop, 330)
	kept, _ := together(t, "Stays", ravi, sachi)
	left, _ := together(t, "Goes", ravi, sachi)
	ended, _ := together(t, "Ravi alone", ravi)
	if _, welcome := w.connect(ravi.Token, ravi.id, 0); !slices.Equal(welcome.Rooms, []string{kept, left, ended}) {
		t.Fatalf("the welcome names %v, want all three rooms", welcome.Rooms)
	}

	// Ravi's phone is off. On his laptop (the same account) he leaves one room and ends another.
	ravi.ws.CloseNow()
	desk := w.signIn("ravi", pocket)
	w.ask(desk.Token, pocket, "leave", map[string]any{"room": left}).ok(t, "leave")
	w.ask(desk.Token, pocket, "leave", map[string]any{"room": ended}).ok(t, "leave the room he was alone in")

	// The phone comes back: no "gone" was kept for it, and the welcome says what is left.
	if _, welcome := w.connect(ravi.Token, ravi.id, 0); !slices.Equal(welcome.Rooms, []string{kept}) {
		t.Errorf("the welcome names %v, want only %v", welcome.Rooms, []string{kept})
	}
	if got := ravi.connect(); len(got) != 1 || got[0].Room != kept || got[0].Gone {
		t.Errorf("after the welcome the phone was sent %d room messages, want the one room that is left", len(got))
	}
	if reply := ravi.set(map[[3]string]any{{"task", "t1", "notes"}: "x"}); len(reply.Rooms) != 1 || reply.Rooms[0].Room != kept {
		t.Errorf("the POST reply holds %d rooms, want the one that is left", len(reply.Rooms))
	}
}

// A cheer kept while offline is sent when the device is back. If the room is no longer
// the sender's, or no longer there, the answer is "room", which tells the device to drop
// it: anything else it would send again for ever.
func TestCheerIntoARoomThatIsNoLongerOnes(t *testing.T) {
	w := start(t)
	ravi, sachi := w.person("ravi", phone, 330), w.person("sachi", laptop, 330)
	room, _ := together(t, "Sachi and me", ravi, sachi)
	ravi.set(sessionCells("run-rang", "work", "rang", w.ms.Load()-2*lapMs, ravi.id))
	late := map[string]any{"room": room, "to": ravi.Account, "run": "run-rang"}

	sachi.ask("leave", map[string]any{"room": room}).ok(t, "leave")
	sachi.ask("cheer", late).refused(t, "a cheer into a room the sender has left", 404, "room")
	ravi.ask("leave", map[string]any{"room": room}).ok(t, "the last member leaves")
	sachi.ask("cheer", late).refused(t, "a cheer into a room that has ended", 404, "room")
	ravi.ask("cheer", map[string]any{"room": room, "to": sachi.Account, "run": "run-rang"}).refused(t, "a cheer by the one who ended it", 404, "room")
	var stored int
	if err := w.db.QueryRow("select count(*) from cheer").Scan(&stored); err != nil || stored != 0 {
		t.Errorf("%d cheers were stored for a room nobody is in, %v", stored, err)
	}
}

func TestARoomsNewsGoesToItsMembersAndNobodyElse(t *testing.T) {
	w := start(t)
	ravi, sachi, mali, nimal := w.person("ravi", phone, 330), w.person("sachi", laptop, 330), w.person("mali", tablet, 330), w.person("nimal", pocket, 330)
	first, _ := together(t, "Sachi and me", ravi, sachi)
	second, _ := together(t, "Mali and me", ravi, mali)
	together(t, "Nimal alone", nimal)

	// Ravi is in both rooms: each gets its own message about him.
	ravi.set(timerCell(running("work", "run-1", nil, w.ms.Load(), lapMs, 0)))
	if m := sachi.room(); m.Room != first || who(t, m, "ravi").Phase != "work" {
		t.Errorf("sachi was sent %s", m.raw)
	}
	if m := mali.room(); m.Room != second || who(t, m, "ravi").Phase != "work" {
		t.Errorf("mali was sent %s", m.raw)
	}
	if got := ravi.settle(); len(got) != 2 || got[0].Room == got[1].Room {
		t.Errorf("ravi was sent %d room messages, want one for each of his rooms", len(got))
	}
	sachi.still("one push by ravi is one message a room")
	nimal.still("ravi shares no room with nimal")

	// Sachi shares one room with ravi and none with mali.
	sachi.set(timerCell(running("work", "run-2", nil, w.ms.Load(), lapMs, 0)))
	if m := ravi.room(); m.Room != first || who(t, m, "sachi").Phase != "work" {
		t.Errorf("ravi was sent %s", m.raw)
	}
	ravi.still("sachi is in one of ravi's rooms, not both")
	sachi.settle() // her own device is told of her own lap
	mali.still("sachi shares no room with mali")
	nimal.still("sachi shares no room with nimal")
	// Nimal's own room is his alone.
	nimal.set(timerCell(running("work", "run-3", nil, w.ms.Load(), lapMs, 0)))
	nimal.room()
	for _, p := range []*person{ravi, sachi, mali} {
		p.still("nimal is in a room of his own")
	}
}

func TestSomeoneOutsideLearnsNothing(t *testing.T) {
	w := start(t)
	ravi, sachi, nimal := w.person("ravi", phone, 330), w.person("sachi", laptop, 330), w.person("nimal", tablet, 330)
	room, code := together(t, "Sachi and me", ravi, sachi)
	ravi.set(sessionCells("run-rang", "work", "rang", w.ms.Load()-2*lapMs, ravi.id))

	// A room that is there and a room that is not are one answer, to the byte.
	for path, fields := range map[string]map[string]any{
		"leave":  {},
		"update": {"name": "Mine now", "ranked": true},
		"cheer":  {"to": ravi.Account, "run": "run-rang"},
	} {
		fields["room"] = room
		real := nimal.ask(path, fields)
		fields["room"] = "NOSUCHROOM"
		made := nimal.ask(path, fields)
		if real.status != 404 || real.raw != `{"error":"room"}` || real.raw != made.raw || real.status != made.status {
			t.Errorf("%s from outside: %d %s for the real room, %d %s for a made-up one", path, real.status, real.raw, made.status, made.raw)
		}
	}
	// The room's id is not its code.
	nimal.ask("join", map[string]any{"code": room}).refused(t, "joining with the room's id", 404, "code")
	// Every request wants a signed-in device.
	for _, path := range []string{"create", "join", "leave", "update", "cheer"} {
		fields := map[string]any{"room": room, "code": code, "name": "x", "to": ravi.Account, "run": "run-rang"}
		w.ask("NOSUCHTOKEN", tablet, path, fields).refused(t, path+" with no such token", 401, "token")
		w.ask(nimal.Token, phone, path, fields).refused(t, path+" with another device's id", 401, "token")
		w.ask(nimal.Token, "", path, fields).refused(t, path+" with no device", 400, "bad_request")
	}
	if n := names(look(ravi)); n != "ravi(you) sachi" {
		t.Errorf("after all that the room holds %q and is called something else?", n)
	}
	nimal.still("nimal is in no room")
	if strings.Contains(lookRaw(nimal), `"rooms":[{`) {
		t.Error("the POST reply of someone outside holds a room")
	}

	// Leaving stops the messages at once, after the one that says gone.
	sachi.settle()
	ravi.settle()
	sachi.ask("leave", map[string]any{"room": room}).ok(t, "leave")
	if gone := sachi.room(); !gone.Gone {
		t.Fatalf("sachi was sent %s", gone.raw)
	}
	ravi.set(timerCell(running("work", "run-2", nil, w.ms.Load(), lapMs, 0)))
	ravi.ask("update", map[string]any{"room": room, "name": "Just me"}).ok(t, "update")
	ravi.room()
	sachi.still("sachi has left the room")
	if strings.Contains(lookRaw(sachi), `"rooms":[{`) {
		t.Error("the POST reply of someone who left still holds the room")
	}
	sachi.ws.CloseNow()
	if got := sachi.connect(); len(got) != 0 {
		t.Errorf("sachi reconnected and was sent %d room messages for a room she left", len(got))
	}
}

func lookRaw(p *person) string {
	var raw json.RawMessage
	p.w.post("/api/sync", syncBody{p.Token, p.id, p.cursor, nil, p.offset}, &raw)
	return string(raw)
}

// One push that changes three things a room shows is one message, not three.
func TestOnePushIsOneMessage(t *testing.T) {
	w := start(t)
	ravi, sachi := w.person("ravi", phone, 330), w.person("sachi", laptop, 330)
	together(t, "Sachi and me", ravi, sachi)
	now := w.ms.Load()
	cells := sessionCells("run-1", "work", "rang", now-lapMs, ravi.id)
	cells[[3]string{"timer", "current", "state"}] = running("work", "run-2", "t1", now, lapMs, 1)
	cells[[3]string{"settings", "current", "share_task"}] = true
	cells[[3]string{"task", "t1", "title"}] = "Thinking in React"
	ravi.set(cells)
	got := sachi.settle()
	if len(got) != 1 {
		t.Fatalf("one push sent sachi %d room messages, want 1", len(got))
	}
	if r := who(t, got[0], "ravi"); r.Phase != "work" || r.Task == nil || *r.Task != "Thinking in React" || r.TodayLaps != 1 || r.Last == nil {
		t.Errorf("the one message does not hold all of the push: %s", got[0].raw)
	}

	// A burst while sachi is not reading: whatever she is sent, it ends on the truth, and
	// it is never more than one message a push.
	for i := range 40 {
		ravi.set(timerCell(running("work", fmt.Sprint("run-", 10+i), nil, now, int64(lapMs+i), 1)))
	}
	burst := sachi.settle()
	if len(burst) == 0 || len(burst) > 40 {
		t.Fatalf("40 pushes sent %d room messages", len(burst))
	}
	if end := who(t, burst[len(burst)-1], "ravi").EndsAt; end == nil || *end != now+lapMs+39 {
		t.Errorf("the last message of the burst is not the last state: %s", burst[len(burst)-1].raw)
	}
	t.Logf("40 pushes in a row reached the other device as %d room messages", len(burst))
}

func TestOffsetIsCheckedAndMissingIsUTC(t *testing.T) {
	w := start(t)
	ravi := w.person("ravi", phone, 330)
	for what, offset := range map[string]any{"15 hours east": 900, "13 hours west": -780, "half a minute": 0.5, "words": "+05:30"} {
		first := hello(ravi.Token, phone, 0)
		first["utc_offset_min"] = offset
		d := w.dial()
		d.say(first)
		if bye := d.want("bye"); bye.Reason != "protocol" {
			t.Errorf("a hello with an offset of %s: bye %q, want protocol", what, bye.Reason)
		}
		var e session
		if status, _ := w.post("/api/sync", map[string]any{"token": ravi.Token, "device": phone, "cursor": 0, "utc_offset_min": offset}, &e); status != 400 || e.Error != "bad_request" {
			t.Errorf("a sync with an offset of %s: %d %q, want 400 bad_request", what, status, e.Error)
		}
	}
	stored := func() (offset int) {
		if err := w.db.QueryRow("select utc_offset_min from account where username = 'ravi'").Scan(&offset); err != nil {
			t.Fatal(err)
		}
		return offset
	}
	if stored() != 330 {
		t.Fatalf("stored offset = %d, want the 330 of ravi's hello: the refused ones must not be kept", stored())
	}
	for _, edge := range []int{-720, 840} {
		w.post("/api/sync", map[string]any{"token": ravi.Token, "device": phone, "cursor": 0, "utc_offset_min": edge}, nil)
		if stored() != edge {
			t.Errorf("after a sync at %d the stored offset is %d: the latest one is kept", edge, stored())
		}
	}
	// A device that does not say is on UTC.
	w.connect(ravi.Token, phone, 0)
	if stored() != 0 {
		t.Errorf("after a hello with no offset the stored offset is %d, want 0", stored())
	}
}

// A whole evening of a room, with the log open: nothing of a cell, a title or a room is
// written to it, and in a run where nothing breaks, nothing is written at all.
func TestNothingOfARoomIsLogged(t *testing.T) {
	var written bytes.Buffer
	stderr := log.Writer()
	log.SetOutput(&written)
	defer log.SetOutput(stderr)

	w := start(t)
	ravi, sachi, nimal := w.person("ravi", phone, 330), w.person("sachi", laptop, 330), w.person("nimal", tablet, 330)
	room, code := together(t, "Whispers", ravi, sachi)
	now := w.ms.Load()
	ravi.set(map[[3]string]any{{"task", "t1", "title"}: "Secret thesis", {"settings", "current", "share_task"}: true})
	ravi.set(timerCell(running("work", "run-now", "t1", now, lapMs, 0)))
	ravi.set(sessionCells("run-rang", "work", "rang", now-2*lapMs, ravi.id))
	sachi.ask("cheer", map[string]any{"room": room, "to": ravi.Account, "run": "run-rang"}).ok(t, "cheer")
	sachi.ask("update", map[string]any{"room": room, "name": "Whispers, louder"}).ok(t, "update")
	nimal.ask("join", map[string]any{"code": "WRONG234"})
	nimal.ask("cheer", map[string]any{"room": room, "to": ravi.Account, "run": "run-rang"})
	nimal.ask("join", map[string]any{"code": code}).ok(t, "join")
	ravi.set(setting("rooms_hidden", true))
	sachi.ask("leave", map[string]any{"room": room}).ok(t, "leave")
	for _, p := range []*person{ravi, sachi, nimal} {
		p.settle()
	}

	for _, secret := range []string{"Secret", "Whispers", code, room, "run-rang", "run-now", ravi.Account, ravi.Token, "ravi", "share_task"} {
		if strings.Contains(written.String(), secret) {
			t.Errorf("the log holds %q: %s", secret, written.String())
		}
	}
	if written.Len() != 0 {
		t.Errorf("a run where nothing broke wrote to the log: %s", written.String())
	}
}
