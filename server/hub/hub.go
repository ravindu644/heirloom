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
	"maps"
	"net/http"
	"reflect"
	"slices"
	gosync "sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"

	"heirloom/server/auth"
	"heirloom/server/rooms"
	"heirloom/server/sync"
)

const (
	maxFrame = 1 << 20 // bytes of one frame from a device
	// A hello is about 150 bytes. Until it has been checked nothing is known about the
	// sender, so it does not get a megabyte of our memory to say it in.
	maxHello     = 4 << 10
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
	// Minutes east of UTC, in a hello. A device that does not say changes nothing: the
	// last offset the account sent stands.
	UTCOffsetMin *int `json:"utc_offset_min"`
}

// The offsets the world uses run from UTC-12 to UTC+14. Saying nothing is allowed.
func validOffset(min *int) bool { return min == nil || *min >= -720 && *min <= 840 }

type welcomeMsg struct {
	Type       string `json:"type"`
	ServerTime int64  `json:"server_time"`
	Head       int64  `json:"head"`
	// Every room the account is in right now. A device drops any room not named here.
	Rooms []string `json:"rooms"`
	// The account's role now. A device keeps it only to choose what to show: the server
	// reads the role afresh on every call that needs one.
	Role string `json:"role"`
}

type roleMsg struct {
	Type string `json:"type"`
	Role string `json:"role"`
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
	// As in a hello: minutes east of UTC, and nothing changes when it is left out.
	UTCOffsetMin *int `json:"utc_offset_min"`
	Push         *struct {
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
	// Every room the account is in, as a socket would be told it.
	Rooms []*rooms.Message `json:"rooms"`
	// The account's role now, as a socket's welcome says it: a device that only ever
	// reaches the server by POST must hear it too.
	Role string `json:"role"`
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

	// Rooms that may read differently now. A room message is not queued: the connection's
	// own goroutine builds it when it gets there. So a burst of changes is one message, a
	// slow device is never owed more than one per room, and what is sent was true when it
	// was written, not when something changed.
	staleMu gosync.Mutex
	stale   map[int64]struct{}
	wake    chan struct{}
	// What this device was last told of each room, and when that room next changes by time
	// alone. Only the connection's own goroutine touches it.
	shown map[int64]shown
}

type shown struct {
	msg  *rooms.Message
	next int64
}

// mark says a room may have changed. It never blocks: it is called with Hub.mu held.
func (c *conn) mark(room int64) {
	c.staleMu.Lock()
	c.stale[room] = struct{}{}
	c.staleMu.Unlock()
	select {
	case c.wake <- struct{}{}:
	default: // already woken
	}
}

type Hub struct {
	auth  *auth.Service
	cells *sync.Store
	rooms *rooms.Service
	now   func() time.Time

	// mu makes "commit, then tell the others, then ack" one step. Two batches that commit
	// as 5-6 and 7-8 reach every queue in that order, and a device joins the live stream
	// only at a moment when nothing is between its cursor and the head.
	mu      gosync.Mutex
	conns   map[*conn]struct{}
	closed  bool
	serving gosync.WaitGroup

	// OnTimer, when set, is told each time an account's timer cell changes. It is called
	// with mu held, so it must not wait on anything: the bell for Web Push hangs here.
	OnTimer func(account int64)
}

func New(a *auth.Service, cells *sync.Store, r *rooms.Service, now func() time.Time) *Hub {
	return &Hub{auth: a, cells: cells, rooms: r, now: now, conns: map[*conn]struct{}{}}
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

// RoleChanged tells every open socket of an account its role, as the database holds it
// at this moment. It is called once a change is stored, so a device's settings follow the
// owner's decision at once and not at its next reconnect. The role is read here, under
// mu, and not passed in: two changes one after the other cannot then arrive the wrong
// way round with an old role last.
func (h *Hub) RoleChanged(account int64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	role, err := h.auth.Role(account)
	if ours(err) != nil {
		return
	}
	msg := encode(roleMsg{"role", role})
	for c := range h.conns {
		if c.account == account {
			c.send(msg)
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
	if h.rooms.Pushed(account, pushed.Won) {
		h.announceOf(account)
	}
	if h.OnTimer != nil && slices.ContainsFunc(pushed.Won, func(c sync.Cell) bool {
		return c.Dataset == "timer" && c.Row == "current" && c.Field == "state"
	}) {
		h.OnTimer(account)
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
	if req.Cursor == nil || *req.Cursor < 0 || !auth.ValidDevice(req.Device) || !validOffset(req.UTCOffsetMin) {
		return SyncReply{}, auth.ErrBadRequest
	}
	account, _, err := h.auth.Check(req.Token, req.Device)
	if err != nil {
		return SyncReply{}, err
	}
	if err := h.offset(account, req.UTCOffsetMin); err != nil {
		return SyncReply{}, err
	}
	reply := SyncReply{Rooms: []*rooms.Message{}}
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
	if reply.Role, err = h.auth.Role(account); err != nil {
		return SyncReply{}, err
	}
	in, err := h.rooms.Of(account)
	if err != nil {
		return SyncReply{}, err
	}
	for _, room := range in {
		msg, _, err := h.rooms.Message(room, account)
		if err != nil {
			return SyncReply{}, err
		}
		if msg != nil {
			reply.Rooms = append(reply.Rooms, msg)
		}
	}
	return reply, nil
}

// offset keeps the account's latest offset from UTC. A new one moves its "today", which
// every room it is in shows. A device that sent none (an older build) leaves it alone:
// taking that for UTC would move a person's midnight every time their old phone woke up.
func (h *Hub) offset(account int64, min *int) error {
	if min == nil {
		return nil
	}
	changed, err := h.rooms.SetOffset(account, *min)
	if err == nil && changed {
		h.mu.Lock()
		h.announceOf(account)
		h.mu.Unlock()
	}
	return err
}

// Announce says a room may read differently now: every connected device of its members
// looks again. A device is sent the room only if what it would be told has changed.
func (h *Hub) Announce(room int64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.announce(room)
}

// announce and announceOf want Hub.mu held. Failing to read who is in a room is logged
// and no more: what called this, a push or a join, has already happened.
func (h *Hub) announce(room int64) {
	members, err := h.rooms.Members(room)
	if ours(err) != nil {
		return
	}
	for c := range h.conns {
		// Membership is the wall: a device hears of a room only through its account being in it.
		if slices.Contains(members, c.account) {
			c.mark(room)
		}
	}
}

// AnnounceOf is Announce for every room the account is in: its picture changed.
func (h *Hub) AnnounceOf(account int64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.announceOf(account)
}

func (h *Hub) announceOf(account int64) {
	in, err := h.rooms.Of(account)
	if ours(err) != nil {
		return
	}
	for _, room := range in {
		h.announce(room)
	}
}

// Left has the account's own devices look at a room it has just left: Announce no longer
// reaches them, they are not members. Each one that was shown the room is told "gone" by
// tell, when it gets there and if the account is still out.
func (h *Hub) Left(account, room int64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.conns {
		if c.account == account {
			c.mark(room)
		}
	}
}

// tell sends this device each of these rooms as it is now, unless that is what the
// device was last told. server_time moves with every reading and is not a change.
//
// "Gone" is decided here too, from the same reading, and nowhere else. A device slow to
// look may find its account has left and come back: then it is told the room, never that
// it is gone, and what it holds matches what we remember showing it.
func (h *Hub) tell(c *conn, in []int64) error {
	for _, room := range in {
		msg, next, err := h.rooms.Message(room, c.account)
		if err != nil {
			return ours(err)
		}
		if msg == nil {
			// Left, or the room ended. Said once, to a device that was shown the room.
			if was, told := c.shown[room]; told {
				delete(c.shown, room)
				if err := c.write(encode(rooms.Gone{Type: "room", Room: was.msg.Room, Gone: true})); err != nil {
					return err
				}
			}
			continue
		}
		before := c.shown[room].msg
		c.shown[room] = shown{msg, next}
		if before != nil {
			was, is := *before, *msg
			// last_at_ms moves too while this moment of last week falls inside one of its laps,
			// and a screen does not move it on: neither is a change worth a message by itself.
			was.ServerTime, is.ServerTime = 0, 0
			was.LastAtMs, is.LastAtMs = 0, 0
			if reflect.DeepEqual(was, is) {
				continue
			}
		}
		if err := c.write(encode(msg)); err != nil {
			return err
		}
	}
	return nil
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
	c := &conn{ws: ws, cancel: cancel, out: make(chan []byte, queueFrames),
		stale: map[int64]struct{}{}, wake: make(chan struct{}, 1), shown: map[int64]shown{}}

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
	hello, err := c.read(helloTimeout, maxHello)
	if err != nil {
		return err
	}
	if hello.Type != "hello" || hello.Cursor == nil || *hello.Cursor < 0 || !auth.ValidDevice(hello.Device) || !validOffset(hello.UTCOffsetMin) {
		return bye{"protocol"}
	}
	if err := h.admit(c, hello.Token, hello.Device); err != nil {
		return err
	}
	head, err := h.cells.Head(c.account)
	if err != nil {
		return ours(err)
	}
	names, err := h.rooms.IDs(c.account)
	if err != nil {
		return ours(err)
	}
	role, err := h.auth.Role(c.account)
	if err != nil {
		return ours(err)
	}
	if err := c.write(encode(welcomeMsg{"welcome", h.now().UnixMilli(), head, names, role})); err != nil {
		return err
	}
	// Each of those rooms, straight after the welcome. The offset goes in first: it
	// decides which day "today" is in what is about to be sent.
	if err := h.offset(c.account, hello.UTCOffsetMin); err != nil {
		return ours(err)
	}
	in, err := h.rooms.Of(c.account)
	if err != nil {
		return ours(err)
	}
	if err := h.tell(c, in); err != nil {
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
	// One timer for the connection, set to the next bell or midnight in any room it has
	// been shown. Nobody pushes anything when a lap ends by time alone, and the room
	// must still say idle. It lives and dies with the connection.
	// It starts by firing at once, which sets it from what the welcome showed.
	bell := time.NewTimer(0)
	defer bell.Stop()
	for {
		var msg []byte
		var in []int64
		select {
		case <-ctx.Done():
			return context.Cause(ctx)
		case msg = <-c.out:
		case <-c.wake:
		case <-bell.C:
			in = slices.Collect(maps.Keys(c.shown))
		}
		// Whatever woke us, the rooms go first: a frame queued after a room changed is never
		// written ahead of the room's news.
		c.staleMu.Lock()
		in = slices.AppendSeq(in, maps.Keys(c.stale))
		clear(c.stale)
		c.staleMu.Unlock()
		if len(in) > 0 {
			if err := h.tell(c, in); err != nil {
				return err
			}
			bell.Stop()
			var next int64
			for _, s := range c.shown {
				if next == 0 || s.next < next {
					next = s.next
				}
			}
			if next != 0 {
				bell.Reset(time.UnixMilli(next).Sub(h.now()))
			}
		}
		if msg != nil {
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
		f, err := c.read(idleTimeout, maxFrame)
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

func (c *conn) read(wait time.Duration, limit int64) (frame, error) {
	ctx, cancel := context.WithTimeout(context.Background(), wait)
	defer cancel()
	_, r, err := c.ws.Reader(ctx)
	if err != nil {
		return frame{}, err
	}
	data, err := io.ReadAll(io.LimitReader(r, limit+1))
	if err != nil {
		return frame{}, err
	}
	var f frame
	if int64(len(data)) > limit || json.Unmarshal(data, &f) != nil {
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
