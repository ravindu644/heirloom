package main

import (
	"bytes"
	"io"
	"net"
	"net/http"
	"sync"
)

// The server lives in 50 MB on a phone and is meant for about twenty devices. These are
// the bounds on what a stranger, or a bug, can make it hold at once. None of them is in
// the way of those twenty: when one is reached the newcomer waits, it is not turned away.
const (
	// Connections open at once, sockets and plain requests together. Twenty devices are
	// twenty sockets, and a browser opening the app adds up to six more each for a moment:
	// about 140 at the worst, all at once after a restart. 256 leaves room over that, and
	// 256 connections that do nothing cost about 8 MB, which the budget can carry.
	maxConns = 256

	// POST /api/sync bodies over smallSync being read and answered at once. The token is
	// inside the body, so up to 1 MB is read and parsed before anyone is known, and each
	// such request can hold about 3 MB with its reply. Four is 12 MB at the very worst.
	maxBigSyncs = 4

	// A sync body up to this size takes no slot. An ordinary poll is 150 bytes and an
	// ordinary push a few cells, so a device in ordinary use never waits behind somebody
	// sending megabytes slowly. 16 KB for each of 256 connections is 4 MB.
	smallSync = 16 << 10
)

// limitListener lets at most cap(slots) connections be open. The one over the bound is
// not refused: it waits, its TCP handshake done by the kernel, until another closes.
type limitListener struct {
	net.Listener
	slots chan struct{}
	done  chan struct{}
	close sync.Once
}

func limit(l net.Listener, n int) *limitListener {
	return &limitListener{Listener: l, slots: make(chan struct{}, n), done: make(chan struct{})}
}

func (l *limitListener) Accept() (net.Conn, error) {
	select {
	case l.slots <- struct{}{}:
	case <-l.done:
		// Shutdown must not hang behind a full house.
		return nil, net.ErrClosed
	}
	c, err := l.Listener.Accept()
	if err != nil {
		<-l.slots
		return nil, err
	}
	// Once: a socket's connection is closed by the websocket library and again by us.
	return &limitedConn{Conn: c, leave: sync.OnceFunc(func() { <-l.slots })}, nil
}

func (l *limitListener) Close() error {
	l.close.Do(func() { close(l.done) })
	return l.Listener.Close()
}

type limitedConn struct {
	net.Conn
	leave func()
}

func (c *limitedConn) Close() error {
	err := c.Conn.Close()
	c.leave()
	return err
}

// bigBodies makes a handler take one of the slots before it reads past smallSync of its
// body, and keep it until it has answered.
func bigBodies(slots chan struct{}, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		head := make([]byte, smallSync)
		n, err := io.ReadFull(r.Body, head)
		if err == nil { // the buffer is full, so there may be more
			select {
			case slots <- struct{}{}:
				defer func() { <-slots }()
			case <-r.Context().Done():
				return // gone while it waited
			}
		}
		// Anything else is the end of a small body, or a broken one that next will find broken.
		r.Body = struct {
			io.Reader
			io.Closer
		}{io.MultiReader(bytes.NewReader(head[:n]), r.Body), r.Body}
		next(w, r)
	}
}
