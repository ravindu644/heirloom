// Package auth holds accounts, invites, per-device tokens and the sign-in rate limit:
// contracts/protocol.md section 10. It never logs, and it stores no password, token or
// invite code as it was given, only hashes.
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"runtime/debug"
	"strings"
	"sync"
	"time"
	"unicode/utf16"

	"golang.org/x/crypto/argon2"
)

// Error is one row of the protocol's error table: the status and the code in the body.
type Error struct {
	Status     int
	Code       string
	RetryAfter int // seconds, with slow_down only
}

func (e *Error) Error() string { return e.Code }

var (
	ErrBadRequest  = &Error{Status: 400, Code: "bad_request"}
	ErrInvite      = &Error{Status: 403, Code: "invite"}
	ErrTaken       = &Error{Status: 409, Code: "taken"}
	ErrCredentials = &Error{Status: 401, Code: "credentials"}
	ErrToken       = &Error{Status: 401, Code: "token"}
)

func slowDown(wait time.Duration) *Error {
	// Rounded up: "0" would tell the device to try again while it is still refused.
	return &Error{Status: 429, Code: "slow_down", RetryAfter: int((wait + time.Second - 1) / time.Second)}
}

const (
	// argon2id at 19 MiB, 2 passes, 1 lane: the smaller of OWASP's two first choices. The
	// server lives in 50 MB on a phone, and 19 MiB for a moment fits where 46 would not.
	argonMemory  = 19 << 10 // KiB
	argonTime    = 2
	argonThreads = 1
	keyLen       = 32
	saltLen      = 16

	maxFailures = 5
	window      = 15 * time.Minute
	// ponytail: the failure counts live in memory, so a restart forgets them, and at most
	// this many names are watched at once. Move them into SQLite if either ever matters.
	maxWatched = 10000
	// Sign-ins waiting for their turn to hash. Past this the answer is slow_down, so a
	// flood of them cannot pile up in memory.
	maxWaiting = 8
)

// Session is the reply to register and login.
type Session struct {
	Token    string `json:"token"`
	Account  string `json:"account"`
	Username string `json:"username"`
}

type failures struct {
	n     int
	since time.Time
}

// The context a Service method takes only ends a wait for the hashing turn. The SQLite
// calls are never cancelled: see sync.Store for what a cancelled one costs.
type Service struct {
	db      *sql.DB
	now     func() time.Time
	revoked func(token string) // told when a token dies, so its open sockets can be cut

	hashing sync.Mutex // one argon2 at a time: two would be 38 MiB at once
	waiting chan struct{}

	mu     sync.Mutex
	failed map[string]failures
}

// New takes the function to call with a dead token's key (as Check returns it).
func New(db *sql.DB, now func() time.Time, revoked func(token string)) *Service {
	return &Service{db: db, now: now, revoked: revoked,
		waiting: make(chan struct{}, maxWaiting), failed: map[string]failures{}}
}

// Invite makes a code that registers one account, once.
func (s *Service) Invite() (string, error) {
	code := rand.Text()
	if _, err := s.db.Exec("insert into invite (hash, created) values (?, ?)", hashOf(code), s.now().UnixMilli()); err != nil {
		return "", fmt.Errorf("store invite: %w", err)
	}
	return code, nil
}

func (s *Service) Register(ctx context.Context, invite, username, password, device string) (Session, error) {
	username, ok := cleanUsername(username)
	if !ok || !validPassword(password) || !ValidDevice(device) || invite == "" {
		return Session{}, ErrBadRequest
	}
	// Looked at before any hashing, so a made-up invite costs the phone nothing. The
	// transaction below asks both questions again, where nothing can slip in between.
	var used sql.NullInt64
	err := s.db.QueryRow("select used_by from invite where hash = ?", hashOf(invite)).Scan(&used)
	if errors.Is(err, sql.ErrNoRows) || used.Valid {
		return Session{}, ErrInvite
	} else if err != nil {
		return Session{}, fmt.Errorf("read invite: %w", err)
	}
	var taken bool
	if err := s.db.QueryRow("select exists (select 1 from account where username = ?)", username).Scan(&taken); err != nil {
		return Session{}, fmt.Errorf("read account: %w", err)
	} else if taken {
		return Session{}, ErrTaken
	}
	salt := make([]byte, saltLen)
	rand.Read(salt)
	key, err := s.argon(ctx, password, salt, argonTime, argonMemory, argonThreads)
	if err != nil {
		return Session{}, err
	}

	tx, err := s.db.Begin()
	if err != nil {
		return Session{}, fmt.Errorf("begin register: %w", err)
	}
	defer tx.Rollback()
	now := s.now().UnixMilli()
	public := rand.Text()
	res, err := tx.Exec(`insert into account (public_id, username, password, created) values (?, ?, ?, ?)
		on conflict (username) do nothing`, public, username, encode(salt, key), now)
	if err != nil {
		return Session{}, fmt.Errorf("store account: %w", err)
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return Session{}, ErrTaken
	}
	account, err := res.LastInsertId()
	if err != nil {
		return Session{}, fmt.Errorf("store account: %w", err)
	}
	res, err = tx.Exec("update invite set used_by = ? where hash = ? and used_by is null", account, hashOf(invite))
	if err != nil {
		return Session{}, fmt.Errorf("use invite: %w", err)
	}
	// Rolling back here also takes the account away, so a used code makes nothing.
	if n, _ := res.RowsAffected(); n != 1 {
		return Session{}, ErrInvite
	}
	token, _, err := issue(tx, account, device, now)
	if err != nil {
		return Session{}, err
	}
	if err := tx.Commit(); err != nil {
		return Session{}, fmt.Errorf("commit register: %w", err)
	}
	return Session{token, public, username}, nil
}

func (s *Service) Login(ctx context.Context, username, password, device string) (Session, error) {
	username, ok := cleanUsername(username)
	if !ok || !validPassword(password) || !ValidDevice(device) {
		return Session{}, ErrBadRequest
	}
	if err := s.attempt(username); err != nil {
		return Session{}, err
	}
	var account int64
	var public string
	// A name nobody has gets the same argon2 work against a key that cannot match, so the
	// time the answer takes does not say whether the account exists.
	stored := nobody
	err := s.db.QueryRow("select id, public_id, password from account where username = ?", username).Scan(&account, &public, &stored)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return Session{}, fmt.Errorf("read account: %w", err)
	}
	if match, err := s.verify(ctx, stored, password); err != nil {
		return Session{}, err
	} else if !match {
		return Session{}, ErrCredentials
	}
	s.mu.Lock()
	delete(s.failed, username)
	s.mu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return Session{}, fmt.Errorf("begin login: %w", err)
	}
	defer tx.Rollback()
	token, replaced, err := issue(tx, account, device, s.now().UnixMilli())
	if err != nil {
		return Session{}, err
	}
	if err := tx.Commit(); err != nil {
		return Session{}, fmt.Errorf("commit login: %w", err)
	}
	if replaced != nil {
		s.revoked(string(replaced))
	}
	return Session{token, public, username}, nil
}

// Logout ends a token at once, on an open socket too.
func (s *Service) Logout(token string) error {
	hash := hashOf(token)
	res, err := s.db.Exec("delete from token where hash = ?", hash)
	if err != nil {
		return fmt.Errorf("delete token: %w", err)
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return ErrToken
	}
	s.revoked(string(hash))
	return nil
}

// Check answers whose token this is. The token belongs to one device, so the same token
// with another device id is no token at all. The key it returns names the token to the
// function given to New, without being the token.
func (s *Service) Check(token, device string) (account int64, key string, err error) {
	hash := hashOf(token)
	var owner string
	// Looked up by its sha-256, so how long the lookup takes says nothing useful about the token.
	err = s.db.QueryRow("select account, device from token where hash = ?", hash).Scan(&account, &owner)
	if errors.Is(err, sql.ErrNoRows) || err == nil && owner != device {
		return 0, "", ErrToken
	} else if err != nil {
		return 0, "", fmt.Errorf("read token: %w", err)
	}
	return account, string(hash), nil
}

// issue gives the device a new token and returns the hash of the one it replaces, if any.
func issue(tx *sql.Tx, account int64, device string, now int64) (token string, replaced []byte, err error) {
	err = tx.QueryRow("select hash from token where account = ? and device = ?", account, device).Scan(&replaced)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return "", nil, fmt.Errorf("read token: %w", err)
	}
	token = rand.Text()
	if _, err := tx.Exec(`insert into token (account, device, hash, created) values (?, ?, ?, ?)
		on conflict (account, device) do update set hash = excluded.hash, created = excluded.created`,
		account, device, hashOf(token), now); err != nil {
		return "", nil, fmt.Errorf("store token: %w", err)
	}
	return token, replaced, nil
}

// attempt counts a sign-in against the name before its password is looked at, and
// Login takes the count away when the password was right. Counting first means sign-ins
// sent all at once cannot each slip past a limit none of them has reached yet.
func (s *Service) attempt(username string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	f, watched := s.failed[username]
	if watched && now.Sub(f.since) >= window {
		f, watched = failures{}, false
	}
	if !watched {
		if len(s.failed) >= maxWatched {
			for name, old := range s.failed {
				if now.Sub(old.since) >= window {
					delete(s.failed, name)
				}
			}
		}
		// Still full of live windows: somebody is spraying names. Refusing new ones for a
		// minute is the safe side; forgetting counts would hand out fresh guesses.
		if len(s.failed) >= maxWatched {
			return slowDown(time.Minute)
		}
		f.since = now
	}
	if f.n >= maxFailures {
		return slowDown(f.since.Add(window).Sub(now))
	}
	f.n++
	s.failed[username] = f
	return nil
}

// argon runs one hash at a time and hands its memory back before the next may start.
func (s *Service) argon(ctx context.Context, password string, salt []byte, passes, memory uint32, threads uint8) ([]byte, error) {
	select {
	case s.waiting <- struct{}{}:
		defer func() { <-s.waiting }()
	default:
		return nil, slowDown(1)
	}
	s.hashing.Lock()
	defer s.hashing.Unlock()
	if err := ctx.Err(); err != nil {
		return nil, err // the caller went away while it waited
	}
	key := argon2.IDKey([]byte(password), salt, passes, memory, threads, keyLen)
	// The 19 MiB are garbage now, but Go would keep them until some later collection.
	// Give them back while we still hold the lock, or the next sign-in doubles the peak.
	debug.FreeOSMemory()
	return key, nil
}

// The stored form is the usual one: $argon2id$v=19$m=19456,t=2,p=1$salt$key. The
// parameters travel with each hash, so raising them later does not strand old passwords.
func encode(salt, key []byte) string {
	b64 := base64.RawStdEncoding.EncodeToString
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s", argon2.Version, argonMemory, argonTime, argonThreads, b64(salt), b64(key))
}

// What Login checks a password against when the username is unknown.
var nobody = encode(make([]byte, saltLen), make([]byte, keyLen))

func (s *Service) verify(ctx context.Context, stored, password string) (bool, error) {
	var version int
	var memory, passes uint32
	var threads uint8
	parts := strings.Split(stored, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false, errors.New("stored password is not argon2id")
	}
	if _, err := fmt.Sscanf(parts[2]+" "+parts[3], "v=%d m=%d,t=%d,p=%d", &version, &memory, &passes, &threads); err != nil || version != argon2.Version {
		return false, errors.New("stored password has unreadable parameters")
	}
	salt, err1 := base64.RawStdEncoding.DecodeString(parts[4])
	want, err2 := base64.RawStdEncoding.DecodeString(parts[5])
	if err1 != nil || err2 != nil {
		return false, errors.New("stored password is not base64")
	}
	got, err := s.argon(ctx, password, salt, passes, memory, threads)
	if err != nil {
		return false, err
	}
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}

func hashOf(secret string) []byte {
	h := sha256.Sum256([]byte(secret))
	return h[:]
}

// cleanUsername lowercases ASCII only, then wants 3 to 32 of a-z 0-9 _.
func cleanUsername(name string) (string, bool) {
	if len(name) < 3 || len(name) > 32 {
		return "", false
	}
	b := []byte(name)
	for i, c := range b {
		if c >= 'A' && c <= 'Z' {
			c += 'a' - 'A'
			b[i] = c
		}
		if (c < 'a' || c > 'z') && (c < '0' || c > '9') && c != '_' {
			return "", false
		}
	}
	return string(b), true
}

// 8 to 256 characters, counted the way the web app's String.length counts them, so the
// form and the server agree on the same password.
func validPassword(p string) bool {
	n := len(utf16.Encode([]rune(p)))
	return n >= 8 && n <= 256
}

// ValidDevice reports whether id is a device id: 16 lowercase hex digits.
func ValidDevice(id string) bool {
	if len(id) != 16 {
		return false
	}
	for _, c := range []byte(id) {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return false
		}
	}
	return true
}
