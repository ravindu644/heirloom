package store

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
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
	if err := db.QueryRow("select count(*) from sqlite_schema where type = 'table' and name in ('account', 'invite', 'token', 'cell', 'room', 'member', 'cheer', 'push_key', 'push_subscription')").Scan(&tables); err != nil {
		t.Fatal(err)
	}
	if version != len(migrations) || tables != 9 {
		t.Errorf("schema version %d with %d of our tables, want %d and 9", version, tables, len(migrations))
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
