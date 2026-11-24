package store

import (
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"time"
)

// KeepBackups is how many daily copies stay in <data>/backups. A week is long enough to
// notice that something went wrong, and seven copies of a small file fit on a phone.
const KeepBackups = 7

// Backups makes one copy of the database a day and keeps the last seven.
type Backups struct {
	dir   string
	tried string // the last day a copy was tried, whether or not it was made
}

// NewBackups copies the database in dir into dir/backups.
func NewBackups(dir string) *Backups { return &Backups{dir: dir} }

// Tick is called every few minutes with the time, which is how the server tells it the
// day. The first call of a UTC day that has no copy yet makes one, and returns its path.
// A day whose copy failed is not tried again: tomorrow's is, and a restart is.
//
// The day is UTC so that the copy is made while the people this server is for are asleep:
// midnight UTC is half past five in the morning in Colombo.
func (b *Backups) Tick(now time.Time) (made string, err error) {
	day := now.UTC().Format(time.DateOnly)
	if day == b.tried {
		return "", nil
	}
	b.tried = day
	dir, err := filepath.Abs(filepath.Join(b.dir, "backups"))
	if err != nil {
		return "", fmt.Errorf("resolve backup directory: %w", err)
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", fmt.Errorf("create backup directory: %w", err)
	}
	final := filepath.Join(dir, "heirloom-"+day+".db")
	if _, err := os.Stat(final); err == nil {
		return "", nil // made before a restart
	}
	// Written under another name first: a file called heirloom-<day>.db is always whole.
	part := final + ".part"
	if err := copyTo(filepath.Join(filepath.Dir(dir), "heirloom.db"), part); err != nil {
		os.Remove(part)
		return "", err
	}
	if err := os.Rename(part, final); err != nil {
		os.Remove(part)
		return "", fmt.Errorf("name backup: %w", err)
	}
	// Only now, with the new copy whole, checked and named, may an old one go.
	copies, err := filepath.Glob(filepath.Join(dir, "heirloom-*.db"))
	if err != nil {
		return final, fmt.Errorf("list backups: %w", err)
	}
	slices.Sort(copies) // the date in the name sorts as time does
	for _, old := range copies[:max(0, len(copies)-KeepBackups)] {
		if err := os.Remove(old); err != nil {
			return final, fmt.Errorf("remove old backup: %w", err)
		}
	}
	return final, nil
}

// copyTo writes a whole, checked copy of the live database to part.
func copyTo(live, part string) error {
	// A copy cut short by a restart would make VACUUM INTO refuse: it never overwrites.
	if err := os.Remove(part); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove unfinished backup: %w", err)
	}
	// Its own connection, not the server's one: a reader does not hold up the writer in
	// WAL mode, so pushes go on being stored while the copy is made.
	src, err := open(dsn(live))
	if err != nil {
		return fmt.Errorf("open database for backup: %w", err)
	}
	defer src.Close()
	// VACUUM INTO reads one consistent moment of the database and writes it out compact,
	// with nothing of the WAL left to go with it.
	if _, err := src.Exec("vacuum into ?", part); err != nil {
		return fmt.Errorf("copy database: %w", err)
	}
	// immutable: read the copy without making -wal and -shm files beside it.
	copied, err := sql.Open("sqlite", (&url.URL{Scheme: "file", Path: part, RawQuery: "mode=ro&immutable=1"}).String())
	if err != nil {
		return fmt.Errorf("open backup: %w", err)
	}
	defer copied.Close()
	var verdict string
	if err := copied.QueryRow("pragma integrity_check").Scan(&verdict); err != nil {
		return fmt.Errorf("check backup: %w", err)
	}
	if verdict != "ok" {
		return errors.New("check backup: the copy is damaged")
	}
	// On the disk before it gets its name, or a power cut could leave a named file of nothing.
	f, err := os.Open(part)
	if err != nil {
		return fmt.Errorf("sync backup: %w", err)
	}
	defer f.Close()
	if err := f.Sync(); err != nil {
		return fmt.Errorf("sync backup: %w", err)
	}
	return nil
}
