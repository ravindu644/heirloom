package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// A moment long enough that something not held back would have happened in it.
const aMoment = 150 * time.Millisecond

func TestListenerHoldsTheOneOverTheBound(t *testing.T) {
	tcp, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	l := limit(tcp, 2)
	accepted := make(chan net.Conn)
	stopped := make(chan error, 1)
	go func() {
		for {
			c, err := l.Accept()
			if err != nil {
				stopped <- err
				return
			}
			accepted <- c
		}
	}()
	dial := func() {
		t.Helper()
		c, err := net.Dial("tcp", tcp.Addr().String())
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { c.Close() })
	}
	next := func(what string, want bool) net.Conn {
		t.Helper()
		select {
		case c := <-accepted:
			if !want {
				t.Fatalf("%s: a connection over the bound was let in", what)
			}
			return c
		case <-time.After(aMoment):
			if want {
				t.Fatalf("%s: no connection was let in", what)
			}
			return nil
		}
	}
	dial()
	dial()
	first, second := next("the first", true), next("the second", true)
	dial()
	dial()
	next("a third with two open", false)

	// One leaves, and exactly one of the two waiting gets in. Closing it twice, as a
	// socket's connection is closed twice, gives back one place, not two.
	first.Close()
	first.Close()
	third := next("after one left", true)
	next("the fourth, with two open again", false)
	second.Close()
	next("after another left", true)

	// Shutting down with the house full does not wait for somebody to leave.
	third.Close()
	dial()
	dial()
	next("the house is full again", true)
	next("still full", false)
	l.Close()
	select {
	case <-stopped:
	case <-time.After(patience):
		t.Fatal("Accept did not return when the listener was closed while full")
	}
}

// Twenty devices coming back at once after a restart is ordinary use: a socket each, and
// a browser's burst of six requests each for the app. Nobody waits, nobody is refused.
func TestTwentyDevicesAtOnceAreOrdinaryUse(t *testing.T) {
	w := start(t)
	people := make([]session, 20)
	for i := range people {
		people[i] = w.signUp(fmt.Sprintf("friend_%d", i), fmt.Sprintf("%016x", i+1))
	}
	// Four rooms of five, so every device is in a room.
	for i := 0; i < len(people); i += 5 {
		w.ask(people[i].Token, fmt.Sprintf("%016x", i+1), "create", map[string]any{"name": "five of us"}).ok(t, "create")
		var code string
		if err := w.db.QueryRow("select code from room order by id desc limit 1").Scan(&code); err != nil {
			t.Fatal(err)
		}
		for j := i + 1; j < i+5; j++ {
			w.ask(people[j].Token, fmt.Sprintf("%016x", j+1), "join", map[string]any{"code": code}).ok(t, "join")
		}
	}

	started := time.Now()
	var all sync.WaitGroup
	failed := make(chan string, 200)
	for i, p := range people {
		all.Go(func() {
			d := w.dial()
			first := hello(p.Token, fmt.Sprintf("%016x", i+1), 0)
			d.ws.Write(t.Context(), websocket.MessageText, []byte(asJSON(first)))
			if m, err := d.read(); err != nil || m.Type != "welcome" || len(m.Rooms) != 1 {
				failed <- fmt.Sprintf("device %d: %+v, %v", i, m, err)
				return
			}
			if m, err := d.read(); err != nil || m.Type != "room" || len(m.Members) != 5 {
				failed <- fmt.Sprintf("device %d was not sent its room: %+v, %v", i, m, err)
			}
		})
		for range 6 {
			all.Go(func() {
				res, err := (&http.Client{Transport: &http.Transport{}}).Get(w.url + "/")
				if err != nil {
					failed <- err.Error()
					return
				}
				io.Copy(io.Discard, res.Body)
				res.Body.Close()
				if res.StatusCode != 200 {
					failed <- res.Status
				}
			})
		}
	}
	all.Wait()
	close(failed)
	for f := range failed {
		t.Error(f)
	}
	if took := time.Since(started); took > 2*time.Second {
		t.Errorf("twenty devices and their 120 requests took %v: something made them wait", took)
	}
}

// upload opens a POST /api/sync with a 20 KB body and sends the first 17 KB of it: past
// what a small body is, so it holds a slot, and not finished, so it keeps it.
type upload struct {
	t    *testing.T
	conn net.Conn
	rest string
}

func (w *world) stall() *upload {
	w.t.Helper()
	body := `{"token":"NOSUCHTOKEN","device":"a1b2c3d4e5f60718","cursor":0,"pad":"` + strings.Repeat("p", 20000) + `"}`
	conn, err := net.Dial("tcp", strings.TrimPrefix(w.url, "http://"))
	if err != nil {
		w.t.Fatal(err)
	}
	w.t.Cleanup(func() { conn.Close() })
	fmt.Fprintf(conn, "POST /api/sync HTTP/1.1\r\nHost: heirloom.test\r\nContent-Type: application/json\r\nContent-Length: %d\r\n\r\n%s", len(body), body[:17000])
	return &upload{w.t, conn, body[17000:]}
}

// finish sends the rest and returns the status line.
func (u *upload) finish() string {
	u.t.Helper()
	io.WriteString(u.conn, u.rest)
	u.conn.SetReadDeadline(time.Now().Add(patience))
	line := make([]byte, 12)
	if _, err := io.ReadFull(u.conn, line); err != nil {
		u.t.Fatalf("no answer to a finished upload: %v", err)
	}
	return string(line)
}

func TestBigSyncBodiesTakeTurnsAndSmallOnesDoNotWait(t *testing.T) {
	w := start(t)
	ravi := w.signUp("ravi", phone)
	var slow []*upload
	for range maxBigSyncs {
		slow = append(slow, w.stall())
	}
	time.Sleep(aMoment) // let the four reach the server and take their slots

	// A fifth big body, whole and ready, has to wait for one of them.
	fifth := make(chan int, 1)
	go func() {
		body := `{"token":"NOSUCHTOKEN","device":"a1b2c3d4e5f60718","cursor":0,"pad":"` + strings.Repeat("p", 20000) + `"}`
		res, err := http.Post(w.url+"/api/sync", "application/json", strings.NewReader(body))
		if err != nil {
			fifth <- 0
			return
		}
		res.Body.Close()
		fifth <- res.StatusCode
	}()
	select {
	case status := <-fifth:
		t.Fatalf("a fifth big body was answered (%d) while four were still being read", status)
	case <-time.After(aMoment):
	}

	// Meanwhile ordinary use goes on: a poll, a small push, a socket, a sign-in.
	began := time.Now()
	reply := w.sync(ravi.Token, phone, 0, &pushBody{"k1", []json.RawMessage{cell(stamp(1, phone), "task", "t1", "title", `"a small push"`)}})
	if reply.Ack == nil || reply.Head != 1 {
		t.Errorf("a small push while the big slots are full: %+v", reply)
	}
	w.sync(ravi.Token, phone, 1, nil)
	d, _ := w.connect(ravi.Token, phone, 1)
	d.quiet()
	w.signIn("ravi", laptop)
	if took := time.Since(began); took > time.Second {
		t.Errorf("ordinary requests took %v behind four slow uploads", took)
	}

	// One of the four finishes. It is answered, and its slot goes to the one that waited.
	if status := slow[0].finish(); !strings.HasPrefix(status, "HTTP/1.1 401") {
		t.Errorf("the finished upload was answered %q, want 401: its token is nobody's", status)
	}
	select {
	case status := <-fifth:
		if status != 401 {
			t.Errorf("the one that waited was answered %d, want 401", status)
		}
	case <-time.After(patience):
		t.Fatal("the fifth big body was never let in after a slot came free")
	}
	for _, u := range slow[1:] {
		u.finish()
	}
}

// A room's code is all it takes to join, so an account gets ten wrong ones an hour.
func TestWrongCodesAreLimitedPerAccount(t *testing.T) {
	w := start(t)
	ravi, sachi, nimal := w.person("ravi", phone, 0), w.person("sachi", laptop, 0), w.person("nimal", tablet, 0)
	_, code := together(t, "Sachi and me", ravi)

	// Right codes are not tries: joining one's own room again, over and over, uses none up.
	for range 30 {
		ravi.ask("join", map[string]any{"code": code}).ok(t, "joining one's own room again")
	}
	for i := range 10 {
		nimal.ask("join", map[string]any{"code": fmt.Sprintf("WRNG%04d", 2222+i)}).refused(t, "a wrong code", 404, "code")
	}
	w.pass(20 * time.Minute)
	// The eleventh is not looked at, and neither is the right one: while refused, the
	// answer must not say which codes are real.
	for _, try := range []string{"WRNG9999", code} {
		res, err := http.Post(w.url+"/api/rooms/join", "application/json", strings.NewReader(asJSON(map[string]any{"token": nimal.Token, "device": nimal.id, "code": try})))
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if res.StatusCode != 429 || strings.TrimSpace(string(body)) != `{"error":"slow_down"}` || res.Header.Get("Retry-After") != "2400" {
			t.Errorf("after ten wrong codes: %d %s, Retry-After %q; want 429 slow_down and the 2400 s left of the hour", res.StatusCode, body, res.Header.Get("Retry-After"))
		}
	}
	ravi.still("nimal was refused, the right code included")
	// It is nimal's count, not everybody's.
	sachi.ask("join", map[string]any{"code": code}).ok(t, "another account, with the right code")
	// Creating, leaving and the rest are not joins.
	nimal.ask("create", map[string]any{"name": "Nimal's"}).ok(t, "create while joins are refused")

	w.pass(40 * time.Minute)
	nimal.ask("join", map[string]any{"code": code}).ok(t, "the right code once the hour is up")
	// A new hour, a new ten.
	for range 10 {
		nimal.ask("join", map[string]any{"code": "WRNG2222"}).refused(t, "a wrong code in the next hour", 404, "code")
	}
	nimal.ask("join", map[string]any{"code": "WRNG2222"}).refused(t, "the eleventh of the next hour", 429, "slow_down")
}
