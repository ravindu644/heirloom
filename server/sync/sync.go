// Package sync is the only place the server compares or stores a cell. The rule is
// contracts/protocol.md section 3: for each field keep the cell with the highest stamp.
package sync

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
	"unicode/utf8"
)

// The limits of protocol.md section 4, and the drift rule of section 2.
const (
	MaxCells  = 500             // cells in one push, and in one page
	maxCell   = 16 << 10        // bytes of one cell as JSON
	maxPage   = 1 << 20         // bytes of values in one page, so a page of large cells stays small in memory
	maxAhead  = 5 * time.Minute // how far past server time a stamp may be
	stampTime = "2006-01-02T15:04:05.000Z"
	stampLen  = len(stampTime) + len("-0000-a1b2c3d4e5f60718")
)

// Cell is one field of one row. Value is kept as the bytes the device sent: the server
// never reads it here, and a newer build's data must come out as it went in.
type Cell struct {
	Stamp   string          `json:"stamp"`
	Dataset string          `json:"dataset"`
	Row     string          `json:"row"`
	Field   string          `json:"field"`
	Value   json.RawMessage `json:"value"`
}

// Refused is why a whole push was turned away: "invalid" or "clock". Nothing was stored.
type Refused struct{ Reason string }

func (r *Refused) Error() string { return "push refused: " + r.Reason }

// Pushed is what a stored batch did to the account's sequence. The numbers after From up
// to Cursor belong to this batch and nothing else. Won holds the cells that got them.
type Pushed struct {
	From, Cursor int64
	Won          []Cell
}

// Page is the cells after a cursor, oldest first. To is the last one's number, or the
// cursor itself when there was nothing newer.
type Page struct {
	To    int64
	Cells []Cell
}

// Store's calls take no context on purpose. Each is a few milliseconds of SQLite, and
// cancelling one makes the driver drop the connection as interrupted: the checkpoint at
// close is then skipped and a -wal file is left behind. Callers stop between calls instead.
type Store struct {
	db  *sql.DB
	now func() time.Time
}

func New(db *sql.DB, now func() time.Time) *Store { return &Store{db, now} }

// Acceptable is the drift rule: a stamp may be at most five minutes past server time.
// A stamp that is not shaped like one is not acceptable either.
func Acceptable(stamp string, serverTime time.Time) bool {
	t, ok := stampAt(stamp)
	return ok && t.UnixMilli() <= serverTime.UnixMilli()+maxAhead.Milliseconds()
}

// stampAt checks the exact shape, because stamps are compared as plain strings and one
// loose stamp (a one digit hour, an upper case hex digit) would sort wrongly against the rest forever.
func stampAt(stamp string) (time.Time, bool) {
	if len(stamp) != stampLen {
		return time.Time{}, false
	}
	at, counter, device := stamp[:24], stamp[25:29], stamp[30:]
	t, err := time.Parse(stampTime, at)
	if err != nil || t.Format(stampTime) != at || stamp[24] != '-' || stamp[29] != '-' || !lowerHex(counter) || !lowerHex(device) {
		return time.Time{}, false
	}
	return t, true
}

func lowerHex(s string) bool {
	for _, c := range []byte(s) {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return false
		}
	}
	return true
}

// name is a dataset, row or field: 1 to 64 of A-Z a-z 0-9 _ -
func name(s string) bool {
	if len(s) < 1 || len(s) > 64 {
		return false
	}
	for _, c := range []byte(s) {
		if (c < '0' || c > '9') && (c < 'a' || c > 'z') && (c < 'A' || c > 'Z') && c != '_' && c != '-' {
			return false
		}
	}
	return true
}

// check reads a push. One bad cell refuses the batch: a device must never be left
// guessing which half of its outbox arrived.
func (s *Store) check(raw []json.RawMessage) ([]Cell, error) {
	if len(raw) > MaxCells {
		return nil, &Refused{"invalid"}
	}
	cells := make([]Cell, len(raw))
	for i, r := range raw {
		// Not UTF-8: a browser closes a socket that sends it such a frame, so one stored cell
		// like that would lock the account's other devices out of their own catch-up.
		if len(r) > maxCell || !utf8.Valid(r) {
			return nil, &Refused{"invalid"}
		}
		// A key we do not know would be dropped without a word. Refusing is louder, and the
		// cell stays in the device's outbox.
		dec := json.NewDecoder(bytes.NewReader(r))
		dec.DisallowUnknownFields()
		c := &cells[i]
		if err := dec.Decode(c); err != nil || c.Value == nil || !name(c.Dataset) || !name(c.Row) || !name(c.Field) {
			return nil, &Refused{"invalid"}
		}
		if _, ok := stampAt(c.Stamp); !ok {
			return nil, &Refused{"invalid"}
		}
	}
	// Only once every cell is well formed: a clock nack makes the device restamp, which
	// would not help a batch that is broken anyway.
	now := s.now()
	for _, c := range cells {
		if !Acceptable(c.Stamp, now) {
			return nil, &Refused{"clock"}
		}
	}
	return cells, nil
}

// The comparison lives in this statement. Equal stamps are the same cell, so only a
// strictly higher stamp replaces the stored one; then exactly one row changes.
const keepNewest = `
insert into cell (account, dataset, row_id, field, stamp, value, seq) values (?, ?, ?, ?, ?, ?, ?)
on conflict (account, dataset, row_id, field) do update
	set stamp = excluded.stamp, value = excluded.value, seq = excluded.seq
	where excluded.stamp > cell.stamp`

// Push stores a batch in one transaction: all of it or none. It returns a *Refused when a
// cell breaks a limit or the drift rule. The caller acks only after this returns nil.
func (s *Store) Push(account int64, raw []json.RawMessage) (Pushed, error) {
	cells, err := s.check(raw)
	if err != nil {
		return Pushed{}, err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return Pushed{}, fmt.Errorf("begin push: %w", err)
	}
	defer tx.Rollback()
	head, err := headOf(tx, account)
	if err != nil {
		return Pushed{}, err
	}
	p := Pushed{From: head, Cursor: head}
	keep, err := tx.Prepare(keepNewest)
	if err != nil {
		return Pushed{}, fmt.Errorf("prepare push: %w", err)
	}
	defer keep.Close()
	for _, c := range cells {
		res, err := keep.Exec(account, c.Dataset, c.Row, c.Field, c.Stamp, []byte(c.Value), p.Cursor+1)
		if err != nil {
			return Pushed{}, fmt.Errorf("store cell: %w", err)
		}
		// A cell that lost changes no row, takes no number and is not sent on.
		if n, _ := res.RowsAffected(); n == 1 {
			p.Cursor++
			p.Won = append(p.Won, c)
		}
	}
	if err := tx.Commit(); err != nil {
		return Pushed{}, fmt.Errorf("commit push: %w", err)
	}
	return p, nil
}

// Pull reads one page after the cursor. Callers send it and ask again, so an account's
// cells are never all in memory at once.
func (s *Store) Pull(account, after int64) (Page, error) {
	rows, err := s.db.Query(
		`select seq, dataset, row_id, field, stamp, value from cell
		where account = ? and seq > ? order by seq limit ?`, account, after, MaxCells)
	if err != nil {
		return Page{}, fmt.Errorf("pull: %w", err)
	}
	defer rows.Close()
	page := Page{To: after, Cells: []Cell{}} // not nil: the reply says "cells":[]
	for size := 0; size < maxPage && rows.Next(); {
		var c Cell
		var value []byte
		if err := rows.Scan(&page.To, &c.Dataset, &c.Row, &c.Field, &c.Stamp, &value); err != nil {
			return Page{}, fmt.Errorf("pull: %w", err)
		}
		c.Value = value
		page.Cells = append(page.Cells, c)
		size += len(value)
	}
	if err := rows.Err(); err != nil {
		return Page{}, fmt.Errorf("pull: %w", err)
	}
	return page, nil
}

// Head is the account's newest sequence number, 0 before its first cell.
func (s *Store) Head(account int64) (int64, error) {
	return headOf(s.db, account)
}

// The newest number is always still in the table: a cell is only ever replaced by one
// with a higher number. So the head needs no counter of its own.
func headOf(q interface {
	QueryRow(string, ...any) *sql.Row
}, account int64) (int64, error) {
	var head int64
	if err := q.QueryRow("select coalesce(max(seq), 0) from cell where account = ?", account).Scan(&head); err != nil {
		return 0, fmt.Errorf("read head: %w", err)
	}
	return head, nil
}
