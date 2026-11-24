// Package rooms is a few friends who see each other focusing: contracts/protocol.md
// section 15. Rooms are tables the server owns, not cells. What it reads of a member's
// own data is the short list in sync.Value and sync.Sessions, and it logs none of it.
package rooms

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	gosync "sync"
	"time"
	"unicode/utf16"

	"heirloom/server/auth"
	"heirloom/server/sync"
)

const (
	maxMembers = 8
	maxRooms   = 5 // rooms one account may be in
	maxName    = 40
	// A room of eight focusing every hour of the week. A target past that is a typo.
	maxTargetMs = maxMembers * 7 * dayMs
	dayMs       = 24 * 60 * 60 * 1000
	// A cheer shows only on the day of the lap it was for. A week covers every offset
	// and then some; after that the row is only taking up room.
	keepCheers = 7 * dayMs
	// 32 characters: A-Z and 2-9 without I and O, which read as 1 and 0. A random byte's
	// low five bits pick one evenly.
	alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	codeLen  = 8
	// Wrong codes an account may try in an hour before every join of its is refused until
	// the hour is up. A code is one of 2^40, so ten an hour finds nothing in a lifetime,
	// and nobody copying a code from a friend's screen gets it wrong ten times.
	maxWrongCodes = 10
	wrongWindow   = time.Hour
)

var (
	ErrRoom = &auth.Error{Status: 404, Code: "room"}
	ErrCode = &auth.Error{Status: 404, Code: "code"}
	ErrFull = &auth.Error{Status: 409, Code: "full"}
	ErrRun  = &auth.Error{Status: 404, Code: "run"}
)

// Message is the room as one member's device is told it.
type Message struct {
	Type       string   `json:"type"`
	Room       string   `json:"room"`
	Name       string   `json:"name"`
	Code       string   `json:"code"`
	TargetMs   int64    `json:"target_ms"`
	Ranked     bool     `json:"ranked"`
	ServerTime int64    `json:"server_time"`
	Members    []Member `json:"members"`
}

type Member struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	You       bool    `json:"you"`
	Away      bool    `json:"away"`
	Phase     string  `json:"phase"`
	SetIndex  int     `json:"set_index"`
	EndsAt    *int64  `json:"ends_at"`
	Paused    bool    `json:"paused"`
	Task      *string `json:"task"`
	TodayMs   int64   `json:"today_ms"`
	TodayLaps int     `json:"today_laps"`
	WeekMs    int64   `json:"week_ms"`
	Last      *Last   `json:"last"`
}

type Last struct {
	Run    string   `json:"run"`
	Ended  int64    `json:"ended"`
	Cheers []string `json:"cheers"`
}

// Gone is the one message a device gets for a room it has left.
type Gone struct {
	Type string `json:"type"`
	Room string `json:"room"`
	Gone bool   `json:"gone"`
}

// totals is a member's day and week, kept until they push a session or their day ends.
type totals struct {
	offset    int
	day       string
	todayMs   int64
	todayLaps int
	weekMs    int64
	last      *Session // the latest lap that rang today
}

// Service's SQLite calls take no context, for the reason sync.Store gives. No method
// touches the database while one of its own transactions is open: there is one
// connection, and the second caller would wait for the first forever.
type Service struct {
	db    *sql.DB
	cells *sync.Store
	now   func() time.Time

	// Held while a member's totals are counted, so a push that lands meanwhile clears
	// them after they are stored, never before.
	mu     gosync.Mutex
	totals map[int64]totals
	counts int // times a week of sessions was read, for the test that says how seldom

	// Wrong codes tried, by account. At most one entry an account, and accounts are by invite.
	guessMu gosync.Mutex
	guesses map[int64]guesses
}

type guesses struct {
	n     int
	since time.Time
}

func New(db *sql.DB, cells *sync.Store, now func() time.Time) *Service {
	return &Service{db: db, cells: cells, now: now, totals: map[int64]totals{}, guesses: map[int64]guesses{}}
}

// guess counts a try at a code before the code is looked at, as sign-ins are counted, so
// tries sent all at once cannot each slip past the limit. right is true when the try
// turned out to be a real code, and the count is given back.
func (s *Service) guess(account int64, right bool) error {
	s.guessMu.Lock()
	defer s.guessMu.Unlock()
	now := s.now()
	g := s.guesses[account]
	if now.Sub(g.since) >= wrongWindow {
		g = guesses{since: now}
	}
	switch {
	case right:
		g.n--
	case g.n >= maxWrongCodes:
		wait := g.since.Add(wrongWindow).Sub(now)
		return &auth.Error{Status: 429, Code: "slow_down", RetryAfter: int((wait + time.Second - 1) / time.Second)}
	default:
		g.n++
	}
	if g.n <= 0 {
		delete(s.guesses, account)
	} else {
		s.guesses[account] = g
	}
	return nil
}

// Create makes a room with the account as its first member and returns the room's ids.
func (s *Service) Create(account int64, name string) (public string, room int64, err error) {
	if !validName(name) {
		return "", 0, auth.ErrBadRequest
	}
	tx, err := s.db.Begin()
	if err != nil {
		return "", 0, fmt.Errorf("begin create room: %w", err)
	}
	defer tx.Rollback()
	if err := roomToSpare(tx, account); err != nil {
		return "", 0, err
	}
	public = rand.Text()
	// A code somebody already has is as likely as guessing one: try again rather than fail.
	for range 5 {
		code := make([]byte, codeLen)
		rand.Read(code)
		for i, b := range code {
			code[i] = alphabet[b&31]
		}
		res, err := tx.Exec("insert into room (public_id, name, code) values (?, ?, ?) on conflict (code) do nothing", public, name, string(code))
		if err != nil {
			return "", 0, fmt.Errorf("store room: %w", err)
		}
		if n, _ := res.RowsAffected(); n == 1 {
			room, _ = res.LastInsertId()
			break
		}
	}
	if room == 0 {
		return "", 0, errors.New("store room: no free code in five tries")
	}
	if _, err := tx.Exec("insert into member (room, account) values (?, ?)", room, account); err != nil {
		return "", 0, fmt.Errorf("store member: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return "", 0, fmt.Errorf("commit create room: %w", err)
	}
	return public, room, nil
}

// Join adds the account to the room with this code. Joining twice is the same answer.
func (s *Service) Join(account int64, code string) (public string, room int64, err error) {
	// Typed from a friend's screen: lower case and a stray space are not a wrong code.
	code = strings.ToUpper(strings.TrimSpace(code))
	if err := s.guess(account, false); err != nil {
		return "", 0, err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return "", 0, fmt.Errorf("begin join: %w", err)
	}
	defer tx.Rollback()
	err = tx.QueryRow("select id, public_id from room where code = ?", code).Scan(&room, &public)
	if errors.Is(err, sql.ErrNoRows) {
		return "", 0, ErrCode
	} else if err != nil {
		return "", 0, fmt.Errorf("read room: %w", err)
	}
	s.guess(account, true)
	var in bool
	var members int
	if err := tx.QueryRow("select count(*), coalesce(max(account = ?), 0) from member where room = ?", account, room).Scan(&members, &in); err != nil {
		return "", 0, fmt.Errorf("read members: %w", err)
	}
	if in {
		return public, room, nil
	}
	if members >= maxMembers {
		return "", 0, ErrFull
	}
	if err := roomToSpare(tx, account); err != nil {
		return "", 0, err
	}
	if _, err := tx.Exec("insert into member (room, account) values (?, ?)", room, account); err != nil {
		return "", 0, fmt.Errorf("store member: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return "", 0, fmt.Errorf("commit join: %w", err)
	}
	return public, room, nil
}

func roomToSpare(tx *sql.Tx, account int64) error {
	var rooms int
	if err := tx.QueryRow("select count(*) from member where account = ?", account).Scan(&rooms); err != nil {
		return fmt.Errorf("count rooms: %w", err)
	}
	if rooms >= maxRooms {
		return ErrFull
	}
	return nil
}

// Leave takes the account out. The last member leaving ends the room.
func (s *Service) Leave(account int64, public string) (room int64, err error) {
	tx, err := s.db.Begin()
	if err != nil {
		return 0, fmt.Errorf("begin leave: %w", err)
	}
	defer tx.Rollback()
	if room, err = find(tx, account, public); err != nil {
		return 0, err
	}
	if _, err := tx.Exec("delete from member where room = ? and account = ?", room, account); err != nil {
		return 0, fmt.Errorf("delete member: %w", err)
	}
	if _, err := tx.Exec("delete from room where id = ? and not exists (select 1 from member where room = ?)", room, room); err != nil {
		return 0, fmt.Errorf("delete room: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("commit leave: %w", err)
	}
	return room, nil
}

// Update changes any of the room's name, target and ranking. Any member may.
func (s *Service) Update(account int64, public string, name *string, targetMs *int64, ranked *bool) (room int64, err error) {
	if name != nil && !validName(*name) || targetMs != nil && (*targetMs < 0 || *targetMs > maxTargetMs) {
		return 0, auth.ErrBadRequest
	}
	tx, err := s.db.Begin()
	if err != nil {
		return 0, fmt.Errorf("begin update room: %w", err)
	}
	defer tx.Rollback()
	if room, err = find(tx, account, public); err != nil {
		return 0, err
	}
	// A nil argument is SQL null, and coalesce then keeps what the room has.
	if _, err := tx.Exec("update room set name = coalesce(?, name), target_ms = coalesce(?, target_ms), ranked = coalesce(?, ranked) where id = ?",
		name, targetMs, ranked, room); err != nil {
		return 0, fmt.Errorf("update room: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("commit update room: %w", err)
	}
	return room, nil
}

// Cheer records that the account cheered a lap of another member's. Once per person per
// run; a second is the same answer.
func (s *Service) Cheer(account int64, public, to, run string) (room int64, err error) {
	if room, err = find(s.db, account, public); err != nil {
		return 0, err
	}
	var friend int64
	err = s.db.QueryRow("select a.id from member m join account a on a.id = m.account where m.room = ? and a.public_id = ?", room, to).Scan(&friend)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrRun
	} else if err != nil {
		return 0, fmt.Errorf("read member: %w", err)
	}
	if friend == account {
		return 0, auth.ErrBadRequest // a cheer is for somebody else
	}
	// Someone who has hidden rooms shows no laps, so there is nothing of theirs to cheer.
	// The answer is the one a made-up run gets: it does not say the lap exists.
	if hidden, err := s.flag(friend, "rooms_hidden"); err != nil {
		return 0, err
	} else if hidden {
		return 0, ErrRun
	}
	kind, err := s.cells.Value(friend, "session", run, "kind")
	if err != nil {
		return 0, err
	}
	outcome, err := s.cells.Value(friend, "session", run, "outcome")
	if err != nil {
		return 0, err
	}
	if string(kind) != `"work"` || string(outcome) != `"rang"` {
		return 0, ErrRun
	}
	now := s.now().UnixMilli()
	if _, err := s.db.Exec("insert into cheer (to_account, run, from_account, created) values (?, ?, ?, ?) on conflict do nothing", friend, run, account, now); err != nil {
		return 0, fmt.Errorf("store cheer: %w", err)
	}
	if _, err := s.db.Exec("delete from cheer where created < ?", now-keepCheers); err != nil {
		return 0, fmt.Errorf("drop old cheers: %w", err)
	}
	return room, nil
}

// find is the room with this public id, if the account is in it. A room that is not
// there and a room one is not in are the same answer, so asking tells an outsider nothing.
func find(q interface {
	QueryRow(string, ...any) *sql.Row
}, account int64, public string) (room int64, err error) {
	err = q.QueryRow("select r.id from room r join member m on m.room = r.id and m.account = ? where r.public_id = ?", account, public).Scan(&room)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrRoom
	} else if err != nil {
		return 0, fmt.Errorf("read room: %w", err)
	}
	return room, nil
}

// Of lists the rooms an account is in, oldest membership first.
func (s *Service) Of(account int64) ([]int64, error) {
	return s.ids("select room from member where account = ? order by id", account)
}

// IDs lists the public ids of the rooms an account is in, in the same order as Of. A
// device drops any room its welcome does not name: it may have been away for the "gone".
func (s *Service) IDs(account int64) ([]string, error) {
	rows, err := s.db.Query("select r.public_id from member m join room r on r.id = m.room where m.account = ? order by m.id", account)
	if err != nil {
		return nil, fmt.Errorf("read rooms: %w", err)
	}
	defer rows.Close()
	ids := []string{} // not nil: the welcome says "rooms":[]
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("read rooms: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// Members lists the accounts in a room.
func (s *Service) Members(room int64) ([]int64, error) {
	return s.ids("select account from member where room = ? order by id", room)
}

func (s *Service) ids(query string, arg int64) ([]int64, error) {
	rows, err := s.db.Query(query, arg)
	if err != nil {
		return nil, fmt.Errorf("read members: %w", err)
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("read members: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// SetOffset keeps the latest offset from UTC a device of the account sent, and says
// whether that moved the account's day.
func (s *Service) SetOffset(account int64, offsetMin int) (changed bool, err error) {
	// Changes no row, and so writes nothing, when the offset is what it was.
	res, err := s.db.Exec("update account set utc_offset_min = ? where id = ? and utc_offset_min != ?", offsetMin, account, offsetMin)
	if err != nil {
		return false, fmt.Errorf("store utc offset: %w", err)
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}

// Pushed is told what a push by the account changed, and says whether a room could look
// different for it. A session cell also clears the account's counted day and week.
func (s *Service) Pushed(account int64, won []sync.Cell) (matters bool) {
	for _, c := range won {
		switch {
		case c.Dataset == "session":
			// Its task and note are not counted, so they change nothing a room shows.
			if c.Field != "task" && c.Field != "note" {
				s.mu.Lock()
				delete(s.totals, account)
				s.mu.Unlock()
				matters = true
			}
		case c.Dataset == "timer" && c.Row == "current" && c.Field == "state",
			c.Dataset == "settings" && c.Row == "current" && (c.Field == "share_task" || c.Field == "rooms_hidden"),
			c.Dataset == "task" && c.Field == "title":
			matters = true
		}
	}
	return matters
}

// Message is the room as viewer is to see it right now, and the next moment it will
// read differently by time alone: a bell, or a member's midnight. It is nil when the
// room is gone or viewer is not in it, which is the only way anyone gets one.
func (s *Service) Message(room, viewer int64) (*Message, int64, error) {
	now := s.now().UnixMilli()
	m := &Message{Type: "room", ServerTime: now}
	err := s.db.QueryRow("select public_id, name, code, target_ms, ranked from room where id = ?", room).Scan(&m.Room, &m.Name, &m.Code, &m.TargetMs, &m.Ranked)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, 0, nil
	} else if err != nil {
		return nil, 0, fmt.Errorf("read room: %w", err)
	}
	type who struct {
		id     int64
		offset int
		Member
	}
	rows, err := s.db.Query(`select a.id, a.public_id, a.username, a.utc_offset_min
		from member m join account a on a.id = m.account where m.room = ? order by m.id`, room)
	if err != nil {
		return nil, 0, fmt.Errorf("read members: %w", err)
	}
	var people []who
	in := false
	for rows.Next() {
		var p who
		if err := rows.Scan(&p.id, &p.ID, &p.Name, &p.offset); err != nil {
			rows.Close()
			return nil, 0, fmt.Errorf("read members: %w", err)
		}
		p.You = p.id == viewer
		in = in || p.You
		people = append(people, p)
	}
	// Closed before the reads below: they need the one connection this was holding.
	if err := errors.Join(rows.Err(), rows.Close()); err != nil {
		return nil, 0, fmt.Errorf("read members: %w", err)
	}
	if !in {
		return nil, 0, nil
	}
	var next int64
	for _, p := range people {
		change, err := s.fill(&p.Member, room, p.id, p.offset, now)
		if err != nil {
			return nil, 0, err
		}
		if next == 0 || change < next {
			next = change
		}
		m.Members = append(m.Members, p.Member)
	}
	return m, next, nil
}

// fill reads one member: the totals always, the rest only if they have not hidden rooms.
// It returns when this member will next read differently with nobody doing anything.
func (s *Service) fill(m *Member, room, account int64, offsetMin int, now int64) (change int64, err error) {
	t, midnight, err := s.count(account, offsetMin, now)
	if err != nil {
		return 0, err
	}
	m.Phase, m.TodayMs, m.TodayLaps, m.WeekMs = "idle", t.todayMs, t.todayLaps, t.weekMs
	if m.Away, err = s.flag(account, "rooms_hidden"); err != nil || m.Away {
		// Not watched: no phase, no task, no last lap. What they did still counts.
		return midnight, err
	}
	state, err := s.cells.Value(account, "timer", "current", "state")
	if err != nil {
		return 0, err
	}
	p := watch(state, now)
	m.Phase, m.SetIndex, m.EndsAt, m.Paused = p.phase, p.setIndex, p.endsAt, p.paused
	change = midnight
	if p.endsAt != nil {
		change = min(change, *p.endsAt)
	}
	// The title is read only once the member's own switch says it may be shown, and only
	// of the one task this lap is for.
	if p.phase == "work" && p.task != nil {
		if share, err := s.flag(account, "share_task"); err != nil {
			return 0, err
		} else if share {
			title, err := s.cells.Value(account, "task", *p.task, "title")
			if err != nil {
				return 0, err
			}
			var text string
			if json.Unmarshal(title, &text) == nil && title != nil {
				m.Task = &text
			}
		}
	}
	if t.last != nil {
		m.Last = &Last{Run: t.last.ID, Ended: t.last.Ended, Cheers: []string{}}
		rows, err := s.db.Query(`select a.public_id from cheer c
			join member m on m.account = c.from_account and m.room = ?
			join account a on a.id = c.from_account
			where c.to_account = ? and c.run = ? order by c.created, a.id`, room, account, t.last.ID)
		if err != nil {
			return 0, fmt.Errorf("read cheers: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				return 0, fmt.Errorf("read cheers: %w", err)
			}
			m.Last.Cheers = append(m.Last.Cheers, id)
		}
		if err := rows.Err(); err != nil {
			return 0, fmt.Errorf("read cheers: %w", err)
		}
	}
	return change, nil
}

func (s *Service) flag(account int64, field string) (bool, error) {
	v, err := s.cells.Value(account, "settings", "current", field)
	return string(v) == "true", err
}

// count is the member's day and week, and when their day ends. It reads their sessions
// only when they have pushed one since, or their day or offset has changed: a room
// message for a timer starting or a title changing reads no session at all. When it does
// read, it reads the week's rows through the index on started, not the years before.
func (s *Service) count(account int64, offsetMin int, now int64) (totals, int64, error) {
	day := localDay(now, offsetMin)
	midnight, _ := time.Parse(time.DateOnly, day)
	dayStart := midnight.UnixMilli() - int64(offsetMin)*60000
	s.mu.Lock()
	defer s.mu.Unlock()
	if t, ok := s.totals[account]; ok && t.day == day && t.offset == offsetMin {
		return t, dayStart + dayMs, nil
	}
	// Monday is the first day of the week; Go's Sunday is 0.
	monday := dayStart - int64((int(midnight.Weekday())+6)%7)*dayMs
	rows, err := s.cells.Sessions(account, monday, monday+7*dayMs)
	if err != nil {
		return totals{}, 0, err
	}
	s.counts++
	week := make([]Session, 0, len(rows))
	for id, fields := range rows {
		// A row that is missing a field, or holds a shape this build does not know, is not counted.
		object, _ := json.Marshal(fields)
		session := Session{ID: id}
		if len(fields) == 5 && json.Unmarshal(object, &session) == nil {
			week = append(week, session)
		}
	}
	t := totals{offset: offsetMin, day: day}
	days, _ := Stats(week, offsetMin)
	for _, d := range days {
		t.weekMs += d.FocusMs
	}
	t.todayMs, t.todayLaps = days[day].FocusMs, days[day].Laps
	for _, session := range week {
		rang := session.counts() && session.Outcome == "rang" && localDay(session.Started, offsetMin) == day
		if rang && (t.last == nil || session.Ended > t.last.Ended || session.Ended == t.last.Ended && session.ID > t.last.ID) {
			t.last = &session
		}
	}
	s.totals[account] = t
	return t, dayStart + dayMs, nil
}

// 1 to 40 characters, counted as the web app's String.length counts them.
func validName(name string) bool {
	n := len(utf16.Encode([]rune(name)))
	return n >= 1 && n <= maxName
}
