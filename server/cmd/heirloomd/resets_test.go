package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	gosync "sync"
	"testing"
	"time"
)

// A way back in, the way the app and the owner at a shell meet it: the owner's three
// calls with a token, the link's two without, the sockets of the account that was reset,
// and "heirloomd -reset" beside the running server. contracts/protocol.md section 10.

const newPassword = "a brand new password"

// bare posts to an /api/ route with no token: all a stranger, or the holder of a link, has.
func (w *world) bare(path string, body map[string]any) (int, string, http.Header) {
	w.t.Helper()
	res, err := http.Post(w.url+"/api/"+path, "application/json", strings.NewReader(asJSON(body)))
	if err != nil {
		w.t.Fatal(err)
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(res.Body)
	return res.StatusCode, strings.TrimSpace(string(data)), res.Header
}

var resetShape = regexp.MustCompile(`^\{"reset":\{"reset":"([A-Z2-7]{52})","username":"([a-z0-9_]+)","created":(\d+),"expires":(\d+)\}\}$`)

// makeReset is the owner making a link in the app.
func (w *world) makeReset(owner session, device, username string) string {
	w.t.Helper()
	status, body := w.call(owner, device, "resets/create", map[string]any{"username": username})
	m := resetShape.FindStringSubmatch(body)
	if status != 200 || m == nil {
		w.t.Fatalf("resets/create for %s = %d %s", username, status, body)
	}
	return m[1]
}

func TestResetOverHTTP(t *testing.T) {
	w := start(t)
	_, ravi := w.setUp("ravi", phone, nil)
	sam, mali := w.signUp("sam", laptop), w.signUp("mali", tablet)
	samsPhone := w.signIn("sam", pocket)
	began := w.ms.Load()

	// The owner's three calls.
	status, body := w.call(ravi, phone, "resets/create", map[string]any{"username": "Sam"})
	m := resetShape.FindStringSubmatch(body)
	if status != 200 || m == nil || m[2] != "sam" || m[3] != fmt.Sprint(began) || m[4] != fmt.Sprint(began+24*3600*1000) {
		t.Fatalf("create = %d %s, want one reset for sam, made now, good for 24 hours", status, body)
	}
	link := m[1]
	if status, body := w.call(ravi, phone, "resets/list", nil); status != 200 || body != fmt.Sprintf(`{"resets":[{"username":"sam","created":%d,"expires":%d}]}`, began, began+24*3600*1000) {
		t.Errorf("list = %d %s, want sam's, without the link", status, body)
	}
	for what, c := range map[string]struct {
		path   string
		fields map[string]any
		status int
		body   string
	}{
		"a reset for the owner":           {"resets/create", map[string]any{"username": "ravi"}, 400, `{"error":"bad_request"}`},
		"a reset for nobody named":        {"resets/create", nil, 400, `{"error":"bad_request"}`},
		"a reset for a name not here":     {"resets/create", map[string]any{"username": "nobody"}, 404, `{"error":"unknown"}`},
		"taking back for a name not here": {"resets/revoke", map[string]any{"username": "nobody"}, 404, `{"error":"unknown"}`},
		"taking back when none is open":   {"resets/revoke", map[string]any{"username": "mali"}, 200, `{}`},
	} {
		if status, body := w.call(ravi, phone, c.path, c.fields); status != c.status || body != c.body {
			t.Errorf("%s = %d %s, want %d %s", what, status, body, c.status, c.body)
		}
	}

	// Sam's two devices and mali's are connected when the link is used.
	onLaptop, _ := w.connect(sam.Token, laptop, 0)
	onPhone, _ := w.connect(samsPhone.Token, pocket, 0)
	malis, _ := w.connect(mali.Token, tablet, 0)
	owner, _ := w.connect(ravi.Token, phone, 0)

	// The link, with no token: whose it is, and then the new password.
	if status, body, _ := w.bare("reset/look", map[string]any{"reset": link}); status != 200 || body != `{"username":"sam"}` {
		t.Fatalf("look = %d %s", status, body)
	}
	status, body, _ = w.bare("reset", map[string]any{"reset": link, "password": newPassword, "device": laptop})
	var fresh session
	if err := json.Unmarshal([]byte(body), &fresh); err != nil || status != 200 || fresh.Token == "" || fresh.Username != "sam" || fresh.Account != sam.Account {
		t.Fatalf("reset = %d %s, want what login answers, for sam", status, body)
	}

	// Every device sam had is signed out, the one that asked included: its old token
	// was a token from before. Their sockets are told so, and cut.
	for _, d := range []*device{onLaptop, onPhone} {
		if bye := d.want("bye"); bye.Reason != "token" {
			t.Errorf("a socket of the reset account was told %+v, want bye token", bye)
		}
		d.gone()
	}
	malis.quiet()
	owner.quiet()
	for device, old := range map[string]session{laptop: sam, pocket: samsPhone} {
		if status, body := w.call(old, device, "sync", map[string]any{"cursor": 0}); status != 401 || body != `{"error":"token"}` {
			t.Errorf("a token from before the reset = %d %s, want 401 token", status, body)
		}
	}
	// The new token is a token: by POST and on a socket.
	if status, _ := w.call(fresh, laptop, "sync", map[string]any{"cursor": 0}); status != 200 {
		t.Errorf("the new token over POST = %d", status)
	}
	if _, welcome := w.connect(fresh.Token, laptop, 0); welcome.Type != "welcome" {
		t.Error("the new token was not welcomed")
	}
	// The old password is refused and the new one signs in.
	if status, body, _ := w.bare("login", map[string]any{"username": "sam", "password": password, "device": pocket}); status != 401 || body != `{"error":"credentials"}` {
		t.Errorf("the old password = %d %s", status, body)
	}
	if status, _, _ := w.bare("login", map[string]any{"username": "sam", "password": newPassword, "device": pocket}); status != 200 {
		t.Errorf("the new password = %d", status)
	}
	if w.signIn("mali", tablet).Token == "" {
		t.Error("mali can no longer sign in")
	}

	// Used once. After that the link is nothing, for looking and for using, and the list is empty.
	for _, path := range []string{"reset/look", "reset"} {
		if status, body, _ := w.bare(path, map[string]any{"reset": link, "password": "yet another password", "device": laptop}); status != 403 || body != `{"error":"reset"}` {
			t.Errorf("%s with a used link = %d %s, want 403 reset", path, status, body)
		}
	}
	if _, body := w.call(ravi, phone, "resets/list", nil); body != `{"resets":[]}` {
		t.Errorf("list after the use = %s", body)
	}

	// Taken back from the app: {} and dead.
	link = w.makeReset(ravi, phone, "mali")
	if status, body := w.call(ravi, phone, "resets/revoke", map[string]any{"username": "mali"}); status != 200 || body != "{}" {
		t.Errorf("revoke = %d %s", status, body)
	}
	if status, body, _ := w.bare("reset/look", map[string]any{"reset": link}); status != 403 || body != `{"error":"reset"}` {
		t.Errorf("a link taken back = %d %s", status, body)
	}
}

// Two phones open the same link and both press the button. One password is set.
func TestTwoResetsAtOnceOverHTTP(t *testing.T) {
	w := start(t)
	_, ravi := w.setUp("ravi", phone, nil)
	w.signUp("sam", laptop)
	link := w.makeReset(ravi, phone, "sam")
	var both gosync.WaitGroup
	type result struct {
		status         int
		body, password string
	}
	results := make(chan result, 6)
	for i := range 6 {
		both.Go(func() {
			pw := fmt.Sprintf("password number %d", i)
			status, body, _ := w.bare("reset", map[string]any{"reset": link, "password": pw, "device": fmt.Sprintf("%016x", i+1)})
			results <- result{status, body, pw}
		})
	}
	both.Wait()
	close(results)
	var winner string
	won := 0
	for r := range results {
		switch {
		case r.status == 200:
			won++
			winner = r.password
		case r.status != 403 || r.body != `{"error":"reset"}`:
			t.Errorf("one of the six got %d %s", r.status, r.body)
		}
	}
	if won != 1 {
		t.Fatalf("%d of six were let in with one link", won)
	}
	if status, _, _ := w.bare("login", map[string]any{"username": "sam", "password": winner, "device": laptop}); status != 200 {
		t.Errorf("the winner's password does not sign in: %d", status)
	}
	var tokens, used int
	if err := w.db.QueryRow("select (select count(*) from token t join account a on a.id = t.account where a.username = 'sam'), (select count(*) from resets where used is not null)").Scan(&tokens, &used); err != nil || tokens != 2 || used != 1 {
		t.Errorf("sam has %d tokens and %d used resets, %v; want the winner's and the sign-in's, and one", tokens, used, err)
	}
}

// What the calls give away. A member, an admin and a stranger must not be able to tell a
// name that is here from one that is not; a link that is no good says only that.
func TestResetCallsSayNothingAboutWhoIsHere(t *testing.T) {
	w := start(t)
	_, ravi := w.setUp("ravi", phone, nil)
	sam, zed := w.signUp("sam", laptop), w.signUp("zed", tablet)
	w.call(ravi, phone, "admins/set", map[string]any{"username": "zed", "role": "admin"})
	used := w.makeReset(ravi, phone, "sam")
	w.bare("reset", map[string]any{"reset": used, "password": newPassword, "device": laptop})
	sam = w.signIn2("sam", newPassword, laptop)
	revoked := w.makeReset(ravi, phone, "sam")
	w.call(ravi, phone, "resets/revoke", map[string]any{"username": "sam"})
	old := w.makeReset(ravi, phone, "sam")
	replaced := old
	current := w.makeReset(ravi, phone, "sam")

	for who, c := range map[string]struct {
		s      session
		device string
	}{"a member": {sam, laptop}, "an admin": {zed, tablet}} {
		for _, path := range []string{"resets/create", "resets/revoke", "resets/list"} {
			_, here := w.call(c.s, c.device, path, map[string]any{"username": "ravi"})
			_, member := w.call(c.s, c.device, path, map[string]any{"username": "sam"})
			status, notHere := w.call(c.s, c.device, path, map[string]any{"username": "nobody"})
			if status != 403 || here != `{"error":"forbidden"}` || here != notHere || here != member {
				t.Errorf("%s calling %s: %s for the owner, %s for a member, %d %s for a name not here; want forbidden for all", who, path, here, member, status, notHere)
			}
		}
	}
	// No token at all: the three owner calls want one before anything else.
	for _, path := range []string{"resets/create", "resets/revoke", "resets/list"} {
		for _, name := range []string{"sam", "nobody"} {
			if status, body := w.call(session{Token: "NOSUCHTOKEN"}, phone, path, map[string]any{"username": name}); status != 401 || body != `{"error":"token"}` {
				t.Errorf("%s for %s with nobody's token = %d %s, want 401 token", path, name, status, body)
			}
		}
	}
	// A link that is no good, whatever the reason, is one answer with nothing in it.
	for what, link := range map[string]string{"used": used, "taken back": revoked, "replaced": replaced, "never made": strings.Repeat("A", 52), "nonsense": "sam", "empty": ""} {
		status, look, _ := w.bare("reset/look", map[string]any{"reset": link})
		if status != 403 || look != `{"error":"reset"}` {
			t.Errorf("look at a link that is %s = %d %s, want 403 reset", what, status, look)
		}
		status, use, _ := w.bare("reset", map[string]any{"reset": link, "password": newPassword, "device": tablet})
		wantStatus, wantBody := 403, `{"error":"reset"}`
		if link == "" {
			wantStatus, wantBody = 400, `{"error":"bad_request"}` // a missing field, as everywhere
		}
		if status != wantStatus || use != wantBody {
			t.Errorf("using a link that is %s = %d %s, want %d %s", what, status, use, wantStatus, wantBody)
		}
	}
	// Run out: the same.
	w.pass(24*time.Hour + time.Millisecond)
	if status, body, _ := w.bare("reset/look", map[string]any{"reset": current}); status != 403 || body != `{"error":"reset"}` {
		t.Errorf("a link 24 hours and a millisecond old = %d %s", status, body)
	}
	// A bad password or device is refused the same way whether or not the link is real.
	real := w.makeReset(ravi, phone, "sam")
	for _, link := range []string{real, strings.Repeat("A", 52)} {
		if status, body, _ := w.bare("reset", map[string]any{"reset": link, "password": "short", "device": tablet}); status != 400 || body != `{"error":"bad_request"}` {
			t.Errorf("a short password with link %.4s... = %d %s, want 400 bad_request either way", link, status, body)
		}
	}
	if status, body, _ := w.bare("reset/look", map[string]any{"reset": real}); status != 200 || body != `{"username":"sam"}` {
		t.Errorf("the refused tries used the link up: %d %s", status, body)
	}
	// Only POST, and a GET of a link's route says nothing.
	for _, path := range []string{"reset", "reset/look", "resets/list"} {
		res, err := http.Get(w.url + "/api/" + path + "?reset=" + real)
		if err != nil {
			t.Fatal(err)
		}
		data, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if res.StatusCode == 200 || strings.Contains(string(data), "sam") {
			t.Errorf("GET %s = %d %s", path, res.StatusCode, data)
		}
	}
}

// signIn2 signs in with a password other than the tests' usual one.
func (w *world) signIn2(username, pw, device string) session {
	w.t.Helper()
	var s session
	if status, _ := w.post("/api/login", creds{"username": username, "password": pw, "device": device}, &s); status != 200 {
		w.t.Fatalf("login %s = %d %s", username, status, s.Error)
	}
	return s
}

// The owner's own way back: at a shell on the server, while it runs. Nobody signed in as
// the owner can make this link from the app.
func TestResetCommandBesideARunningServer(t *testing.T) {
	w := start(t)
	_, ravi := w.setUp("ravi", phone, nil)
	sam := w.signUp("sam", laptop)
	// Keep the server writing while the command opens the same database.
	d, _ := w.connect(sam.Token, laptop, 0)
	d.push("k", cell(stamp(1, laptop), "task", "t1", "title", `1`))

	made, err := newReset(w.dir, "Ravi", w.now)
	if err != nil {
		t.Fatalf("-reset beside a running server: %v", err)
	}
	d.want("ack")
	if made.Username != "ravi" || len(made.Reset) != 52 || made.Expires-made.Created != 24*3600*1000 {
		t.Errorf("made %+v, want a link for the owner, good for 24 hours", made)
	}
	if _, err := newReset(w.dir, "nobody", w.now); err == nil || !strings.Contains(err.Error(), "no account is called") {
		t.Errorf("-reset for a name not here: %v", err)
	}
	// The server was told nothing, and knows the link.
	if status, body, _ := w.bare("reset/look", map[string]any{"reset": made.Reset}); status != 200 || body != `{"username":"ravi"}` {
		t.Fatalf("the server does not know a link made beside it: %d %s", status, body)
	}
	owners, _ := w.connect(ravi.Token, phone, 0)
	status, body, _ := w.bare("reset", map[string]any{"reset": made.Reset, "password": newPassword, "device": tablet})
	var back session
	if json.Unmarshal([]byte(body), &back); status != 200 || back.Username != "ravi" {
		t.Fatalf("the owner's way back = %d %s", status, body)
	}
	if bye := owners.want("bye"); bye.Reason != "token" {
		t.Errorf("the owner's old socket was told %+v", bye)
	}
	// Still the owner, with every call of the owner's.
	if role := w.welcomeRole(back, tablet); role != "owner" {
		t.Errorf("after the reset the welcome says %q", role)
	}
	if status, _ := w.call(back, tablet, "admins/list", nil); status != 200 {
		t.Errorf("admins/list after the owner's reset = %d", status)
	}
	// The command closing its connection did not take the server's database from under it.
	d.push("k2", cell(stamp(2, laptop), "task", "t2", "title", `2`))
	if ack := d.want("ack"); ack.Cursor != 2 {
		t.Errorf("after the command the server acked %+v", ack)
	}
	// Nothing of the link is on disk as it was printed.
	files, _ := filepath.Glob(filepath.Join(w.dir, "heirloom.db*"))
	for _, f := range files {
		if data, err := os.ReadFile(f); err != nil || bytes.Contains(data, []byte(made.Reset)) {
			t.Errorf("%s holds the reset as it was printed (%v)", filepath.Base(f), err)
		}
	}
}

// A device signed out by a reset has no business being rung: its subscription goes with
// its token, as it does at an ordinary sign-out.
func TestResetDropsTheAccountsPushSubscriptions(t *testing.T) {
	w := start(t)
	_, ravi := w.setUp("ravi", phone, nil)
	sam := w.signUp("sam", laptop)
	samsPhone := w.signIn("sam", pocket)
	w.gateway.browser("sam-laptop").subscribe(w, sam.Token, laptop)
	w.gateway.browser("sam-phone").subscribe(w, samsPhone.Token, pocket)
	w.gateway.browser("ravi").subscribe(w, ravi.Token, phone)

	link := w.makeReset(ravi, phone, "sam")
	_, body, _ := w.bare("reset", map[string]any{"reset": link, "password": newPassword, "device": laptop})
	var fresh session
	json.Unmarshal([]byte(body), &fresh)

	var left string
	if err := w.db.QueryRow("select group_concat(a.username) from push_subscription p join account a on a.id = p.account").Scan(&left); err != nil || left != "ravi" {
		t.Errorf("subscriptions are still held for %q, want only the owner's, who was not reset", left)
	}
	// Sam's lap ends: nobody is rung, not even the device that did the reset, until it asks again.
	w.sync(fresh.Token, laptop, 0, &pushBody{"b", []json.RawMessage{json.RawMessage(asJSON(map[string]any{
		"stamp": stamp(5, laptop), "dataset": "timer", "row": "current", "field": "state",
		"value": running("work", "run-1", nil, w.ms.Load(), bellMs, 0)}))}})
	w.pass(bellMs * time.Millisecond)
	w.gateway.none("every device of the account was signed out")
}

// The server's own log of a reset: who and when, never what.
func TestResetLogOverHTTP(t *testing.T) {
	var written bytes.Buffer
	stderr := log.Writer()
	log.SetOutput(&written)
	defer log.SetOutput(stderr)

	w := start(t)
	_, ravi := w.setUp("ravi", phone, nil)
	w.signUp("sam", laptop)
	first := w.makeReset(ravi, phone, "sam")
	w.call(ravi, phone, "resets/revoke", map[string]any{"username": "sam"})
	second := w.makeReset(ravi, phone, "sam")
	w.bare("reset/look", map[string]any{"reset": second})
	w.bare("reset", map[string]any{"reset": second, "password": "wrong", "device": laptop})
	w.bare("reset", map[string]any{"reset": second, "password": newPassword, "device": laptop})
	w.bare("reset", map[string]any{"reset": second, "password": "a later password", "device": laptop})
	w.bare("reset", map[string]any{"reset": "GUESSEDRESET", "password": "a guessed password", "device": laptop})

	logged := written.String()
	var said []string
	for _, line := range strings.Split(strings.TrimSpace(logged), "\n") {
		said = append(said, regexp.MustCompile(`^\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2} `).ReplaceAllString(line, ""))
	}
	if got, want := strings.Join(said, "; "), "reset: made for sam; reset: taken back for sam; reset: made for sam; reset: used for sam"; got != want {
		t.Errorf("the log says %q, want %q", got, want)
	}
	for _, secret := range []string{first, second, second[:12], newPassword, "a later password", "a guessed password", "GUESSEDRESET", ravi.Token} {
		if strings.Contains(logged, secret) {
			t.Errorf("the log holds %q:\n%s", secret, logged)
		}
	}
}
