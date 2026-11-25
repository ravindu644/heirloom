package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	gosync "sync"
	"testing"
	"time"
)

// A fresh server, roles, invitation links and the owner's say over admins, the way the
// app meets them: over HTTP and in the welcome. contracts/protocol.md section 10.

// call posts to an /api/ route as a signed-in device and returns the status and the body.
func (w *world) call(s session, device, path string, fields map[string]any) (int, string) {
	w.t.Helper()
	body := map[string]any{"token": s.Token, "device": device}
	for k, v := range fields {
		body[k] = v
	}
	res, err := http.Post(w.url+"/api/"+path, "application/json", strings.NewReader(asJSON(body)))
	if err != nil {
		w.t.Fatal(err)
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(res.Body)
	return res.StatusCode, strings.TrimSpace(string(data))
}

// setUp registers with no invitation, as the app does on a server that says "setup".
func (w *world) setUp(username, device string, invite any) (int, session) {
	w.t.Helper()
	body := map[string]any{"username": username, "password": password, "device": device}
	if invite != nil {
		body["invite"] = invite
	}
	var s session
	status, _ := w.post("/api/register", body, &s)
	return status, s
}

func (w *world) health() string {
	w.t.Helper()
	res, err := http.Get(w.url + "/healthz")
	if err != nil {
		w.t.Fatal(err)
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(res.Body)
	return string(data)
}

func (w *world) welcomeRole(s session, device string) string {
	w.t.Helper()
	_, welcome := w.connect(s.Token, device, 0)
	if !strings.Contains(welcome.raw, `"role":"`) {
		w.t.Fatalf("the welcome says no role: %s", welcome.raw)
	}
	var m struct{ Role string }
	json.Unmarshal([]byte(welcome.raw), &m)
	return m.Role
}

func TestFreshServerIsSetUpFromTheApp(t *testing.T) {
	w := start(t)
	// All a stranger may learn before signing in: that nobody has, yet.
	if got := w.health(); got != `{"ok":true,"version":"dev","sqlite":"test","setup":true}` {
		t.Fatalf("a fresh server's /healthz = %s", got)
	}
	// The app sends no invite at all; an empty one is the same.
	status, ravi := w.setUp("Ravi", phone, nil)
	if status != 200 || ravi.Username != "ravi" || ravi.Token == "" || ravi.Account == "" {
		t.Fatalf("setting up = %d %+v", status, ravi)
	}
	if got := w.health(); got != `{"ok":true,"version":"dev","sqlite":"test"}` {
		t.Errorf("after the first account /healthz = %s, want setup gone", got)
	}
	if role := w.welcomeRole(ravi, phone); role != "owner" {
		t.Errorf("the first account's welcome says %q, want owner", role)
	}
	// The door without an invitation is shut, by either spelling.
	for what, invite := range map[string]any{"no invite": nil, "an empty invite": ""} {
		if status, s := w.setUp("sachi", laptop, invite); status != 400 || s.Error != "bad_request" || s.Token != "" {
			t.Errorf("a second account with %s = %d %q, want 400 bad_request", what, status, s.Error)
		}
	}
	// With a link from the owner, the second is a member, and hears so.
	status, made := w.call(ravi, phone, "invites/create", nil)
	if status != 200 {
		t.Fatalf("create = %d %s", status, made)
	}
	var reply struct{ Invite struct{ Invite string } }
	json.Unmarshal([]byte(made), &reply)
	status, sachi := w.setUp("sachi", laptop, reply.Invite.Invite)
	if status != 200 {
		t.Fatalf("registering with the link = %d %s", status, sachi.Error)
	}
	if role := w.welcomeRole(sachi, laptop); role != "member" {
		t.Errorf("the second account's welcome says %q, want member", role)
	}
	if status, again := w.setUp("mali", tablet, reply.Invite.Invite); status != 403 || again.Error != "invite" {
		t.Errorf("the link a second time = %d %q, want 403 invite", status, again.Error)
	}

	// The owner raises sachi: her next welcome says admin, and lowered, member again.
	if status, body := w.call(ravi, phone, "admins/set", map[string]any{"username": "sachi", "role": "admin"}); status != 200 || body != "{}" {
		t.Fatalf("set = %d %s", status, body)
	}
	if role := w.welcomeRole(sachi, laptop); role != "admin" {
		t.Errorf("after being raised, the welcome says %q", role)
	}
	w.call(ravi, phone, "admins/set", map[string]any{"username": "sachi", "role": "member"})
	if role := w.welcomeRole(sachi, laptop); role != "member" {
		t.Errorf("after being lowered, the welcome says %q", role)
	}
	if role := w.welcomeRole(ravi, phone); role != "owner" {
		t.Errorf("the owner's welcome now says %q", role)
	}
}

// A device behind a proxy that lets no socket through never gets a welcome. The POST
// reply says the role instead, and says the new one as soon as the owner has changed it.
func TestPOSTReplySaysTheRole(t *testing.T) {
	w := start(t)
	_, ravi := w.setUp("ravi", phone, nil)
	sam := w.signUp("sam", laptop)
	says := func(s session, device string) string {
		t.Helper()
		status, body := w.call(s, device, "sync", map[string]any{"cursor": 0})
		var reply struct{ Role *string }
		if err := json.Unmarshal([]byte(body), &reply); err != nil || status != 200 || reply.Role == nil {
			t.Fatalf("sync = %d %s, want a reply that says a role", status, body)
		}
		return *reply.Role
	}
	if got := says(ravi, phone); got != "owner" {
		t.Errorf("the owner's reply says %q", got)
	}
	if got := says(sam, laptop); got != "member" {
		t.Errorf("a member's reply says %q", got)
	}
	w.call(ravi, phone, "admins/set", map[string]any{"username": "sam", "role": "admin"})
	if got := says(sam, laptop); got != "admin" {
		t.Errorf("after being raised, the next reply says %q", got)
	}
	// The same word the socket's welcome uses.
	if got := w.welcomeRole(sam, laptop); got != says(sam, laptop) {
		t.Errorf("the welcome says %q and the POST reply %q", got, says(sam, laptop))
	}
}

// The owner makes sam an admin while sam's app is open. Sam's devices are told at once,
// not at their next reconnect, which on a home network can be hours away.
func TestRoleChangeReachesOpenSockets(t *testing.T) {
	w := start(t)
	_, ravi := w.setUp("ravi", phone, nil)
	sam, mali := w.signUp("sam", laptop), w.signUp("mali", tablet)
	owner, _ := w.connect(ravi.Token, phone, 0)
	samsLaptop, _ := w.connect(sam.Token, laptop, 0)
	samsPhone, _ := w.connect(w.signIn("sam", pocket).Token, pocket, 0)
	malis, _ := w.connect(mali.Token, tablet, 0)
	stored := func() (role string) {
		t.Helper()
		if err := w.db.QueryRow("select role from account where username = 'sam'").Scan(&role); err != nil {
			t.Fatal(err)
		}
		return role
	}

	w.call(ravi, phone, "admins/set", map[string]any{"username": "sam", "role": "admin"})
	for _, d := range []*device{samsLaptop, samsPhone} {
		if m := d.want("role"); m.Role != "admin" || m.Role != stored() || m.raw != `{"type":"role","role":"admin"}`+"\n" {
			t.Errorf("sam's device was told %s, and the database holds %q", m.raw, stored())
		}
	}
	// Nobody else hears of it: not the owner who did it, not another member.
	owner.quiet()
	malis.quiet()

	// Saying what is already so, or something refused, tells nobody anything.
	w.call(ravi, phone, "admins/set", map[string]any{"username": "sam", "role": "admin"})
	w.call(ravi, phone, "admins/set", map[string]any{"username": "ravi", "role": "member"})
	w.call(sam, laptop, "admins/set", map[string]any{"username": "mali", "role": "admin"})
	w.call(ravi, phone, "admins/set", map[string]any{"username": "mali", "role": "member"})
	for _, d := range []*device{samsLaptop, samsPhone, owner, malis} {
		d.quiet()
	}

	// Lowered again: told again, with the role as it now is.
	w.call(ravi, phone, "admins/set", map[string]any{"username": "sam", "role": "member"})
	for _, d := range []*device{samsLaptop, samsPhone} {
		if m := d.want("role"); m.Role != "member" || m.Role != stored() {
			t.Errorf("sam's device was told %s, and the database holds %q", m.raw, stored())
		}
	}
	malis.quiet()
}

// Two phones opening a fresh server's address at the same moment: one owner, one refusal.
func TestTwoSetUpsAtOnceOverHTTP(t *testing.T) {
	w := start(t)
	var both gosync.WaitGroup
	results := make(chan [2]string, 8)
	for i := range 8 {
		both.Go(func() {
			body := asJSON(map[string]any{"username": fmt.Sprintf("first_%d", i), "password": password, "device": fmt.Sprintf("%016x", i+1)})
			res, err := http.Post(w.url+"/api/register", "application/json", strings.NewReader(body))
			if err != nil {
				results <- [2]string{"0", err.Error()}
				return
			}
			defer res.Body.Close()
			data, _ := io.ReadAll(res.Body)
			results <- [2]string{fmt.Sprint(res.StatusCode), strings.TrimSpace(string(data))}
		})
	}
	both.Wait()
	close(results)
	won := 0
	for r := range results {
		switch {
		case r[0] == "200":
			won++
		case r[0] == "403" && r[1] == `{"error":"invite"}`, r[0] == "400" && r[1] == `{"error":"bad_request"}`:
			// Lost the race at the last step, or arrived after it was over.
		default:
			t.Errorf("one of the eight got %s %s", r[0], r[1])
		}
	}
	var accounts, owners int
	if err := w.db.QueryRow("select count(*), coalesce(sum(role = 'owner'), 0) from account").Scan(&accounts, &owners); err != nil {
		t.Fatal(err)
	}
	if won != 1 || accounts != 1 || owners != 1 {
		t.Errorf("%d of eight were let in, %d accounts, %d owners; want one of each", won, accounts, owners)
	}
}

func TestInvitationsOverHTTP(t *testing.T) {
	w := start(t)
	_, ravi := w.setUp("ravi", phone, nil)
	began := w.ms.Load()
	const week = 7 * 24 * 3600 * 1000

	status, body := w.call(ravi, phone, "invites/create", nil)
	shape := regexp.MustCompile(`^\{"invite":\{"invite":"([A-Z2-7]{26})","created":(\d+),"expires":(\d+)\}\}$`)
	m := shape.FindStringSubmatch(body)
	if status != 200 || m == nil || m[2] != fmt.Sprint(began) || m[3] != fmt.Sprint(began+week) {
		t.Fatalf("create = %d %s, want one invite made now and good for 7 days", status, body)
	}
	first := m[1]
	w.pass(time.Second)
	_, body = w.call(ravi, phone, "invites/create", nil)
	second := shape.FindStringSubmatch(body)[1]
	// The command line's invite is in the list like any other.
	third, err := newInvite(w.dir)
	if err != nil {
		t.Fatal(err)
	}

	status, body = w.call(ravi, phone, "invites/list", nil)
	var list struct {
		Invites []struct {
			Invite           string
			Created, Expires int64
		}
	}
	if err := json.Unmarshal([]byte(body), &list); err != nil || status != 200 || len(list.Invites) != 3 ||
		list.Invites[0].Invite != first || list.Invites[1].Invite != second || list.Invites[2].Invite != third {
		t.Fatalf("list = %d %s, want the three, oldest first", status, body)
	}
	if strings.Contains(body, "ravi") || strings.Contains(body, "made_by") {
		t.Errorf("the list says who made an invite: %s", body)
	}

	// Renew a live one: the same link. Renew after it ran out: a new one.
	w.pass(24 * time.Hour)
	status, body = w.call(ravi, phone, "invites/renew", map[string]any{"invite": first})
	if m := shape.FindStringSubmatch(body); status != 200 || m == nil || m[1] != first || m[3] != fmt.Sprint(w.ms.Load()+week) {
		t.Errorf("renewing a live invite = %d %s", status, body)
	}
	w.pass(7*24*time.Hour - time.Hour) // now the second has run out, and the first has an hour left
	if _, body := w.call(ravi, phone, "invites/list", nil); strings.Contains(body, second) || !strings.Contains(body, first) {
		t.Errorf("after a week the list is %s, want the renewed one and not the one that ran out", body)
	}
	status, body = w.call(ravi, phone, "invites/renew", map[string]any{"invite": second})
	m = shape.FindStringSubmatch(body)
	if status != 200 || m == nil || m[1] == second {
		t.Fatalf("renewing one that ran out = %d %s, want a new invite", status, body)
	}
	if status, s := w.setUp("sachi", laptop, second); status != 403 || s.Error != "invite" {
		t.Errorf("the old link of a renewed invite = %d %q", status, s.Error)
	}
	if status, s := w.setUp("sachi", laptop, m[1]); status != 200 {
		t.Errorf("the new link = %d %q", status, s.Error)
	}

	// Revoke: {} whether or not it was there, and then the link is dead.
	for range 2 {
		if status, body := w.call(ravi, phone, "invites/revoke", map[string]any{"invite": first}); status != 200 || body != "{}" {
			t.Errorf("revoke = %d %s, want {}", status, body)
		}
	}
	if status, s := w.setUp("mali", tablet, first); status != 403 || s.Error != "invite" {
		t.Errorf("a revoked link = %d %q", status, s.Error)
	}
	for what, invite := range map[string]string{"a used invite": m[1], "a revoked invite": first, "no invite": ""} {
		if status, body := w.call(ravi, phone, "invites/renew", map[string]any{"invite": invite}); status != 404 || body != `{"error":"unknown"}` {
			t.Errorf("renewing %s = %d %s, want 404 unknown", what, status, body)
		}
	}
	if _, body := w.call(ravi, phone, "invites/list", nil); body != `{"invites":[]}` {
		t.Errorf("with every invite used, run out or revoked the list is %s, want an empty list", body)
	}

	// Fifty open, and the fifty-first is refused.
	for i := range 50 {
		if status, body := w.call(ravi, phone, "invites/create", nil); status != 200 {
			t.Fatalf("invite %d = %d %s", i+1, status, body)
		}
	}
	if status, body := w.call(ravi, phone, "invites/create", nil); status != 409 || body != `{"error":"full"}` {
		t.Errorf("the fifty-first = %d %s, want 409 full", status, body)
	}
}

// Who may call what. The answer comes from the database at each call, so it changes the
// moment the owner changes a role, whatever the device still believes.
func TestRolesOverHTTP(t *testing.T) {
	w := start(t)
	_, ravi := w.setUp("ravi", phone, nil)
	sam, mali := w.signUp("sam", laptop), w.signUp("mali", tablet)
	_, body := w.call(ravi, phone, "invites/create", nil)
	invite := regexp.MustCompile(`"invite":"([A-Z2-7]+)"`).FindStringSubmatch(body)[1]

	routes := map[string]map[string]any{
		"invites/create": nil,
		"invites/list":   nil,
		"invites/renew":  {"invite": invite},
		"invites/revoke": {"invite": "NOSUCHINVITE"},
		"admins/list":    nil,
		"admins/set":     {"username": "mali", "role": "member"},
	}
	may := func(who string, s session, device string, allowed string) {
		t.Helper()
		for path, fields := range routes {
			status, body := w.call(s, device, path, fields)
			if strings.Contains(allowed, strings.Split(path, "/")[0]) {
				if status != 200 {
					t.Errorf("%s was refused %s: %d %s", who, path, status, body)
				}
			} else if status != 403 || body != `{"error":"forbidden"}` {
				t.Errorf("%s calling %s = %d %s, want 403 forbidden", who, path, status, body)
			}
		}
	}
	may("a member", sam, laptop, "")
	may("the owner", ravi, phone, "invites admins")

	w.call(ravi, phone, "admins/set", map[string]any{"username": "Sam", "role": "admin"})
	may("an admin", sam, laptop, "invites")
	// The owner first, then admins by name. Members are in no list anyone can ask for.
	w.call(ravi, phone, "admins/set", map[string]any{"username": "mali", "role": "admin"})
	if status, body := w.call(ravi, phone, "admins/list", nil); status != 200 || body != `{"admins":[{"username":"ravi","role":"owner"},{"username":"mali","role":"admin"},{"username":"sam","role":"admin"}]}` {
		t.Errorf("admins/list = %d %s", status, body)
	}
	w.call(ravi, phone, "admins/set", map[string]any{"username": "mali", "role": "member"})
	if _, body := w.call(ravi, phone, "admins/list", nil); strings.Contains(body, "mali") {
		t.Errorf("a member is in the list of admins: %s", body)
	}
	if status, body := w.call(ravi, phone, "admins/set", map[string]any{"username": "sam", "role": "admin"}); status != 200 || body != "{}" {
		t.Errorf("raising an admin again = %d %s, want {}", status, body)
	}

	// Lowered: sam's device has not heard, and its very next call is refused.
	w.call(ravi, phone, "admins/set", map[string]any{"username": "sam", "role": "member"})
	may("a former admin", sam, laptop, "")

	// The owner's role is not anybody's to change, the owner's included.
	w.call(ravi, phone, "admins/set", map[string]any{"username": "sam", "role": "admin"})
	for what, c := range map[string]struct {
		by     session
		device string
		fields map[string]any
		status int
		code   string
	}{
		"the owner lowering themself":     {ravi, phone, map[string]any{"username": "ravi", "role": "member"}, 400, "bad_request"},
		"the owner making themself admin": {ravi, phone, map[string]any{"username": "RAVI", "role": "admin"}, 400, "bad_request"},
		"an admin lowering the owner":     {sam, laptop, map[string]any{"username": "ravi", "role": "member"}, 403, "forbidden"},
		"an admin taking the server":      {sam, laptop, map[string]any{"username": "sam", "role": "owner"}, 403, "forbidden"},
		"a member raising themself":       {mali, tablet, map[string]any{"username": "mali", "role": "admin"}, 403, "forbidden"},
		"a second owner":                  {ravi, phone, map[string]any{"username": "sam", "role": "owner"}, 400, "bad_request"},
		"a role there is not":             {ravi, phone, map[string]any{"username": "sam", "role": "boss"}, 400, "bad_request"},
		"no role":                         {ravi, phone, map[string]any{"username": "sam"}, 400, "bad_request"},
		"no username":                     {ravi, phone, map[string]any{"role": "admin"}, 400, "bad_request"},
		"a name the server does not have": {ravi, phone, map[string]any{"username": "nobody", "role": "admin"}, 404, "unknown"},
		"a role sent as a number":         {ravi, phone, map[string]any{"username": "sam", "role": 1}, 400, "bad_request"},
	} {
		if status, body := w.call(c.by, c.device, "admins/set", c.fields); status != c.status || body != fmt.Sprintf(`{"error":%q}`, c.code) {
			t.Errorf("%s = %d %s, want %d %s", what, status, body, c.status, c.code)
		}
	}
	var roles string
	if err := w.db.QueryRow("select group_concat(username || ':' || role, ' ') from (select * from account order by id)").Scan(&roles); err != nil || roles != "ravi:owner sam:admin mali:member" {
		t.Errorf("after all that the roles are %q", roles)
	}
	// A role sent along with a request is not a role: only the database's counts.
	if status, body := w.call(mali, tablet, "invites/list", map[string]any{"role": "owner"}); status != 403 {
		t.Errorf("a member who says they are the owner = %d %s", status, body)
	}
}

// Read as a stranger on the home network would: nothing but "setup" before signing in,
// and no list of who is here for anybody but the owner.
func TestStrangerLearnsNothing(t *testing.T) {
	w := start(t)
	_, ravi := w.setUp("ravi", phone, nil)
	w.signUp("sachi", laptop)
	stranger := session{Token: "NOSUCHTOKEN"}
	for _, path := range []string{"invites/create", "invites/list", "invites/renew", "invites/revoke", "admins/list", "admins/set"} {
		fields := map[string]any{"invite": "x", "username": "ravi", "role": "member"}
		if status, body := w.call(stranger, phone, path, fields); status != 401 || body != `{"error":"token"}` {
			t.Errorf("%s with nobody's token = %d %s, want 401 token", path, status, body)
		}
		if status, body := w.call(ravi, laptop, path, fields); status != 401 || body != `{"error":"token"}` {
			t.Errorf("%s with the owner's token from another device = %d %s, want 401 token", path, status, body)
		}
		if status, body := w.call(ravi, "", path, fields); status != 400 || body != `{"error":"bad_request"}` {
			t.Errorf("%s with no device = %d %s, want 400 bad_request", path, status, body)
		}
		res, err := http.Get(w.url + "/api/" + path)
		if err != nil {
			t.Fatal(err)
		}
		io.Copy(io.Discard, res.Body)
		res.Body.Close()
		if res.StatusCode != 404 && res.StatusCode != 405 {
			t.Errorf("GET %s = %d: these are answered to a POST with a token only", path, res.StatusCode)
		}
	}
	// What every unauthenticated answer says, searched for a name.
	said := w.health()
	for _, c := range []struct {
		path string
		body map[string]any
	}{
		{"register", map[string]any{"username": "ravi", "password": password, "device": tablet}},
		{"register", map[string]any{"invite": "NOSUCHINVITE", "username": "ravi", "password": password, "device": tablet}},
		{"register", map[string]any{"invite": "NOSUCHINVITE", "username": "nobody", "password": password, "device": tablet}},
		{"login", map[string]any{"username": "ravi", "password": "not the password", "device": tablet}},
		{"login", map[string]any{"username": "nobody", "password": "not the password", "device": tablet}},
		{"sync", map[string]any{"token": "x", "device": tablet, "cursor": 0}},
		{"logout", map[string]any{"token": "x"}},
	} {
		_, body := w.call(session{}, "", c.path, c.body)
		said += " " + body
	}
	for _, secret := range []string{"ravi", "sachi", "owner", "member", "taken"} {
		if strings.Contains(said, secret) {
			t.Errorf("before signing in, a stranger was told %q: %s", secret, said)
		}
	}
	// With a made-up invite, a name that is taken and one that is not get the same answer.
	_, taken := w.call(session{}, "", "register", map[string]any{"invite": "NOSUCHINVITE", "username": "ravi", "password": password, "device": tablet})
	_, free := w.call(session{}, "", "register", map[string]any{"invite": "NOSUCHINVITE", "username": "nobody", "password": password, "device": tablet})
	if taken != free || taken != `{"error":"invite"}` {
		t.Errorf("without a real invite, a taken name answers %s and a free one %s", taken, free)
	}
}
