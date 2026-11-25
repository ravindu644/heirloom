package main

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/big"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	gosync "sync"
	"testing"
	"time"

	"heirloom/server/push"
	"heirloom/server/sync"
)

// Web Push at the bell, with a stand-in for the push services: a local HTTPS server that
// keeps what it is sent. No test here talks to a real one. contracts/protocol.md section 17.

const contact = "mailto:owner@example.org"

var b64url = base64.RawURLEncoding

// gateway is the push service: Mozilla's, Google's and Apple's, as far as the server can tell.
type gateway struct {
	*httptest.Server
	t       *testing.T
	mu      gosync.Mutex
	got     []pushed
	answer  map[string]int // by path; 201 when not set
	hold    chan struct{}  // when set, every request waits here before it is answered
	inside  int            // requests being held right now
	arrived chan struct{}
}

type pushed struct {
	path   string
	header http.Header
	body   []byte
}

func newGateway(t *testing.T) *gateway {
	g := &gateway{t: t, answer: map[string]int{}, arrived: make(chan struct{}, 1000)}
	g.Server = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		g.mu.Lock()
		g.got = append(g.got, pushed{r.URL.Path, r.Header.Clone(), body})
		status, hold := g.answer[r.URL.Path], g.hold
		g.inside++
		g.mu.Unlock()
		g.arrived <- struct{}{}
		if hold != nil {
			<-hold
		}
		g.mu.Lock()
		g.inside--
		g.mu.Unlock()
		if status == 0 {
			status = http.StatusCreated
		}
		w.WriteHeader(status)
	}))
	return g
}

// wait returns the next n pushes to arrive.
func (g *gateway) wait(n int) []pushed {
	g.t.Helper()
	for i := range n {
		select {
		case <-g.arrived:
		case <-time.After(patience):
			g.t.Fatalf("waited for %d pushes and got %d", n, i)
		}
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.got[len(g.got)-n:]
}

// none says no push arrives for as long as one would have taken to.
func (g *gateway) none(why string) {
	g.t.Helper()
	select {
	case <-g.arrived:
		g.mu.Lock()
		last := g.got[len(g.got)-1]
		g.mu.Unlock()
		g.t.Fatalf("%s, and a push was sent to %s", why, last.path)
	case <-time.After(2 * aMoment):
	}
}

// browser is one device's push subscription: the keys only it has, and where to reach it.
type browser struct {
	name  string
	key   *ecdh.PrivateKey
	auth  []byte
	words push.Words
	g     *gateway
}

func (g *gateway) browser(name string) *browser {
	key, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		g.t.Fatal(err)
	}
	b := &browser{name: name, key: key, auth: make([]byte, 16), g: g}
	rand.Read(b.auth)
	// Each device's own words, so a test can tell whose were sent.
	for i := range 4 {
		b.words.Lap = append(b.words.Lap, fmt.Sprintf("%s: lap %d of 4, done.", name, i+1))
		b.words.Take = append(b.words.Take, fmt.Sprintf("%s: take five after lap %d.", name, i+1))
		b.words.Next = append(b.words.Next, fmt.Sprintf("%s: lap %d is next.", name, i+1))
	}
	b.words.Take[3] = name + ": take fifteen."
	b.words.Break = name + ": break over."
	return b
}

func (b *browser) path() string { return "/push/" + b.name }

func (b *browser) subscription() map[string]any {
	return map[string]any{"endpoint": b.g.URL + b.path(), "keys": map[string]any{
		"p256dh": b64url.EncodeToString(b.key.PublicKey().Bytes()), "auth": b64url.EncodeToString(b.auth)}}
}

// subscribe sends this browser's subscription as the device signed in with token.
func (b *browser) subscribe(w *world, token, device string) {
	w.t.Helper()
	var e session
	if status, _ := w.post("/api/push/subscribe", map[string]any{"token": token, "device": device, "subscription": b.subscription(), "words": b.words}, &e); status != 200 {
		w.t.Fatalf("subscribe %s: %d %s", b.name, status, e.Error)
	}
}

type ring struct {
	T     string `json:"t"`
	Run   string `json:"run"`
	At    int64  `json:"at"`
	Title string `json:"title"`
	Body  string `json:"body"`
}

// open is the browser's half of RFC 8291: what only the holder of the private key can do.
func (b *browser) open(p pushed) (ring, string) {
	b.g.t.Helper()
	body := p.body
	if len(body) < 21+65+17 || p.header.Get("Content-Encoding") != "aes128gcm" {
		b.g.t.Fatalf("a push of %d bytes, encoded as %q", len(body), p.header.Get("Content-Encoding"))
	}
	salt, idLen := body[:16], int(body[20])
	sender, err := ecdh.P256().NewPublicKey(body[21 : 21+idLen])
	if err != nil {
		b.g.t.Fatal(err)
	}
	shared, err := b.key.ECDH(sender)
	if err != nil {
		b.g.t.Fatal(err)
	}
	info := "WebPush: info\x00" + string(b.key.PublicKey().Bytes()) + string(sender.Bytes())
	ikm, _ := hkdf.Key(sha256.New, shared, b.auth, info, 32)
	key, _ := hkdf.Key(sha256.New, ikm, salt, "Content-Encoding: aes128gcm\x00", 16)
	nonce, _ := hkdf.Key(sha256.New, ikm, salt, "Content-Encoding: nonce\x00", 12)
	block, _ := aes.NewCipher(key)
	gcm, _ := cipher.NewGCM(block)
	plain, err := gcm.Open(nil, nonce, body[21+idLen:], nil)
	if err != nil {
		b.g.t.Fatalf("%s cannot decrypt the push sent to %s: %v", b.name, p.path, err)
	}
	plain = bytes.TrimRight(plain, "\x00")
	if len(plain) == 0 || plain[len(plain)-1] != 2 {
		b.g.t.Fatalf("the record does not end in the last-record mark: % x", plain)
	}
	var r ring
	if err := json.Unmarshal(plain[:len(plain)-1], &r); err != nil {
		b.g.t.Fatalf("the payload is not JSON: %s", plain)
	}
	return r, string(plain[:len(plain)-1])
}

func (w *world) pushKey() string {
	w.t.Helper()
	res, err := http.Get(w.url + "/api/push/key")
	if err != nil {
		w.t.Fatal(err)
	}
	defer res.Body.Close()
	var body struct{ Key string }
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil || res.StatusCode != 200 || res.Header.Get("Access-Control-Allow-Origin") != "*" {
		w.t.Fatalf("GET /api/push/key = %d, %v", res.StatusCode, err)
	}
	return body.Key
}

// restart is the server going down and coming back, as far as bells are concerned.
func (w *world) restart() { w.restartAs(contact) }

// restartAs is a restart with another -contact.
func (w *world) restartAs(contact string) {
	w.t.Helper()
	w.bells.Close()
	bells, err := push.New(w.db, sync.New(w.db, w.now), w.now, w.gateway.Client(), contact)
	if err != nil {
		w.t.Fatal(err)
	}
	w.bells, w.hub.OnTimer = bells, bells.TimerChanged
}

func (w *world) subscriptions() (n int) {
	w.t.Helper()
	if err := w.db.QueryRow("select count(*) from push_subscription").Scan(&n); err != nil {
		w.t.Fatal(err)
	}
	return n
}

const bellMs = 200 // a lap short enough to wait for

func TestPushKeyIsPublicAndKept(t *testing.T) {
	w := start(t)
	key := w.pushKey() // no token: a browser needs it before it has one
	point, err := b64url.DecodeString(key)
	if err != nil || len(point) != 65 || point[0] != 4 {
		t.Fatalf("key %q is not an uncompressed P-256 point in base64url", key)
	}
	if _, err := ecdh.P256().NewPublicKey(point); err != nil {
		t.Errorf("the key is not on the curve: %v", err)
	}
	// A browser's subscription is tied to this key. A restart that made a new one would
	// silently end every subscription there is.
	w.restart()
	if again := w.bells.Key(); again != key {
		t.Errorf("after a restart the key is %q, was %q", again, key)
	}
	// The private half is in the database, and nowhere a request can reach.
	var stored []byte
	if err := w.db.QueryRow("select private from push_key").Scan(&stored); err != nil || len(stored) == 0 {
		t.Fatalf("no key stored: %v", err)
	}
}

func TestSubscribeReplaceUnsubscribeAndSignOut(t *testing.T) {
	w := start(t)
	ravi := w.signUp("ravi", phone)
	chrome, firefox := w.gateway.browser("chrome"), w.gateway.browser("firefox")

	chrome.subscribe(w, ravi.Token, phone)
	var endpoint, words string
	read := func() {
		t.Helper()
		if err := w.db.QueryRow("select endpoint, words from push_subscription where device = ?", phone).Scan(&endpoint, &words); err != nil {
			t.Fatal(err)
		}
	}
	read()
	if endpoint != w.gateway.URL+"/push/chrome" || !strings.Contains(words, "chrome: take fifteen.") {
		t.Errorf("stored %q with words %s", endpoint, words)
	}
	// One subscription per device: a new one replaces the old.
	firefox.subscribe(w, ravi.Token, phone)
	read()
	if w.subscriptions() != 1 || endpoint != w.gateway.URL+"/push/firefox" || !strings.Contains(words, "firefox: break over.") {
		t.Errorf("after subscribing again: %d subscriptions, %q", w.subscriptions(), endpoint)
	}

	var e session
	good := func() map[string]any {
		return map[string]any{"token": ravi.Token, "device": phone, "subscription": chrome.subscription(), "words": chrome.words}
	}
	change := func(edit func(body map[string]any)) map[string]any {
		body := good()
		// Through JSON and back, so each case edits its own copy.
		raw, _ := json.Marshal(body)
		json.Unmarshal(raw, &body)
		edit(body)
		return body
	}
	sub := func(body map[string]any) map[string]any { return body["subscription"].(map[string]any) }
	keys := func(body map[string]any) map[string]any { return sub(body)["keys"].(map[string]any) }
	wordsOf := func(body map[string]any) map[string]any { return body["words"].(map[string]any) }
	for what, body := range map[string]map[string]any{
		"an endpoint over http":       change(func(b map[string]any) { sub(b)["endpoint"] = "http://push.example.net/x" }),
		"an endpoint that is no URL":  change(func(b map[string]any) { sub(b)["endpoint"] = "push.example.net/x" }),
		"an endpoint with a password": change(func(b map[string]any) { sub(b)["endpoint"] = "https://me:pw@push.example.net/x" }),
		"an endpoint of 3000 bytes":   change(func(b map[string]any) { sub(b)["endpoint"] = "https://push.example.net/" + strings.Repeat("x", 3000) }),
		"no subscription":             change(func(b map[string]any) { delete(b, "subscription") }),
		"a key that is not base64url": change(func(b map[string]any) { keys(b)["p256dh"] = "not a key!" }),
		"a key that is not a point":   change(func(b map[string]any) { keys(b)["p256dh"] = b64url.EncodeToString(make([]byte, 65)) }),
		"an auth secret of 8 bytes":   change(func(b map[string]any) { keys(b)["auth"] = b64url.EncodeToString(make([]byte, 8)) }),
		"no words":                    change(func(b map[string]any) { delete(b, "words") }),
		"three laps":                  change(func(b map[string]any) { wordsOf(b)["lap"] = []string{"1", "2", "3"} }),
		"five breaks":                 change(func(b map[string]any) { wordsOf(b)["take"] = []string{"1", "2", "3", "4", "5"} }),
		"no word for a break ending":  change(func(b map[string]any) { delete(wordsOf(b), "break") }),
		"a sentence of 81 characters": change(func(b map[string]any) { wordsOf(b)["next"] = []string{"1", "2", "3", strings.Repeat("n", 81)} }),
		"an empty sentence":           change(func(b map[string]any) { wordsOf(b)["lap"] = []string{"1", "", "3", "4"} }),
		"words of another shape":      change(func(b map[string]any) { b["words"] = "Lap done." }),
		"no device":                   change(func(b map[string]any) { delete(b, "device") }),
	} {
		if status, _ := w.post("/api/push/subscribe", body, &e); status != 400 || e.Error != "bad_request" {
			t.Errorf("subscribe with %s: %d %q, want 400 bad_request", what, status, e.Error)
		}
	}
	for _, path := range []string{"/api/push/subscribe", "/api/push/unsubscribe"} {
		if status, _ := w.post(path, change(func(b map[string]any) { b["token"] = "NOSUCHTOKEN" }), &e); status != 401 || e.Error != "token" {
			t.Errorf("%s with nobody's token: %d %q, want 401 token", path, status, e.Error)
		}
	}
	read()
	if w.subscriptions() != 1 || endpoint != w.gateway.URL+"/push/firefox" {
		t.Errorf("the refused requests changed what is stored: %d subscriptions, %q", w.subscriptions(), endpoint)
	}
	// The limits themselves: 80 characters, counted as the app counts them, and padded base64.
	ok := change(func(b map[string]any) {
		wordsOf(b)["break"] = strings.Repeat("ව", 80)
		keys(b)["auth"] = base64.URLEncoding.EncodeToString(chrome.auth)
	})
	if status, _ := w.post("/api/push/subscribe", ok, &e); status != 200 {
		t.Errorf("80 characters and a padded key: %d %s", status, e.Error)
	}

	var body map[string]any
	if status, _ := w.post("/api/push/unsubscribe", creds{"token": ravi.Token, "device": phone}, &body); status != 200 || len(body) != 0 || w.subscriptions() != 0 {
		t.Errorf("unsubscribe = %d %v, %d subscriptions left", status, body, w.subscriptions())
	}
	if status, _ := w.post("/api/push/unsubscribe", creds{"token": ravi.Token, "device": phone}, &body); status != 200 {
		t.Errorf("unsubscribing with nothing subscribed = %d, want the same answer", status)
	}

	// Signing a device out takes its subscription with it, and only its own.
	lap := w.signIn("ravi", laptop)
	chrome.subscribe(w, ravi.Token, phone)
	firefox.subscribe(w, lap.Token, laptop)
	if status, _ := w.post("/api/logout", creds{"token": ravi.Token}, &body); status != 200 {
		t.Fatalf("logout = %d", status)
	}
	read2 := ""
	if err := w.db.QueryRow("select group_concat(device) from push_subscription").Scan(&read2); err != nil || read2 != laptop {
		t.Errorf("after the phone signed out, subscriptions are held for %q, want only the laptop's", read2)
	}
	// Signing in again on a device is not signing out: it keeps its subscription.
	w.signIn("ravi", laptop)
	if w.subscriptions() != 1 {
		t.Errorf("signing in again dropped the device's subscription")
	}
}

// checkVAPID verifies the push's signature with the server's public key, as a push service does.
func checkVAPID(t *testing.T, w *world, p pushed) {
	t.Helper()
	header := p.header.Get("Authorization")
	token, key, found := strings.Cut(strings.TrimPrefix(header, "vapid t="), ", k=")
	if !found || !strings.HasPrefix(header, "vapid t=") || key != w.pushKey() {
		t.Fatalf("Authorization = %q, want vapid t=<jwt>, k=<the server's public key>", header)
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatalf("the token has %d parts", len(parts))
	}
	point, _ := b64url.DecodeString(key)
	x, y := elliptic.Unmarshal(elliptic.P256(), point) //nolint:staticcheck // the test's own check, not the server's code
	signature, err := b64url.DecodeString(parts[2])
	if err != nil || len(signature) != 64 {
		t.Fatalf("the signature is %d bytes, want r and s side by side: 64", len(signature))
	}
	digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if !ecdsa.Verify(&ecdsa.PublicKey{Curve: elliptic.P256(), X: x, Y: y}, digest[:], new(big.Int).SetBytes(signature[:32]), new(big.Int).SetBytes(signature[32:])) {
		t.Error("the token does not verify with the server's public key")
	}
	var head struct{ Typ, Alg string }
	var claims struct {
		Aud, Sub string
		Exp      int64
	}
	rawHead, _ := b64url.DecodeString(parts[0])
	rawClaims, _ := b64url.DecodeString(parts[1])
	if json.Unmarshal(rawHead, &head) != nil || json.Unmarshal(rawClaims, &claims) != nil || head.Alg != "ES256" || head.Typ != "JWT" {
		t.Fatalf("header %s, claims %s", rawHead, rawClaims)
	}
	// The audience is the push service's origin and nothing of the path, which is the secret part.
	if claims.Aud != w.gateway.URL || claims.Sub != contact {
		t.Errorf("aud %q sub %q, want %q and %q", claims.Aud, claims.Sub, w.gateway.URL, contact)
	}
	if left := time.Unix(claims.Exp, 0).Sub(w.now()); left <= 0 || left > 24*time.Hour {
		t.Errorf("the token expires in %v: a push service wants under a day", left)
	}
}

func TestBellSendsOnePushToEachSubscribedDeviceOfThatAccount(t *testing.T) {
	w := start(t)
	ravi, sachi := w.person("ravi", phone, 330), w.person("sachi", pocket, 330)
	lap := w.signIn("ravi", laptop)
	w.signIn("ravi", tablet) // a third device of ravi's that never asked to be rung
	onPhone, onLaptop, sachis := w.gateway.browser("ravi-phone"), w.gateway.browser("ravi-laptop"), w.gateway.browser("sachi")
	onPhone.subscribe(w, ravi.Token, phone)
	onLaptop.subscribe(w, lap.Token, laptop)
	sachis.subscribe(w, sachi.Token, pocket)

	// Lap 2 of the set, for a task whose title is shared with a room. None of that title
	// may ride along.
	together(t, "Sachi and me", ravi, sachi)
	ravi.set(map[[3]string]any{{"task", "t1", "title"}: "Secret thesis", {"settings", "current", "share_task"}: true})
	started := w.ms.Load()
	ravi.set(timerCell(running("work", "run-1", "t1", started, bellMs, 1)))
	w.gateway.none("the lap is still running")
	w.pass(bellMs * time.Millisecond)

	got := w.gateway.wait(2)
	seen := map[string]bool{}
	for _, p := range got {
		b := map[string]*browser{onPhone.path(): onPhone, onLaptop.path(): onLaptop}[p.path]
		if b == nil {
			t.Fatalf("a push went to %s", p.path)
		}
		seen[p.path] = true
		r, raw := b.open(p)
		want := ring{"ring", "run-1", started + bellMs, b.name + ": lap 2 of 4, done.", b.name + ": take five after lap 2."}
		if r != want {
			t.Errorf("%s was sent %+v, want %+v", b.name, r, want)
		}
		// Exactly these five things, and so no task and no title of anything.
		var fields map[string]any
		json.Unmarshal([]byte(raw), &fields)
		if len(fields) != 5 || strings.Contains(raw, "Secret") || strings.Contains(raw, "t1") {
			t.Errorf("the payload holds more than the five fields: %s", raw)
		}
		if p.header.Get("TTL") != "60" || p.header.Get("Urgency") != "high" || p.header.Get("Content-Type") != "application/octet-stream" {
			t.Errorf("headers: TTL %q, Urgency %q, Content-Type %q", p.header.Get("TTL"), p.header.Get("Urgency"), p.header.Get("Content-Type"))
		}
		if bytes.Contains(p.body, []byte("lap 2")) || bytes.Contains(p.body, []byte("run-1")) {
			t.Error("the push service can read the message")
		}
		checkVAPID(t, w, p)
	}
	if len(seen) != 2 {
		t.Errorf("the two pushes went to %v, want one for each of ravi's subscribed devices", seen)
	}
	// One each and no more: not a second for the same bell, nothing for sachi, whose
	// timer is not running, and nothing when sachi's own lap is someone else's news.
	w.gateway.none("the bell has been sent once to each device")
	ravi.set(timerCell(running("work", "run-1", "t1", started, bellMs, 1))) // the same state pushed again, as a device coming back would
	w.gateway.none("the same run's bell was already sent")

	// Sachi's break ends: hers alone, in her words, and a break's words.
	started = w.ms.Load()
	sachi.set(timerCell(running("short", "run-2", nil, started, bellMs, 1)))
	w.pass(bellMs * time.Millisecond)
	p := w.gateway.wait(1)[0]
	if r, _ := sachis.open(p); p.path != sachis.path() || r != (ring{"ring", "run-2", started + bellMs, "sachi: break over.", "sachi: lap 3 is next."}) {
		t.Errorf("sachi's break ended and %s was sent %+v", p.path, r)
	}
	w.gateway.none("sachi's bell is not ravi's")
}

func TestWordsFollowThePhaseAndThePlaceInTheSet(t *testing.T) {
	w := start(t)
	ravi := w.person("ravi", phone, 330)
	b := w.gateway.browser("ravi")
	b.subscribe(w, ravi.Token, phone)
	for i, c := range []struct {
		phase       string
		setIndex    int
		title, body string
	}{
		{"work", 0, "ravi: lap 1 of 4, done.", "ravi: take five after lap 1."},
		{"work", 3, "ravi: lap 4 of 4, done.", "ravi: take fifteen."}, // the fourth lap earns the long break
		{"short", 0, "ravi: break over.", "ravi: lap 2 is next."},
		{"short", 2, "ravi: break over.", "ravi: lap 4 is next."},
		{"long", 3, "ravi: break over.", "ravi: lap 1 is next."}, // after the long break the set starts again
	} {
		ravi.set(timerCell(running(c.phase, fmt.Sprint("run-", i), nil, w.ms.Load(), bellMs, c.setIndex)))
		w.pass(bellMs * time.Millisecond)
		if r, _ := b.open(w.gateway.wait(1)[0]); r.Title != c.title || r.Body != c.body || r.Run != fmt.Sprint("run-", i) {
			t.Errorf("%s at index %d rang %q / %q, want %q / %q", c.phase, c.setIndex, r.Title, r.Body, c.title, c.body)
		}
	}
}

// What a person does before the bell moves it or takes it away. Each case waits past the
// moment the old bell would have rung.
func TestPauseStopExtendAndAnotherStartMoveTheBell(t *testing.T) {
	w := start(t)
	ravi := w.person("ravi", phone, 330)
	b := w.gateway.browser("ravi")
	b.subscribe(w, ravi.Token, phone)
	begin := func(run string) (map[string]any, int64) {
		started := w.ms.Load()
		state := running("work", run, nil, started, bellMs, 0)
		ravi.set(timerCell(state))
		return state, started
	}
	rings := func(what, run string, at int64) {
		t.Helper()
		if r, _ := b.open(w.gateway.wait(1)[0]); r.Run != run || r.At != at {
			t.Errorf("%s: rang %s at %d, want %s at %d", what, r.Run, r.At, run, at)
		}
		w.gateway.none(what + ": it rang once")
	}

	// Paused before the bell: a paused lap never rings. Resumed: it rings at the new end.
	state, started := begin("run-pause")
	w.pass(bellMs / 2 * time.Millisecond)
	state["paused_at"] = w.ms.Load()
	ravi.set(timerCell(state))
	w.pass(5 * bellMs * time.Millisecond)
	w.gateway.none("the lap is paused")
	state["paused_at"], state["paused_ms"] = nil, 5*bellMs
	ravi.set(timerCell(state))
	w.pass(bellMs / 2 * time.Millisecond)
	rings("resumed", "run-pause", started+5*bellMs+bellMs)

	// Stopped: nothing.
	begin("run-stop")
	ravi.set(timerCell(idle))
	w.pass(bellMs * time.Millisecond)
	w.gateway.none("the lap was stopped")

	// Extended: nothing at the old end, one at the new.
	state, started = begin("run-extend")
	state["planned_ms"] = 3 * bellMs
	ravi.set(timerCell(state))
	w.pass(bellMs * time.Millisecond)
	w.gateway.none("the lap was given more time")
	w.pass(2 * bellMs * time.Millisecond)
	rings("extended", "run-extend", started+3*bellMs)

	// Replaced by another run before its bell: only the new one rings.
	begin("run-old")
	w.pass(bellMs / 2 * time.Millisecond)
	started = w.ms.Load()
	ravi.set(timerCell(running("work", "run-new", nil, started, 2*bellMs, 1)))
	w.pass(bellMs / 2 * time.Millisecond)
	w.gateway.none("the first run was replaced")
	w.pass(3 * bellMs / 2 * time.Millisecond)
	rings("replaced", "run-new", started+2*bellMs)

	// More time after the bell reopens the lap: that is a new end, and a new bell.
	state, started = begin("run-again")
	w.pass(bellMs * time.Millisecond)
	rings("the first end", "run-again", started+bellMs)
	state["planned_ms"] = 3 * bellMs
	ravi.set(timerCell(state))
	w.pass(2 * bellMs * time.Millisecond)
	rings("reopened", "run-again", started+3*bellMs)
}

func TestRestartInTheMiddleOfALapStillRings(t *testing.T) {
	w := start(t)
	ravi := w.person("ravi", phone, 330)
	b := w.gateway.browser("ravi")
	b.subscribe(w, ravi.Token, phone)

	started := w.ms.Load()
	ravi.set(timerCell(running("work", "run-1", nil, started, bellMs, 0)))
	w.restart() // down and up again while the lap runs: the bell is set from the database
	w.pass(bellMs * time.Millisecond)
	if r, _ := b.open(w.gateway.wait(1)[0]); r.Run != "run-1" || r.At != started+bellMs {
		t.Errorf("after a restart: %+v", r)
	}
	// A restart just after the bell does not ring it again: the database remembers.
	w.restart()
	w.gateway.none("this bell was sent before the restart")

	// Down across the bell and back 59 s late: late, but still a bell.
	started = w.ms.Load()
	ravi.set(timerCell(running("work", "run-2", nil, started, bellMs, 1)))
	w.bells.Close()
	w.pass(bellMs*time.Millisecond + 59*time.Second)
	w.restart()
	if r, _ := b.open(w.gateway.wait(1)[0]); r.Run != "run-2" || r.At != started+bellMs {
		t.Errorf("59 s late: %+v", r)
	}
	w.gateway.none("it rang once")

	// 61 s late is not a bell.
	started = w.ms.Load()
	ravi.set(timerCell(running("work", "run-3", nil, started, bellMs, 2)))
	w.bells.Close()
	w.pass(bellMs*time.Millisecond + 61*time.Second)
	w.restart()
	w.gateway.none("the bell is 61 s gone")
}

func TestGoneDeletesTheSubscriptionAndAnErrorDoesNot(t *testing.T) {
	w := start(t)
	ravi := w.person("ravi", phone, 330)
	lap, tab := w.signIn("ravi", laptop), w.signIn("ravi", tablet)
	gone, missing, broken := w.gateway.browser("gone"), w.gateway.browser("missing"), w.gateway.browser("broken")
	gone.subscribe(w, ravi.Token, phone)
	missing.subscribe(w, lap.Token, laptop)
	broken.subscribe(w, tab.Token, tablet)
	w.gateway.answer[gone.path()], w.gateway.answer[missing.path()], w.gateway.answer[broken.path()] = 410, 404, 500

	ravi.set(timerCell(running("work", "run-1", nil, w.ms.Load(), bellMs, 0)))
	w.pass(bellMs * time.Millisecond)
	w.gateway.wait(3)
	// The answers are handled just after they arrive.
	var left string
	for range 200 {
		if err := w.db.QueryRow("select coalesce(group_concat(device), '') from push_subscription").Scan(&left); err != nil {
			t.Fatal(err)
		}
		if left == tablet {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	if left != tablet {
		t.Errorf("subscriptions left for %q, want only the one whose push service had a bad moment", left)
	}
	// Nothing is retried: the bell has passed.
	w.gateway.none("a failed push is not sent again")
	// The next bell goes to the one that is left, and only there.
	w.gateway.answer[broken.path()] = 201
	ravi.set(timerCell(running("work", "run-2", nil, w.ms.Load(), bellMs, 1)))
	w.pass(bellMs * time.Millisecond)
	if p := w.gateway.wait(1)[0]; p.path != broken.path() {
		t.Errorf("the next bell went to %s", p.path)
	}
	w.gateway.none("two of the three subscriptions are gone")
}

// 401 and 403 are what a push service says when the subscription was made under another
// key (a backup from before the key was restored), and also when it does not like the
// sender. With a contact set the first is what it means, and the row would otherwise be
// tried at every bell for ever. With none set it may be about us, and every subscription
// there is must not be thrown away for that.
func TestRefusedSubscriptionIsDroppedOnceTheSenderHasAName(t *testing.T) {
	w := start(t)
	ravi := w.person("ravi", phone, 330)
	lap, tab := w.signIn("ravi", laptop), w.signIn("ravi", tablet)
	forbidden, unauthorized, fine := w.gateway.browser("forbidden"), w.gateway.browser("unauthorized"), w.gateway.browser("fine")
	forbidden.subscribe(w, ravi.Token, phone)
	unauthorized.subscribe(w, lap.Token, laptop)
	fine.subscribe(w, tab.Token, tablet)
	w.gateway.answer[forbidden.path()], w.gateway.answer[unauthorized.path()] = 403, 401
	bell := func(run string, pushes, left int) {
		t.Helper()
		ravi.set(timerCell(running("work", run, nil, w.ms.Load(), bellMs, 0)))
		w.pass(bellMs * time.Millisecond)
		w.gateway.wait(pushes)
		for range 200 {
			if w.subscriptions() == left {
				break
			}
			time.Sleep(5 * time.Millisecond)
		}
		if got := w.subscriptions(); got != left {
			t.Errorf("after %s: %d subscriptions are kept, want %d", run, got, left)
		}
		w.gateway.none("one push a device a bell")
	}

	// The owner has set no contact: a refusal may be the push service not liking that.
	w.restartAs(push.DefaultContact)
	bell("run-1", 3, 3)
	bell("run-2", 3, 3)

	// With a contact set, a refusal is about the subscription. It goes, and is not tried again.
	w.restartAs(contact)
	bell("run-3", 3, 1)
	bell("run-4", 1, 1)
}

// A push service that does not answer must cost nobody anything: a device pushing its
// work a moment after the bell is acked as fast as ever.
func TestSlowPushServiceHoldsNothingUp(t *testing.T) {
	w := start(t)
	ravi := w.person("ravi", phone, 330)
	devices := []string{phone, laptop, tablet, pocket, "e5f6071829304152", "f607182930415263"}
	for i, id := range devices {
		token := ravi.Token
		if i > 0 {
			token = w.signIn("ravi", id).Token
		}
		w.gateway.browser(fmt.Sprint("device-", i)).subscribe(w, token, id)
	}
	quiet := time.Now()
	ravi.set(map[[3]string]any{{"task", "t0", "title"}: "before"})
	usual := time.Since(quiet)

	hold := make(chan struct{})
	release := gosync.OnceFunc(func() { close(hold) })
	defer release() // also when this test fails, or the stand-in would wait for ever
	w.gateway.mu.Lock()
	w.gateway.hold = hold
	w.gateway.mu.Unlock()
	ravi.set(timerCell(running("work", "run-1", nil, w.ms.Load(), bellMs, 0)))
	w.pass(bellMs * time.Millisecond)
	w.gateway.wait(4)

	// Six devices to ring, and the push service sits on every request. Four are in the
	// air and the other two wait their turn inside the server, not on the network.
	w.gateway.none("only four requests may be in the air")
	w.gateway.mu.Lock()
	inside := w.gateway.inside
	w.gateway.mu.Unlock()
	if inside != 4 {
		t.Errorf("%d requests are with the push service at once, want the bound of 4", inside)
	}

	// Meanwhile the server is as quick as it was: a batch by POST, one on the socket, a
	// timer change (which touches the bell itself), a room, a sign-in.
	began := time.Now()
	ravi.set(map[[3]string]any{{"task", "t1", "title"}: "while the push service sleeps"})
	stuck := time.Since(began)
	ravi.push("k", cell(stamp(59, phone), "task", "t2", "title", `1`))
	for {
		if m, err := ravi.read(); err != nil {
			t.Fatal(err)
		} else if m.Type == "ack" {
			break
		}
	}
	ravi.set(timerCell(running("work", "run-2", nil, w.ms.Load(), 60000, 1)))
	ravi.ask("create", map[string]any{"name": "meanwhile"}).ok(t, "create a room")
	w.signIn("ravi", phone)
	if all := time.Since(began); all > time.Second || stuck > 250*time.Millisecond {
		t.Errorf("with the push service stuck, a push batch took %v and the five requests %v (a batch took %v before)", stuck, all, usual)
	}
	t.Logf("a push batch was acked in %v with four pushes stuck in the air (%v with none)", stuck, usual)

	release()
	w.gateway.wait(2) // the two that waited get their turn once the first four are answered
}

// Everything that can go wrong with a push, with the log open. What is written names no
// endpoint, no word, no key and no run.
func TestNothingOfASubscriptionIsLogged(t *testing.T) {
	var written bytes.Buffer
	stderr := log.Writer()
	log.SetOutput(&written)
	defer log.SetOutput(stderr)

	w := start(t)
	ravi := w.person("ravi", phone, 330)
	lap, tab := w.signIn("ravi", laptop), w.signIn("ravi", tablet)
	gone, broken, away := w.gateway.browser("gone-secret-path"), w.gateway.browser("broken-secret-path"), w.gateway.browser("away-secret-path")
	gone.subscribe(w, ravi.Token, phone)
	broken.subscribe(w, lap.Token, laptop)
	w.gateway.answer[gone.path()], w.gateway.answer[broken.path()] = 410, 500
	// A push service that is not there at all: nothing listens on this port.
	unreachable := away.subscription()
	unreachable["endpoint"] = "https://127.0.0.1:1/push/away-secret-path"
	var e session
	w.post("/api/push/subscribe", map[string]any{"token": tab.Token, "device": tablet, "subscription": unreachable, "words": away.words}, &e)
	w.post("/api/push/subscribe", map[string]any{"token": tab.Token, "device": tablet, "subscription": map[string]any{"endpoint": "http://refused-secret-path"}, "words": away.words}, &e)

	ravi.set(timerCell(running("work", "run-secret", nil, w.ms.Load(), bellMs, 0)))
	w.pass(bellMs * time.Millisecond)
	w.gateway.wait(2)
	time.Sleep(2 * aMoment) // the third fails to connect, and the answers are handled
	w.bells.Close()         // every send has finished

	logged := written.String()
	for _, secret := range []string{"secret-path", "127.0.0.1", w.gateway.URL, "take five", "lap 1", "run-secret", ravi.Token,
		b64url.EncodeToString(gone.auth), b64url.EncodeToString(gone.key.PublicKey().Bytes()), w.bells.Key(), "ravi"} {
		if strings.Contains(logged, secret) {
			t.Errorf("the log holds %q:\n%s", secret, logged)
		}
	}
	// It does say that something went wrong, twice: the 500 and the push service that was not there.
	if !strings.Contains(logged, "a push service answered 500") || !strings.Contains(logged, "a push service could not be reached") || strings.Count(logged, "\n") != 2 {
		t.Errorf("the log:\n%s\nwant one line for the 500 and one for the push service that was not there", logged)
	}
}

// What the browser's side must match: the reply shapes, to the byte.
func TestPushRepliesAreWhatTheProtocolShows(t *testing.T) {
	w := start(t)
	ravi := w.signUp("ravi", phone)
	b := w.gateway.browser("ravi")
	raw := func(path string, body any) string {
		res, err := http.Post(w.url+path, "application/json", strings.NewReader(asJSON(body)))
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		data, _ := io.ReadAll(res.Body)
		return strings.TrimSpace(string(data))
	}
	if got := raw("/api/push/subscribe", map[string]any{"token": ravi.Token, "device": phone, "subscription": b.subscription(), "words": b.words}); got != "{}" {
		t.Errorf("subscribe answered %s", got)
	}
	if got := raw("/api/push/unsubscribe", creds{"token": ravi.Token, "device": phone}); got != "{}" {
		t.Errorf("unsubscribe answered %s", got)
	}
	res, err := http.Get(w.url + "/api/push/key")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var body map[string]string
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil || !reflect.DeepEqual(body, map[string]string{"key": w.bells.Key()}) {
		t.Errorf("GET /api/push/key answered %v, %v", body, err)
	}
}
