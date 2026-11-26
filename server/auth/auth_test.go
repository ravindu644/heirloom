package auth

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"heirloom/server/store"
)

var ctx = context.Background()

const (
	phone    = "a1b2c3d4e5f60718"
	laptop   = "b2c3d4e5f6071829"
	password = "correct horse battery"
)

type world struct {
	*Service
	db      *sql.DB
	dir     string
	now     time.Time
	revoked []string
}

func newWorld(t *testing.T) *world {
	t.Helper()
	w := &world{dir: t.TempDir(), now: time.Date(2026, 11, 25, 4, 30, 0, 0, time.UTC)}
	db, err := store.Open(w.dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	w.db = db
	w.Service = New(db, func() time.Time { return w.now }, func(token string) { w.revoked = append(w.revoked, token) })
	return w
}

func (w *world) invite(t *testing.T) string {
	t.Helper()
	code, err := w.Invite()
	if err != nil {
		t.Fatal(err)
	}
	return code
}

func (w *world) register(t *testing.T, username, device string) Session {
	t.Helper()
	s, err := w.Register(ctx, w.invite(t), username, password, device)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func want(t *testing.T, what string, err error, code string) *Error {
	t.Helper()
	var e *Error
	if !errors.As(err, &e) || e.Code != code {
		t.Fatalf("%s: got %v, want %s", what, err, code)
	}
	return e
}

func TestRegisterWithAnInviteOnce(t *testing.T) {
	w := newWorld(t)
	code := w.invite(t)
	s, err := w.Register(ctx, code, "Ravi", password, phone)
	if err != nil {
		t.Fatal(err)
	}
	if s.Username != "ravi" || s.Token == "" || s.Account == "" {
		t.Errorf("session = %+v, want the lowercased name, a token and an account id", s)
	}
	if _, _, err := w.Check(s.Token, phone); err != nil {
		t.Errorf("the new token does not work: %v", err)
	}

	_, err = w.Register(ctx, code, "sam", password, laptop)
	want(t, "a used invite", err, "invite")
	_, err = w.Register(ctx, "NOSUCHCODE", "sam", password, laptop)
	want(t, "an unknown invite", err, "invite")

	// A taken name is refused in any case, and the invite it tried with is still good.
	second := w.invite(t)
	_, err = w.Register(ctx, second, "RAVI", password, laptop)
	if e := want(t, "a taken name", err, "taken"); e.Status != 409 {
		t.Errorf("taken is status %d, want 409", e.Status)
	}
	if _, err := w.Register(ctx, second, "sam", password, laptop); err != nil {
		t.Errorf("the invite was spent on a refused registration: %v", err)
	}
}

func TestBadRequests(t *testing.T) {
	w := newWorld(t)
	w.register(t, "owner", laptop) // with an account on the server, no invite is a bad request
	code := w.invite(t)
	long := strings.Repeat("p", 257)
	for what, f := range map[string][4]string{
		"no invite":                       {"", "ravi", password, phone},
		"a name of two":                   {code, "ra", password, phone},
		"a name of 33":                    {code, strings.Repeat("r", 33), password, phone},
		"a name with a dash":              {code, "ra-vi", password, phone},
		"a name with a letter not in a-z": {code, "ravï", password, phone},
		"a password of seven":             {code, "ravi", "1234567", phone},
		"a password of 257":               {code, "ravi", long, phone},
		"no device":                       {code, "ravi", password, ""},
		"a device that is not hex":        {code, "ravi", password, "a1b2c3d4e5f6071g"},
		"a device in upper case":          {code, "ravi", password, "A1B2C3D4E5F60718"},
	} {
		_, err := w.Register(ctx, f[0], f[1], f[2], f[3])
		if e := want(t, "register with "+what, err, "bad_request"); e.Status != 400 {
			t.Errorf("bad_request is status %d, want 400", e.Status)
		}
		if f[0] != "" {
			_, err = w.Login(ctx, f[1], f[2], f[3])
			want(t, "login with "+what, err, "bad_request")
		}
	}
	// None of that used the invite, and the limits themselves are fine.
	if _, err := w.Register(ctx, code, strings.Repeat("r", 32), long[:256], phone); err != nil {
		t.Errorf("a 32 character name with a 256 character password: %v", err)
	}
	if _, err := w.Register(ctx, w.invite(t), "r_9", "12345678", phone); err != nil {
		t.Errorf("a 3 character name with an 8 character password: %v", err)
	}
}

func TestWrongPasswordAndUnknownNameLookTheSame(t *testing.T) {
	w := newWorld(t)
	w.register(t, "ravi", phone)
	_, wrong := w.Login(ctx, "ravi", "not the password", phone)
	_, nobody := w.Login(ctx, "nobody", password, phone)
	a, b := want(t, "a wrong password", wrong, "credentials"), want(t, "an unknown name", nobody, "credentials")
	if a != b || a.Status != 401 {
		t.Errorf("the two refusals differ, or are not 401: %+v and %+v", a, b)
	}
	if s, err := w.Login(ctx, "RAVI", password, laptop); err != nil || s.Username != "ravi" {
		t.Errorf("the right password in another case of the name: %+v, %v", s, err)
	}
}

func TestSixthSignInIsRefusedUntilTheWindowPasses(t *testing.T) {
	w := newWorld(t)
	w.register(t, "ravi", phone)
	w.register(t, "sam", laptop)
	for i := range 5 {
		_, err := w.Login(ctx, "ravi", "not the password", phone)
		want(t, "failure "+string(rune('1'+i)), err, "credentials")
		w.now = w.now.Add(time.Minute)
	}
	// Five minutes in, five failures. The right password does not help now.
	_, err := w.Login(ctx, "ravi", password, phone)
	e := want(t, "the sixth sign-in", err, "slow_down")
	if e.Status != 429 || e.RetryAfter != 10*60 {
		t.Errorf("slow_down = status %d, retry after %d s; want 429 and the 600 s left of the 15 minutes", e.Status, e.RetryAfter)
	}
	// Another name is not held up by it.
	if _, err := w.Login(ctx, "sam", password, laptop); err != nil {
		t.Errorf("sam was refused because of ravi: %v", err)
	}
	// A second short of the window is still refused, and says one second.
	w.now = w.now.Add(10*time.Minute - 500*time.Millisecond)
	_, err = w.Login(ctx, "ravi", password, phone)
	if e := want(t, "half a second early", err, "slow_down"); e.RetryAfter != 1 {
		t.Errorf("retry after = %d, want 1: 0 would invite a retry that is refused", e.RetryAfter)
	}
	w.now = w.now.Add(500 * time.Millisecond)
	if _, err := w.Login(ctx, "ravi", password, phone); err != nil {
		t.Errorf("after the 15 minutes: %v", err)
	}
}

func TestASuccessClearsTheCount(t *testing.T) {
	w := newWorld(t)
	w.register(t, "ravi", phone)
	for range 3 {
		for range 4 {
			_, err := w.Login(ctx, "ravi", "not the password", phone)
			want(t, "a failure", err, "credentials")
		}
		if _, err := w.Login(ctx, "ravi", password, phone); err != nil {
			t.Fatalf("four typos and then the right password: %v", err)
		}
	}
}

// A name nobody has is limited like a real one, so the limit does not say who exists.
func TestUnknownNameIsLimitedToo(t *testing.T) {
	w := newWorld(t)
	for range 5 {
		_, err := w.Login(ctx, "nobody", password, phone)
		want(t, "an unknown name", err, "credentials")
	}
	_, err := w.Login(ctx, "nobody", password, phone)
	want(t, "the sixth try at an unknown name", err, "slow_down")
}

// Sign-ins sent all at once must not each get a guess because none has failed yet.
func TestLimitHoldsForSignInsAtOnce(t *testing.T) {
	w := newWorld(t)
	w.register(t, "ravi", phone)
	codes := make(chan string, 7)
	var wg sync.WaitGroup
	for range cap(codes) {
		wg.Go(func() {
			_, err := w.Login(ctx, "ravi", "not the password", phone)
			var e *Error
			errors.As(err, &e)
			codes <- e.Code
		})
	}
	wg.Wait()
	close(codes)
	guesses := 0
	for code := range codes {
		if code == "credentials" {
			guesses++
		} else if code != "slow_down" {
			t.Errorf("got %q", code)
		}
	}
	if guesses != maxFailures {
		t.Errorf("%d of 7 simultaneous sign-ins had their password checked, want %d", guesses, maxFailures)
	}
}

// A sign-in that was turned away before its password was looked at says nothing about
// the password, so it must not use up one of the name's five tries.
func TestSignInThatNeverReachedTheHashIsNotCounted(t *testing.T) {
	w := newWorld(t)
	w.register(t, "ravi", phone)
	// Eight sign-ins are already in line for the hash.
	for range maxWaiting {
		w.waiting <- struct{}{}
	}
	for range maxFailures + 1 {
		_, err := w.Login(ctx, "ravi", password, phone)
		if e := want(t, "a sign-in with the line full", err, "slow_down"); e.RetryAfter != 1 {
			t.Fatalf("retry after = %d s, want 1: the line is full, the name is not locked", e.RetryAfter)
		}
	}
	for range maxWaiting {
		<-w.waiting
	}
	// And six whose caller hung up while they waited.
	gone, hangUp := context.WithCancel(ctx)
	hangUp()
	for range maxFailures + 1 {
		if _, err := w.Login(gone, "ravi", "not the password", phone); !errors.Is(err, context.Canceled) {
			t.Fatalf("a sign-in nobody waits for: %v, want it dropped", err)
		}
	}
	if len(w.failed) != 0 {
		t.Errorf("%d names are being counted, and no password was ever checked", len(w.failed))
	}
	if _, err := w.Login(ctx, "ravi", password, phone); err != nil {
		t.Errorf("locked out by sign-ins that were never checked: %v", err)
	}
}

// fail makes one failed sign-in for each name, a minute apart, oldest first.
func (w *world) fail(t *testing.T, names ...string) {
	t.Helper()
	for _, name := range names {
		_, err := w.Login(ctx, name, "not the password", phone)
		want(t, "a failed sign-in for "+name, err, "credentials")
		w.now = w.now.Add(time.Minute)
	}
}

func (w *world) watched() string {
	names := slices.Sorted(maps.Keys(w.failed))
	return strings.Join(names, " ")
}

// Filling the list with made-up names must not shut out the people who are not on it.
func TestAFullListNeverRefusesAName(t *testing.T) {
	w := newWorld(t)
	w.maxWatched = 3
	w.register(t, "ravi", phone)
	w.fail(t, "aaa", "bbb", "ccc")
	if w.watched() != "aaa bbb ccc" {
		t.Fatalf("watching %q, want the list full", w.watched())
	}
	if _, err := w.Login(ctx, "ravi", password, phone); err != nil {
		t.Fatalf("a real sign-in with the list full of other names: %v", err)
	}
	// More made-up names are checked and counted like any other, the list does not grow,
	// and it is the oldest window that makes room each time.
	w.fail(t, "ddd", "eee", "fff")
	if w.watched() != "ddd eee fff" {
		t.Errorf("watching %q, want only the three newest: memory must stay bounded", w.watched())
	}
	w.fail(t, "ddd")
	if w.watched() != "ddd eee fff" {
		t.Errorf("a name already on the list pushed another off: %q", w.watched())
	}
}

// A name with five failures stays refused while newer names come and go around it, and
// a window that has passed is dropped before any that is still running.
func TestALockedNameStaysLockedOnAFullList(t *testing.T) {
	w := newWorld(t)
	w.maxWatched = 3
	w.register(t, "ravi", phone)
	w.fail(t, "old")                                  // 0 min
	w.fail(t, "ravi", "ravi", "ravi", "ravi", "ravi") // 1 to 5 min: locked until 16 min
	w.fail(t, "mid")                                  // 6 min
	w.fail(t, "new")                                  // 7 min: "old" makes room
	if w.watched() != "mid new ravi" {
		t.Fatalf("watching %q, want the oldest window forgotten and ravi kept", w.watched())
	}
	_, err := w.Login(ctx, "ravi", password, phone)
	if e := want(t, "the locked name at 8 minutes", err, "slow_down"); e.RetryAfter != 8*60 {
		t.Errorf("retry after = %d s, want the 480 left of ravi's window", e.RetryAfter)
	}
	// At 16 minutes ravi's window has passed. The next new name drops it, not "mid".
	w.now = w.now.Add(8 * time.Minute)
	w.fail(t, "newer")
	if w.watched() != "mid new newer" {
		t.Errorf("watching %q, want the passed window gone before a live one", w.watched())
	}
}

func TestSigningInAgainReplacesThatDevicesToken(t *testing.T) {
	w := newWorld(t)
	first := w.register(t, "ravi", phone)
	other, err := w.Login(ctx, "ravi", password, laptop)
	if err != nil {
		t.Fatal(err)
	}
	account, oldKey, err := w.Check(first.Token, phone)
	if err != nil {
		t.Fatal(err)
	}
	if len(w.revoked) != 0 {
		t.Fatalf("a first sign-in on a device revoked %d tokens", len(w.revoked))
	}
	second, err := w.Login(ctx, "ravi", password, phone)
	if err != nil {
		t.Fatal(err)
	}
	if second.Account != first.Account || second.Token == first.Token {
		t.Errorf("signing in again: account %q then %q, same token: %v", first.Account, second.Account, second.Token == first.Token)
	}
	_, _, err = w.Check(first.Token, phone)
	want(t, "the replaced token", err, "token")
	if len(w.revoked) != 1 || w.revoked[0] != oldKey {
		t.Errorf("revoked %d tokens, want exactly the phone's old one so its socket is cut", len(w.revoked))
	}
	for token, device := range map[string]string{second.Token: phone, other.Token: laptop} {
		if got, _, err := w.Check(token, device); err != nil || got != account {
			t.Errorf("a live token of %s: account %d, %v; want %d", device, got, err, account)
		}
	}
}

func TestTokenBelongsToOneDevice(t *testing.T) {
	w := newWorld(t)
	s := w.register(t, "ravi", phone)
	_, _, err := w.Check(s.Token, laptop)
	want(t, "the phone's token from the laptop", err, "token")
	_, _, err = w.Check("", phone)
	want(t, "no token", err, "token")
}

func TestLogoutEndsTheToken(t *testing.T) {
	w := newWorld(t)
	s := w.register(t, "ravi", phone)
	_, key, _ := w.Check(s.Token, phone)
	if err := w.Logout(s.Token); err != nil {
		t.Fatal(err)
	}
	_, _, err := w.Check(s.Token, phone)
	want(t, "a signed out token", err, "token")
	if len(w.revoked) != 1 || w.revoked[0] != key {
		t.Error("logout did not report the token, so its socket would stay open")
	}
	if e := want(t, "signing out twice", w.Logout(s.Token), "token"); e.Status != 401 {
		t.Errorf("token is status %d, want 401", e.Status)
	}
}

// Nothing a person or a device typed in is on disk as it was typed.
func TestNoSecretIsStoredAsGiven(t *testing.T) {
	w := newWorld(t)
	code := w.invite(t)
	s, err := w.Register(ctx, code, "ravi", password, phone)
	if err != nil {
		t.Fatal(err)
	}
	var stored string
	if err := w.db.QueryRow("select password from account").Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(stored, "$argon2id$v=19$m=19456,t=2,p=1$") {
		t.Errorf("stored password = %q, want argon2id with its parameters", stored[:min(len(stored), 40)])
	}
	files, _ := filepath.Glob(filepath.Join(w.dir, "*"))
	for _, f := range files {
		data, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		// The invitation is not in this list: it is kept as it is, on purpose, until it is used.
		for what, secret := range map[string]string{"password": password, "token": s.Token} {
			if bytes.Contains(data, []byte(secret)) {
				t.Errorf("%s holds the %s as it was given", filepath.Base(f), what)
			}
		}
	}
	if len(files) < 2 {
		t.Errorf("only %v was looked at: the -wal file holds the newest writes", files)
	}
}

// Two people do not get the same salt, so the same password is not the same hash.
func TestSamePasswordHashesDifferently(t *testing.T) {
	w := newWorld(t)
	w.register(t, "ravi", phone)
	w.register(t, "sam", laptop)
	var distinct int
	if err := w.db.QueryRow("select count(distinct password) from account").Scan(&distinct); err != nil {
		t.Fatal(err)
	}
	if distinct != 2 {
		t.Error("two accounts with one password share a hash")
	}
}

func (w *world) role(t *testing.T, username string) (role string) {
	t.Helper()
	if err := w.db.QueryRow("select role from account where username = ?", username).Scan(&role); err != nil {
		t.Fatal(err)
	}
	return role
}

func (w *world) id(t *testing.T, username string) (id int64) {
	t.Helper()
	if err := w.db.QueryRow("select id from account where username = ?", username).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

// A fresh server is set up from the app: the first to register, with no invitation,
// owns it. After that the door without an invitation is shut for good.
func TestFirstAccountOwnsAFreshServer(t *testing.T) {
	w := newWorld(t)
	if !w.Fresh() {
		t.Fatal("a server with no account does not say it is fresh")
	}
	s, err := w.Register(ctx, "", "Ravi", password, phone)
	if err != nil {
		t.Fatalf("setting up a fresh server: %v", err)
	}
	if s.Username != "ravi" || s.Token == "" || w.role(t, "ravi") != Owner {
		t.Errorf("the first account: %+v, role %q; want the owner", s, w.role(t, "ravi"))
	}
	if w.Fresh() {
		t.Error("the server still says it is fresh")
	}
	_, err = w.Register(ctx, "", "sachi", password, laptop)
	if e := want(t, "a second account with no invitation", err, "bad_request"); e.Status != 400 {
		t.Errorf("status %d", e.Status)
	}
	// With an invitation the second is a member.
	if _, err := w.Register(ctx, w.invite(t), "sachi", password, laptop); err != nil || w.role(t, "sachi") != Member {
		t.Errorf("the second account: %v, role %q", err, w.role(t, "sachi"))
	}
	// Fresh never turns back, and no longer asks the database.
	if _, err := w.db.Exec("delete from token; delete from account"); err != nil {
		t.Fatal(err)
	}
	if w.Fresh() {
		t.Error("a server that has had an account says it is fresh again")
	}
}

// Two people setting a fresh server up at the same moment: one owns it, the other is told
// "invite", and there is one account. Both are held at the hash until both have been let in.
func TestTwoSettingUpAtOnce(t *testing.T) {
	w := newWorld(t)
	w.hashing.Lock()
	results := make(chan error, 2)
	for _, name := range []string{"ravi", "sachi"} {
		go func() {
			_, err := w.Register(ctx, "", name, password, phone)
			results <- err
		}()
	}
	for len(w.waiting) < 2 {
		time.Sleep(time.Millisecond)
	}
	w.hashing.Unlock()
	first, second := <-results, <-results
	if first != nil {
		first, second = second, first
	}
	if first != nil {
		t.Fatalf("neither was let in: %v, %v", first, second)
	}
	if e := want(t, "the one who lost", second, "invite"); e.Status != 403 {
		t.Errorf("status %d, want 403", e.Status)
	}
	var accounts, owners int
	if err := w.db.QueryRow("select count(*), sum(role = 'owner') from account").Scan(&accounts, &owners); err != nil || accounts != 1 || owners != 1 {
		t.Errorf("%d accounts, %d owners, %v; want one of each", accounts, owners, err)
	}
}

// An invitation made on the command line before anyone has registered: whoever uses it
// is still the first account, and a server must not be left with no owner.
func TestFirstAccountByCommandLineInviteIsTheOwner(t *testing.T) {
	w := newWorld(t)
	if _, err := w.Register(ctx, w.invite(t), "ravi", password, phone); err != nil || w.role(t, "ravi") != Owner {
		t.Errorf("the first account, by invitation: %v, role %q; want the owner", err, w.role(t, "ravi"))
	}
	if _, err := w.Register(ctx, w.invite(t), "sachi", password, laptop); err != nil || w.role(t, "sachi") != Member {
		t.Errorf("the second: %v, role %q", err, w.role(t, "sachi"))
	}
}

func TestInvitationWorksOnceForAWeek(t *testing.T) {
	w := newWorld(t)
	owner := w.register(t, "ravi", phone)
	_ = owner
	ravi := w.id(t, "ravi")
	made := w.now
	inv, err := w.CreateInvite(ravi)
	if err != nil {
		t.Fatal(err)
	}
	if len(inv.Invite) < 26 || inv.Created != made.UnixMilli() || inv.Expires != made.Add(7*24*time.Hour).UnixMilli() {
		t.Errorf("invitation %+v, want a token of 26 characters or more, good for 7 days from %d", inv, made.UnixMilli())
	}
	// A taken name does not spend it. Then it makes one account, a member, and is gone.
	_, err = w.Register(ctx, inv.Invite, "RAVI", password, laptop)
	want(t, "a taken name", err, "taken")
	if _, err := w.Register(ctx, inv.Invite, "sachi", password, laptop); err != nil || w.role(t, "sachi") != Member {
		t.Fatalf("registering with the invitation: %v, role %q", err, w.role(t, "sachi"))
	}
	_, err = w.Register(ctx, inv.Invite, "mali", password, laptop)
	want(t, "the invitation a second time", err, "invite")
	if open, _ := w.Invites(ravi); len(open) != 0 {
		t.Errorf("a used invitation is still listed: %v", open)
	}

	// Run out: the last millisecond of the week is still good, the next is not.
	inv, _ = w.CreateInvite(ravi)
	later, _ := w.CreateInvite(ravi)
	w.now = made.Add(7 * 24 * time.Hour)
	_, err = w.Register(ctx, inv.Invite, "mali", password, laptop)
	want(t, "an invitation a week old", err, "invite")
	w.now = w.now.Add(-time.Millisecond)
	if _, err := w.Register(ctx, later.Invite, "mali", password, laptop); err != nil {
		t.Errorf("an invitation one millisecond short of a week: %v", err)
	}
	// Taken back, and never made.
	w.now = made
	inv, _ = w.CreateInvite(ravi)
	if err := w.RevokeInvite(ravi, inv.Invite); err != nil {
		t.Fatal(err)
	}
	_, err = w.Register(ctx, inv.Invite, "nimal", password, laptop)
	want(t, "an invitation taken back", err, "invite")
	_, err = w.Register(ctx, "NOSUCHINVITE", "nimal", password, laptop)
	want(t, "an invitation nobody made", err, "invite")
	if err := w.RevokeInvite(ravi, "NOSUCHINVITE"); err != nil {
		t.Errorf("taking back an invitation that is not there: %v, want the same answer", err)
	}
}

func TestRenewKeepsALiveLinkAndReplacesADeadOne(t *testing.T) {
	w := newWorld(t)
	w.register(t, "ravi", phone)
	ravi := w.id(t, "ravi")
	made := w.now
	inv, _ := w.CreateInvite(ravi)

	// Three days in, still good: the same link, seven days from now.
	w.now = made.Add(3 * 24 * time.Hour)
	again, err := w.RenewInvite(ravi, inv.Invite)
	if err != nil || again.Invite != inv.Invite || again.Created != inv.Created || again.Expires != w.now.Add(7*24*time.Hour).UnixMilli() {
		t.Fatalf("renewing a live invitation: %+v, %v; want the same link, 7 days from now", again, err)
	}
	// Eleven days in, it has run out. Renewed, it comes back under a new name.
	w.now = made.Add(11 * 24 * time.Hour)
	if open, _ := w.Invites(ravi); len(open) != 0 {
		t.Errorf("an invitation that has run out is listed: %v", open)
	}
	fresh, err := w.RenewInvite(ravi, inv.Invite)
	if err != nil || fresh.Invite == inv.Invite || fresh.Invite == "" || fresh.Expires != w.now.Add(7*24*time.Hour).UnixMilli() {
		t.Fatalf("renewing a dead invitation: %+v, %v; want a new link", fresh, err)
	}
	_, err = w.Register(ctx, inv.Invite, "sachi", password, laptop)
	want(t, "the old link of a renewed invitation", err, "invite")
	_, err = w.RenewInvite(ravi, inv.Invite)
	want(t, "renewing by the old name", err, "unknown")
	if open, _ := w.Invites(ravi); len(open) != 1 || open[0] != fresh {
		t.Errorf("listed %v, want only the renewed one", open)
	}
	if _, err := w.Register(ctx, fresh.Invite, "sachi", password, laptop); err != nil {
		t.Errorf("the new link: %v", err)
	}
	// Used, taken back, never made: there is nothing to renew.
	_, err = w.RenewInvite(ravi, fresh.Invite)
	if e := want(t, "renewing a used invitation", err, "unknown"); e.Status != 404 {
		t.Errorf("status %d, want 404", e.Status)
	}
	gone, _ := w.CreateInvite(ravi)
	w.RevokeInvite(ravi, gone.Invite)
	_, err = w.RenewInvite(ravi, gone.Invite)
	want(t, "renewing one taken back", err, "unknown")
	_, err = w.RenewInvite(ravi, "")
	want(t, "renewing nothing", err, "unknown")

	// One that ran out more than a month ago is cleared when the next is made.
	old, _ := w.CreateInvite(ravi)
	w.now = w.now.Add(7*24*time.Hour + 30*24*time.Hour)
	w.CreateInvite(ravi)
	_, err = w.RenewInvite(ravi, old.Invite)
	want(t, "renewing one long dead", err, "unknown")
	var rows int
	if err := w.db.QueryRow("select count(*) from invitation").Scan(&rows); err != nil || rows != 1 {
		t.Errorf("%d invitations stored, want only the newest: old ones must not pile up", rows)
	}
}

func TestFiftyInvitationsOpenAtMost(t *testing.T) {
	w := newWorld(t)
	w.register(t, "ravi", phone)
	ravi := w.id(t, "ravi")
	var made []Invitation
	for i := range maxInvites {
		inv, err := w.CreateInvite(ravi)
		if err != nil {
			t.Fatalf("invitation %d: %v", i+1, err)
		}
		made = append(made, inv)
		w.now = w.now.Add(time.Second)
	}
	_, err := w.CreateInvite(ravi)
	if e := want(t, "the fifty-first", err, "full"); e.Status != 409 {
		t.Errorf("status %d, want 409", e.Status)
	}
	if _, err := w.Invite(); err == nil {
		t.Error("the command line made a fifty-first")
	}
	// Oldest first, all fifty.
	open, err := w.Invites(ravi)
	if err != nil || len(open) != maxInvites || open[0] != made[0] || open[49] != made[49] {
		t.Errorf("listed %d, %v; want the fifty, oldest first", len(open), err)
	}
	// One taken back, one used, or one run out each makes room for one.
	w.RevokeInvite(ravi, made[0].Invite)
	if _, err := w.CreateInvite(ravi); err != nil {
		t.Errorf("after taking one back: %v", err)
	}
	if _, err := w.Register(ctx, made[1].Invite, "sachi", password, laptop); err != nil {
		t.Fatal(err)
	}
	if _, err := w.CreateInvite(ravi); err != nil {
		t.Errorf("after one was used: %v", err)
	}
	_, err = w.CreateInvite(ravi)
	want(t, "full again", err, "full")
	w.now = time.UnixMilli(made[2].Expires)
	if _, err := w.CreateInvite(ravi); err != nil {
		t.Errorf("after one ran out: %v", err)
	}
}

// Who may do what, read from the database at each call.
func TestRolesAreCheckedOnEveryCall(t *testing.T) {
	w := newWorld(t)
	w.register(t, "ravi", phone)
	w.register(t, "sam", laptop)
	w.register(t, "mali", laptop)
	w.register(t, "zed", laptop)
	ravi, sam, mali := w.id(t, "ravi"), w.id(t, "sam"), w.id(t, "mali")
	inv, _ := w.CreateInvite(ravi)

	// The six calls, as one account would make them.
	calls := func(caller int64) map[string]error {
		_, create := w.CreateInvite(caller)
		_, list := w.Invites(caller)
		_, renew := w.RenewInvite(caller, inv.Invite)
		revoke := w.RevokeInvite(caller, "NOSUCHINVITE")
		_, admins := w.Admins(caller)
		set := w.SetRole(caller, "zed", Member)
		return map[string]error{"invites/create": create, "invites/list": list, "invites/renew": renew, "invites/revoke": revoke, "admins/list": admins, "admins/set": set}
	}
	allowed := func(who string, caller int64, may ...string) {
		t.Helper()
		for call, err := range calls(caller) {
			if slices.Contains(may, call) {
				if err != nil {
					t.Errorf("%s was refused %s: %v", who, call, err)
				}
			} else if e := want(t, who+" calling "+call, err, "forbidden"); e.Status != 403 {
				t.Errorf("status %d, want 403", e.Status)
			}
		}
	}
	invites := []string{"invites/create", "invites/list", "invites/renew", "invites/revoke"}
	allowed("a member", mali)
	allowed("the owner", ravi, append(invites, "admins/list", "admins/set")...)

	// The owner raises sam. From that call on sam may invite, and may still not choose admins.
	if err := w.SetRole(ravi, "Sam", Admin); err != nil || w.role(t, "sam") != Admin {
		t.Fatalf("raising sam: %v, role %q", err, w.role(t, "sam"))
	}
	allowed("an admin", sam, invites...)
	if err := w.SetRole(ravi, "sam", Admin); err != nil {
		t.Errorf("raising an admin again: %v, want the same answer", err)
	}
	w.SetRole(ravi, "zed", Admin)
	admins, err := w.Admins(ravi)
	if err != nil || !slices.Equal(admins, []Person{{"ravi", Owner, nil}, {"sam", Admin, nil}, {"zed", Admin, nil}}) {
		t.Errorf("admins = %v, %v; want the owner, then the admins by name, and no members", admins, err)
	}
	// And lowers sam: at once, sam is a member again.
	if err := w.SetRole(ravi, "sam", Member); err != nil || w.role(t, "sam") != Member {
		t.Fatalf("lowering sam: %v, role %q", err, w.role(t, "sam"))
	}
	allowed("a former admin", sam)
	if err := w.SetRole(ravi, "mali", Member); err != nil {
		t.Errorf("lowering a member: %v, want the same answer", err)
	}

	// Nothing changes the owner's role: not the owner, naming themself or by any spelling.
	for _, try := range [][2]string{{"ravi", Member}, {"ravi", Admin}, {"RAVI", Member}} {
		err := w.SetRole(ravi, try[0], try[1])
		if e := want(t, "the owner made "+try[1], err, "bad_request"); e.Status != 400 {
			t.Errorf("status %d, want 400", e.Status)
		}
	}
	// Nor an admin, who may not call this at all.
	w.SetRole(ravi, "sam", Admin)
	want(t, "an admin naming the owner", w.SetRole(sam, "ravi", Member), "forbidden")
	want(t, "an admin raising themself", w.SetRole(sam, "sam", Owner), "forbidden")
	if w.role(t, "ravi") != Owner {
		t.Fatalf("the owner is now %q", w.role(t, "ravi"))
	}
	// There is one owner, and that is not a role to hand out.
	for _, role := range []string{Owner, "boss", "", "ADMIN"} {
		want(t, "a role of "+role, w.SetRole(ravi, "sam", role), "bad_request")
	}
	want(t, "no username", w.SetRole(ravi, "", Admin), "bad_request")
	for _, name := range []string{"nobody", "no such name!", "x"} {
		if e := want(t, "a name the server does not have", w.SetRole(ravi, name, Admin), "unknown"); e.Status != 404 {
			t.Errorf("status %d, want 404", e.Status)
		}
	}
	var owners int
	if err := w.db.QueryRow("select count(*) from account where role = 'owner'").Scan(&owners); err != nil || owners != 1 {
		t.Errorf("%d owners after all that", owners)
	}
}

// Renewing is not a way round the two limits making an invitation has: fifty open, and
// thirty days kept after running out.
func TestRenewHoldsTheSameLimitsAsMaking(t *testing.T) {
	w := newWorld(t)
	w.register(t, "ravi", phone)
	ravi := w.id(t, "ravi")
	began := w.now
	dead, _ := w.CreateInvite(ravi)
	other, _ := w.CreateInvite(ravi)
	w.now = began.Add(8 * 24 * time.Hour) // both have run out
	var open []Invitation
	for range maxInvites {
		inv, err := w.CreateInvite(ravi)
		if err != nil {
			t.Fatal(err)
		}
		open = append(open, inv)
	}

	// Fifty are open. Bringing a run-out one back would make fifty-one.
	_, err := w.RenewInvite(ravi, dead.Invite)
	if e := want(t, "renewing a run-out invitation with fifty open", err, "full"); e.Status != 409 {
		t.Errorf("status %d, want 409", e.Status)
	}
	if got, _ := w.Invites(ravi); len(got) != maxInvites {
		t.Fatalf("%d invitations are open, want %d", len(got), maxInvites)
	}
	// A live one renewed is still one of the fifty: that is fine.
	w.now = w.now.Add(time.Hour)
	if again, err := w.RenewInvite(ravi, open[0].Invite); err != nil || again.Invite != open[0].Invite || again.Expires != w.now.Add(7*24*time.Hour).UnixMilli() {
		t.Errorf("renewing a live invitation with fifty open: %+v, %v", again, err)
	}
	// One taken back, and the run-out one may come back in its place, under a new name.
	w.RevokeInvite(ravi, open[1].Invite)
	back, err := w.RenewInvite(ravi, dead.Invite)
	if err != nil || back.Invite == dead.Invite {
		t.Fatalf("renewing with forty-nine open: %+v, %v", back, err)
	}
	_, err = w.RenewInvite(ravi, other.Invite)
	want(t, "and the next one, at fifty again", err, "full")

	// Thirty days after it ran out an invitation is gone for good, whether or not anything
	// has cleared the row away yet. No invitation has been made since, so the row is there.
	ranOut := time.UnixMilli(other.Expires)
	w.RevokeInvite(ravi, open[2].Invite) // room for one, so "full" is not the answer
	w.now = ranOut.Add(30 * 24 * time.Hour)
	_, err = w.RenewInvite(ravi, other.Invite)
	if e := want(t, "renewing thirty days after it ran out", err, "unknown"); e.Status != 404 {
		t.Errorf("status %d, want 404", e.Status)
	}
	var rows int
	if err := w.db.QueryRow("select count(*) from invitation where invite = ?", other.Invite).Scan(&rows); err != nil || rows != 1 {
		t.Fatalf("the row was cleared before the test asked (%d left): it does not test the age check", rows)
	}
	// A millisecond inside the thirty days, it still can be.
	w.now = w.now.Add(-time.Millisecond)
	if _, err := w.RenewInvite(ravi, other.Invite); err != nil {
		t.Errorf("renewing a millisecond short of thirty days: %v", err)
	}
}

// The owner's change is told where it can be passed on at once, and only when it is one.
func TestRoleChangeIsTold(t *testing.T) {
	w := newWorld(t)
	w.register(t, "ravi", phone)
	w.register(t, "sam", laptop)
	ravi, sam := w.id(t, "ravi"), w.id(t, "sam")
	var told []int64
	w.OnRole = func(account int64) {
		// Committed before anyone is told: what is read here is already the new role.
		if role, _ := w.Role(account); role != Admin && len(told) == 0 {
			t.Errorf("told of a change the database does not hold yet: role %q", role)
		}
		told = append(told, account)
	}
	w.SetRole(ravi, "sam", Admin)
	w.SetRole(ravi, "sam", Admin)   // already so
	w.SetRole(ravi, "ravi", Member) // refused
	w.SetRole(ravi, "nobody", Admin)
	w.SetRole(sam, "sam", Member) // sam is not the owner, so this is refused
	if !slices.Equal(told, []int64{sam}) {
		t.Errorf("told of changes to %v, want one, for sam", told)
	}
	w.SetRole(ravi, "sam", Member)
	if !slices.Equal(told, []int64{sam, sam}) {
		t.Errorf("after lowering: told %v", told)
	}
}
