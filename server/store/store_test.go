package store

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

// SQLite before 3.51.3 can corrupt a WAL database. Nothing is built on an older one.
var minSQLite = [3]int{3, 51, 3}

// atLeast compares versions number by number: as strings, "3.9.0" would beat "3.51.3".
func atLeast(version string, min [3]int) (bool, error) {
	var got [3]int
	if _, err := fmt.Sscanf(version, "%d.%d.%d", &got[0], &got[1], &got[2]); err != nil {
		return false, fmt.Errorf("parse sqlite version %q: %w", version, err)
	}
	for i := range got {
		if got[i] != min[i] {
			return got[i] > min[i], nil
		}
	}
	return true, nil
}

func TestAtLeast(t *testing.T) {
	for version, want := range map[string]bool{
		"3.51.3": true,
		"3.51.4": true,
		"3.52.0": true,
		"4.0.0":  true,
		"3.51.2": false,
		"3.9.0":  false,
		"3.45.1": false,
	} {
		got, err := atLeast(version, minSQLite)
		if err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Errorf("atLeast(%q) = %v, want %v", version, got, want)
		}
	}
	if _, err := atLeast("not a version", minSQLite); err == nil {
		t.Error("atLeast accepted a version it could not parse")
	}
}

func TestBundledSQLiteVersion(t *testing.T) {
	v, err := SQLiteVersion()
	if err != nil {
		t.Fatal(err)
	}
	ok, err := atLeast(v, minSQLite)
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatalf("bundled SQLite is %s, need %d.%d.%d or later", v, minSQLite[0], minSQLite[1], minSQLite[2])
	}
	t.Logf("bundled SQLite %s", v)
}

func TestOpenUsesWALAndClosesClean(t *testing.T) {
	// A nested directory that does not exist yet, with characters a careless DSN would misread.
	dir := filepath.Join(t.TempDir(), "a?b %41", "data")
	db, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	var mode string
	if err := db.QueryRow("pragma journal_mode").Scan(&mode); err != nil {
		t.Fatal(err)
	}
	if mode != "wal" {
		t.Errorf("journal_mode = %q, want wal", mode)
	}
	// 2 is FULL. Anything lower can lose a commit the server already acked.
	var sync int
	if err := db.QueryRow("pragma synchronous").Scan(&sync); err != nil {
		t.Fatal(err)
	}
	if sync != 2 {
		t.Errorf("synchronous = %d, want 2 (FULL)", sync)
	}
	// A write is what creates the -wal file, so make one before closing.
	if _, err := db.Exec("create table t (x); insert into t values (1)"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "heirloom.db-wal")); err != nil {
		t.Errorf("no -wal file while open, so the close check below proves nothing: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	names, err := filepath.Glob(filepath.Join(dir, "*"))
	if err != nil {
		t.Fatal(err)
	}
	if len(names) != 1 || filepath.Base(names[0]) != "heirloom.db" {
		t.Errorf("after Close the data directory holds %v, want only heirloom.db", names)
	}
}

func TestSchemaIsMadeOnceAndANewerOneIsRefused(t *testing.T) {
	dir := t.TempDir()
	db, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	var version, tables int
	if err := db.QueryRow("pragma user_version").Scan(&version); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow("select count(*) from sqlite_schema where type = 'table' and name in ('account', 'invitation', 'token', 'cell', 'room', 'member', 'cheer', 'push_key', 'push_subscription', 'resets')").Scan(&tables); err != nil {
		t.Fatal(err)
	}
	if version != len(migrations) || tables != 10 {
		t.Errorf("schema version %d with %d of our tables, want %d and 10", version, tables, len(migrations))
	}
	// Opening again, as every restart and every "heirloomd -invite" does, must keep what is there.
	if _, err := db.Exec("insert into account (public_id, username, password, created) values ('a', 'ravi', '', 0)"); err != nil {
		t.Fatal(err)
	}
	second, err := Open(dir)
	if err != nil {
		t.Fatalf("opening a database that is already open and already migrated: %v", err)
	}
	var accounts int
	if err := second.QueryRow("select count(*) from account").Scan(&accounts); err != nil || accounts != 1 {
		t.Errorf("after opening again: %d accounts, %v; want the one that was there", accounts, err)
	}
	second.Close()

	// A database written by a newer build is not ours to touch.
	if _, err := db.Exec("pragma user_version = 99"); err != nil {
		t.Fatal(err)
	}
	db.Close()
	if newer, err := Open(dir); err == nil {
		newer.Close()
		t.Error("opened a database from a newer build without complaint")
	}
}

// A server from before roles: two accounts, an unused invite code. After the migration
// the older account owns it, the other is a member, and nothing else of theirs moved.
func TestServerFromBeforeRolesGetsItsOwner(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "heirloom.db")
	old, err := open(dsn(path))
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range migrations[:3] {
		if _, err := old.Exec(m); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := old.Exec(`pragma user_version = 3;
		insert into account (id, public_id, username, password, created, utc_offset_min) values (7, 'a-ravi', 'ravi', 'hash-1', 100, 330), (9, 'a-sachi', 'sachi', 'hash-2', 200, 0);
		insert into invite (hash, created) values (x'00', 150);
		insert into token (account, device, hash, created) values (9, 'a1b2c3d4e5f60718', x'01', 200);
		insert into cell (account, dataset, row_id, field, stamp, value, seq) values (7, 'task', 't1', 'title', 's', x'31', 1)`); err != nil {
		t.Fatal(err)
	}
	old.Close()

	db, err := Open(dir)
	if err != nil {
		t.Fatalf("a version 3 database does not open: %v", err)
	}
	defer db.Close()
	var roles string
	if err := db.QueryRow("select group_concat(username || ' ' || role, ', ') from (select * from account order by id)").Scan(&roles); err != nil || roles != "ravi owner, sachi member" {
		t.Errorf("roles after the migration: %q, %v; want the older account the owner", roles, err)
	}
	var kept, version, oldInvites int
	if err := db.QueryRow(`select (select count(*) from cell) + (select count(*) from token) + (select count(*) from account where password like 'hash-%' and (utc_offset_min = 330 or id = 9)),
		(select count(*) from sqlite_schema where name = 'invite')`).Scan(&kept, &oldInvites); err != nil || kept != 4 || oldInvites != 0 {
		t.Errorf("after the migration %d of the 4 old rows are as they were and %d old invite tables remain, %v", kept, oldInvites, err)
	}
	if err := db.QueryRow("pragma user_version").Scan(&version); err != nil || version != len(migrations) {
		t.Errorf("version %d, want %d", version, len(migrations))
	}

	// The schema itself holds two of the rules: one owner, and the owner stays.
	if _, err := db.Exec("update account set role = 'owner' where username = 'sachi'"); err == nil {
		t.Error("a second owner was stored")
	}
	for _, change := range []string{"update account set role = 'member' where username = 'ravi'", "update account set role = 'admin'"} {
		if _, err := db.Exec(change); err == nil {
			t.Errorf("%q changed the owner's role", change)
		}
	}
	if _, err := db.Exec("update account set role = 'boss' where username = 'sachi'"); err == nil {
		t.Error("a role that is not one of the three was stored")
	}
	if _, err := db.Exec("update account set role = 'admin' where username = 'sachi'"); err != nil {
		t.Errorf("a member could not be made an admin: %v", err)
	}
	// An account made without naming a role is a member, as other tests' inserts rely on.
	if _, err := db.Exec("insert into account (public_id, username, password, created) values ('a-mali', 'mali', '', 300)"); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow("select role from account where username = 'mali'").Scan(&roles); err != nil || roles != "member" {
		t.Errorf("an account inserted without a role is %q, %v", roles, err)
	}
}

// A server with no account yet migrates too, and its first account can be the owner.
func TestEmptyServerHasNoOwnerYet(t *testing.T) {
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec("insert into account (public_id, username, password, created, role) values ('a', 'ravi', '', 0, 'owner')"); err != nil {
		t.Errorf("the first account could not be stored as the owner: %v", err)
	}
}

// Rooms from before keepers: each is kept by the member who has been in it longest,
// whoever that is now, and a room is never kept by somebody outside it.
func TestRoomsFromBeforeKeepersAreKeptByTheirLongestMember(t *testing.T) {
	dir := t.TempDir()
	old, err := open(dsn(filepath.Join(dir, "heirloom.db")))
	if err != nil {
		t.Fatal(err)
	}
	before := slices.IndexFunc(migrations, func(m string) bool { return strings.Contains(m, "add column keeper") })
	for _, m := range migrations[:before] {
		if _, err := old.Exec(m); err != nil {
			t.Fatal(err)
		}
	}
	// Room 1 was made by ravi, who left: sachi has been in it longest now. Room 2 is mali's.
	if _, err := old.Exec(fmt.Sprintf(`pragma user_version = %d;
		insert into account (id, public_id, username, password, created) values (1, 'a-ravi', 'ravi', '', 0), (2, 'a-sachi', 'sachi', '', 0), (3, 'a-nimal', 'nimal', '', 0), (4, 'a-mali', 'mali', '', 0);
		insert into room (id, public_id, name, code) values (1, 'r-1', 'One', 'AAAAAAAA'), (2, 'r-2', 'Two', 'BBBBBBBB');
		insert into member (id, room, account) values (5, 1, 3), (3, 1, 2), (4, 2, 4), (9, 2, 2)`, before)); err != nil {
		t.Fatal(err)
	}
	old.Close()

	db, err := Open(dir)
	if err != nil {
		t.Fatalf("a version %d database does not open: %v", before, err)
	}
	defer db.Close()
	var keepers string
	if err := db.QueryRow("select group_concat(name || ' ' || keeper, ', ') from (select * from room order by id)").Scan(&keepers); err != nil || keepers != "One 2, Two 4" {
		t.Errorf("keepers after the migration: %q, %v; want sachi for One and mali for Two", keepers, err)
	}
	// And the second pass of rooms: the rooms and members already here start from the day
	// of the migration, not from 1970, so no streak reaches back before it.
	var oldest int64
	if err := db.QueryRow("select min(x) from (select created as x from room union all select joined from member)").Scan(&oldest); err != nil || oldest < time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC).UnixMilli() {
		t.Errorf("the oldest room or member starts at %d, %v; want the day of the migration", oldest, err)
	}
}
