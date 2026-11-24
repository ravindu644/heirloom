// Package hub holds the devices' connections and passes each stored batch on to the
// account's other devices: contracts/protocol.md sections 4 and 5. It keeps one promise
// the device's cursor depends on: on one connection, everything goes out in sequence order.
package hub

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	gosync "sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"

	"heirloom/server/auth"
	"heirloom/server/sync"
)

const (
	maxFrame     = 1 << 20 // bytes of one frame from a device
	helloTimeout = 10 * time.Second
	// A device pings every 25 s. Two missed pings and it is gone; without this a phone that
	// walked out of wifi would hold its connection, and its memory, forever.
	idleTimeout  = 60 * time.Second
	writeTimeout = 10 * time.Second
	// What may wait for a device that reads slower than its account writes. Past either
	// bound the socket is closed and the device catches up by cursor, from SQLite.
	queueFrames = 256
	queueBytes  = 4 << 20
)

var (
	errSlow   = errors.New("device cannot keep up")
	errClosed = errors.New("server is shutting down")
)

// bye ends a connection for good, with the reason the device is told.
type bye struct{ reason string }

func (b bye) Error() string { return "bye: " + b.reason }

// frame is anything a device sends: the type says which fields matter.
type frame struct {
	Type   string            `json:"type"`
	Token  string            `json:"token"`
	Device string            `json:"device"`
	Cursor *int64            `json:"cursor"`
	Batch  string            `json:"batch"`
	Cells  []json.RawMessage `json:"cells"`
	T      json.RawMessage   `json:"t"`
}

type welcomeMsg struct {
	Type       string `json:"type"`
	ServerTime int64  `json:"server_time"`
	Head       int64  `json:"head"`
}

type cellsMsg struct {
	Type  string      `json:"type"`
	From  int64       `json:"from"`
	To    int64       `json:"to"`
	Cells []sync.Cell `json:"cells"`
}

type pongMsg struct {
	Type       string          `json:"type"`
	T          json.RawMessage `json:"t"`
	ServerTime int64           `json:"server_time"`
}

type byeMsg struct {
	Type   string `json:"type"`
	Reason string `json:"reason"`
}

// Ack and Nack answer a push. On a socket they carry their type; in the POST reply the
// key they sit under already says it.
type Ack struct {
	Type   string `json:"type,omitempty"`
	Batch  string `json:"batch"`
	From   int64  `json:"from"`
	Cursor int64  `json:"cursor"`
}

type Nack struct {
	Type       string `json:"type,omitempty"`
	Batch      string `json:"batch"`
	Reason     string `json:"reason"`
	ServerTime int64  `json:"server_time"`
}

// SyncRequest and SyncReply are the body and the answer of POST /api/sync.
type SyncRequest struct {
	Token  string `json:"token"`
	Device string `json:"device"`
	Cursor *int64 `json:"cursor"`
	Push   *struct {
		Batch string            `json:"batch"`
		Cells []json.RawMessage `json:"cells"`
	} `json:"push"`
}

type SyncReply struct {
	ServerTime int64       `json:"server_time"`
	Head       int64       `json:"head"`
	From       int64       `json:"from"`
	To         int64       `json:"to"`
	Cells      []sync.Cell `json:"cells"`
	Ack        *Ack        `json:"ack,omitempty"`
	Nack       *Nack       `json:"nack,omitempty"`
}

type conn struct {
	ws      *websocket.Conn
	account int64
	token   string
	cancel  context.CancelCauseFunc
	live    bool // caught up and getting other devices' pushes; guarded by Hub.mu
	out     chan []byte
	queued  atomic.Int64
	reader  gosync.WaitGroup
}

type Hub struct {
	auth  *auth.Service
	cells *sync.Store
	now   func() time.Time

	// mu makes "commit, then tell the others, then ack" one step. Two batches that commit
	// as 5-6 and 7-8 reach every queue in that order, and a device joins the live stream
	// only at a moment when nothing is between its cursor and the head.
	mu      gosync.Mutex
	conns   map[*conn]struct{}
	closed  bool
	serving gosync.WaitGroup
}

func New(a *auth.Service, cells *sync.Store, now func() time.Time) *Hub {
	return &Hub{auth: a, cells: cells, now: now, conns: map[*conn]struct{}{}}
}

// encode writes JSON without escaping < > &, so a value leaves as the device wrote it.
func encode(v any) []byte {
	var b bytes.Buffer
	e := json.NewEncoder(&b)
	e.SetEscapeHTML(false)
	if err := e.Encode(v); err != nil {
		// Every message is plain structs and values that were parsed on the way in.
		panic(err)
	}
	return b.Bytes()
}

// Kick ends every socket signed in with this token. The device is told to stop reconnecting.
func (h *Hub) Kick(token string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.conns {
		if c.token == token {
			c.cancel(bye{"token"})
		}
	}
}

// Close ends every socket and waits for their handlers, so the database can be closed
// with nothing mid-write. Devices reconnect when the server is back.
func (h *Hub) Close() {
	h.mu.Lock()
	h.closed = true
	for c := range h.conns {
		c.cancel(errClosed)
		c.ws.CloseNow() // a device that has not said hello yet is only waiting in a read
	}
	h.mu.Unlock()
	h.serving.Wait()
}

// push stores a batch and passes what it changed to the account's other live devices.
// The reply is an *Ack or a *Nack. An error is the server's own fault: nothing is
// answered, and the device sends the batch again.
func (h *Hub) push(account int64, from *conn, batch string, cells []json.RawMessage) (any, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	pushed, err := h.cells.Push(account, cells)
	if refused := (*sync.Refused)(nil); errors.As(err, &refused) {
		nack := &Nack{Batch: batch, Reason: refused.Reason, ServerTime: h.now().UnixMilli()}
		if from != nil {
			nack.Type = "nack"
			from.send(encode(nack))
		}
		return nack, nil
	} else if err != nil {
		return nil, err
	}
	if len(pushed.Won) > 0 {
		// Encoded once and shared: every other device gets the same bytes.
		live := encode(cellsMsg{"cells", pushed.From, pushed.Cursor, pushed.Won})
		for c := range h.conns {
			// The account check is the wall between accounts.
			if c.account == account && c.live && c != from {
				c.send(live)
			}
		}
	}
	ack := &Ack{Batch: batch, From: pushed.From, Cursor: pushed.Cursor}
	if from != nil {
		ack.Type = "ack"
		from.send(encode(ack))
	}
	return ack, nil
}

// Sync is POST /api/sync: the socket's exchange in one request. An *auth.Error says the
// token or the body was bad.
func (h *Hub) Sync(req SyncRequest) (SyncReply, error) {
	if req.Cursor == nil || *req.Cursor < 0 || !auth.ValidDevice(req.Device) {
		return SyncReply{}, auth.ErrBadRequest
	}
	account, _, err := h.auth.Check(req.Token, req.Device)
	if err != nil {
		return SyncReply{}, err
	}
	var reply SyncReply
	if req.Push != nil {
		answer, err := h.push(account, nil, req.Push.Batch, req.Push.Cells)
		if err != nil {
			return SyncReply{}, err
		}
		reply.Ack, _ = answer.(*Ack)
		reply.Nack, _ = answer.(*Nack)
	}
	head, err := h.cells.Head(account)
	if err != nil {
		return SyncReply{}, err
	}
	reply.From = startFrom(*req.Cursor, head)
	page, err := h.cells.Pull(account, reply.From)
	if err != nil {
		return SyncReply{}, err
	}
	// A push may have landed between the two reads; the head is never behind the page.
	reply.ServerTime, reply.Head, reply.To, reply.Cells = h.now().UnixMilli(), max(head, page.To), page.To, page.Cells
	return reply, nil
}

// A cursor past the head comes from a server whose data was restored from an older copy.
// That device's numbers mean nothing here, so it is sent everything; merging it is harmless.
func startFrom(cursor, head int64) int64 {
	if cursor > head {
		return 0
	}
	return cursor
}

// ServeWS is GET /api/ws.
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	// Any origin: there are no cookies, the token arrives in the hello (protocol section 10).
	ws, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
	if err != nil {
		return // Accept has already answered
	}
	defer ws.CloseNow()
	// We cap frames ourselves in read: the library's limit would close the socket before
	// we could say bye.
	ws.SetReadLimit(-1)
	ctx, cancel := context.WithCancelCause(context.Background())
	defer cancel(nil)
	c := &conn{ws: ws, cancel: cancel, out: make(chan []byte, queueFrames)}

	h.mu.Lock()
	if h.closed {
		h.mu.Unlock()
		return
	}
	// Listed before the hello, with no account yet, so Close can reach it.
	h.conns[c] = struct{}{}
	h.serving.Add(1)
	h.mu.Unlock()
	defer h.serving.Done()

	err = h.serve(ctx, c)
	h.mu.Lock()
	delete(h.conns, c)
	h.mu.Unlock()
	if b := (bye{}); errors.As(err, &b) && c.write(encode(byeMsg{"bye", b.reason})) == nil {
		ws.Close(websocket.StatusPolicyViolation, b.reason)
	}
	ws.CloseNow()
	c.reader.Wait()
}

// ours logs a failure of the server's own, as opposed to a device going away, and hands
// it back. The errors that pass through here come from SQLite and hold no cell values.
func ours(err error) error {
	if err != nil {
		log.Printf("socket: %v", err)
	}
	return err
}

// serve runs one connection and returns why it ended.
func (h *Hub) serve(ctx context.Context, c *conn) error {
	hello, err := c.read(helloTimeout)
	if err != nil {
		return err
	}
	if hello.Type != "hello" || hello.Cursor == nil || *hello.Cursor < 0 || !auth.ValidDevice(hello.Device) {
		return bye{"protocol"}
	}
	if err := h.admit(c, hello.Token, hello.Device); err != nil {
		return err
	}
	head, err := h.cells.Head(c.account)
	if err != nil {
		return ours(err)
	}
	if err := c.write(encode(welcomeMsg{"welcome", h.now().UnixMilli(), head})); err != nil {
		return err
	}

	// Catch up from SQLite a page at a time, until nothing is between the cursor and the head.
	for cursor := startFrom(*hello.Cursor, head); !c.live; {
		if ctx.Err() != nil {
			return context.Cause(ctx)
		}
		page, err := h.cells.Pull(c.account, cursor)
		if err != nil {
			return ours(err)
		}
		if len(page.Cells) == 0 {
			if err := h.goLive(c, cursor); err != nil {
				return ours(err)
			}
			continue
		}
		if err := c.write(encode(cellsMsg{"cells", cursor, page.To, page.Cells})); err != nil {
			return err
		}
		cursor = page.To
	}

	// The device's frames are read only from here on. Its pushes and pings wait in the
	// socket while it catches up, so it is never sent its own push back, and every ack it
	// gets starts at the number it has reached.
	c.reader.Go(func() { c.cancel(h.listen(c)) })
	for {
		select {
		case <-ctx.Done():
			return context.Cause(ctx)
		case msg := <-c.out:
			c.queued.Add(-int64(len(msg)))
			if err := c.write(msg); err != nil {
				return err
			}
		}
	}
}

// admit checks the token and gives the connection its account in one step, so a logout
// either fails the check or finds the connection to cut. Never neither.
func (h *Hub) admit(c *conn, token, device string) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	account, key, err := h.auth.Check(token, device)
	if errors.Is(err, auth.ErrToken) {
		return bye{"token"}
	} else if err != nil {
		return ours(err)
	}
	c.account, c.token = account, key
	return nil
}

// goLive adds the connection to the live stream if it has everything up to the head.
// It asks under mu, so no batch can commit between the question and the joining.
func (h *Hub) goLive(c *conn, cursor int64) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	head, err := h.cells.Head(c.account)
	c.live = err == nil && head <= cursor
	return err
}

// listen reads the device's frames until the socket ends.
func (h *Hub) listen(c *conn) error {
	for {
		f, err := c.read(idleTimeout)
		if err != nil {
			return err
		}
		switch f.Type {
		case "ping":
			c.send(encode(pongMsg{"pong", f.T, h.now().UnixMilli()}))
		case "push":
			if _, err := h.push(c.account, c, f.Batch, f.Cells); err != nil {
				return ours(err)
			}
		}
		// Any other type is ignored, as the protocol asks of both sides.
	}
}

func (c *conn) read(wait time.Duration) (frame, error) {
	ctx, cancel := context.WithTimeout(context.Background(), wait)
	defer cancel()
	_, r, err := c.ws.Reader(ctx)
	if err != nil {
		return frame{}, err
	}
	data, err := io.ReadAll(io.LimitReader(r, maxFrame+1))
	if err != nil {
		return frame{}, err
	}
	var f frame
	if len(data) > maxFrame || json.Unmarshal(data, &f) != nil {
		return frame{}, bye{"protocol"}
	}
	return f, nil
}

// write does not hang on the connection's own context: a write cut short would close the
// socket under the bye that is about to be sent.
func (c *conn) write(msg []byte) error {
	ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
	defer cancel()
	return c.ws.Write(ctx, websocket.MessageText, msg)
}

// send queues a message and never blocks: it is called with Hub.mu held.
func (c *conn) send(msg []byte) {
	if c.queued.Add(int64(len(msg))) > queueBytes {
		c.cancel(errSlow)
		return
	}
	select {
	case c.out <- msg:
	default:
		c.cancel(errSlow)
	}
}
