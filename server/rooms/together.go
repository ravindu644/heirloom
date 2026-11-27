package rooms

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"slices"
	"strings"
	"unicode/utf16"

	"heirloom/server/auth"
)

// Rooms, the second pass (protocol section 15): calling a lap together, notes, taking a
// member out, and pictures.

const (
	callLasts    = 60 * 1000 // a call stands one minute past its start, then it is over
	callSoonest  = 60 * 1000
	callLatest   = 30 * 60 * 1000
	maxCalls     = 6  // an account's calls in a day, taken back or not
	maxNotes     = 30 // an account's notes in one room in a day
	maxNote      = 200
	keepNotes    = 7 * dayMs
	maxPicture   = 12000
	maxPictures  = 20                 // changes of an account's picture in a day: each one is sent to every room it is in
	noteBreakers = "\r\n\v\f\u0085  " // whatever a screen would start a new line at
)

var (
	ErrCall     = &auth.Error{Status: 404, Code: "call"}
	ErrCallOpen = &auth.Error{Status: 409, Code: "call"}
	ErrPicture  = &auth.Error{Status: 404, Code: "picture"}
)

// slowDown is 429 until the oldest of the day's count is a day old.
func slowDown(oldest, now int64) error {
	wait := oldest + dayMs - now
	return &auth.Error{Status: 429, Code: "slow_down", RetryAfter: int(max(1, (wait+999)/1000))}
}

// Note is one line from a member. From is null once its writer has left the room.
type Note struct {
	ID   string  `json:"id"`
	From *string `json:"from"`
	At   int64   `json:"at"`
	Text string  `json:"text"`
}

// Note adds a line to the room. Its text is never logged, here or by the caller.
func (s *Service) Note(account int64, public, text string) (id string, room int64, err error) {
	tx, err := s.db.Begin()
	if err != nil {
		return "", 0, fmt.Errorf("begin note: %w", err)
	}
	defer tx.Rollback()
	if room, err = find(tx, account, public); err != nil {
		return "", 0, err
	}
	if n := len(utf16.Encode([]rune(text))); strings.TrimSpace(text) == "" || n > maxNote || strings.ContainsAny(text, noteBreakers) {
		return "", 0, auth.ErrBadRequest
	}
	now := s.now().UnixMilli()
	// The seven days are kept here, where notes are made, as cheers are where cheers are.
	// A room nobody writes in shows none of its old notes anyway: every read asks for a week.
	if _, err := tx.Exec("delete from note where at <= ?", now-keepNotes); err != nil {
		return "", 0, fmt.Errorf("drop old notes: %w", err)
	}
	var written int
	var oldest sql.NullInt64
	if err := tx.QueryRow("select count(*), min(at) from note where room = ? and account = ? and at > ?", room, account, now-dayMs).Scan(&written, &oldest); err != nil {
		return "", 0, fmt.Errorf("count notes: %w", err)
	}
	if written >= maxNotes {
		return "", 0, slowDown(oldest.Int64, now)
	}
	id = rand.Text()
	if _, err := tx.Exec("insert into note (public_id, room, account, at, text) values (?, ?, ?, ?, ?)", id, room, account, now, text); err != nil {
		return "", 0, fmt.Errorf("store note: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return "", 0, fmt.Errorf("commit note: %w", err)
	}
	return id, room, nil
}

// Notes are the room's last seven days of them, newest first.
func (s *Service) Notes(account int64, public string) ([]Note, error) {
	room, err := find(s.db, account, public)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.Query(`select n.public_id, a.public_id, n.at, n.text from note n left join account a on a.id = n.account
		where n.room = ? and n.at > ? order by n.at desc, n.id desc`, room, s.now().UnixMilli()-keepNotes)
	if err != nil {
		return nil, fmt.Errorf("read notes: %w", err)
	}
	defer rows.Close()
	notes := []Note{} // not nil: the reply says "notes":[]
	for rows.Next() {
		var n Note
		if err := rows.Scan(&n.ID, &n.From, &n.At, &n.Text); err != nil {
			return nil, fmt.Errorf("read notes: %w", err)
		}
		notes = append(notes, n)
	}
	return notes, rows.Err()
}

// Read marks the room's notes up to at as read on every device of the account. It only
// moves forward, and never past now: a device with a fast clock cannot read tomorrow's
// notes today. It returns the room when the mark moved, so its devices are told at once.
func (s *Service) Read(account int64, public string, at int64) (room int64, err error) {
	if at < 0 {
		return 0, auth.ErrBadRequest
	}
	if room, err = find(s.db, account, public); err != nil {
		return 0, err
	}
	at = min(at, s.now().UnixMilli())
	res, err := s.db.Exec("update member set notes_read = ? where room = ? and account = ? and notes_read < ?", at, room, account, at)
	if err != nil {
		return 0, fmt.Errorf("mark notes read: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return 0, nil
	}
	return room, nil
}

// openCall is the room's call that still stands, if any.
func openCall(q interface {
	QueryRow(string, ...any) *sql.Row
}, room, now int64) (id int64, public string, by, at int64, err error) {
	err = q.QueryRow("select id, public_id, account, at from call where room = ? and ended is null and at + ? > ?", room, callLasts, now).Scan(&id, &public, &by, &at)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, "", 0, 0, ErrCall
	}
	if err != nil {
		return 0, "", 0, 0, fmt.Errorf("read call: %w", err)
	}
	return id, public, by, at, nil
}

// call is the room's open call as a message shows it, or nil.
func (s *Service) call(room, now int64) (*Call, error) {
	id, public, by, at, err := openCall(s.db, room, now)
	if errors.Is(err, ErrCall) {
		return nil, nil
	} else if err != nil {
		return nil, err
	}
	c := &Call{ID: public, At: at, In: []string{}}
	if err := s.db.QueryRow("select public_id from account where id = ?", by).Scan(&c.By); err != nil {
		return nil, fmt.Errorf("read caller: %w", err)
	}
	rows, err := s.db.Query("select a.public_id from call_in i join account a on a.id = i.account where i.call = ? order by i.id", id)
	if err != nil {
		return nil, fmt.Errorf("read who is in: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var who string
		if err := rows.Scan(&who); err != nil {
			return nil, fmt.Errorf("read who is in: %w", err)
		}
		c.In = append(c.In, who)
	}
	return c, rows.Err()
}

// Call calls a lap for a whole minute 1 to 30 minutes ahead, with the caller in. at nil
// takes the caller's own open call back, and the id is then "".
func (s *Service) Call(account int64, public string, at *int64) (id string, room int64, err error) {
	tx, err := s.db.Begin()
	if err != nil {
		return "", 0, fmt.Errorf("begin call: %w", err)
	}
	defer tx.Rollback()
	if room, err = find(tx, account, public); err != nil {
		return "", 0, err
	}
	now := s.now().UnixMilli()
	if at == nil {
		res, err := tx.Exec("update call set ended = ? where room = ? and account = ? and ended is null and at + ? > ?", now, room, account, callLasts, now)
		if err != nil {
			return "", 0, fmt.Errorf("take call back: %w", err)
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return "", 0, ErrCall
		}
		return "", room, commit(tx, "take call back")
	}
	if *at%60000 != 0 || *at < now+callSoonest || *at > now+callLatest {
		return "", 0, auth.ErrBadRequest
	}
	if _, _, _, _, err := openCall(tx, room, now); err == nil {
		return "", 0, ErrCallOpen
	} else if !errors.Is(err, ErrCall) {
		return "", 0, err
	}
	// The day's calls, and the rows of the ones older than that go: nothing reads them.
	if _, err := tx.Exec("delete from call where made <= ?", now-dayMs); err != nil {
		return "", 0, fmt.Errorf("drop old calls: %w", err)
	}
	var made int
	var oldest sql.NullInt64
	if err := tx.QueryRow("select count(*), min(made) from call where account = ?", account).Scan(&made, &oldest); err != nil {
		return "", 0, fmt.Errorf("count calls: %w", err)
	}
	if made >= maxCalls {
		return "", 0, slowDown(oldest.Int64, now)
	}
	id = rand.Text()
	res, err := tx.Exec("insert into call (public_id, room, account, at, made) values (?, ?, ?, ?, ?)", id, room, account, *at, now)
	if err != nil {
		return "", 0, fmt.Errorf("store call: %w", err)
	}
	call, _ := res.LastInsertId()
	if _, err := tx.Exec("insert into call_in (call, account) values (?, ?)", call, account); err != nil {
		return "", 0, fmt.Errorf("store caller: %w", err)
	}
	return id, room, commit(tx, "call")
}

// In says the account is in the call, or takes it back, until the call starts. Saying it
// twice is the same answer. The caller is in by calling, and out only by taking it back.
func (s *Service) In(account int64, public, call string, in bool) (room int64, err error) {
	tx, err := s.db.Begin()
	if err != nil {
		return 0, fmt.Errorf("begin in: %w", err)
	}
	defer tx.Rollback()
	if room, err = find(tx, account, public); err != nil {
		return 0, err
	}
	now := s.now().UnixMilli()
	// Asked inside the transaction, so a call that starts or ends meanwhile is never joined.
	id, open, by, at, err := openCall(tx, room, now)
	if err != nil {
		return 0, err
	}
	if open != call || now >= at {
		return 0, ErrCall
	}
	if by == account {
		return 0, auth.ErrBadRequest
	}
	if in {
		_, err = tx.Exec("insert into call_in (call, account) values (?, ?) on conflict do nothing", id, account)
	} else {
		_, err = tx.Exec("delete from call_in where call = ? and account = ?", id, account)
	}
	if err != nil {
		return 0, fmt.Errorf("store in: %w", err)
	}
	return room, commit(tx, "in")
}

// Remove takes a member out of the room, for its keeper only, and gives the room a new
// code in the same transaction: the one the member had stops working with them. It
// returns the account taken out, 0 when they had already gone.
func (s *Service) Remove(account int64, public, member string) (room, removed int64, err error) {
	tx, err := s.db.Begin()
	if err != nil {
		return 0, 0, fmt.Errorf("begin remove: %w", err)
	}
	defer tx.Rollback()
	if room, err = find(tx, account, public); err != nil {
		return 0, 0, err
	}
	if err := keeps(tx, room, account); err != nil {
		return 0, 0, err
	}
	err = tx.QueryRow("select a.id from member m join account a on a.id = m.account where m.room = ? and a.public_id = ?", room, member).Scan(&removed)
	if errors.Is(err, sql.ErrNoRows) {
		return room, 0, nil // already out: the same answer
	} else if err != nil {
		return 0, 0, fmt.Errorf("read member: %w", err)
	}
	if removed == account {
		return 0, 0, auth.ErrBadRequest // leaving is its own request
	}
	if err := out(tx, room, removed, s.now().UnixMilli()); err != nil {
		return 0, 0, err
	}
	for range 5 {
		res, err := tx.Exec("update room set code = ?1 where id = ?2 and not exists (select 1 from room where code = ?1)", newCode(), room)
		if err != nil {
			return 0, 0, fmt.Errorf("new code: %w", err)
		}
		if n, _ := res.RowsAffected(); n == 1 {
			return room, removed, commit(tx, "remove")
		}
	}
	return 0, 0, errors.New("new code: no free code in five tries")
}

// out takes the account out of the room inside a leave or a remove: their notes stay,
// from nobody; they are out of the call; a call of theirs ends; a keeper hands on.
func out(tx *sql.Tx, room, account, now int64) error {
	for _, step := range []struct{ what, query string }{
		{"delete member", "delete from member where room = ?1 and account = ?2"},
		{"keep notes", "update note set account = null where room = ?1 and account = ?2"},
		{"leave call", "delete from call_in where account = ?2 and call in (select id from call where room = ?1)"},
		{"end call", "update call set ended = ?3 where room = ?1 and account = ?2 and ended is null"},
		// A keeper who leaves hands the room to whoever has been in it longest. The caller
		// announces the room after any leave, so every member hears who keeps it now.
		{"hand on room", "update room set keeper = (select account from member where room = ?1 order by id limit 1) where id = ?1 and keeper = ?2"},
	} {
		if _, err := tx.Exec(step.query, room, account, now); err != nil {
			return fmt.Errorf("%s: %w", step.what, err)
		}
	}
	return nil
}

// keeps refuses anybody but the room's keeper.
func keeps(tx *sql.Tx, room, account int64) error {
	var keeper bool
	if err := tx.QueryRow("select keeper is ? from room where id = ?", account, room).Scan(&keeper); err != nil {
		return fmt.Errorf("read keeper: %w", err)
	}
	if !keeper {
		return auth.ErrForbidden
	}
	return nil
}

func commit(tx *sql.Tx, what string) error {
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit %s: %w", what, err)
	}
	return nil
}

// newCode is 8 of the alphabet. A random byte's low five bits pick one evenly.
func newCode() string {
	code := make([]byte, codeLen)
	rand.Read(code)
	for i, b := range code {
		code[i] = alphabet[b&31]
	}
	return string(code)
}

// SetPicture keeps the account's picture, or takes it off with nil. The bytes are kept as
// sent; the server only checks they are small and start as a WebP or a JPEG does. changed
// is false when the account already had this picture, or none and none was asked for:
// nothing is stored, counted or sent.
func (s *Service) SetPicture(account int64, picture *string) (hash string, changed bool, err error) {
	var data []byte
	if picture != nil {
		data, err = base64.StdEncoding.DecodeString(*picture)
		if err != nil || len(data) > maxPicture || pictureType(data) == "" {
			return "", false, auth.ErrBadRequest
		}
		sum := sha256.Sum256(data)
		hash = hex.EncodeToString(sum[:])
	}
	var named *string
	if hash != "" {
		named = &hash
	}
	s.pictureMu.Lock()
	defer s.pictureMu.Unlock()
	var had sql.NullString
	if err := s.db.QueryRow("select picture_hash from account where id = ?", account).Scan(&had); err != nil {
		return "", false, fmt.Errorf("read picture: %w", err)
	}
	if had.String == hash {
		return hash, false, nil
	}
	now := s.now().UnixMilli()
	day := slices.DeleteFunc(s.pictures[account], func(at int64) bool { return at <= now-dayMs })
	if len(day) >= maxPictures {
		s.pictures[account] = day
		return "", false, slowDown(day[0], now)
	}
	if _, err := s.db.Exec("update account set picture = ?, picture_hash = ? where id = ?", data, named, account); err != nil {
		return "", false, fmt.Errorf("store picture: %w", err)
	}
	s.pictures[account] = append(day, now)
	return hash, true, nil
}

// Picture is the picture by this hash, for an account that shares a room with its owner,
// is its owner, or is the server's owner and it is an admin's. Anyone else is told there is none, as if the hash named nothing.
func (s *Service) Picture(viewer int64, hash string) (data []byte, contentType string, err error) {
	err = s.db.QueryRow(`select a.picture from account a where a.picture_hash = ?1 and (a.id = ?2 or exists (
		select 1 from member theirs join member mine on mine.room = theirs.room and mine.account = ?2 where theirs.account = a.id)
		or (a.role in ('owner', 'admin') and exists (select 1 from account o where o.id = ?2 and o.role = 'owner')))
		limit 1`, hash, viewer).Scan(&data)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, "", ErrPicture
	} else if err != nil {
		return nil, "", fmt.Errorf("read picture: %w", err)
	}
	return data, pictureType(data), nil
}

// pictureType is what the first bytes say the picture is, or "" for anything else.
func pictureType(b []byte) string {
	switch {
	case len(b) >= 12 && bytes.Equal(b[:4], []byte("RIFF")) && bytes.Equal(b[8:12], []byte("WEBP")):
		return "image/webp"
	case len(b) >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF:
		return "image/jpeg"
	}
	return ""
}
