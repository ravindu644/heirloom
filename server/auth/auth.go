// Package auth holds accounts, their roles, invitations, per-device tokens and the
// sign-in rate limit: contracts/protocol.md section 10. It never logs, and it stores no
// password or token as it was given, only hashes. An invitation is kept as it is, on
// purpose: see the invitation table.
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
	"sync/atomic"
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
	ErrForbidden   = &Error{Status: 403, Code: "forbidden"}
	ErrFull        = &Error{Status: 409, Code: "full"}
	ErrUnknown     = &Error{Status: 404, Code: "unknown"}
)

// The three roles. The server holds an account's role and reads it from the database on
// every call that needs one; what a device believes about itself is never asked.
const (
	Member = "member"
	Admin  = "admin"
	Owner  = "owner"
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

	// An invitation is good for a week: long enough to reach a friend, short enough that
	// one found in an old chat or an old backup opens nothing.
	inviteLife = 7 * 24 * time.Hour
	// Invitations open at once, for the whole server. A server of friends never has fifty
	// people waiting to join; fifty bounds what an admin's stuck finger can make.
	maxInvites = 50
	// One that ran out can still be renewed, so it is kept, but not for ever: after this
	// long it is removed, and renewing it is "unknown" like any other that is gone.
	keepRunOut = 30 * 24 * time.Hour

	maxFailures = 5
	window      = 15 * time.Minute
	// ponytail: the failure counts live in memory, so a restart forgets them, and at most
	// this many names are watched at once (about 1 MB). Move them into SQLite if either
	// ever matters.
	maxWatched = 10000
	// Sign-ins in line for the hash, the one running included. Past this the answer is
	// slow_down, so a flood of them cannot pile up in memory. This line, not the list
	// above, is what bounds how fast passwords can be guessed.
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
	// OnRole, when set, is told the account whose role the owner has just changed, after
	// the change is stored. The hub hangs here to tell that account's open sockets.
	OnRole func(account int64)

	maxWatched int // a field so a test can fill the list without ten thousand hashes

	settled atomic.Bool // the server has an account; see Fresh

	hashing sync.Mutex // one argon2 at a time: two would be 38 MiB at once
	waiting chan struct{}
	// Read and written only inside a hashing turn (see turn), which is its lock.
	failed map[string]failures
}

// New takes the function to call with a dead token's key (as Check returns it).
func New(db *sql.DB, now func() time.Time, revoked func(token string)) *Service {
	return &Service{db: db, now: now, revoked: revoked, maxWatched: maxWatched,
		waiting: make(chan struct{}, maxWaiting), failed: map[string]failures{}}
}

// NoAccounts reports whether the server is fresh: nobody has registered yet, and the
// first who does will own it.
func NoAccounts(db *sql.DB) (bool, error) {
	var none bool
	if err := db.QueryRow("select not exists (select 1 from account)").Scan(&none); err != nil {
		return false, fmt.Errorf("count accounts: %w", err)
	}
	return none, nil
}

// Fresh is NoAccounts for /healthz, which is asked often. A server stops being fresh
// once and never is again, so after the first no the database is not asked any more.
func (s *Service) Fresh() bool {
	if s.settled.Load() {
		return false
	}
	none, err := NoAccounts(s.db)
	if err != nil || !none {
		s.settled.Store(err == nil)
		return false // an error is not a reason to tell a stranger the server is up for grabs
	}
	return true
}

// Role is the account's role now, read from the database.
func (s *Service) Role(account int64) (string, error) {
	var role string
	if err := s.db.QueryRow("select role from account where id = ?", account).Scan(&role); err != nil {
		return "", fmt.Errorf("read role: %w", err)
	}
	return role, nil
}

// may refuses a caller whose role, as the database has it this moment, is not one of these.
func (s *Service) may(account int64, roles ...string) error {
	role, err := s.Role(account)
	if err != nil {
		return err
	}
	for _, allowed := range roles {
		if role == allowed {
			return nil
		}
	}
	return ErrForbidden
}

// Invitation is one invite link: Invite is the last part of <server>/#/join/<invite>.
type Invitation struct {
	Invite  string `json:"invite"`
	Created int64  `json:"created"`
	Expires int64  `json:"expires"`
}

// Invite makes an invitation from the command line: nobody's, so it needs no role.
func (s *Service) Invite() (string, error) {
	inv, err := s.invite(nil)
	return inv.Invite, err
}

// CreateInvite makes an invitation for an admin or the owner.
func (s *Service) CreateInvite(caller int64) (Invitation, error) {
	if err := s.may(caller, Admin, Owner); err != nil {
		return Invitation{}, err
	}
	return s.invite(&caller)
}

func (s *Service) invite(by *int64) (Invitation, error) {
	now := s.now()
	inv := Invitation{rand.Text(), now.UnixMilli(), now.Add(inviteLife).UnixMilli()}
	tx, err := s.db.Begin()
	if err != nil {
		return Invitation{}, fmt.Errorf("begin invite: %w", err)
	}
	defer tx.Rollback()
	// Here, where invitations are made, is where the long dead ones are cleared away.
	if _, err := tx.Exec("delete from invitation where expires <= ?", now.Add(-keepRunOut).UnixMilli()); err != nil {
		return Invitation{}, fmt.Errorf("clear old invites: %w", err)
	}
	var open int
	if err := tx.QueryRow("select count(*) from invitation where expires > ?", inv.Created).Scan(&open); err != nil {
		return Invitation{}, fmt.Errorf("count invites: %w", err)
	}
	if open >= maxInvites {
		return Invitation{}, ErrFull
	}
	if _, err := tx.Exec("insert into invitation (invite, made_by, created, expires) values (?, ?, ?, ?)", inv.Invite, by, inv.Created, inv.Expires); err != nil {
		return Invitation{}, fmt.Errorf("store invite: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return Invitation{}, fmt.Errorf("commit invite: %w", err)
	}
	return inv, nil
}

// Invites lists every invitation that can still be used, oldest first.
func (s *Service) Invites(caller int64) ([]Invitation, error) {
	if err := s.may(caller, Admin, Owner); err != nil {
		return nil, err
	}
	rows, err := s.db.Query("select invite, created, expires from invitation where expires > ? order by created, invite", s.now().UnixMilli())
	if err != nil {
		return nil, fmt.Errorf("read invites: %w", err)
	}
	defer rows.Close()
	open := []Invitation{} // not nil: the reply says "invites":[]
	for rows.Next() {
		var inv Invitation
		if err := rows.Scan(&inv.Invite, &inv.Created, &inv.Expires); err != nil {
			return nil, fmt.Errorf("read invites: %w", err)
		}
		open = append(open, inv)
	}
	return open, rows.Err()
}

// RenewInvite gives an invitation seven days from now. One that had run out comes back
// under a new name, so the link that was out there for a week and more stays dead.
//
// It holds the two limits that making one holds. Bringing a run-out invitation back
// opens one more, so with fifty open it is refused; renewing a live one opens nothing
// and is not. And one that ran out more than thirty days ago is gone, whether or not
// the row has been cleared away yet.
func (s *Service) RenewInvite(caller int64, invite string) (Invitation, error) {
	if err := s.may(caller, Admin, Owner); err != nil {
		return Invitation{}, err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return Invitation{}, fmt.Errorf("begin renew: %w", err)
	}
	defer tx.Rollback()
	now := s.now()
	inv := Invitation{Invite: invite}
	err = tx.QueryRow("select created, expires from invitation where invite = ?", invite).Scan(&inv.Created, &inv.Expires)
	if errors.Is(err, sql.ErrNoRows) {
		return Invitation{}, ErrUnknown // used, taken back, or never was
	} else if err != nil {
		return Invitation{}, fmt.Errorf("read invite: %w", err)
	}
	if inv.Expires <= now.UnixMilli() {
		if inv.Expires <= now.Add(-keepRunOut).UnixMilli() {
			return Invitation{}, ErrUnknown
		}
		var open int
		if err := tx.QueryRow("select count(*) from invitation where expires > ?", now.UnixMilli()).Scan(&open); err != nil {
			return Invitation{}, fmt.Errorf("count invites: %w", err)
		}
		if open >= maxInvites {
			return Invitation{}, ErrFull
		}
		inv.Invite = rand.Text()
	}
	inv.Expires = now.Add(inviteLife).UnixMilli()
	if _, err := tx.Exec("update invitation set invite = ?, expires = ? where invite = ?", inv.Invite, inv.Expires, invite); err != nil {
		return Invitation{}, fmt.Errorf("renew invite: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return Invitation{}, fmt.Errorf("commit renew: %w", err)
	}
	return inv, nil
}

// RevokeInvite takes an invitation back. One that is not there is the same answer.
func (s *Service) RevokeInvite(caller int64, invite string) error {
	if err := s.may(caller, Admin, Owner); err != nil {
		return err
	}
	if _, err := s.db.Exec("delete from invitation where invite = ?", invite); err != nil {
		return fmt.Errorf("delete invite: %w", err)
	}
	return nil
}

// Person is a username and its role, as the owner is shown them.
type Person struct {
	Username string `json:"username"`
	Role     string `json:"role"`
}

// Admins lists the owner and then the admins by name, for the owner only. Members are
// not in it: no call lists everybody.
func (s *Service) Admins(caller int64) ([]Person, error) {
	if err := s.may(caller, Owner); err != nil {
		return nil, err
	}
	rows, err := s.db.Query("select username, role from account where role in ('owner', 'admin') order by role = 'owner' desc, username")
	if err != nil {
		return nil, fmt.Errorf("read admins: %w", err)
	}
	defer rows.Close()
	admins := []Person{}
	for rows.Next() {
		var p Person
		if err := rows.Scan(&p.Username, &p.Role); err != nil {
			return nil, fmt.Errorf("read admins: %w", err)
		}
		admins = append(admins, p)
	}
	return admins, rows.Err()
}

// SetRole makes a member an admin or an admin a member, for the owner only. The owner's
// own role is not on offer: not to anyone else, and not to the owner.
func (s *Service) SetRole(caller int64, username, role string) error {
	if err := s.may(caller, Owner); err != nil {
		return err
	}
	if username == "" || role != Admin && role != Member {
		return ErrBadRequest
	}
	name, ok := cleanUsername(username)
	if !ok {
		return ErrUnknown // a name no account could have
	}
	var account int64
	var current string
	err := s.db.QueryRow("select id, role from account where username = ?", name).Scan(&account, &current)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrUnknown
	} else if err != nil {
		return fmt.Errorf("read account: %w", err)
	}
	if current == Owner {
		return ErrBadRequest
	}
	// "and role != 'owner'" is the rule a third time, beside the check above and the
	// trigger in the schema: nothing changes the owner's role.
	res, err := s.db.Exec("update account set role = ? where id = ? and role != 'owner' and role != ?", role, account, role)
	if err != nil {
		return fmt.Errorf("store role: %w", err)
	}
	// Stored, and only then told, and only if it was a change: saying what is already so
	// tells nobody anything.
	if n, _ := res.RowsAffected(); n == 1 && s.OnRole != nil {
		s.OnRole(account)
	}
	return nil
}

// Register makes an account. With an invitation it is a member's, and the invitation is
// used up. With none it is the first account of a fresh server, and its owner's.
func (s *Service) Register(ctx context.Context, invite, username, password, device string) (Session, error) {
	username, ok := cleanUsername(username)
	if !ok || !validPassword(password) || !ValidDevice(device) {
		return Session{}, ErrBadRequest
	}
	// Looked at before any hashing, so a made-up invite costs the phone nothing. The
	// transaction below asks every question again, where nothing can slip in between.
	if invite == "" {
		// No invitation is only for the one who sets a fresh server up.
		if fresh, err := NoAccounts(s.db); err != nil {
			return Session{}, err
		} else if !fresh {
			return Session{}, ErrBadRequest
		}
	} else {
		var expires int64
		err := s.db.QueryRow("select expires from invitation where invite = ?", invite).Scan(&expires)
		if errors.Is(err, sql.ErrNoRows) || err == nil && expires <= s.now().UnixMilli() {
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
	}
	salt := make([]byte, saltLen)
	rand.Read(salt)
	done, err := s.turn(ctx)
	if err != nil {
		return Session{}, err
	}
	key := argon(password, salt, argonTime, argonMemory, argonThreads)
	done()

	// One transaction, and it holds the write lock from its first statement: of two who
	// set a fresh server up at once, the second finds an account there and is refused.
	tx, err := s.db.Begin()
	if err != nil {
		return Session{}, fmt.Errorf("begin register: %w", err)
	}
	defer tx.Rollback()
	now := s.now().UnixMilli()
	var first bool
	if err := tx.QueryRow("select not exists (select 1 from account)").Scan(&first); err != nil {
		return Session{}, fmt.Errorf("count accounts: %w", err)
	}
	if invite == "" {
		if !first {
			return Session{}, ErrInvite // somebody else was the first, a moment ago
		}
	} else {
		// Deleted here, with the account made below or not at all: an invitation is one account.
		res, err := tx.Exec("delete from invitation where invite = ? and expires > ?", invite, now)
		if err != nil {
			return Session{}, fmt.Errorf("use invite: %w", err)
		}
		if n, _ := res.RowsAffected(); n != 1 {
			return Session{}, ErrInvite
		}
	}
	// The first account of a server is its owner, however it came: with no invitation,
	// from the app, or with one made on the command line before anyone had registered.
	// Otherwise such a server would have no owner and no way to get one.
	role := Member
	if first {
		role = Owner
	}
	public := rand.Text()
	res, err := tx.Exec(`insert into account (public_id, username, password, created, role) values (?, ?, ?, ?, ?)
		on conflict (username) do nothing`, public, username, encode(salt, key), now, role)
	if err != nil {
		return Session{}, fmt.Errorf("store account: %w", err)
	}
	// Rolling back here also puts the invitation back, so a taken name does not spend it.
	if n, _ := res.RowsAffected(); n != 1 {
		return Session{}, ErrTaken
	}
	account, err := res.LastInsertId()
	if err != nil {
		return Session{}, fmt.Errorf("store account: %w", err)
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
	account, public, err := s.checkPassword(ctx, username, password)
	if err != nil {
		return Session{}, err
	}

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

// checkPassword is the part of a sign-in that takes a hashing turn.
func (s *Service) checkPassword(ctx context.Context, username, password string) (account int64, public string, err error) {
	done, err := s.turn(ctx)
	if err != nil {
		// Turned away before the password was looked at, so nothing is counted against the name.
		return 0, "", err
	}
	defer done()
	// A name nobody has gets the same argon2 work against a key that cannot match, so the
	// time the answer takes does not say whether the account exists.
	stored := nobody
	err = s.db.QueryRow("select id, public_id, password from account where username = ?", username).Scan(&account, &public, &stored)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return 0, "", fmt.Errorf("read account: %w", err)
	}
	if err := s.attempt(username); err != nil {
		return 0, "", err
	}
	if match, err := verify(stored, password); err != nil {
		return 0, "", err
	} else if !match {
		return 0, "", ErrCredentials
	}
	delete(s.failed, username)
	return account, public, nil
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

// attempt counts a sign-in against the name just before its password is hashed, and
// checkPassword takes the count away when the password was right. Counting first, inside
// the turn, means sign-ins sent all at once cannot each slip past a limit none of them
// has reached yet, and one that never got a turn is never counted.
func (s *Service) attempt(username string) error {
	now := s.now()
	f, watched := s.failed[username]
	if watched && now.Sub(f.since) >= window {
		delete(s.failed, username)
		f, watched = failures{}, false
	}
	if f.n >= maxFailures {
		return slowDown(f.since.Add(window).Sub(now))
	}
	if !watched {
		f.since = now
		s.makeRoom(now)
	}
	f.n++
	s.failed[username] = f
	return nil
}

// makeRoom keeps the list at its bound: it drops every window that has passed and, if
// that was not enough, the one that began longest ago.
//
// A full list must not refuse a name it is not watching, or filling it with made-up
// names would shut out everyone else. It must not stop counting new names either, or a
// name not on it could be guessed without end. Forgetting the oldest window gives little
// away: every name on the list cost a whole hashing turn to put there, so pushing one
// name off a full list takes ten thousand hashes and buys five more guesses at it.
func (s *Service) makeRoom(now time.Time) {
	if len(s.failed) < s.maxWatched {
		return
	}
	var oldest string
	var began time.Time
	for name, f := range s.failed {
		if now.Sub(f.since) >= window {
			delete(s.failed, name)
		} else if oldest == "" || f.since.Before(began) {
			oldest, began = name, f.since
		}
	}
	if len(s.failed) >= s.maxWatched {
		delete(s.failed, oldest)
	}
}

// turn waits for the caller's turn to hash and returns the function that ends it. One
// hash runs at a time; when the line is full the caller is told to slow down instead of
// being added to it.
func (s *Service) turn(ctx context.Context) (done func(), err error) {
	select {
	case s.waiting <- struct{}{}:
	default:
		return nil, slowDown(time.Second)
	}
	s.hashing.Lock()
	done = func() { s.hashing.Unlock(); <-s.waiting }
	if err := ctx.Err(); err != nil {
		done()
		return nil, err // the caller went away while it waited
	}
	return done, nil
}

// argon hashes, and hands its memory back before it returns. Call it inside a turn.
func argon(password string, salt []byte, passes, memory uint32, threads uint8) []byte {
	key := argon2.IDKey([]byte(password), salt, passes, memory, threads, keyLen)
	// The 19 MiB are garbage now, but Go would keep them until some later collection.
	// Give them back while we still hold the turn, or the next sign-in doubles the peak.
	debug.FreeOSMemory()
	return key
}

// The stored form is the usual one: $argon2id$v=19$m=19456,t=2,p=1$salt$key. The
// parameters travel with each hash, so raising them later does not strand old passwords.
func encode(salt, key []byte) string {
	b64 := base64.RawStdEncoding.EncodeToString
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s", argon2.Version, argonMemory, argonTime, argonThreads, b64(salt), b64(key))
}

// What Login checks a password against when the username is unknown.
var nobody = encode(make([]byte, saltLen), make([]byte, keyLen))

func verify(stored, password string) (bool, error) {
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
	return subtle.ConstantTimeCompare(argon(password, salt, passes, memory, threads), want) == 1, nil
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
