package push

import (
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"math/big"
	"net/http"
	"net/netip"
	"slices"
	"strings"
	"testing"
	"time"

	"heirloom/server/store"
	"heirloom/server/sync"
)

func raw(t *testing.T, text string) []byte {
	t.Helper()
	b, err := b64.DecodeString(text)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

// The example of RFC 8291 section 5, with the keys and salt of its appendix A. If this
// is the same to the byte, a browser can read what the server sends.
func TestEncryptionMatchesRFC8291(t *testing.T) {
	sender, err := ecdh.P256().NewPrivateKey(raw(t, "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"))
	if err != nil {
		t.Fatal(err)
	}
	ua, err := ecdh.P256().NewPublicKey(raw(t, "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"))
	if err != nil {
		t.Fatal(err)
	}
	if got := b64.EncodeToString(sender.PublicKey().Bytes()); got != "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8" {
		t.Fatalf("the sender's public key is %s: the test's own keys are wrong", got)
	}
	plaintext := []byte("When I grow up, I want to be a watermelon")
	body, err := encrypt(plaintext, ua, raw(t, "BTBZMqHH6r4Tts7J_aSIgg"), sender, raw(t, "DGv6ra1nlYgDCS1FRnbzlw"))
	if err != nil {
		t.Fatal(err)
	}
	const want = "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml" +
		"mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT" +
		"pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN"
	if got := b64.EncodeToString(body); got != want {
		t.Errorf("encrypted to\n%s\nwant the RFC's\n%s", got, want)
	}
	// 16 of salt, 4 of record size, 1 and 65 of key, 41 of text, 1 of padding mark, 16 of
	// tag. (The RFC's example says Content-Length: 145; its own body is these 144.)
	if len(body) != 144 {
		t.Errorf("the body is %d bytes, want 144", len(body))
	}
	if string(plaintext) != "When I grow up, I want to be a watermelon" {
		t.Error("encrypting changed the caller's plaintext")
	}
	// A real message has a key and a salt of its own each time.
	one, _ := seal(plaintext, ua, raw(t, "BTBZMqHH6r4Tts7J_aSIgg"))
	two, _ := seal(plaintext, ua, raw(t, "BTBZMqHH6r4Tts7J_aSIgg"))
	if string(one) == string(two) || len(one) != 144 {
		t.Error("two messages were sealed the same way")
	}
}

// The token a push service checks: it must verify with the public key browsers
// subscribed with, and name that push service and nobody else.
func TestVAPIDVerifiesAndNamesItsAudience(t *testing.T) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 11, 25, 4, 30, 0, 0, time.UTC)
	header, err := vapid(key, "https://fcm.googleapis.com", "mailto:owner@example.org", now)
	if err != nil {
		t.Fatal(err)
	}
	token, k, found := strings.Cut(strings.TrimPrefix(header, "vapid t="), ", k=")
	point, _ := key.PublicKey.ECDH()
	if !found || !strings.HasPrefix(header, "vapid t=") || k != b64.EncodeToString(point.Bytes()) {
		t.Fatalf("header = %q", header)
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatalf("%d parts", len(parts))
	}
	signature := raw(t, parts[2])
	if len(signature) != 64 {
		t.Fatalf("the signature is %d bytes: ES256 in a JWT is r and s, 32 each", len(signature))
	}
	digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if !ecdsa.Verify(&key.PublicKey, digest[:], new(big.Int).SetBytes(signature[:32]), new(big.Int).SetBytes(signature[32:])) {
		t.Error("the signature does not verify")
	}
	// Signed by this key and no other.
	other, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if ecdsa.Verify(&other.PublicKey, digest[:], new(big.Int).SetBytes(signature[:32]), new(big.Int).SetBytes(signature[32:])) {
		t.Error("the signature verifies with somebody else's key")
	}
	if string(raw(t, parts[0])) != `{"typ":"JWT","alg":"ES256"}` {
		t.Errorf("header %s", raw(t, parts[0]))
	}
	var claims map[string]any
	if err := json.Unmarshal(raw(t, parts[1]), &claims); err != nil {
		t.Fatal(err)
	}
	if len(claims) != 3 || claims["aud"] != "https://fcm.googleapis.com" || claims["sub"] != "mailto:owner@example.org" || claims["exp"] != float64(now.Add(12*time.Hour).Unix()) {
		t.Errorf("claims %v, want the audience, the contact and twelve hours", claims)
	}
}

func TestWordsArePickedByPhaseAndPlace(t *testing.T) {
	w := Words{Lap: []string{"L1", "L2", "L3", "L4"}, Take: []string{"T1", "T2", "T3", "long"}, Break: "over", Next: []string{"N1", "N2", "N3", "N4"}}
	for _, c := range []struct {
		phase       string
		index       int
		title, body string
	}{
		{"work", 0, "L1", "T1"}, {"work", 1, "L2", "T2"}, {"work", 2, "L3", "T3"}, {"work", 3, "L4", "long"},
		{"short", 0, "over", "N2"}, {"short", 1, "over", "N3"}, {"short", 2, "over", "N4"}, {"short", 3, "over", "N1"},
		{"long", 3, "over", "N1"}, {"long", 0, "over", "N1"},
	} {
		if title, body := w.pick(c.phase, c.index); title != c.title || body != c.body {
			t.Errorf("%s at %d: %q / %q, want %q / %q", c.phase, c.index, title, body, c.title, c.body)
		}
	}
}

// An endpoint is a URL a signed-in person gave us. It must not be a way to make the
// server call the machine it runs on, or the network it sits in.
func TestOnlyPublicAddressesAreDialled(t *testing.T) {
	for address, want := range map[string]bool{
		"142.250.72.10:443":              true,
		"[2607:f8b0:4005:80a::200a]:443": true,
		"127.0.0.1:8787":                 false,
		"[::1]:443":                      false,
		"10.0.0.5:443":                   false,
		"192.168.41.30:443":              false,
		"172.16.3.4:443":                 false,
		"169.254.169.254:443":            false,
		"[fe80::1]:443":                  false,
		"[fd00::1]:443":                  false,
		"[::ffff:127.0.0.1]:443":         false,
		"[::ffff:10.0.0.5]:443":          false,
		"0.0.0.0:443":                    false,
		"224.0.0.1:443":                  false,
		"localhost:443":                  false,
		"not an address":                 false,
	} {
		if got := public(address); got != want {
			t.Errorf("public(%q) = %v, want %v", address, got, want)
		}
	}
	// Every range the IANA registries set apart from the public internet: its first
	// address, its last, and one inside.
	for _, prefix := range notPublic {
		first := prefix.Addr()
		bytes := first.AsSlice()
		for bit := prefix.Bits(); bit < len(bytes)*8; bit++ {
			bytes[bit/8] |= 1 << (7 - bit%8)
		}
		last, _ := netip.AddrFromSlice(bytes)
		for _, ip := range []netip.Addr{first, last, first.Next()} {
			if prefix.Contains(ip) && public(netip.AddrPortFrom(ip, 443).String()) {
				t.Errorf("%s, in %s, would be dialled", ip, prefix)
			}
		}
	}
	for _, prefix := range []string{
		"0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24",
		"192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4",
		"::/128", "::1/128", "64:ff9b:1::/48", "100::/64", "2001::/23", "2001:db8::/32", "2002::/16", "3fff::/20", "5f00::/16", "fc00::/7", "fe80::/10", "ff00::/8",
	} {
		if !slices.Contains(notPublic, netip.MustParsePrefix(prefix)) {
			t.Errorf("%s is not in the list", prefix)
		}
	}
	// An IPv6-only network reaches IPv4 hosts through 64:ff9b::/96, so those are judged
	// by the IPv4 address inside.
	for address, want := range map[string]bool{
		"[64:ff9b::8.8.8.8]:443":       true,
		"[64:ff9b::10.0.0.5]:443":      false,
		"[64:ff9b::100.64.0.1]:443":    false,
		"[64:ff9b::127.0.0.1]:443":     false,
		"[64:ff9b::192.168.41.30]:443": false,
		"100.100.100.100:443":          false, // Tailscale lives in 100.64.0.0/10
		"198.18.0.1:443":               false,
		"198.19.255.255:443":           false,
		"198.20.0.1:443":               true,
		"100.128.0.1:443":              true,
		"[2001:4860:4860::8888]:443":   true, // not in 2001::/23
		"[2a00:1450:4001::200a]:443":   true,
		"1.1.1.1:443":                  true,
	} {
		if got := public(address); got != want {
			t.Errorf("public(%q) = %v, want %v", address, got, want)
		}
	}
	// The real client is the one with the guard in it, and it follows no redirect.
	res, err := Client().Get("https://127.0.0.1:1/")
	if err == nil {
		res.Body.Close()
		t.Fatal("the client reached the loopback")
	}
	if !strings.Contains(err.Error(), "not a public address") {
		t.Errorf("the loopback was refused for another reason: %v", err)
	}
	if Client().CheckRedirect(nil, nil) != http.ErrUseLastResponse {
		t.Error("the client would follow a redirect to wherever a push service's address pointed")
	}
}

type world struct {
	*Service
	db    *sql.DB
	cells *sync.Store
	now   time.Time
}

func newWorld(t *testing.T) *world {
	t.Helper()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	w := &world{db: db, now: time.Date(2026, 11, 25, 4, 30, 0, 0, time.UTC)}
	w.cells = sync.New(db, func() time.Time { return w.now })
	w.Service, err = New(db, w.cells, func() time.Time { return w.now }, &http.Client{}, DefaultContact)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { w.Close(); db.Close() })
	return w
}

// device makes an account (or uses the one given) with a signed-in device.
func (w *world) device(t *testing.T, account int64, name, id string) int64 {
	t.Helper()
	if account == 0 {
		res, err := w.db.Exec("insert into account (public_id, username, password, created) values (?, ?, '', 0)", name, name)
		if err != nil {
			t.Fatal(err)
		}
		account, _ = res.LastInsertId()
	}
	if _, err := w.db.Exec("insert into token (account, device, hash, created) values (?, ?, ?, 0)", account, id, []byte(name+id)); err != nil {
		t.Fatal(err)
	}
	return account
}

func subscription(t *testing.T) Subscription {
	t.Helper()
	key, _ := ecdh.P256().GenerateKey(rand.Reader)
	var s Subscription
	s.Endpoint = "https://push.example.net/send/abc"
	s.Keys.P256dh, s.Keys.Auth = b64.EncodeToString(key.PublicKey().Bytes()), b64.EncodeToString(make([]byte, 16))
	return s
}

var words = Words{Lap: []string{"1", "2", "3", "4"}, Take: []string{"1", "2", "3", "4"}, Break: "b", Next: []string{"1", "2", "3", "4"}}

func (w *world) timer(t *testing.T, account int64, state string) {
	t.Helper()
	w.now = w.now.Add(time.Second)
	cell, _ := json.Marshal(map[string]any{"stamp": w.now.Format("2006-01-02T15:04:05.000Z") + "-0000-a1b2c3d4e5f60718",
		"dataset": "timer", "row": "current", "field": "state", "value": json.RawMessage(state)})
	if _, err := w.cells.Push(account, []json.RawMessage{cell}); err != nil {
		t.Fatal(err)
	}
	w.TimerChanged(account)
}

func (w *world) held() (accounts, bells int) {
	w.mu.Lock()
	defer w.mu.Unlock()
	for _, bell := range w.bells {
		if bell != nil {
			bells++
		}
	}
	return len(w.bells), bells
}

// The schedule holds one entry for an account with a subscription, one timer while a
// run of its is on the way to a bell, and nothing at all for anybody else.
func TestNothingIsHeldForAnAccountWithNoSubscription(t *testing.T) {
	w := newWorld(t)
	ravi, sachi := w.device(t, 0, "ravi", "a1b2c3d4e5f60718"), w.device(t, 0, "sachi", "b2c3d4e5f6071829")
	w.device(t, ravi, "ravi", "c3d4e5f607182930")
	running := func() string {
		return `{"phase":"work","run":"r","task":null,"started":` + jsonInt(w.now.UnixMilli()) + `,"paused_at":null,"paused_ms":0,"planned_ms":1500000,"set_index":0}`
	}
	const idle = `{"phase":"idle","run":null,"task":null,"started":null,"paused_at":null,"paused_ms":0,"planned_ms":0,"set_index":0}`
	check := func(what string, accounts, bells int) {
		t.Helper()
		if a, b := w.held(); a != accounts || b != bells {
			t.Errorf("%s: %d accounts and %d timers are held, want %d and %d", what, a, b, accounts, bells)
		}
	}

	// Nobody has subscribed: timers start and stop, and nothing is kept.
	w.timer(t, ravi, running())
	w.timer(t, sachi, running())
	check("no subscriptions", 0, 0)

	// Ravi subscribes in the middle of his lap: one entry, one timer. Sachi still costs nothing.
	if err := w.Subscribe(ravi, "a1b2c3d4e5f60718", subscription(t), words); err != nil {
		t.Fatal(err)
	}
	check("one subscription, a lap running", 1, 1)
	// A second device of his is not a second timer.
	if err := w.Subscribe(ravi, "c3d4e5f607182930", subscription(t), words); err != nil {
		t.Fatal(err)
	}
	check("two devices of one account", 1, 1)
	w.timer(t, sachi, idle)
	check("someone else's timer changed", 1, 1)

	// Stopped, or paused: the entry stays, the timer goes.
	w.timer(t, ravi, idle)
	check("subscribed, nothing running", 1, 0)
	w.timer(t, ravi, running())
	check("running again", 1, 1)
	w.timer(t, ravi, strings.Replace(running(), `"paused_at":null`, `"paused_at":`+jsonInt(w.now.UnixMilli()), 1))
	check("paused", 1, 0)
	w.timer(t, ravi, running())

	// One device unsubscribes, the other signs out. With the last one, everything goes.
	if err := w.Unsubscribe(ravi, "a1b2c3d4e5f60718"); err != nil {
		t.Fatal(err)
	}
	check("one of two devices unsubscribed", 1, 1)
	if _, err := w.db.Exec("delete from token where account = ? and device = 'c3d4e5f607182930'", ravi); err != nil {
		t.Fatal(err)
	}
	w.timer(t, ravi, running()) // the next time anything looks, the account is found to have none
	check("the last device signed out", 0, 0)
	var left int
	if err := w.db.QueryRow("select count(*) from push_subscription").Scan(&left); err != nil || left != 0 {
		t.Errorf("%d subscriptions are still stored after the sign-out, %v", left, err)
	}
}

func jsonInt(n int64) string {
	b, _ := json.Marshal(n)
	return string(b)
}

func TestContactMustBeAnAddress(t *testing.T) {
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, contact := range []string{"", "owner@example.org", "http://example.org", "tel:+94"} {
		if s, err := New(db, sync.New(db, time.Now), time.Now, &http.Client{}, contact); err == nil {
			s.Close()
			t.Errorf("a contact of %q was taken", contact)
		}
	}
	for _, contact := range []string{DefaultContact, "mailto:owner@example.org", "https://example.org/contact"} {
		s, err := New(db, sync.New(db, time.Now), time.Now, &http.Client{}, contact)
		if err != nil {
			t.Errorf("a contact of %q was refused: %v", contact, err)
			continue
		}
		s.Close()
	}
	// The default says what it is.
	if !strings.Contains(DefaultContact, "not-set") || !strings.HasSuffix(DefaultContact, ".invalid") {
		t.Errorf("the default contact %q does not say it is unset", DefaultContact)
	}
}
