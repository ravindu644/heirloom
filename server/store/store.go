// Package store owns the SQLite file. Nothing else in the server opens a database.
package store

import (
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite" // pure Go, so CGO_ENABLED=0 still links
)

// Open creates dir if it is missing and opens dir/heirloom.db in WAL mode.
func Open(dir string) (*sql.DB, error) {
	// 0700: the database holds everyone's data and the container is shared.
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, fmt.Errorf("create data directory: %w", err)
	}
	path, err := filepath.Abs(filepath.Join(dir, "heirloom.db"))
	if err != nil {
		return nil, fmt.Errorf("resolve data directory: %w", err)
	}
	// Built as a URL so a "?" or "%" in the path cannot be read as an option.
	dsn := url.URL{Scheme: "file", Path: path, RawQuery: url.Values{"_pragma": {
		"journal_mode(WAL)",
		// FULL fsyncs the WAL on every commit. With NORMAL a power cut can roll back a commit
		// we already acked, and the device has dropped that cell from its outbox by then.
		"synchronous(FULL)",
		"busy_timeout(5000)",
		"foreign_keys(1)",
	}}.Encode()}
	db, err := open(dsn.String())
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	return db, nil
}

// SQLiteVersion is the version of the SQLite compiled into this binary. It asks an in-memory
// database, so "heirloomd -version" never creates a file.
func SQLiteVersion() (string, error) {
	db, err := open(":memory:")
	if err != nil {
		return "", fmt.Errorf("open in-memory database: %w", err)
	}
	defer db.Close()
	var v string
	if err := db.QueryRow("select sqlite_version()").Scan(&v); err != nil {
		return "", fmt.Errorf("select sqlite_version(): %w", err)
	}
	return v, nil
}

func open(dsn string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// ponytail: one connection is the single writer, and readers queue behind it.
	// Add a read-only pool if reads ever wait on writes.
	db.SetMaxOpenConns(1)
	// sql.Open is lazy. Ping so a bad path fails at startup, not on the first request.
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}
