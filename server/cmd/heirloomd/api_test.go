package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"testing/fstest"
	"time"

	"github.com/coder/websocket"

	"heirloom/server/hub"
	"heirloom/server/push"
	"heirloom/server/rooms"
	"heirloom/server/store"
	"heirloom/server/sync"
	"heirloom/server/web"
)

// These tests talk to the whole server the way a device does: HTTP for accounts and
// POST /api/sync, a real WebSocket for the rest. Only the clock is ours.

const (
	phone    = "a1b2c3d4e5f60718"
	laptop   = "b2c3d4e5f6071829"
	tablet   = "c3d4e5f607182930"
	password = "correct horse battery"
	patience = 5 * time.Second
)

// Stamps in these tests are around 04:30 the day before, so none is ahead of the server.
var serverTime = time.Date(2026, 11, 25, 4, 30, 0, 0, time.UTC)

type world struct {
	t   *testing.T
	url string
	dir string
	db  *sql.DB
	hub *hub.Hub
	ms  atomic.Int64
	// Counts the cells the rooms tests write, so each gets a later stamp than the last.
	stamps atomic.Int64
	// Web Push: the server's bells, and the stand-in for the push services they call.
	bells   *push.Service
	gateway *gateway
}

func start(t *testing.T) *world {
	t.Helper()
	w := &world{t: t, dir: t.TempDir()}
	w.ms.Store(serverTime.UnixMilli())
	db, err := store.Open(w.dir)
	if err != nil {
		t.Fatal(err)
	}
	app, err := web.Handler(fstest.MapFS{"index.html": {Data: []byte("<!doctype html><title>heirloom</title>")}})
	if err != nil {
		t.Fatal(err)
	}
	w.gateway = newGateway(t)
	w.bells, err = push.New(db, sync.New(db, w.now), w.now, w.gateway.Client(), contact)
	if err != nil {
		t.Fatal(err)
	}
	api, h := newAPI(db, w.now, "test", app, w.bells)
	// Behind the same bound on connections as the real listener, so every test here
	// also says the bound is not in the way of ordinary use.
	srv := httptest.NewUnstartedServer(api)
	srv.Listener = limit(srv.Listener, maxConns)
	srv.Start()
	t.Cleanup(func() { h.Close(); w.bells.Close(); srv.Close(); w.gateway.Close(); db.Close() })
	w.url, w.db, w.hub = srv.URL, db, h
	return w
}

func (w *world) pass(d time.Duration) { w.ms.Add(d.Milliseconds()) }

func (w *world) now() time.Time { return time.UnixMilli(w.ms.Load()) }

// asJSON writes what a device would send: a string goes as it is, anything else as JSON
// with < > & left alone, the way JSON.stringify leaves them.
func asJSON(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	var b bytes.Buffer
	e := json.NewEncoder(&b)
	e.SetEscapeHTML(false)
	if err := e.Encode(v); err != nil {
		panic(err)
	}
	return b.String()
}

// post sends body (a string goes as it is, anything else as JSON) and decodes the answer.
func (w *world) post(path string, body, out any) (int, http.Header) {
	w.t.Helper()
	res, err := http.Post(w.url+path, "application/json", strings.NewReader(asJSON(body)))
	if err != nil {
		w.t.Fatal(err)
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(res.Body)
	if out != nil {
		if err := json.Unmarshal(data, out); err != nil {
			w.t.Fatalf("%s answered %d with %q, which is not JSON", path, res.StatusCode, data)
		}
	}
	return res.StatusCode, res.Header
}

type session struct{ Token, Account, Username, Error string }

type creds map[string]string

// signUp makes an invite the way the owner would and registers with it.
func (w *world) signUp(username, device string) session {
	w.t.Helper()
	code, err := newInvite(w.dir, w.now)
	if err != nil {
		w.t.Fatal(err)
	}
	var s session
	if status, _ := w.post("/api/register", creds{"invite": code, "username": username, "password": password, "device": device}, &s); status != 200 {
		w.t.Fatalf("register %s = %d %s", username, status, s.Error)
	}
	return s
}

func (w *world) signIn(username, device string) session {
	w.t.Helper()
	var s session
	if status, _ := w.post("/api/login", creds{"username": username, "password": password, "device": device}, &s); status != 200 {
		w.t.Fatalf("login %s = %d %s", username, status, s.Error)
	}
	return s
}

type syncBody struct {
	Token  string    `json:"token"`
	Device string    `json:"device"`
	Cursor int64     `json:"cursor"`
	Push   *pushBody `json:"push,omitempty"`
	Offset int       `json:"utc_offset_min,omitempty"`
}

type pushBody struct {
	Batch string            `json:"batch"`
	Cells []json.RawMessage `json:"cells"`
}

func (w *world) sync(token, device string, cursor int64, push *pushBody) hub.SyncReply {
	w.t.Helper()
	var reply hub.SyncReply
	if status, _ := w.post("/api/sync", syncBody{token, device, cursor, push, 0}, &reply); status != 200 {
		w.t.Fatalf("sync = %d", status)
	}
	return reply
}

// msg is any frame the server sends.
type msg struct {
	Type       string
	Batch      string
	Reason     string
	From       int64
	To         int64
	Cursor     int64
	Head       int64
	ServerTime int64 `json:"server_time"`
	T          json.RawMessage
	Cells      []sync.Cell
	// A room message.
	Room     string
	Name     string
	Code     string
	TargetMs int64 `json:"target_ms"`
	Ranked   bool
	Gone     bool
	Members  []rooms.Member
	Rooms    []string // in a welcome
	Role     string   // in a welcome, and the whole of a role message
	raw      string
}

type device struct {
	t  *testing.T
	ws *websocket.Conn
}

func (w *world) dial() *device {
	w.t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), patience)
	defer cancel()
	ws, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(w.url, "http")+"/api/ws", nil)
	if err != nil {
		w.t.Fatal(err)
	}
	ws.SetReadLimit(16 << 20)
	w.t.Cleanup(func() { ws.CloseNow() })
	return &device{w.t, ws}
}

func hello(token, id string, cursor int64) map[string]any {
	return map[string]any{"type": "hello", "token": token, "device": id, "cursor": cursor, "client_time": serverTime.UnixMilli()}
}

// connect says hello and returns the device with the server's welcome.
func (w *world) connect(token, id string, cursor int64) (*device, msg) {
	w.t.Helper()
	d := w.dial()
	d.say(hello(token, id, cursor))
	return d, d.want("welcome")
}

func (d *device) say(v any) {
	d.t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), patience)
	defer cancel()
	if err := d.ws.Write(ctx, websocket.MessageText, []byte(asJSON(v))); err != nil {
		d.t.Fatal(err)
	}
}

func (d *device) read() (msg, error) {
	ctx, cancel := context.WithTimeout(context.Background(), patience)
	defer cancel()
	_, data, err := d.ws.Read(ctx)
	if err != nil {
		return msg{}, err
	}
	m := msg{raw: string(data)}
	return m, json.Unmarshal(data, &m)
}

func (d *device) want(typ string) msg {
	d.t.Helper()
	m, err := d.read()
	if err != nil {
		d.t.Fatalf("waiting for %s: %v", typ, err)
	}
	if m.Type != typ {
		d.t.Fatalf("got %+v, want a %s", m, typ)
	}
	return m
}

// quiet proves nothing is on its way to this device. The server writes to a connection in
// order, so if the answer to our ping is the very next frame, nothing was queued before it.
func (d *device) quiet() msg {
	d.t.Helper()
	d.say(`{"type":"ping","t":7}`)
	return d.want("pong")
}

// gone proves the server closed the socket.
func (d *device) gone() {
	d.t.Helper()
	if m, err := d.read(); err == nil {
		d.t.Fatalf("got %+v, want the socket closed", m)
	} else if websocket.CloseStatus(err) == -1 {
		d.t.Fatalf("the socket ended with %v, want a close from the server", err)
	}
}

func (d *device) push(batch string, cells ...json.RawMessage) {
	d.t.Helper()
	d.say(map[string]any{"type": "push", "batch": batch, "cells": cells})
}

func stamp(second int, device string) string {
	return fmt.Sprintf("2026-11-24T04:30:%02d.000Z-0000-%s", second, device)
}

func cell(stamp, dataset, row, field, value string) json.RawMessage {
	return json.RawMessage(fmt.Sprintf(`{"stamp":%q,"dataset":%q,"row":%q,"field":%q,"value":%s}`, stamp, dataset, row, field, value))
}

func values(cells []sync.Cell) string {
	var out []string
	for _, c := range cells {
		out = append(out, string(c.Value))
	}
	return strings.Join(out, " ")
}

func TestPushReachesTheOtherDevicesAndNotTheSender(t *testing.T) {
	w := start(t)
	ravi := w.signUp("ravi", phone)
	a, welcome := w.connect(ravi.Token, phone, 0)
	if welcome.Head != 0 || welcome.ServerTime != serverTime.UnixMilli() {
		t.Errorf("welcome = %+v, want head 0 at the server's time", welcome)
	}
	b, _ := w.connect(w.signIn("ravi", laptop).Token, laptop, 0)
	c, _ := w.connect(w.signIn("ravi", tablet).Token, tablet, 0)

	a.push("k1", cell(stamp(1, phone), "task", "t1", "title", `"Pointers"`), cell(stamp(2, phone), "task", "t1", "done", `false`))
	if ack := a.want("ack"); ack.Batch != "k1" || ack.From != 0 || ack.Cursor != 2 {
		t.Errorf("ack = %+v, want batch k1 from 0 cursor 2", ack)
	}
	for _, other := range []*device{b, c} {
		if live := other.want("cells"); live.From != 0 || live.To != 2 || values(live.Cells) != `"Pointers" false` {
			t.Errorf("live cells = %+v, want both cells as 0 to 2", live)
		}
	}
	a.quiet() // the sender does not get its own push back

	// The laptop answers. One of its cells loses to the phone's and is not passed on.
	b.push("k2", cell(stamp(0, laptop), "task", "t1", "title", `"older"`), cell(stamp(3, laptop), "task", "t2", "title", `"Arrays"`))
	if ack := b.want("ack"); ack.From != 2 || ack.Cursor != 3 {
		t.Errorf("ack = %+v, want from 2 cursor 3", ack)
	}
	for _, other := range []*device{a, c} {
		if live := other.want("cells"); live.From != 2 || live.To != 3 || values(live.Cells) != `"Arrays"` {
			t.Errorf("live cells = %+v, want only the cell that won, as 2 to 3", live)
		}
	}
	// A batch where nothing wins is acked and sent to nobody.
	b.push("k2", cell(stamp(0, laptop), "task", "t1", "title", `"older"`), cell(stamp(3, laptop), "task", "t2", "title", `"Arrays"`))
	if ack := b.want("ack"); ack.From != 3 || ack.Cursor != 3 {
		t.Errorf("ack of a batch sent twice = %+v, want from 3 cursor 3", ack)
	}
	a.quiet()
	c.quiet()
}

func TestPingIsAnsweredWithServerTime(t *testing.T) {
	w := start(t)
	d, _ := w.connect(w.signUp("ravi", phone).Token, phone, 0)
	w.pass(140 * time.Millisecond)
	d.say(`{"type":"ping","t":1795494625000}`)
	if pong := d.want("pong"); string(pong.T) != "1795494625000" || pong.ServerTime != serverTime.UnixMilli()+140 {
		t.Errorf("pong = %+v, want t echoed and the server's time", pong)
	}
	// A type this build does not know is ignored, not punished.
	d.say(`{"type":"cheer","room":"r1"}`)
	d.quiet()
}

func TestCatchUpPagesAt500ThenGoesLive(t *testing.T) {
	w := start(t)
	ravi := w.signUp("ravi", phone)
	a, _ := w.connect(ravi.Token, phone, 0)
	for batch := range 3 {
		cells := make([]json.RawMessage, 400)
		for i := range cells {
			cells[i] = cell(stamp(1, phone), "task", fmt.Sprintf("t%d-%d", batch, i), "title", `1`)
		}
		a.push("fill", cells...)
		a.want("ack")
	}

	b, welcome := w.connect(w.signIn("ravi", laptop).Token, laptop, 0)
	if welcome.Head != 1200 {
		t.Fatalf("welcome head = %d, want 1200", welcome.Head)
	}
	for _, want := range [][2]int64{{0, 500}, {500, 1000}, {1000, 1200}} {
		page := b.want("cells")
		if page.From != want[0] || page.To != want[1] || int64(len(page.Cells)) != want[1]-want[0] {
			t.Fatalf("page = %d to %d with %d cells, want %d to %d", page.From, page.To, len(page.Cells), want[0], want[1])
		}
	}
	b.quiet()
	// Caught up, so the next push arrives live and carries on from the same number.
	a.push("more", cell(stamp(2, phone), "task", "new", "title", `"live"`))
	if live := b.want("cells"); live.From != 1200 || live.To != 1201 || values(live.Cells) != `"live"` {
		t.Errorf("live after catch-up = %+v, want 1200 to 1201", live)
	}

	// A device that was away picks up from its cursor, not from the start.
	c, _ := w.connect(ravi.Token, phone, 1000)
	if page := c.want("cells"); page.From != 1000 || page.To != 1201 || len(page.Cells) != 201 {
		t.Errorf("from cursor 1000: %d to %d with %d cells, want 1000 to 1201 with 201", page.From, page.To, len(page.Cells))
	}
	// A cursor past the head (the server's data was restored from an older copy) gets everything.
	d, _ := w.connect(ravi.Token, phone, 99999)
	if page := d.want("cells"); page.From != 0 || page.To != 500 {
		t.Errorf("from a cursor past the head: %d to %d, want a fresh start at 0 to 500", page.From, page.To)
	}
}

// The same script down both roads: what POST /api/sync answers must be what a socket says.
func TestPostSyncGivesWhatTheSocketGives(t *testing.T) {
	w := start(t)
	ravi := w.signUp("ravi", phone)
	lap := w.signIn("ravi", laptop)
	live, _ := w.connect(lap.Token, laptop, 0)

	batch := &pushBody{"k1", []json.RawMessage{
		cell(stamp(1, phone), "task", "t1", "title", `"<Pointers & arrays>"`),
		cell(stamp(2, phone), "mood", "2026-11-24", "level", `{"big":12345678901234567890123}`),
	}}
	reply := w.sync(ravi.Token, phone, 0, batch)
	if reply.Ack == nil || reply.Nack != nil || *reply.Ack != (hub.Ack{Batch: "k1", From: 0, Cursor: 2}) {
		t.Fatalf("ack = %+v nack = %+v, want an ack of k1 from 0 to 2", reply.Ack, reply.Nack)
	}
	if reply.Head != 2 || reply.From != 0 || reply.To != 2 || reply.ServerTime != serverTime.UnixMilli() {
		t.Errorf("reply = %+v, want head 2, 0 to 2, at the server's time", reply)
	}
	// A push that came by POST still reaches the account's sockets live.
	pushed := live.want("cells")
	if pushed.From != 0 || pushed.To != 2 || !reflect.DeepEqual(pushed.Cells, reply.Cells) {
		t.Errorf("the socket got %+v, the POST reply holds %+v", pushed.Cells, reply.Cells)
	}
	// And a fresh socket is sent the same page the POST got.
	fresh, welcome := w.connect(ravi.Token, phone, 0)
	page := fresh.want("cells")
	if welcome.Head != reply.Head || page.From != reply.From || page.To != reply.To || !reflect.DeepEqual(page.Cells, reply.Cells) {
		t.Errorf("socket: head %d, %d to %d, %+v\npost: head %d, %d to %d, %+v", welcome.Head, page.From, page.To, page.Cells, reply.Head, reply.From, reply.To, reply.Cells)
	}
	if got := values(reply.Cells); got != `"<Pointers & arrays>" {"big":12345678901234567890123}` {
		t.Errorf("values came back as %s", got)
	}

	// The same push on a socket gets the same ack, word for word.
	fresh.push("k1", batch.Cells...)
	again := w.sync(ravi.Token, phone, 2, batch)
	if ack := fresh.want("ack"); ack.Batch != again.Ack.Batch || ack.From != again.Ack.From || ack.Cursor != again.Ack.Cursor || ack.From != 2 || ack.Cursor != 2 {
		t.Errorf("socket ack %+v, POST ack %+v, want both from 2 cursor 2", ack, again.Ack)
	}
	if again.Cells == nil || len(again.Cells) != 0 || again.To != 2 {
		t.Errorf("nothing new: cells %v to %d, want [] and 2", again.Cells, again.To)
	}

	// Refusals too: same reason, same server time, nothing stored.
	future := cell("2026-11-25T04:35:00.001Z-0000-"+phone, "task", "t9", "title", `"too early"`)
	for reason, bad := range map[string]json.RawMessage{"clock": future, "invalid": cell(stamp(3, phone), "task", "t 9", "title", `1`)} {
		good := cell(stamp(3, phone), "task", "t8", "title", `"in a bad batch"`)
		refused := w.sync(ravi.Token, phone, 2, &pushBody{"k2", []json.RawMessage{good, bad}})
		fresh.push("k2", good, bad)
		nack := fresh.want("nack")
		if refused.Nack == nil || refused.Ack != nil || *refused.Nack != (hub.Nack{Batch: "k2", Reason: reason, ServerTime: serverTime.UnixMilli()}) {
			t.Errorf("POST: ack %+v nack %+v, want a %s nack", refused.Ack, refused.Nack, reason)
		}
		if nack.Batch != "k2" || nack.Reason != reason || nack.ServerTime != serverTime.UnixMilli() {
			t.Errorf("socket nack = %+v, want %s", nack, reason)
		}
		if refused.Head != 2 {
			t.Errorf("after a %s nack the head is %d, want 2: nothing may be stored", reason, refused.Head)
		}
	}
	live.quiet()

	// No push at all is a plain pull.
	if pull := w.sync(lap.Token, laptop, 1, nil); pull.Ack != nil || pull.Nack != nil || pull.From != 1 || pull.To != 2 || len(pull.Cells) != 1 {
		t.Errorf("pull = %+v, want one cell, 1 to 2, no ack", pull)
	}
}

func TestPostSyncPagesAndRefusesBadRequests(t *testing.T) {
	w := start(t)
	ravi := w.signUp("ravi", phone)
	for batch := range 3 {
		cells := make([]json.RawMessage, 400)
		for i := range cells {
			cells[i] = cell(stamp(1, phone), "task", fmt.Sprintf("t%d-%d", batch, i), "title", `1`)
		}
		w.sync(ravi.Token, phone, 0, &pushBody{"fill", cells})
	}
	// The device asks again until `to` equals `head`.
	var pages []int
	for cursor := int64(0); ; {
		reply := w.sync(ravi.Token, phone, cursor, nil)
		if reply.From != cursor || reply.Head != 1200 {
			t.Fatalf("reply = from %d head %d, want from %d head 1200", reply.From, reply.Head, cursor)
		}
		pages, cursor = append(pages, len(reply.Cells)), reply.To
		if reply.To == reply.Head {
			break
		}
	}
	if fmt.Sprint(pages) != "[500 500 200]" {
		t.Errorf("pages = %v, want 500, 500, 200", pages)
	}

	var e session
	for what, body := range map[string]any{
		"a signed out token": syncBody{"NOSUCHTOKEN", phone, 0, nil, 0},
		"another device":     syncBody{ravi.Token, laptop, 0, nil, 0},
	} {
		if status, _ := w.post("/api/sync", body, &e); status != 401 || e.Error != "token" {
			t.Errorf("%s: %d %s, want 401 token", what, status, e.Error)
		}
	}
	for what, body := range map[string]any{
		"no cursor":           creds{"token": ravi.Token, "device": phone},
		"a cursor below zero": syncBody{ravi.Token, phone, -1, nil, 0},
		"no device":           syncBody{ravi.Token, "", 0, nil, 0},
		"not JSON":            `{"token":`,
		"a body over 1 MB":    `{"token":"` + strings.Repeat("x", 1<<20) + `"}`,
	} {
		if status, _ := w.post("/api/sync", body, &e); status != 400 || e.Error != "bad_request" {
			t.Errorf("%s: %d %s, want 400 bad_request", what, status, e.Error)
		}
	}
}

func TestTwoAccountsNeverSeeEachOther(t *testing.T) {
	w := start(t)
	ravi, sam := w.signUp("ravi", phone), w.signUp("sam", laptop)
	if ravi.Account == sam.Account || ravi.Account == "" {
		t.Fatalf("account ids %q and %q", ravi.Account, sam.Account)
	}
	r, _ := w.connect(ravi.Token, phone, 0)
	s, _ := w.connect(sam.Token, laptop, 0)

	// Sam's device is live while Ravi pushes, by socket and by POST. Sam hears nothing.
	r.push("k1", cell(stamp(5, phone), "settings", "current", "theme", `"dark"`))
	r.want("ack")
	w.sync(ravi.Token, phone, 1, &pushBody{"k2", []json.RawMessage{cell(stamp(6, phone), "task", "t1", "title", `"Ravi's"`)}})
	r.want("cells") // a push by POST reaches the account's own sockets, this one included
	s.quiet()

	// Sam writes the same field with an older stamp. In Sam's account it is the newest.
	s.push("k1", cell(stamp(1, laptop), "settings", "current", "theme", `"light"`))
	if ack := s.want("ack"); ack.From != 0 || ack.Cursor != 1 {
		t.Errorf("Sam's ack = %+v, want from 0 cursor 1: numbers are per account", ack)
	}
	r.quiet()

	for name, c := range map[string]struct {
		session
		device, want string
		head         int64
	}{"ravi": {ravi, phone, `"dark" "Ravi's"`, 2}, "sam": {sam, laptop, `"light"`, 1}} {
		pull := w.sync(c.Token, c.device, 0, nil)
		if values(pull.Cells) != c.want || pull.Head != c.head {
			t.Errorf("%s pulls %s head %d, want %s head %d", name, values(pull.Cells), pull.Head, c.want, c.head)
		}
		fresh, welcome := w.connect(c.Token, c.device, 0)
		if page := fresh.want("cells"); values(page.Cells) != c.want || welcome.Head != c.head {
			t.Errorf("%s catches up with %s head %d, want %s head %d", name, values(page.Cells), welcome.Head, c.want, c.head)
		}
	}
	// One account's token is nothing with the other's device id.
	var e session
	if status, _ := w.post("/api/sync", syncBody{ravi.Token, laptop, 0, nil, 0}, &e); status != 401 {
		t.Errorf("Ravi's token from Sam's device = %d, want 401", status)
	}
}

func TestAccountsOverHTTP(t *testing.T) {
	w := start(t)
	code, err := newInvite(w.dir, w.now)
	if err != nil {
		t.Fatal(err)
	}
	var s session
	status, _ := w.post("/api/register", creds{"invite": code, "username": "Ravi", "password": password, "device": phone}, &s)
	if status != 200 || s.Username != "ravi" || s.Token == "" || s.Account == "" {
		t.Fatalf("register = %d %+v", status, s)
	}
	second, _ := newInvite(w.dir, w.now)
	for what, c := range map[string]struct {
		path   string
		body   any
		status int
		code   string
	}{
		"the invite again":        {"/api/register", creds{"invite": code, "username": "sam", "password": password, "device": laptop}, 403, "invite"},
		"an invite nobody made":   {"/api/register", creds{"invite": "NOSUCHCODE", "username": "sam", "password": password, "device": laptop}, 403, "invite"},
		"a taken name":            {"/api/register", creds{"invite": second, "username": "ravi", "password": password, "device": laptop}, 409, "taken"},
		"a short password":        {"/api/register", creds{"invite": second, "username": "sam", "password": "short", "device": laptop}, 400, "bad_request"},
		"a missing field":         {"/api/register", creds{"invite": second, "username": "sam", "password": password}, 400, "bad_request"},
		"a field of another type": {"/api/register", `{"invite":1,"username":"sam","password":"` + password + `","device":"` + laptop + `"}`, 400, "bad_request"},
		"not JSON":                {"/api/login", `username=ravi`, 400, "bad_request"},
		"a body over 4 KB":        {"/api/login", creds{"username": "ravi", "password": strings.Repeat("p", 5000), "device": phone}, 400, "bad_request"},
		"a wrong password":        {"/api/login", creds{"username": "ravi", "password": "not the password", "device": phone}, 401, "credentials"},
		"a name nobody has":       {"/api/login", creds{"username": "nobody", "password": password, "device": phone}, 401, "credentials"},
		"a token nobody has":      {"/api/logout", creds{"token": "NOSUCHTOKEN"}, 401, "token"},
	} {
		var e session
		if status, _ := w.post(c.path, c.body, &e); status != c.status || e.Error != c.code {
			t.Errorf("%s: %d %q, want %d %q", what, status, e.Error, c.status, c.code)
		}
	}
	// The refused registrations above did not spend the second invite.
	if status, _ := w.post("/api/register", creds{"invite": second, "username": "sam", "password": password, "device": laptop}, &s); status != 200 {
		t.Errorf("register with the invite that was only ever refused = %d", status)
	}
	login := w.signIn("ravi", laptop)
	if login.Account == "" || login.Username != "ravi" || login.Token == "" {
		t.Errorf("login = %+v", login)
	}
}

func TestSixthSignInGets429(t *testing.T) {
	w := start(t)
	w.signUp("ravi", phone)
	wrong := creds{"username": "ravi", "password": "not the password", "device": phone}
	right := creds{"username": "ravi", "password": password, "device": phone}
	var e session
	// One failure above, in TestAccountsOverHTTP's world, would not count here: each test has its own server.
	for i := range 5 {
		if status, _ := w.post("/api/login", wrong, &e); status != 401 {
			t.Fatalf("failure %d = %d, want 401", i+1, status)
		}
	}
	w.pass(time.Minute)
	status, header := w.post("/api/login", right, &e)
	if status != 429 || e.Error != "slow_down" || header.Get("Retry-After") != "840" {
		t.Errorf("sixth sign-in, right password = %d %q Retry-After %q; want 429 slow_down 840", status, e.Error, header.Get("Retry-After"))
	}
	if header.Get("Access-Control-Expose-Headers") != "Retry-After" {
		t.Error("a browser on another origin could not read Retry-After")
	}
	w.pass(14 * time.Minute)
	if status, _ := w.post("/api/login", right, &e); status != 200 {
		t.Errorf("after the 15 minutes = %d, want 200", status)
	}
}

func TestLogoutEndsTheTokenOnHTTPAndOnAnOpenSocket(t *testing.T) {
	w := start(t)
	ravi := w.signUp("ravi", phone)
	lap := w.signIn("ravi", laptop)
	a, _ := w.connect(ravi.Token, phone, 0)
	second, _ := w.connect(ravi.Token, phone, 0) // the same token open twice
	b, _ := w.connect(lap.Token, laptop, 0)

	var body map[string]any
	if status, _ := w.post("/api/logout", creds{"token": ravi.Token}, &body); status != 200 || len(body) != 0 {
		t.Fatalf("logout = %d %v, want 200 {}", status, body)
	}
	for _, d := range []*device{a, second} {
		if bye := d.want("bye"); bye.Reason != "token" {
			t.Errorf("bye = %+v, want reason token", bye)
		}
		d.gone()
	}
	b.quiet() // the laptop's own token is untouched

	var e session
	if status, _ := w.post("/api/sync", syncBody{ravi.Token, phone, 0, nil, 0}, &e); status != 401 || e.Error != "token" {
		t.Errorf("sync with the signed out token = %d %q, want 401 token", status, e.Error)
	}
	if status, _ := w.post("/api/logout", creds{"token": ravi.Token}, &e); status != 401 || e.Error != "token" {
		t.Errorf("signing out twice = %d %q, want 401 token", status, e.Error)
	}
	again := w.dial()
	again.say(hello(ravi.Token, phone, 0))
	if bye := again.want("bye"); bye.Reason != "token" {
		t.Errorf("hello with the signed out token: %+v, want bye token", bye)
	}
	again.gone()
}

func TestSigningInAgainCutsTheOldTokensSocket(t *testing.T) {
	w := start(t)
	old := w.signUp("ravi", phone)
	d, _ := w.connect(old.Token, phone, 0)
	fresh := w.signIn("ravi", phone)
	if bye := d.want("bye"); bye.Reason != "token" {
		t.Errorf("bye = %+v, want reason token", bye)
	}
	d.gone()
	if _, welcome := w.connect(fresh.Token, phone, 0); welcome.Type != "welcome" {
		t.Error("the new token was not welcomed")
	}
}

func TestBadHelloGetsBye(t *testing.T) {
	w := start(t)
	ravi := w.signUp("ravi", phone)
	for what, c := range map[string]struct {
		first  any
		reason string
	}{
		"a token nobody has":        {hello("NOSUCHTOKEN", phone, 0), "token"},
		"no token":                  {hello("", phone, 0), "token"},
		"another device's token":    {hello(ravi.Token, laptop, 0), "token"},
		"a push before hello":       {map[string]any{"type": "push", "batch": "k", "cells": []any{}}, "protocol"},
		"a hello without a cursor":  {creds{"type": "hello", "token": ravi.Token, "device": phone}, "protocol"},
		"a hello with a bad device": {hello(ravi.Token, "my phone", 0), "protocol"},
		"a hello with cursor -1":    {hello(ravi.Token, phone, -1), "protocol"},
		"a frame that is not JSON":  {`hello`, "protocol"},
		// Nothing is known about the sender yet, so a hello gets 4 KB and no more.
		"a hello of 5 KB":         {hello(strings.Repeat("x", 5000), phone, 0), "protocol"},
		"a first frame over 1 MB": {`{"type":"hello","token":"` + strings.Repeat("x", 1<<20) + `"}`, "protocol"},
	} {
		d := w.dial()
		d.say(c.first)
		if bye := d.want("bye"); bye.Reason != c.reason {
			t.Errorf("%s: bye %q, want %q", what, bye.Reason, c.reason)
		}
		d.gone()
	}

	// After a good hello the same limits hold: a frame over 1 MB ends the socket with a reason.
	d, _ := w.connect(ravi.Token, phone, 0)
	d.say(`{"type":"push","batch":"` + strings.Repeat("x", 1<<20) + `","cells":[]}`)
	if bye := d.want("bye"); bye.Reason != "protocol" {
		t.Errorf("a frame over 1 MB: bye %q, want protocol", bye.Reason)
	}
	d.gone()
	// And one just under it, full of cells, is an ordinary push.
	d, _ = w.connect(ravi.Token, phone, 0)
	big := make([]json.RawMessage, 60)
	for i := range big {
		big[i] = cell(stamp(1, phone), "task", fmt.Sprintf("t%d", i), "note", `"`+strings.Repeat("n", 16000)+`"`)
	}
	d.push("big", big...)
	if ack := d.want("ack"); ack.Cursor != 60 {
		t.Errorf("a 960 KB push: %+v, want an ack to 60", ack)
	}
}

func TestClockNackOnTheSocketStoresNothing(t *testing.T) {
	w := start(t)
	ravi := w.signUp("ravi", phone)
	a, _ := w.connect(ravi.Token, phone, 0)
	b, _ := w.connect(w.signIn("ravi", laptop).Token, laptop, 0)
	a.push("k1",
		cell(stamp(1, phone), "task", "t1", "title", `"fine"`),
		cell("2026-11-25T04:35:00.001Z-0000-"+phone, "task", "t2", "title", `"a millisecond too far ahead"`))
	if nack := a.want("nack"); nack.Batch != "k1" || nack.Reason != "clock" || nack.ServerTime != serverTime.UnixMilli() {
		t.Errorf("nack = %+v, want clock with the server's time", nack)
	}
	b.quiet()
	if _, welcome := w.connect(ravi.Token, phone, 0); welcome.Head != 0 {
		t.Errorf("head after a refused batch = %d, want 0", welcome.Head)
	}
	// The device corrects its clock and restamps; the server's clock has moved on too.
	w.pass(time.Millisecond)
	a.push("k1",
		cell(stamp(1, phone), "task", "t1", "title", `"fine"`),
		cell("2026-11-25T04:35:00.001Z-0000-"+phone, "task", "t2", "title", `"now inside the window"`))
	if ack := a.want("ack"); ack.From != 0 || ack.Cursor != 2 {
		t.Errorf("ack = %+v, want from 0 cursor 2", ack)
	}
	b.want("cells")
}

func TestInviteWhileTheServerHasTheDatabaseOpen(t *testing.T) {
	w := start(t)
	// Keep the server writing while invites are made beside it, as the owner would on the phone.
	ravi := w.signUp("ravi", phone)
	d, _ := w.connect(ravi.Token, phone, 0)
	codes := map[string]bool{}
	for i := range 20 {
		d.push("k", cell(stamp(i, phone), "task", fmt.Sprintf("t%d", i), "title", `1`))
		code, err := newInvite(w.dir, w.now)
		if err != nil {
			t.Fatalf("invite %d beside a running server: %v", i, err)
		}
		codes[code] = true
		d.want("ack")
	}
	if len(codes) != 20 {
		t.Errorf("20 invites gave %d different codes", len(codes))
	}
	n := 0
	for code := range codes {
		var s session
		if status, _ := w.post("/api/register", creds{"invite": code, "username": fmt.Sprintf("friend_%d", n), "password": password, "device": laptop}, &s); status != 200 {
			t.Errorf("the server does not know an invite made beside it: %d %s", status, s.Error)
		}
		if n++; n == 2 {
			break
		}
	}
	// The invite process closing its connection must not have taken the server's WAL away.
	if page := w.sync(ravi.Token, phone, 0, nil); len(page.Cells) != 20 {
		t.Errorf("the server now holds %d cells, want 20", len(page.Cells))
	}
}

func TestAnyOriginIsAnswered(t *testing.T) {
	w := start(t)
	req, _ := http.NewRequest(http.MethodOptions, w.url+"/api/login", nil)
	req.Header.Set("Origin", "https://localhost")
	req.Header.Set("Access-Control-Request-Method", "POST")
	req.Header.Set("Access-Control-Request-Headers", "content-type")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 204 || res.Header.Get("Access-Control-Allow-Origin") != "*" ||
		!strings.Contains(res.Header.Get("Access-Control-Allow-Methods"), "POST") ||
		!strings.EqualFold(res.Header.Get("Access-Control-Allow-Headers"), "content-type") {
		t.Errorf("preflight = %d %v", res.StatusCode, res.Header)
	}
	// The answer itself carries the header too, on a refusal as on a success.
	req, _ = http.NewRequest(http.MethodPost, w.url+"/api/login", bytes.NewReader([]byte(`{}`)))
	req.Header.Set("Origin", "capacitor://localhost")
	res, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 400 || res.Header.Get("Access-Control-Allow-Origin") != "*" {
		t.Errorf("POST from another origin = %d, Allow-Origin %q", res.StatusCode, res.Header.Get("Access-Control-Allow-Origin"))
	}
	// /healthz too: the phone app, from its own origin, asks it before anything else
	// whether this address is a heirloom server and whether it needs setting up.
	for _, method := range []string{http.MethodGet, http.MethodOptions} {
		req, _ = http.NewRequest(method, w.url+"/healthz", nil)
		req.Header.Set("Origin", "https://localhost")
		res, err = http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if res.Header.Get("Access-Control-Allow-Origin") != "*" {
			t.Errorf("%s /healthz from another origin: Allow-Origin %q, so a WebView reads a good server as unreachable", method, res.Header.Get("Access-Control-Allow-Origin"))
		}
		if method == http.MethodGet && (res.StatusCode != 200 || !strings.Contains(string(body), `"setup":true`)) {
			t.Errorf("GET /healthz = %d %s", res.StatusCode, body)
		}
		if method == http.MethodOptions && (res.StatusCode != 204 || !strings.Contains(res.Header.Get("Access-Control-Allow-Methods"), "GET")) {
			t.Errorf("OPTIONS /healthz = %d %v", res.StatusCode, res.Header)
		}
	}
	// And the socket opens from an origin that is not the server's.
	ravi := w.signUp("ravi", phone)
	ctx, cancel := context.WithTimeout(context.Background(), patience)
	defer cancel()
	ws, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(w.url, "http")+"/api/ws", &websocket.DialOptions{HTTPHeader: http.Header{"Origin": {"https://localhost"}}})
	if err != nil {
		t.Fatalf("socket from another origin: %v", err)
	}
	d := &device{t, ws}
	t.Cleanup(func() { ws.CloseNow() })
	d.say(hello(ravi.Token, phone, 0))
	d.want("welcome")
}

// follower is a device's cursor, kept by the protocol's rules. It fails on the one thing
// the server's ordering promise rules out: a frame that starts past the cursor.
type follower struct{ cursor int64 }

func (f *follower) see(m msg) error {
	switch m.Type {
	case "cells":
		if m.From > f.cursor {
			return fmt.Errorf("cells %d to %d arrived at cursor %d: something was skipped", m.From, m.To, f.cursor)
		}
		f.cursor = max(f.cursor, m.To)
	case "ack":
		if m.From == f.cursor {
			f.cursor = m.Cursor
		}
	}
	return nil
}

// Four devices of one account push at once while a fifth joins late and a sixth only
// listens. Every one of them must end with its cursor on the head without ever seeing a
// gap, which is only true if each connection is written in sequence order.
func TestEveryConnectionIsWrittenInSequenceOrder(t *testing.T) {
	w := start(t)
	ravi := w.signUp("ravi", phone)
	const pushers, batches = 4, 40
	done := make(chan error, pushers+2)

	// run follows one socket until it has seen `acks` acks and its cursor is on `head`.
	run := func(d *device, f *follower, acks int, head int64) error {
		for acks > 0 || f.cursor < head {
			m, err := d.read()
			if err != nil {
				return fmt.Errorf("at cursor %d with %d acks to come: %w", f.cursor, acks, err)
			}
			if err := f.see(m); err != nil {
				return err
			}
			if m.Type == "ack" {
				acks--
			}
		}
		return nil
	}
	// Every cell is for its own field, so every one wins and the head ends at exactly this.
	const head = pushers * batches * 3
	listener, _ := w.connect(ravi.Token, phone, 0)
	go func() { done <- run(listener, &follower{}, 0, head) }()
	for p := range pushers {
		d, _ := w.connect(ravi.Token, phone, 0)
		go func() {
			go func() {
				for b := range batches {
					cells := make([]json.RawMessage, 3)
					for i := range cells {
						cells[i] = cell(stamp(rand.IntN(60), phone), "task", fmt.Sprintf("p%d-b%d-c%d", p, b, i), "title", `1`)
					}
					frame := asJSON(map[string]any{"type": "push", "batch": fmt.Sprint(b), "cells": cells})
					if d.ws.Write(context.Background(), websocket.MessageText, []byte(frame)) != nil {
						return
					}
				}
			}()
			done <- run(d, &follower{}, batches, head)
		}()
	}
	// The late one arrives in the middle of it and has to change from catch-up to live.
	late, _ := w.connect(ravi.Token, phone, 0)
	go func() { done <- run(late, &follower{}, 0, head) }()

	for range pushers + 2 {
		if err := <-done; err != nil {
			t.Error(err)
		}
	}
	if reply := w.sync(ravi.Token, phone, head, nil); reply.Head != head {
		t.Errorf("head = %d, want %d", reply.Head, head)
	}
}

// The queue's bound is on what is waiting, not on what has ever been sent: a device that
// keeps reading stays connected through far more than the bound.
func TestADeviceThatKeepsUpIsNeverCut(t *testing.T) {
	w := start(t)
	ravi := w.signUp("ravi", phone)
	a, _ := w.connect(ravi.Token, phone, 0)
	b, _ := w.connect(w.signIn("ravi", laptop).Token, laptop, 0)
	note := `"` + strings.Repeat("n", 15<<10) + `"`
	for batch := range 8 { // 8 frames of about 900 KB: twice the 4 MB a queue may hold
		cells := make([]json.RawMessage, 60)
		for i := range cells {
			cells[i] = cell(stamp(batch, phone), "task", fmt.Sprintf("t%d", i), "note", note)
		}
		a.push("big", cells...)
		a.want("ack")
		if live := b.want("cells"); len(live.Cells) != 60 {
			t.Fatalf("batch %d arrived with %d cells", batch, len(live.Cells))
		}
	}
}

func TestShutdownClosesSocketsAndLeavesOneFile(t *testing.T) {
	w := start(t)
	ravi := w.signUp("ravi", phone)
	d, _ := w.connect(ravi.Token, phone, 0)
	d.push("k1", cell(stamp(1, phone), "task", "t1", "title", `1`))
	d.want("ack")
	silent := w.dial() // connected, never said hello

	w.hub.Close()
	for _, c := range []*device{d, silent} {
		if m, err := c.read(); err == nil {
			t.Errorf("after shutdown a socket still got %+v", m)
		}
	}
	if err := w.db.Close(); err != nil {
		t.Fatal(err)
	}
	if files, _ := filepath.Glob(filepath.Join(w.dir, "*")); len(files) != 1 {
		t.Errorf("after shutdown the data directory holds %v, want only heirloom.db", files)
	}
}

// The app is served under everything the API does not claim, and takes nothing from it.
func TestAppAndAPIShareTheListener(t *testing.T) {
	w := start(t)
	get := func(path string) (*http.Response, string) {
		t.Helper()
		res, err := http.Get(w.url + path)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		body, _ := io.ReadAll(res.Body)
		return res, string(body)
	}
	if res, body := get("/"); res.StatusCode != 200 || !strings.Contains(body, "<title>heirloom</title>") || res.Header.Get("Content-Security-Policy") != web.CSP {
		t.Errorf("/ = %d %q with CSP %q, want the app's index.html under its policy", res.StatusCode, body, res.Header.Get("Content-Security-Policy"))
	}
	// /healthz is still the health check, byte for byte, and not a page of the app.
	w.signUp("somebody", laptop)
	if res, body := get("/healthz"); res.StatusCode != 200 || body != `{"ok":true,"version":"dev","sqlite":"test"}` || res.Header.Get("Content-Security-Policy") != "" {
		t.Errorf("/healthz = %d %s", res.StatusCode, body)
	}
	// /api/login still reaches the accounts, and still answers any origin.
	var e session
	status, header := w.post("/api/login", creds{"username": "nobody", "password": password, "device": phone}, &e)
	if status != 401 || e.Error != "credentials" || header.Get("Access-Control-Allow-Origin") != "*" {
		t.Errorf("/api/login = %d %q, Allow-Origin %q; want 401 credentials for any origin", status, e.Error, header.Get("Access-Control-Allow-Origin"))
	}
	// A path nobody has is a 404, not the app: an API typo must not come back as HTML with a 200.
	for _, path := range []string{"/focus", "/api/nothing", "/healthz/x"} {
		if res, body := get(path); res.StatusCode != 404 || strings.Contains(body, "<title>") {
			t.Errorf("%s = %d %q, want 404 and not index.html", path, res.StatusCode, body)
		}
	}
	// The app's own pages are for its own origin: no CORS header invites another site to read them.
	if res, _ := get("/"); res.Header.Get("Access-Control-Allow-Origin") != "" {
		t.Error("the app's page carries a CORS header")
	}
}
