// Package store owns the SQLite file. Nothing else in the server opens a database.
package store

import (
	"context"
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
	db, err := open(dsn(path))
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	if err := migrate(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate %s: %w", path, err)
	}
	return db, nil
}

// dsn is how every connection to the live database is opened.
func dsn(path string) string {
	// Built as a URL so a "?" or "%" in the path cannot be read as an option.
	return (&url.URL{Scheme: "file", Path: path, RawQuery: url.Values{
		// Every transaction takes the write lock when it begins. One that read first and
		// asked for the lock later would fail outright if "heirloomd -invite" wrote in between.
		"_txlock": {"immediate"},
		"_pragma": {
			"journal_mode(WAL)",
			// FULL fsyncs the WAL on every commit. With NORMAL a power cut can roll back a commit
			// we already acked, and the device has dropped that cell from its outbox by then.
			"synchronous(FULL)",
			"busy_timeout(5000)",
			"foreign_keys(1)",
		},
	}.Encode()}).String()
}

// migrations[i] takes the schema from version i to i+1. A released one is never edited:
// a change is a new entry at the end.
var migrations = []string{`
create table account (
	id        integer primary key,
	public_id text not null unique, -- the opaque id a device names its local database by
	username  text not null unique,
	password  text not null,        -- argon2id, with its salt and parameters
	created   integer not null      -- ms since the epoch, like every time here
) strict;

create table invite (
	hash    blob primary key, -- sha-256 of the code
	created integer not null,
	used_by integer references account (id) -- null until it registers its one account
) strict, without rowid;

create table token (
	account integer not null references account (id),
	device  text not null,
	hash    blob not null unique, -- sha-256 of the token; the token itself is never stored
	created integer not null,
	primary key (account, device) -- signing in again replaces that device's token
) strict, without rowid;

-- One row per field: the newest cell and the sequence number it got when it won.
create table cell (
	account integer not null references account (id),
	dataset text not null,
	row_id  text not null,
	field   text not null,
	stamp   text not null,
	value   blob not null, -- the JSON value, byte for byte as the device sent it
	seq     integer not null,
	primary key (account, dataset, row_id, field)
) strict, without rowid;

-- Pull by cursor walks this, and the account's head is its last entry.
create unique index cell_seq on cell (account, seq);
`, `
-- Rooms are the server's own: several accounts share one, so there is nothing to merge.
create table room (
	id        integer primary key,
	public_id text not null unique,
	name      text not null,
	code      text not null unique, -- whoever has it can join
	target_ms integer not null default 0,
	ranked    integer not null default 0
) strict;

-- id grows as people join, which is the order the room shows them in.
create table member (
	id      integer primary key,
	room    integer not null references room (id) on delete cascade,
	account integer not null references account (id),
	unique (room, account)
) strict;
create index member_account on member (account);

-- One row per person per run, in no room: a cheer is between two people.
create table cheer (
	to_account   integer not null references account (id),
	run          text not null,
	from_account integer not null references account (id),
	created      integer not null,
	primary key (to_account, run, from_account)
) strict, without rowid;

-- The latest offset from UTC a device of this account sent: where its "today" begins.
alter table account add column utc_offset_min integer not null default 0;

-- A room shows a member's day and week. This finds the sessions that started inside
-- them without walking the years of sessions before.
create index cell_session_started on cell (account, cast(value as integer))
	where dataset = 'session' and field = 'started';
`, `
-- The server's own VAPID key, made at first start. One row.
create table push_key (
	id      integer primary key check (id = 1),
	private blob not null
) strict;

-- A browser that asked to be rung, one per device. It goes with the device's token:
-- signing out deletes that, and this with it.
create table push_subscription (
	account  integer not null,
	device   text not null,
	endpoint text not null, -- a capability: whoever has it can push to that browser
	p256dh   blob not null,
	auth     blob not null,
	words    text not null, -- what the notification says, written by the app
	rung_run text,          -- the last bell sent to this device, so none is sent twice,
	rung_at  integer,       -- not even across a restart
	primary key (account, device),
	foreign key (account, device) references token (account, device) on delete cascade
) strict, without rowid;
`, `
-- member, admin or owner. The oldest account is the owner: it is the one that set the
-- server up, or on a server from before roles, the one whose server it has been all along.
alter table account add column role text not null default 'member'
	check (role in ('member', 'admin', 'owner'));
update account set role = 'owner' where id = (select min(id) from account);

-- One owner at most, and the owner stays the owner, whatever a request or a bug asks for.
create unique index account_owner on account (role) where role = 'owner';
create trigger account_owner_stays before update of role on account when old.role = 'owner'
begin
	select raise(abort, 'the owner stays the owner');
end;

-- An invitation is the last part of a link. It is kept as it is, not hashed, so an admin
-- can copy the link again; it runs out after a week and can be taken back, which is what
-- bounds the use of one read out of a stolen backup. Registering deletes it.
create table invitation (
	invite  text primary key,
	made_by integer references account (id), -- null: made with "heirloomd -invite"
	created integer not null,
	expires integer not null
) strict, without rowid;

-- The codes of before were kept only as hashes and cannot be carried over.
drop table invite;
`, `
-- A way back in: a link the owner gives that sets a new password, once. Unlike an
-- invitation it is kept only as its hash, because it opens an account that exists: the
-- link is shown when it is made and the server cannot show it again. One row an
-- account, so making a new one for somebody is the end of their old one.
create table resets (
	account integer primary key references account (id),
	hash    blob not null unique, -- sha-256 of the reset
	created integer not null,
	expires integer not null,
	used    integer -- when it set a password; null until then
) strict;
`, `
-- A room's keeper: the one member who may change its name, target and ranking, so a
-- friend's slip of the thumb cannot rename the room for everyone. Null only for a room
-- with nobody left in it, which ends in the same transaction. A room from before keepers
-- is kept by the member who has been in it longest.
alter table room add column keeper integer references account (id);
update room set keeper = (select account from member where member.room = room.id order by member.id limit 1);
`, `
-- Rooms, the second pass. A room's streak counts from the day it was made and each member
-- from the day they came in. Nobody knows those days for the rooms and members already
-- here, so they start from today: no day before it is held against them.
alter table room add column created integer not null default 0;
alter table member add column joined integer not null default 0;
update room set created = cast(unixepoch('subsec') * 1000 as integer);
update member set joined = cast(unixepoch('subsec') * 1000 as integer);

-- A picture is kept as it was sent and named by the sha-256 of its bytes (hex), so a new
-- one is a new name and a device may keep an old one for good.
alter table account add column picture blob;
alter table account add column picture_hash text;

-- One line from a member, kept seven days. account is null once its writer has left:
-- the note stays with the room, from "someone who left".
create table note (
	id        integer primary key,
	public_id text not null unique,
	room      integer not null references room (id) on delete cascade,
	account   integer references account (id),
	at        integer not null,
	text      text not null
) strict;
create index note_room on note (room, at);

-- A lap called for a minute ahead. It stands until a minute after at, unless ended
-- (taken back, or its caller left) first. Rows stay a day after, for the limit of six.
create table call (
	id        integer primary key,
	public_id text not null unique,
	room      integer not null references room (id) on delete cascade,
	account   integer not null references account (id),
	at        integer not null,
	made      integer not null,
	ended     integer
) strict;
create index call_room on call (room);
create index call_account on call (account, made);

-- Who is in. id is the order they said so: the caller's row is the first.
create table call_in (
	id      integer primary key,
	call    integer not null references call (id) on delete cascade,
	account integer not null references account (id),
	unique (call, account)
) strict;
`, `
-- How far an account has read a room's notes, server ms: read on one device, read on all.
alter table member add column notes_read integer not null default 0;
`, `
-- The limits on calls. taken_back: the caller took it back before it started, so it is
-- not one of their day's 20 (it is one of the 40). free: the caller kept the room when
-- they made it, so it counts only toward the keeper's 100 in that room, whoever keeps it later.
alter table call add column taken_back integer not null default 0;
alter table call add column free integer not null default 0;
`}

func migrate(db *sql.DB) error {
	ctx := context.Background()
	// The transaction takes the write lock first, so two processes opening at once
	// (the server and "heirloomd -invite") cannot both run the same migration.
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var version int
	if err := tx.QueryRowContext(ctx, "pragma user_version").Scan(&version); err != nil {
		return err
	}
	if version > len(migrations) {
		return fmt.Errorf("database is at schema %d, this build knows %d: it is older than the data", version, len(migrations))
	}
	if version == len(migrations) {
		return nil
	}
	for _, m := range migrations[version:] {
		if _, err := tx.ExecContext(ctx, m); err != nil {
			return err
		}
	}
	// A pragma takes no bound parameter; the number is ours, not input.
	if _, err := tx.ExecContext(ctx, fmt.Sprintf("pragma user_version = %d", len(migrations))); err != nil {
		return err
	}
	return tx.Commit()
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
