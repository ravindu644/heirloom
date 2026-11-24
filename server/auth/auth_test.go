package auth

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
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
		for what, secret := range map[string]string{"password": password, "token": s.Token, "invite": code} {
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
