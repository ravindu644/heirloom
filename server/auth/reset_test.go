package auth

import (
	"bytes"
	"context"
	"crypto/sha256"
	"errors"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"testing"
	"time"
)

const newPassword = "a brand new password"

// people is the usual server: ravi owns it, zed is an admin, sam and mali are members.
func people(t *testing.T) (w *world, ravi, zed, sam int64) {
	t.Helper()
	w = newWorld(t)
	w.register(t, "ravi", phone)
	w.register(t, "zed", laptop)
	w.register(t, "sam", laptop)
	w.register(t, "mali", laptop)
	ravi, zed, sam = w.id(t, "ravi"), w.id(t, "zed"), w.id(t, "sam")
	if err := w.SetRole(ravi, "zed", Admin); err != nil {
		t.Fatal(err)
	}
	return w, ravi, zed, sam
}

func (w *world) resetFor(t *testing.T, caller int64, username string) Reset {
	t.Helper()
	r, err := w.CreateReset(caller, username)
	if err != nil {
		t.Fatalf("a reset for %s: %v", username, err)
	}
	return r
}

func TestOnlyTheOwnerGivesAWayBackIn(t *testing.T) {
	w, ravi, zed, sam := people(t)
	for who, caller := range map[string]int64{"a member": sam, "an admin": zed} {
		// A name that is here and one that is not get the same refusal: asking is not a
		// way to find out who has an account.
		for _, name := range []string{"mali", "nobody", "ravi", ""} {
			_, create := w.CreateReset(caller, name)
			if e := want(t, who+" making a reset for "+name, create, "forbidden"); e.Status != 403 {
				t.Errorf("status %d, want 403", e.Status)
			}
			want(t, who+" taking back a reset for "+name, w.RevokeReset(caller, name), "forbidden")
		}
		_, list := w.Resets(caller)
		want(t, who+" listing resets", list, "forbidden")
	}
	var stored int
	if err := w.db.QueryRow("select count(*) from resets").Scan(&stored); err != nil || stored != 0 {
		t.Fatalf("%d resets were stored by people who may not make one", stored)
	}

	// The owner may, for anybody but the owner.
	made := w.now
	r := w.resetFor(t, ravi, "Sam")
	if !regexp.MustCompile(`^[A-Z2-7]{52}$`).MatchString(r.Reset) || r.Username != "sam" || r.Created != made.UnixMilli() || r.Expires != made.Add(24*time.Hour).UnixMilli() {
		t.Errorf("reset = %+v, want 32 bytes as 52 characters of base32, for sam, good for 24 hours", r)
	}
	for _, name := range []string{"ravi", "RAVI"} {
		_, err := w.CreateReset(ravi, name)
		if e := want(t, "the owner making a reset for the owner", err, "bad_request"); e.Status != 400 {
			t.Errorf("status %d, want 400", e.Status)
		}
	}
	_, err := w.CreateReset(ravi, "")
	want(t, "a reset for nobody", err, "bad_request")
	want(t, "taking back for nobody", w.RevokeReset(ravi, ""), "bad_request")
	for _, name := range []string{"nobody", "no such name!", "x"} {
		_, err := w.CreateReset(ravi, name)
		if e := want(t, "a reset for a name the server does not have", err, "unknown"); e.Status != 404 {
			t.Errorf("status %d, want 404", e.Status)
		}
		want(t, "taking back for a name the server does not have", w.RevokeReset(ravi, name), "unknown")
	}

	// The list: who and when, oldest first, never the link.
	w.now = w.now.Add(time.Minute)
	w.resetFor(t, ravi, "mali")
	open, err := w.Resets(ravi)
	if err != nil || len(open) != 2 || open[0] != (Reset{"", "sam", r.Created, r.Expires}) || open[1].Username != "mali" || open[1].Reset != "" {
		t.Errorf("list = %+v, %v; want sam then mali, without the links", open, err)
	}
}

// The link is shown once. What the server keeps is its hash, so neither a backup nor the
// server itself can give it out again.
func TestOnlyTheHashOfAResetIsKept(t *testing.T) {
	w, ravi, _, sam := people(t)
	r := w.resetFor(t, ravi, "sam")
	var hash []byte
	if err := w.db.QueryRow("select hash from resets where account = ?", sam).Scan(&hash); err != nil {
		t.Fatal(err)
	}
	if want := sha256.Sum256([]byte(r.Reset)); !bytes.Equal(hash, want[:]) {
		t.Errorf("stored %x, want the sha-256 of the reset", hash)
	}
	files, _ := filepath.Glob(filepath.Join(w.dir, "*"))
	for _, f := range files {
		data, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		if bytes.Contains(data, []byte(r.Reset)) || bytes.Contains(data, []byte(r.Reset[:20])) {
			t.Errorf("%s holds the reset as it was given", filepath.Base(f))
		}
	}
	if len(files) < 2 {
		t.Errorf("only %v was looked at: the -wal file holds the newest writes", files)
	}
}

func TestResetSetsThePasswordOnceAndSignsEveryDeviceOut(t *testing.T) {
	w, ravi, _, sam := people(t)
	// Sam is signed in on two devices; mali, on the same device id, is somebody else.
	onLaptop, err := w.Login(ctx, "sam", password, laptop)
	if err != nil {
		t.Fatal(err)
	}
	onPhone, err := w.Login(ctx, "sam", password, phone)
	if err != nil {
		t.Fatal(err)
	}
	malis, err := w.Login(ctx, "mali", password, laptop)
	if err != nil {
		t.Fatal(err)
	}
	_, laptopKey, _ := w.Check(onLaptop.Token, laptop)
	_, phoneKey, _ := w.Check(onPhone.Token, phone)
	w.revoked = nil
	r := w.resetFor(t, ravi, "sam")

	if name, err := w.LookReset(r.Reset); err != nil || name != "sam" {
		t.Fatalf("look = %q, %v; want the name the link was made for", name, err)
	}
	if got, _ := w.Resets(ravi); len(got) != 1 {
		t.Fatalf("looking at a reset used it up: %v", got)
	}
	// A password that will not do does not use the link up either.
	_, err = w.UseReset(ctx, r.Reset, "short", laptop)
	want(t, "a password of five", err, "bad_request")
	_, err = w.UseReset(ctx, r.Reset, newPassword, "not a device")
	want(t, "a bad device", err, "bad_request")

	s, err := w.UseReset(ctx, r.Reset, newPassword, laptop)
	if err != nil {
		t.Fatalf("using the reset: %v", err)
	}
	if s.Username != "sam" || s.Token == "" || s.Account != onLaptop.Account || s.Token == onLaptop.Token {
		t.Errorf("the reply = %+v, want a new token for sam's own account", s)
	}
	// Every token sam had is dead, and each was reported so its socket can be cut.
	for device, old := range map[string]string{laptop: onLaptop.Token, phone: onPhone.Token} {
		_, _, err := w.Check(old, device)
		want(t, "a token from before the reset", err, "token")
	}
	slices.Sort(w.revoked)
	if wantKeys := slices.Sorted(slices.Values([]string{laptopKey, phoneKey})); !slices.Equal(w.revoked, wantKeys) {
		t.Errorf("%d tokens were reported dead, want exactly sam's two", len(w.revoked))
	}
	// The new one works, on the device that asked and only there.
	if account, _, err := w.Check(s.Token, laptop); err != nil || account != sam {
		t.Errorf("the new token: account %d, %v", account, err)
	}
	// Mali never noticed.
	if _, _, err := w.Check(malis.Token, laptop); err != nil {
		t.Errorf("another account's token died with sam's: %v", err)
	}

	// The old password is no password; the new one is.
	_, err = w.Login(ctx, "sam", password, phone)
	want(t, "the password from before", err, "credentials")
	if _, err := w.Login(ctx, "sam", newPassword, phone); err != nil {
		t.Errorf("the new password: %v", err)
	}
	if _, err := w.Login(ctx, "mali", password, laptop); err != nil {
		t.Errorf("mali's password changed with sam's: %v", err)
	}

	// Once. The link is used up, for looking and for using.
	_, err = w.UseReset(ctx, r.Reset, "yet another password", laptop)
	if e := want(t, "the reset a second time", err, "reset"); e.Status != 403 {
		t.Errorf("status %d, want 403", e.Status)
	}
	_, err = w.LookReset(r.Reset)
	want(t, "looking at a used reset", err, "reset")
	if _, err := w.Login(ctx, "sam", newPassword, phone); err != nil {
		t.Errorf("the refused second use changed the password: %v", err)
	}
	if open, _ := w.Resets(ravi); len(open) != 0 {
		t.Errorf("a used reset is still listed: %v", open)
	}
	var used *int64
	if err := w.db.QueryRow("select used from resets where account = ?", sam).Scan(&used); err != nil || used == nil {
		t.Errorf("the reset is not marked used: %v", err)
	}
}

// Two people with the same link at the same moment. One sets the password; the other is
// told "reset", and the password is the first one's.
func TestTwoUsesAtOnce(t *testing.T) {
	w, ravi, _, _ := people(t)
	r := w.resetFor(t, ravi, "sam")
	w.hashing.Lock()
	type result struct {
		password string
		err      error
	}
	results := make(chan result, 2)
	for _, pw := range []string{"the first password", "the second password"} {
		go func() {
			_, err := w.UseReset(ctx, r.Reset, pw, phone)
			results <- result{pw, err}
		}()
	}
	for len(w.waiting) < 2 {
		time.Sleep(time.Millisecond)
	}
	w.hashing.Unlock()
	a, b := <-results, <-results
	if a.err != nil {
		a, b = b, a
	}
	if a.err != nil {
		t.Fatalf("neither was let in: %v, %v", a.err, b.err)
	}
	want(t, "the one who lost", b.err, "reset")
	if _, err := w.Login(ctx, "sam", a.password, laptop); err != nil {
		t.Errorf("the winner's password does not sign in: %v", err)
	}
	_, err := w.Login(ctx, "sam", b.password, laptop)
	want(t, "the loser's password", err, "credentials")
	var tokens int
	if err := w.db.QueryRow("select count(*) from token where account = (select id from account where username = 'sam')").Scan(&tokens); err != nil || tokens != 2 {
		t.Errorf("sam has %d tokens, want the winner's and the one just made by signing in", tokens)
	}
}

func TestResetRunsOutIsReplacedAndIsTakenBack(t *testing.T) {
	w, ravi, _, _ := people(t)
	made := w.now

	// Good for 24 hours: a millisecond short of that it works, a millisecond past it does not.
	r := w.resetFor(t, ravi, "sam")
	w.now = made.Add(24*time.Hour - time.Millisecond)
	if _, err := w.LookReset(r.Reset); err != nil {
		t.Errorf("a millisecond short of 24 hours: %v", err)
	}
	w.now = made.Add(24*time.Hour + time.Millisecond)
	_, err := w.LookReset(r.Reset)
	want(t, "looking 24 hours and a millisecond on", err, "reset")
	_, err = w.UseReset(ctx, r.Reset, newPassword, laptop)
	want(t, "using it 24 hours and a millisecond on", err, "reset")
	if _, err := w.Login(ctx, "sam", password, laptop); err != nil {
		t.Errorf("a run-out reset changed the password: %v", err)
	}
	if open, _ := w.Resets(ravi); len(open) != 0 {
		t.Errorf("a run-out reset is listed: %v", open)
	}

	// One open reset an account: a new one is the end of the old one.
	first := w.resetFor(t, ravi, "sam")
	second := w.resetFor(t, ravi, "sam")
	_, err = w.LookReset(first.Reset)
	want(t, "the link a newer one replaced", err, "reset")
	_, err = w.UseReset(ctx, first.Reset, newPassword, laptop)
	want(t, "using the replaced link", err, "reset")
	if name, err := w.LookReset(second.Reset); err != nil || name != "sam" {
		t.Errorf("the newer link: %q, %v", name, err)
	}
	var rows int
	if err := w.db.QueryRow("select count(*) from resets").Scan(&rows); err != nil || rows != 1 {
		t.Errorf("%d resets stored, want one an account", rows)
	}

	// Taken back: dead at once. None open is the same answer.
	if err := w.RevokeReset(ravi, "SAM"); err != nil {
		t.Fatal(err)
	}
	_, err = w.LookReset(second.Reset)
	want(t, "a reset taken back", err, "reset")
	_, err = w.UseReset(ctx, second.Reset, newPassword, laptop)
	want(t, "using a reset taken back", err, "reset")
	if err := w.RevokeReset(ravi, "sam"); err != nil {
		t.Errorf("taking back when none is open: %v, want the same answer", err)
	}
	// Never made, and nothing at all.
	for _, made := range []string{"NOSUCHRESET", strings.Repeat("A", 52), ""} {
		_, err := w.LookReset(made)
		want(t, "a reset nobody made", err, "reset")
	}
	_, err = w.UseReset(ctx, "", newPassword, laptop)
	want(t, "no reset at all", err, "bad_request")
}

// The owner's own way back is the command line, which may name anybody.
func TestCommandLineResetIsForAnyoneTheOwnerToo(t *testing.T) {
	w, ravi, _, _ := people(t)
	r, err := w.ResetFor("Ravi")
	if err != nil || r.Username != "ravi" || len(r.Reset) != 52 {
		t.Fatalf("a reset for the owner from the command line: %+v, %v", r, err)
	}
	if _, err := w.ResetFor("nobody"); !errors.Is(err, ErrUnknown) {
		t.Errorf("a reset for nobody: %v, want unknown", err)
	}
	// The owner sees it in the list and may take it back, but could not have made it.
	if open, _ := w.Resets(ravi); len(open) != 1 || open[0].Username != "ravi" {
		t.Errorf("list = %v", open)
	}
	if _, err := w.UseReset(ctx, r.Reset, newPassword, laptop); err != nil {
		t.Fatalf("the owner's way back: %v", err)
	}
	if _, err := w.Login(ctx, "ravi", newPassword, phone); err != nil || w.role(t, "ravi") != Owner {
		t.Errorf("after it: %v, role %q", err, w.role(t, "ravi"))
	}
}

// Five wrong passwords lock a name for fifteen minutes. A reset is the owner's say that
// this person is who they are, so it lifts that.
func TestResetClearsTheFailedSignIns(t *testing.T) {
	w, ravi, _, _ := people(t)
	for range maxFailures {
		_, err := w.Login(ctx, "sam", "not the password", laptop)
		want(t, "a wrong password", err, "credentials")
	}
	_, err := w.Login(ctx, "sam", password, laptop)
	want(t, "the sixth sign-in", err, "slow_down")
	r := w.resetFor(t, ravi, "sam")
	if _, err := w.UseReset(ctx, r.Reset, newPassword, laptop); err != nil {
		t.Fatal(err)
	}
	if _, err := w.Login(ctx, "sam", newPassword, phone); err != nil {
		t.Errorf("signing in right after the reset: %v, want the count gone", err)
	}
}

// A reset waits in the same line as sign-ins, and a full line turns it away without
// using it up.
func TestResetWaitsInTheLineOfSignIns(t *testing.T) {
	w, ravi, _, _ := people(t)
	r := w.resetFor(t, ravi, "sam")
	for range maxWaiting {
		w.waiting <- struct{}{}
	}
	_, err := w.UseReset(ctx, r.Reset, newPassword, laptop)
	if e := want(t, "a reset with the line full", err, "slow_down"); e.Status != 429 || e.RetryAfter != 1 {
		t.Errorf("status %d, retry after %d; want 429 and 1", e.Status, e.RetryAfter)
	}
	// A made-up reset never stands in the line at all: it is refused first.
	_, err = w.UseReset(ctx, "NOSUCHRESET", newPassword, laptop)
	want(t, "a made-up reset with the line full", err, "reset")
	for range maxWaiting {
		<-w.waiting
	}
	gone, hangUp := context.WithCancel(ctx)
	hangUp()
	if _, err := w.UseReset(gone, r.Reset, newPassword, laptop); !errors.Is(err, context.Canceled) {
		t.Errorf("a reset nobody waits for: %v", err)
	}
	if _, err := w.UseReset(ctx, r.Reset, newPassword, laptop); err != nil {
		t.Errorf("after being turned away twice the link is used up: %v", err)
	}
}

// Used and run-out resets go when the next invitation or reset is made, with the old
// invitations: neither table grows by itself.
func TestOldResetsAreClearedWithOldInvites(t *testing.T) {
	w, ravi, _, _ := people(t)
	rows := func() (n int) {
		t.Helper()
		if err := w.db.QueryRow("select count(*) from resets").Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	used := w.resetFor(t, ravi, "sam")
	if _, err := w.UseReset(ctx, used.Reset, newPassword, laptop); err != nil {
		t.Fatal(err)
	}
	w.resetFor(t, ravi, "mali")
	if rows() != 1 {
		t.Errorf("%d resets stored after the next was made, want the used one gone", rows())
	}
	w.now = w.now.Add(25 * time.Hour) // mali's has run out
	if _, err := w.CreateInvite(ravi); err != nil {
		t.Fatal(err)
	}
	if rows() != 0 {
		t.Errorf("%d resets stored after an invitation was made, want the run-out one gone", rows())
	}
	// One that is open stays.
	w.resetFor(t, ravi, "sam")
	w.CreateInvite(ravi)
	if rows() != 1 {
		t.Errorf("an open reset was cleared away")
	}
}

// The making, the use and the taking back are written down, with the username. The link
// and the password never are.
func TestResetsAreLoggedWithoutTheirSecret(t *testing.T) {
	var written bytes.Buffer
	stderr, flags := log.Writer(), log.Flags()
	log.SetOutput(&written)
	defer func() { log.SetOutput(stderr); log.SetFlags(flags) }()

	w, ravi, _, _ := people(t)
	first := w.resetFor(t, ravi, "sam")
	second := w.resetFor(t, ravi, "sam")
	w.RevokeReset(ravi, "sam")
	w.RevokeReset(ravi, "sam") // none open: nothing was taken back
	third := w.resetFor(t, ravi, "sam")
	if _, err := w.UseReset(ctx, third.Reset, newPassword, laptop); err != nil {
		t.Fatal(err)
	}
	w.UseReset(ctx, third.Reset, "another password", laptop) // refused: nothing was used
	w.UseReset(ctx, "NOSUCHRESET", "a guessed password", laptop)
	w.LookReset(first.Reset)
	owners, _ := w.ResetFor("ravi")

	logged := written.String()
	lines := strings.Split(strings.TrimSpace(logged), "\n")
	var said []string
	stamp := regexp.MustCompile(`^\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2} `)
	for _, line := range lines {
		if !stamp.MatchString(line) {
			t.Errorf("a log line with no time: %q", line)
		}
		said = append(said, stamp.ReplaceAllString(line, ""))
	}
	wantLines := []string{"reset: made for sam", "reset: made for sam", "reset: taken back for sam", "reset: made for sam", "reset: used for sam", "reset: made for ravi"}
	if !slices.Equal(said, wantLines) {
		t.Errorf("the log says\n%s\nwant\n%s", strings.Join(said, "\n"), strings.Join(wantLines, "\n"))
	}
	for what, secret := range map[string]string{"a reset": first.Reset, "the replaced reset": second.Reset, "the used reset": third.Reset, "the owner's reset": owners.Reset,
		"the start of a reset": third.Reset[:12], "the new password": newPassword, "a refused password": "another password", "a guessed password": "a guessed password", "a made-up reset": "NOSUCHRESET"} {
		if strings.Contains(logged, secret) {
			t.Errorf("the log holds %s:\n%s", what, logged)
		}
	}
}

// An error that reaches a log or a reply must not carry the reset or the password either.
func TestResetErrorsCarryNoSecret(t *testing.T) {
	w, ravi, _, _ := people(t)
	r := w.resetFor(t, ravi, "sam")
	w.db.Close() // every call from here fails inside SQLite
	_, look := w.LookReset(r.Reset)
	_, use := w.UseReset(ctx, r.Reset, newPassword, laptop)
	_, create := w.CreateReset(ravi, "sam")
	for what, err := range map[string]error{"look": look, "use": use, "create": create} {
		if err == nil {
			t.Fatalf("%s worked on a closed database", what)
		}
		if strings.Contains(err.Error(), r.Reset) || strings.Contains(err.Error(), newPassword) || strings.Contains(err.Error(), r.Reset[:12]) {
			t.Errorf("the error from %s holds a secret: %v", what, err)
		}
	}
}
