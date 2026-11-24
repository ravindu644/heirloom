package store

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

// A database with one account and n cells in it, shaped like real ones.
func filled(t *testing.T, n int) (dir string, db *sql.DB) {
	t.Helper()
	dir = t.TempDir()
	db, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	tx, err := db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec("insert into account (public_id, username, password, created) values ('a', 'ravi', '', 0)"); err != nil {
		t.Fatal(err)
	}
	add, err := tx.Prepare("insert into cell (account, dataset, row_id, field, stamp, value, seq) values (1, 'session', ?, ?, '2026-11-24T04:30:00.000Z-0000-a1b2c3d4e5f60718', ?, ?)")
	if err != nil {
		t.Fatal(err)
	}
	fields := []string{"kind", "task", "started", "ended", "planned_ms", "paused_ms", "outcome", "device", "note"}
	for i := range n {
		if _, err := add.Exec(fmt.Sprint("run-", i/len(fields)), fields[i%len(fields)], []byte(fmt.Sprint(1795494600000+i)), i+1); err != nil {
			t.Fatal(err)
		}
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	return dir, db
}

func copies(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(filepath.Join(dir, "backups"))
	if err != nil && !os.IsNotExist(err) {
		t.Fatal(err)
	}
	var names []string
	for _, e := range entries {
		names = append(names, e.Name())
	}
	return names
}

var night = time.Date(2026, 11, 25, 0, 5, 0, 0, time.UTC)

func TestBackupIsMadeOnceADay(t *testing.T) {
	dir, _ := filled(t, 90)
	b := NewBackups(dir)
	made, err := b.Tick(night)
	if err != nil || filepath.Base(made) != "heirloom-2026-11-25.db" {
		t.Fatalf("the first tick of the day made %q, %v", made, err)
	}
	// Every ten minutes all day the server asks again. One copy.
	for minutes := 10; minutes < 24*60-5; minutes += 10 {
		if again, err := b.Tick(night.Add(time.Duration(minutes) * time.Minute)); again != "" || err != nil {
			t.Fatalf("%d minutes later another copy was made: %q, %v", minutes, again, err)
		}
	}
	// The copy stands alone: nothing unfinished, and no -wal or -shm beside it.
	if got := copies(t, dir); !slices.Equal(got, []string{"heirloom-2026-11-25.db"}) {
		t.Errorf("backups holds %v, want the one copy and nothing else", got)
	}
	if next, err := b.Tick(night.Add(24 * time.Hour)); err != nil || filepath.Base(next) != "heirloom-2026-11-26.db" {
		t.Errorf("the next day made %q, %v", next, err)
	}
	// A restart on a day that has its copy does not make another.
	if again, err := NewBackups(dir).Tick(night.Add(25 * time.Hour)); again != "" || err != nil {
		t.Errorf("after a restart the day's copy was made again: %q, %v", again, err)
	}
	if info, err := os.Stat(filepath.Join(dir, "backups")); err != nil || info.Mode().Perm() != 0o700 {
		t.Errorf("the backup directory is %v, want it closed to everyone else", info.Mode().Perm())
	}
}

func TestSevenBackupsAreKept(t *testing.T) {
	dir, _ := filled(t, 90)
	b := NewBackups(dir)
	for day := range 10 {
		if _, err := b.Tick(night.AddDate(0, 0, day)); err != nil {
			t.Fatal(err)
		}
		if got := len(copies(t, dir)); got != min(day+1, KeepBackups) {
			t.Fatalf("after day %d there are %d copies", day+1, got)
		}
	}
	want := []string{"heirloom-2026-11-28.db", "heirloom-2026-11-29.db", "heirloom-2026-11-30.db", "heirloom-2026-12-01.db",
		"heirloom-2026-12-02.db", "heirloom-2026-12-03.db", "heirloom-2026-12-04.db"}
	if got := copies(t, dir); !slices.Equal(got, want) {
		t.Errorf("kept %v, want the newest seven", got)
	}
}

// A day whose backup fails takes nothing with it: not the server, not an older copy.
func TestAFailedDayIsTriedAgainTomorrow(t *testing.T) {
	dir, db := filled(t, 90)
	b := NewBackups(dir)
	for day := range KeepBackups {
		if _, err := b.Tick(night.AddDate(0, 0, day)); err != nil {
			t.Fatal(err)
		}
	}
	before := copies(t, dir)

	// Something is in the way of the eighth day's copy and cannot be cleared.
	eighth := night.AddDate(0, 0, KeepBackups)
	stuck := filepath.Join(dir, "backups", "heirloom-"+eighth.Format(time.DateOnly)+".db.part")
	if err := os.MkdirAll(filepath.Join(stuck, "x"), 0o700); err != nil {
		t.Fatal(err)
	}
	made, err := b.Tick(eighth)
	if err == nil || made != "" {
		t.Fatalf("the copy was made with its path blocked: %q", made)
	}
	if strings.Contains(err.Error(), "ravi") || strings.Contains(err.Error(), "1795494600000") {
		t.Errorf("the error, which is logged, holds data: %v", err)
	}
	if got := slices.DeleteFunc(copies(t, dir), func(name string) bool { return strings.HasSuffix(name, ".part") }); !slices.Equal(got, before) {
		t.Errorf("a failed day removed a good copy: %v, was %v", got, before)
	}
	// Not hammered every ten minutes for the rest of the day.
	if again, err := b.Tick(eighth.Add(10 * time.Minute)); again != "" || err != nil {
		t.Errorf("the failed day was tried again: %q, %v", again, err)
	}
	// The server's database never noticed.
	if _, err := db.Exec("insert into cell (account, dataset, row_id, field, stamp, value, seq) values (1, 'task', 't1', 'title', 's', x'31', 100000)"); err != nil {
		t.Errorf("after a failed backup the database refuses a write: %v", err)
	}
	// Tomorrow, with the path clear, there is a copy again, and only then does the oldest go.
	if err := os.RemoveAll(stuck); err != nil {
		t.Fatal(err)
	}
	if made, err := b.Tick(eighth.Add(24 * time.Hour)); err != nil || made == "" {
		t.Fatalf("the day after a failure: %q, %v", made, err)
	}
	if got := copies(t, dir); len(got) != KeepBackups || got[0] != before[1] {
		t.Errorf("after the next good day: %v", got)
	}
}

// A copy cut short by a power cut is not a backup and is not in the way of the next one.
func TestUnfinishedCopyIsReplaced(t *testing.T) {
	dir, _ := filled(t, 90)
	part := filepath.Join(dir, "backups", "heirloom-2026-11-25.db.part")
	if err := os.MkdirAll(filepath.Dir(part), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(part, []byte("half a database"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := NewBackups(dir).Tick(night); err != nil {
		t.Fatal(err)
	}
	if got := copies(t, dir); !slices.Equal(got, []string{"heirloom-2026-11-25.db"}) {
		t.Errorf("backups holds %v", got)
	}
}

// Restoring is copying a backup back as heirloom.db. What opens is the database as it
// was at the moment of the copy: every cell it had, and none written after.
func TestRestoredCopyOpensWithItsCells(t *testing.T) {
	dir, db := filled(t, 900)
	made, err := NewBackups(dir).Tick(night)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec("insert into cell (account, dataset, row_id, field, stamp, value, seq) values (1, 'task', 'later', 'title', 's', cast('after the copy' as blob), 901)"); err != nil {
		t.Fatal(err)
	}

	restored := t.TempDir()
	data, err := os.ReadFile(made)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(restored, "heirloom.db"), data, 0o600); err != nil {
		t.Fatal(err)
	}
	back, err := Open(restored)
	if err != nil {
		t.Fatalf("the restored copy does not open: %v", err)
	}
	defer back.Close()
	var cells, head, accounts, later int
	var mode, value string
	if err := back.QueryRow("select count(*), max(seq), (select count(*) from account), (select count(*) from cell where row_id = 'later') from cell").Scan(&cells, &head, &accounts, &later); err != nil {
		t.Fatal(err)
	}
	if cells != 900 || head != 900 || accounts != 1 || later != 0 {
		t.Errorf("restored: %d cells to number %d, %d accounts, %d written after the copy; want 900, 900, 1, 0", cells, head, accounts, later)
	}
	if err := back.QueryRow("select value from cell where row_id = 'run-7' and field = 'kind'").Scan(&value); err != nil || value != "1795494600063" {
		t.Errorf("a restored cell reads %q, %v", value, err)
	}
	// And it is a working database again: WAL, the current schema, writable.
	if err := back.QueryRow("pragma journal_mode").Scan(&mode); err != nil || mode != "wal" {
		t.Errorf("restored journal mode = %q, %v", mode, err)
	}
	if _, err := back.Exec("insert into cell (account, dataset, row_id, field, stamp, value, seq) values (1, 'task', 't1', 'title', 's', x'31', 901)"); err != nil {
		t.Errorf("the restored database refuses a write: %v", err)
	}
}

// The copy is made on its own connection, so the server's writer is not held up for the
// length of it. Three years of ten laps a day is the size the rooms' cost test uses.
func TestBackupDoesNotHoldUpTheWriter(t *testing.T) {
	dir, db := filled(t, 98550)
	write := func(i int) time.Duration {
		start := time.Now()
		if _, err := db.Exec("insert into cell (account, dataset, row_id, field, stamp, value, seq) values (1, 'task', ?, 'title', 's', x'31', ?)", fmt.Sprint("t", i), 200000+i); err != nil {
			t.Fatal(err)
		}
		return time.Since(start)
	}
	var quiet time.Duration
	for i := range 50 {
		quiet = max(quiet, write(i))
	}

	done := make(chan time.Duration)
	go func() {
		start := time.Now()
		if _, err := NewBackups(dir).Tick(night); err != nil {
			t.Error(err)
		}
		done <- time.Since(start)
	}()
	var during, slowest time.Duration
	writes := 0
	for i := 50; during == 0; i++ {
		select {
		case during = <-done:
		default:
			slowest = max(slowest, write(i))
			writes++
		}
	}
	info, err := os.Stat(filepath.Join(dir, "backups", "heirloom-2026-11-25.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("a backup of %d cells (%d KB) took %v; %d commits were made meanwhile, the slowest %v (%v with no backup running)",
		98550, info.Size()>>10, during, writes, slowest, quiet)
	if writes < 3 {
		t.Errorf("only %d writes got through while the backup ran for %v: it held the writer up", writes, during)
	}
	if slowest > during/2 && slowest > 100*time.Millisecond {
		t.Errorf("one write waited %v of a %v backup", slowest, during)
	}
}
