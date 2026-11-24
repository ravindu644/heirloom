// Package push rings a browser that is not looking: contracts/protocol.md section 17.
// At the moment an account's timer says a run ends, each of its subscribed devices is
// sent one Web Push. An endpoint is a capability and a word is somebody's own text:
// neither is ever logged.
package push

import (
	"bytes"
	"context"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	gosync "sync"
	"syscall"
	"time"
	"unicode/utf16"

	"heirloom/server/auth"
	"heirloom/server/rooms"
	"heirloom/server/sync"
)

const (
	// A bell this late is not a bell: the server was down when it should have rung.
	maxLate = 60 * time.Second
	// How long a push service may hold on to a message for a browser that is offline.
	ttlSeconds = "60"
	// One request to a push service. They answer in well under a second or not at all.
	sendTimeout = 10 * time.Second
	// Requests in the air at once. A bell is one request per subscribed device of one
	// account, so four is every device a person has; the rest wait their turn.
	maxInAir = 4
	maxWord  = 80
	maxURL   = 2048

	// DefaultContact is the "sub" a push service is given when the owner has set none. It
	// says so, rather than naming an address nobody reads.
	DefaultContact = "mailto:contact-not-set@heirloom.invalid"
)

// Words is what a notification says, written by the app in its own voice: the server has
// no copy of its own. Four of each for the four laps of a set.
type Words struct {
	Lap   []string `json:"lap"`   // a lap is done
	Take  []string `json:"take"`  // the break it earns; the fourth is the long one
	Break string   `json:"break"` // a break is over
	Next  []string `json:"next"`  // the lap that comes next
}

// pick is the title and body for the end of a run: by its phase and its place in the set.
func (w Words) pick(phase string, setIndex int) (title, body string) {
	switch phase {
	case "work":
		return w.Lap[setIndex], w.Take[setIndex]
	case "long":
		return w.Break, w.Next[0] // after the long break the set starts again
	default:
		return w.Break, w.Next[(setIndex+1)%4]
	}
}

func (w Words) valid() bool {
	all := append(append(append([]string{w.Break}, w.Lap...), w.Take...), w.Next...)
	if len(w.Lap) != 4 || len(w.Take) != 4 || len(w.Next) != 4 {
		return false
	}
	for _, word := range all {
		// Counted as the web app's String.length counts. A notification with no text is not one.
		if n := len(utf16.Encode([]rune(word))); n < 1 || n > maxWord {
			return false
		}
	}
	return true
}

// Subscription is the browser's own object, as PushSubscription.toJSON() gives it.
type Subscription struct {
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
}

// Service's SQLite calls take no context, for the reason sync.Store gives.
type Service struct {
	db      *sql.DB
	cells   *sync.Store
	now     func() time.Time
	client  *http.Client
	contact string
	key     *ecdsa.PrivateKey
	public  string // the key browsers subscribe with, base64url

	// The schedule. An account is in the map only while it is thought to have a
	// subscription, and its timer is set only while a run of its is on its way to a bell.
	// An account with no subscription costs one look in this map when its timer changes.
	mu     gosync.Mutex
	bells  map[int64]*time.Timer
	closed bool

	air     chan struct{}
	sending gosync.WaitGroup
	stop    context.CancelFunc
	alive   context.Context
}

// Client is the HTTP client that talks to push services: no proxy, no redirects, and no
// address that is not on the public internet. An endpoint is a URL a signed-in person
// gave us, and it must not be a way to make the server call the machine it runs on.
func Client() *http.Client {
	dialer := &net.Dialer{Timeout: 5 * time.Second, Control: func(_, address string, _ syscall.RawConn) error {
		if !public(address) {
			return errors.New("not a public address")
		}
		return nil
	}}
	return &http.Client{
		Timeout:       sendTimeout,
		Transport:     &http.Transport{DialContext: dialer.DialContext, TLSHandshakeTimeout: 5 * time.Second, MaxIdleConns: 4, IdleConnTimeout: time.Minute},
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
}

// public reports whether an address a name resolved to is one a push service could have.
func public(address string) bool {
	ap, err := netip.ParseAddrPort(address)
	if err != nil {
		return false
	}
	ip := ap.Addr().Unmap()
	return ip.IsGlobalUnicast() && !ip.IsPrivate() && !ip.IsLoopback() && !ip.IsLinkLocalUnicast()
}

// New reads the server's VAPID key, making it on the first start, and sets a bell for
// every subscribed account whose timer is running: a restart in the middle of a lap
// still rings it. contact is the "sub" of every push: a mailto: or https: the owner set.
func New(db *sql.DB, cells *sync.Store, now func() time.Time, client *http.Client, contact string) (*Service, error) {
	if !strings.HasPrefix(contact, "mailto:") && !strings.HasPrefix(contact, "https://") {
		return nil, errors.New("the push contact must begin with mailto: or https://")
	}
	s := &Service{db: db, cells: cells, now: now, client: client, contact: contact, bells: map[int64]*time.Timer{}, air: make(chan struct{}, maxInAir)}
	s.alive, s.stop = context.WithCancel(context.Background())

	fresh, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("make vapid key: %w", err)
	}
	der, err := x509.MarshalECPrivateKey(fresh)
	if err != nil {
		return nil, fmt.Errorf("make vapid key: %w", err)
	}
	// Kept only if there is none yet. Every later start reads the one from the first.
	if _, err := db.Exec("insert into push_key (id, private) values (1, ?) on conflict do nothing", der); err != nil {
		return nil, fmt.Errorf("store vapid key: %w", err)
	}
	if err := db.QueryRow("select private from push_key where id = 1").Scan(&der); err != nil {
		return nil, fmt.Errorf("read vapid key: %w", err)
	}
	if s.key, err = x509.ParseECPrivateKey(der); err != nil {
		return nil, fmt.Errorf("read vapid key: %w", err)
	}
	point, err := s.key.PublicKey.ECDH()
	if err != nil {
		return nil, fmt.Errorf("read vapid key: %w", err)
	}
	s.public = b64.EncodeToString(point.Bytes())

	rows, err := db.Query("select distinct account from push_subscription")
	if err != nil {
		return nil, fmt.Errorf("read subscriptions: %w", err)
	}
	for rows.Next() {
		var account int64
		if err := rows.Scan(&account); err != nil {
			rows.Close()
			return nil, fmt.Errorf("read subscriptions: %w", err)
		}
		s.bells[account] = nil
	}
	if err := errors.Join(rows.Err(), rows.Close()); err != nil {
		return nil, fmt.Errorf("read subscriptions: %w", err)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for account := range s.bells {
		s.set(account)
	}
	return s, nil
}

// Key is the VAPID public key a browser subscribes with.
func (s *Service) Key() string { return s.public }

// Close stops every bell and waits for the pushes in the air, cut short, so the database
// can be closed after it.
func (s *Service) Close() {
	s.mu.Lock()
	s.closed = true
	for _, bell := range s.bells {
		if bell != nil {
			bell.Stop()
		}
	}
	s.mu.Unlock()
	s.stop()
	s.sending.Wait()
}

// Subscribe keeps a device's subscription and its words. A new one replaces the old.
func (s *Service) Subscribe(account int64, device string, sub Subscription, words Words) error {
	endpoint, err := url.Parse(sub.Endpoint)
	p256dh, err1 := decode(sub.Keys.P256dh)
	authSecret, err2 := decode(sub.Keys.Auth)
	if err != nil || err1 != nil || err2 != nil || len(sub.Endpoint) > maxURL ||
		endpoint.Scheme != "https" || endpoint.Host == "" || endpoint.User != nil || len(authSecret) != 16 || !words.valid() {
		return auth.ErrBadRequest
	}
	// A key that is not a point on the curve would fail at the first bell instead.
	if _, err := ecdh.P256().NewPublicKey(p256dh); err != nil {
		return auth.ErrBadRequest
	}
	text, err := json.Marshal(words)
	if err != nil {
		return fmt.Errorf("store words: %w", err)
	}
	// rung_run and rung_at stay: a device that subscribes again a moment after a bell has
	// already had that bell.
	if _, err := s.db.Exec(`insert into push_subscription (account, device, endpoint, p256dh, auth, words) values (?, ?, ?, ?, ?, ?)
		on conflict (account, device) do update set endpoint = excluded.endpoint, p256dh = excluded.p256dh, auth = excluded.auth, words = excluded.words`,
		account, device, sub.Endpoint, p256dh, authSecret, string(text)); err != nil {
		return fmt.Errorf("store subscription: %w", err)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, watched := s.bells[account]; !watched {
		s.bells[account] = nil
	}
	s.set(account) // a lap may be running already
	return nil
}

// Browsers give base64url without padding; some libraries add it. Either is the same key.
func decode(text string) ([]byte, error) { return b64.DecodeString(strings.TrimRight(text, "=")) }

// Unsubscribe forgets a device's subscription. Having none is the same answer.
func (s *Service) Unsubscribe(account int64, device string) error {
	if _, err := s.db.Exec("delete from push_subscription where account = ? and device = ?", account, device); err != nil {
		return fmt.Errorf("delete subscription: %w", err)
	}
	s.TimerChanged(account) // if that was the account's last, its bell goes too
	return nil
}

// TimerChanged is told that an account's timer cell has a new value. It never sends and
// never waits on the network: it only moves the account's bell. For an account with no
// subscription it is one look in a map.
func (s *Service) TimerChanged(account int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, watched := s.bells[account]; watched {
		s.set(account)
	}
}

// set puts the account's bell where its timer now says, with mu held. It reads the
// account's subscriptions and its timer afresh each time, so whatever happened in
// between (a pause, a stop, more minutes, another run, a sign-out) is what counts.
func (s *Service) set(account int64) {
	if bell := s.bells[account]; bell != nil {
		bell.Stop()
	}
	if s.closed {
		return
	}
	var subscribed bool
	if err := s.db.QueryRow("select exists (select 1 from push_subscription where account = ?)", account).Scan(&subscribed); err != nil {
		log.Printf("push: %v", err) // SQLite's complaint: no endpoint, no word
		return
	}
	if !subscribed {
		delete(s.bells, account) // signed out or unsubscribed: nothing is held for it
		return
	}
	s.bells[account] = nil
	state, err := s.cells.Value(account, "timer", "current", "state")
	if err != nil {
		log.Printf("push: %v", err)
		return
	}
	timer, running := rooms.ReadTimer(state)
	at, set := timer.Ends()
	wait := time.UnixMilli(at).Sub(s.now())
	if !running || !set || wait < -maxLate {
		return // nothing running, paused, or a bell too long gone
	}
	s.bells[account] = time.AfterFunc(max(wait, 0), func() { s.ring(account) })
}

// ring is the bell: it runs when an account's timer was due. The timer is read again,
// because the cell may have changed since the bell was set, and each device is claimed
// in the database before it is sent to, so no device hears one bell twice.
func (s *Service) ring(account int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return
	}
	state, err := s.cells.Value(account, "timer", "current", "state")
	if err != nil {
		log.Printf("push: %v", err)
		return
	}
	timer, running := rooms.ReadTimer(state)
	at, set := timer.Ends()
	if late := s.now().Sub(time.UnixMilli(at)); !running || !set || late < 0 || late > maxLate {
		s.set(account) // paused, stopped, extended or replaced since: the bell moves or goes
		return
	}
	run := ""
	if timer.Run != nil {
		run = *timer.Run
	}
	s.bells[account] = nil

	type target struct {
		device, endpoint, words string
		p256dh, auth            []byte
	}
	rows, err := s.db.Query("select device, endpoint, p256dh, auth, words from push_subscription where account = ?", account)
	if err != nil {
		log.Printf("push: %v", err)
		return
	}
	var targets []target
	for rows.Next() {
		var t target
		if err := rows.Scan(&t.device, &t.endpoint, &t.p256dh, &t.auth, &t.words); err != nil {
			rows.Close()
			log.Printf("push: %v", err)
			return
		}
		targets = append(targets, t)
	}
	// Closed before the claims below: they need the one connection this was holding.
	if err := errors.Join(rows.Err(), rows.Close()); err != nil {
		log.Printf("push: %v", err)
		return
	}
	if len(targets) == 0 {
		delete(s.bells, account)
		return
	}
	for _, t := range targets {
		// The claim: this run's bell at this moment, for this device, once. "is not" so
		// that a device never rung before, whose columns are null, is claimed too.
		res, err := s.db.Exec(`update push_subscription set rung_run = ?, rung_at = ?
			where account = ? and device = ? and (rung_run is not ? or rung_at is not ?)`, run, at, account, t.device, run, at)
		if err != nil {
			log.Printf("push: %v", err)
			continue
		}
		if n, _ := res.RowsAffected(); n != 1 {
			continue // this device has had this bell
		}
		var words Words
		ua, err := ecdh.P256().NewPublicKey(t.p256dh)
		if err != nil || json.Unmarshal([]byte(t.words), &words) != nil || !words.valid() {
			continue // cannot happen for a row Subscribe wrote
		}
		title, body := words.pick(timer.Phase, timer.SetIndex)
		// All of the payload. The run, the moment, and two of the device's own sentences:
		// no task, no title of anything, nothing of anyone else's.
		payload, _ := json.Marshal(struct {
			T     string `json:"t"`
			Run   string `json:"run"`
			At    int64  `json:"at"`
			Title string `json:"title"`
			Body  string `json:"body"`
		}{"ring", run, at, title, body})
		s.sending.Go(func() { s.send(account, t.device, t.endpoint, ua, t.auth, payload, at) })
	}
}

// send is one request to a push service, on its own goroutine: whatever the push
// service does, nothing else in the server waits for it.
func (s *Service) send(account int64, device, endpoint string, ua *ecdh.PublicKey, authSecret, payload []byte, at int64) {
	select {
	case s.air <- struct{}{}:
		defer func() { <-s.air }()
	case <-s.alive.Done():
		return
	}
	if s.now().Sub(time.UnixMilli(at)) > maxLate {
		return // it waited its turn too long: the bell has passed
	}
	target, err := url.Parse(endpoint)
	if err != nil {
		return
	}
	body, err := seal(payload, ua, authSecret)
	if err != nil {
		log.Printf("push: a message could not be encrypted")
		return
	}
	authorization, err := vapid(s.key, target.Scheme+"://"+target.Host, s.contact, s.now())
	if err != nil {
		log.Printf("push: a message could not be signed")
		return
	}
	ctx, cancel := context.WithTimeout(s.alive, sendTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Authorization", authorization)
	req.Header.Set("Content-Encoding", "aes128gcm")
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("TTL", ttlSeconds)
	req.Header.Set("Urgency", "high")
	res, err := s.client.Do(req)
	if err != nil {
		// Go's error for this holds the whole URL, and the URL is the capability. Say
		// only that it happened. Nothing is retried: the bell has passed.
		if s.alive.Err() == nil {
			log.Printf("push: a push service could not be reached")
		}
		return
	}
	res.Body.Close()
	switch {
	case res.StatusCode == http.StatusNotFound || res.StatusCode == http.StatusGone:
		// The push service has dropped this subscription. So do we, unless the device
		// has subscribed anew in the meantime.
		if _, err := s.db.Exec("delete from push_subscription where account = ? and device = ? and endpoint = ?", account, device, endpoint); err != nil {
			log.Printf("push: %v", err)
		}
	case res.StatusCode >= 300:
		log.Printf("push: a push service answered %d", res.StatusCode)
	}
}
