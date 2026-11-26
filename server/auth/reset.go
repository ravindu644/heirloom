package auth

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base32"
	"errors"
	"fmt"
	"log"
	"time"
)

// A way back in (protocol section 10). A password is never read back, only replaced, and
// only with the say of whoever runs the server: the owner makes a link in the app for
// anybody but themself, and "heirloomd -reset" makes one for anybody.

// A reset is good for a day: long enough to reach the person, short enough that a link
// left in a chat is soon nothing.
const resetLife = 24 * time.Hour

// Reset is a link that sets a new password, as its maker is shown it, once. Reset is the
// last part of <server>/#/reset/<reset>; in a list it is left out, because the server
// has only its hash.
type Reset struct {
	Reset    string `json:"reset,omitempty"`
	Username string `json:"username"`
	Created  int64  `json:"created"`
	Expires  int64  `json:"expires"`
}

// CreateReset makes a reset for anybody but the owner, for the owner only. A device left
// open and signed in as the owner must not be a way to take the server.
func (s *Service) CreateReset(caller int64, username string) (Reset, error) {
	// The role first: anybody but the owner is refused before the name is looked at, and
	// so learns nothing about who is here.
	if err := s.may(caller, Owner); err != nil {
		return Reset{}, err
	}
	return s.reset(username, false)
}

// ResetFor makes a reset from the command line, for any account, the owner's too. Whoever
// can run it already holds the data.
func (s *Service) ResetFor(username string) (Reset, error) { return s.reset(username, true) }

func (s *Service) reset(username string, ownerToo bool) (Reset, error) {
	if username == "" {
		return Reset{}, ErrBadRequest
	}
	name, ok := cleanUsername(username)
	if !ok {
		return Reset{}, ErrUnknown // a name no account could have
	}
	// 32 bytes from the system's random source, written as an invite is: base32, no padding.
	secret := make([]byte, 32)
	rand.Read(secret)
	now := s.now()
	r := Reset{base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(secret), name, now.UnixMilli(), now.Add(resetLife).UnixMilli()}

	tx, err := s.db.Begin()
	if err != nil {
		return Reset{}, fmt.Errorf("begin reset: %w", err)
	}
	defer tx.Rollback()
	var account int64
	var role string
	err = tx.QueryRow("select id, role from account where username = ?", name).Scan(&account, &role)
	if errors.Is(err, sql.ErrNoRows) {
		return Reset{}, ErrUnknown
	} else if err != nil {
		return Reset{}, fmt.Errorf("read account: %w", err)
	}
	if role == Owner && !ownerToo {
		return Reset{}, ErrBadRequest
	}
	if err := sweep(tx, now); err != nil {
		return Reset{}, err
	}
	// One row an account: a new reset takes the place of the old, which is dead from here.
	if _, err := tx.Exec(`insert into resets (account, hash, created, expires) values (?, ?, ?, ?)
		on conflict (account) do update set hash = excluded.hash, created = excluded.created, expires = excluded.expires, used = null`,
		account, hashOf(r.Reset), r.Created, r.Expires); err != nil {
		return Reset{}, fmt.Errorf("store reset: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return Reset{}, fmt.Errorf("commit reset: %w", err)
	}
	log.Printf("reset: made for %s", name)
	return r, nil
}

// Resets lists every reset that can still be used, oldest first, without the link.
func (s *Service) Resets(caller int64) ([]Reset, error) {
	if err := s.may(caller, Owner); err != nil {
		return nil, err
	}
	rows, err := s.db.Query(`select a.username, r.created, r.expires from resets r join account a on a.id = r.account
		where r.used is null and r.expires > ? order by r.created, a.username`, s.now().UnixMilli())
	if err != nil {
		return nil, fmt.Errorf("read resets: %w", err)
	}
	defer rows.Close()
	list := []Reset{} // not nil: the reply says "resets":[]
	for rows.Next() {
		var r Reset
		if err := rows.Scan(&r.Username, &r.Created, &r.Expires); err != nil {
			return nil, fmt.Errorf("read resets: %w", err)
		}
		list = append(list, r)
	}
	return list, rows.Err()
}

// RevokeReset takes back the reset open for a username. None open is the same answer.
func (s *Service) RevokeReset(caller int64, username string) error {
	if err := s.may(caller, Owner); err != nil {
		return err
	}
	if username == "" {
		return ErrBadRequest
	}
	name, ok := cleanUsername(username)
	if !ok {
		return ErrUnknown
	}
	var account int64
	err := s.db.QueryRow("select id from account where username = ?", name).Scan(&account)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrUnknown
	} else if err != nil {
		return fmt.Errorf("read account: %w", err)
	}
	res, err := s.db.Exec("delete from resets where account = ? and used is null and expires > ?", account, s.now().UnixMilli())
	if err != nil {
		return fmt.Errorf("delete reset: %w", err)
	}
	// Only a reset that was really open is a taking back worth a line.
	if n, _ := res.RowsAffected(); n == 1 {
		log.Printf("reset: taken back for %s", name)
	}
	return nil
}

// openReset finds the account a reset is for, if the reset can still be used. Unknown, used,
// taken back and run out are one answer, and say no more than that.
func openReset(q interface {
	QueryRow(string, ...any) *sql.Row
}, hash []byte, now int64) (account int64, public, username string, err error) {
	// Found by the sha-256 of what was sent, so how long the lookup takes says nothing
	// that would help guess a reset: there is no steering a hash toward a stored one.
	err = q.QueryRow(`select a.id, a.public_id, a.username from resets r join account a on a.id = r.account
		where r.hash = ? and r.used is null and r.expires > ?`, hash, now).Scan(&account, &public, &username)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, "", "", ErrReset
	} else if err != nil {
		return 0, "", "", fmt.Errorf("read reset: %w", err)
	}
	return account, public, username, nil
}

// LookReset says whose password a reset would set, to whoever holds the link.
func (s *Service) LookReset(reset string) (username string, err error) {
	_, _, username, err = openReset(s.db, hashOf(reset), s.now().UnixMilli())
	return username, err
}

// UseReset sets the account's password, uses the reset up, signs every device of the
// account out, and signs in the device that asked. It is one transaction: a reset is
// never used up without the password having changed, nor the other way round. Of two
// that come with the same link, one is let in and the other is told "reset".
func (s *Service) UseReset(ctx context.Context, reset, password, device string) (Session, error) {
	if reset == "" || !validPassword(password) || !ValidDevice(device) {
		return Session{}, ErrBadRequest
	}
	hash := hashOf(reset)
	// Looked at before any hashing, so a made-up reset costs the phone nothing and never
	// stands in the line of sign-ins.
	if _, _, _, err := openReset(s.db, hash, s.now().UnixMilli()); err != nil {
		return Session{}, err
	}
	// The same line as sign-ins: one password is hashed at a time, and a full line is slow_down.
	done, err := s.turn(ctx)
	if err != nil {
		return Session{}, err
	}
	defer done()
	salt := make([]byte, saltLen)
	rand.Read(salt)
	key := argon(password, salt, argonTime, argonMemory, argonThreads)

	tx, err := s.db.Begin()
	if err != nil {
		return Session{}, fmt.Errorf("begin reset: %w", err)
	}
	defer tx.Rollback()
	now := s.now().UnixMilli()
	// Asked again, with the write lock held: the other of two at once finds it used.
	account, public, username, err := openReset(tx, hash, now)
	if err != nil {
		return Session{}, err
	}
	if _, err := tx.Exec("update resets set used = ? where account = ?", now, account); err != nil {
		return Session{}, fmt.Errorf("use reset: %w", err)
	}
	if _, err := tx.Exec("update account set password = ? where id = ?", encode(salt, key), account); err != nil {
		return Session{}, fmt.Errorf("store password: %w", err)
	}
	// Every device of the account is signed out, this one's old token included. Their
	// push subscriptions go with the tokens: they hang on them.
	rows, err := tx.Query("select hash from token where account = ?", account)
	if err != nil {
		return Session{}, fmt.Errorf("read tokens: %w", err)
	}
	var dead [][]byte
	for rows.Next() {
		var h []byte
		if err := rows.Scan(&h); err != nil {
			rows.Close()
			return Session{}, fmt.Errorf("read tokens: %w", err)
		}
		dead = append(dead, h)
	}
	if err := errors.Join(rows.Err(), rows.Close()); err != nil {
		return Session{}, fmt.Errorf("read tokens: %w", err)
	}
	if _, err := tx.Exec("delete from token where account = ?", account); err != nil {
		return Session{}, fmt.Errorf("delete tokens: %w", err)
	}
	token, _, err := issue(tx, account, device, now)
	if err != nil {
		return Session{}, err
	}
	if err := tx.Commit(); err != nil {
		return Session{}, fmt.Errorf("commit reset: %w", err)
	}

	// Only now, with all of it stored: the sockets are cut, and the count of failed
	// sign-ins is dropped. Whoever holds the link has the owner's say, which is more than
	// five wrong guesses are against. (The count is ours to touch: we hold the hashing turn.)
	delete(s.failed, username)
	log.Printf("reset: used for %s", username)
	for _, h := range dead {
		s.revoked(string(h))
	}
	return Session{token, public, username}, nil
}
