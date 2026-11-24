package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"heirloom/server/auth"
	"heirloom/server/hub"
	"heirloom/server/push"
	"heirloom/server/rooms"
	"heirloom/server/sync"
)

const (
	maxPushBody    = 8 << 10 // a subscription and thirteen sentences of up to 80 characters
	maxAccountBody = 4 << 10 // register, login, logout: a few short strings
	maxSyncBody    = 1 << 20 // the same 1 MB as a frame on the socket
)

// newAPI wires the routes of contracts/protocol.md, and the web app under everything
// else. The hub comes back too, because its sockets outlive their HTTP requests and have
// to be closed by hand at shutdown.
func newAPI(db *sql.DB, now func() time.Time, sqliteVersion string, app http.Handler, bells *push.Service) (http.Handler, *hub.Hub) {
	var h *hub.Hub
	accounts := auth.New(db, now, func(token string) { h.Kick(token) })
	cells := sync.New(db, now)
	together := rooms.New(db, cells, now)
	h = hub.New(accounts, cells, together, now)
	if bells != nil {
		h.OnTimer = bells.TimerChanged
	}

	// The e2e run polls /healthz and reads these three fields; the shape is fixed.
	health, err := json.Marshal(struct {
		OK      bool   `json:"ok"`
		Version string `json:"version"`
		SQLite  string `json:"sqlite"`
	}{true, version, sqliteVersion})
	if err != nil {
		panic(err) // two strings and a bool always marshal
	}

	type credentials struct {
		Invite   string `json:"invite"`
		Username string `json:"username"`
		Password string `json:"password"`
		Device   string `json:"device"`
		Token    string `json:"token"`
	}
	mux := http.NewServeMux()
	mux.Handle("GET /", app) // GET and HEAD; the mux answers any other method with 405
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write(health)
	})
	mux.HandleFunc("GET /api/ws", h.ServeWS)
	mux.HandleFunc("POST /api/sync", bigBodies(make(chan struct{}, maxBigSyncs), post(maxSyncBody, func(_ context.Context, req hub.SyncRequest) (hub.SyncReply, error) {
		return h.Sync(req)
	})))
	mux.HandleFunc("POST /api/register", post(maxAccountBody, func(ctx context.Context, c credentials) (auth.Session, error) {
		return accounts.Register(ctx, c.Invite, c.Username, c.Password, c.Device)
	}))
	mux.HandleFunc("POST /api/login", post(maxAccountBody, func(ctx context.Context, c credentials) (auth.Session, error) {
		return accounts.Login(ctx, c.Username, c.Password, c.Device)
	}))
	mux.HandleFunc("POST /api/logout", post(maxAccountBody, func(_ context.Context, c credentials) (struct{}, error) {
		return struct{}{}, accounts.Logout(c.Token)
	}))

	// Web Push at the bell (protocol section 17). The key is public: a browser needs it
	// before it has anything to sign in with. Signing out removes a device's subscription
	// by itself: the row hangs on the token's.
	type pushRequest struct {
		Token        string            `json:"token"`
		Device       string            `json:"device"`
		Subscription push.Subscription `json:"subscription"`
		Words        push.Words        `json:"words"`
	}
	mux.HandleFunc("GET /api/push/key", func(w http.ResponseWriter, _ *http.Request) {
		reply(w, http.StatusOK, map[string]string{"key": bells.Key()})
	})
	ring := func(path string, do func(account int64, req pushRequest) error) {
		mux.HandleFunc("POST /api/push/"+path, post(maxPushBody, func(_ context.Context, req pushRequest) (struct{}, error) {
			if !auth.ValidDevice(req.Device) {
				return struct{}{}, auth.ErrBadRequest
			}
			account, _, err := accounts.Check(req.Token, req.Device)
			if err != nil {
				return struct{}{}, err
			}
			return struct{}{}, do(account, req)
		}))
	}
	ring("subscribe", func(account int64, req pushRequest) error {
		return bells.Subscribe(account, req.Device, req.Subscription, req.Words)
	})
	ring("unsubscribe", func(account int64, req pushRequest) error {
		return bells.Unsubscribe(account, req.Device)
	})

	// Rooms (protocol section 15). Every request names its device as /api/sync does, and
	// after each the hub has the members' devices look at the room again.
	type roomRequest struct {
		Token    string  `json:"token"`
		Device   string  `json:"device"`
		Room     string  `json:"room"`
		Code     string  `json:"code"`
		Name     *string `json:"name"`
		TargetMs *int64  `json:"target_ms"`
		Ranked   *bool   `json:"ranked"`
		To       string  `json:"to"`
		Run      string  `json:"run"`
	}
	type roomReply struct {
		Room string `json:"room,omitempty"`
	}
	room := func(path string, do func(account int64, req roomRequest) (public string, room int64, err error)) {
		mux.HandleFunc("POST /api/rooms/"+path, post(maxAccountBody, func(_ context.Context, req roomRequest) (roomReply, error) {
			if !auth.ValidDevice(req.Device) {
				return roomReply{}, auth.ErrBadRequest
			}
			account, _, err := accounts.Check(req.Token, req.Device)
			if err != nil {
				return roomReply{}, err
			}
			public, id, err := do(account, req)
			if err != nil {
				return roomReply{}, err
			}
			h.Announce(id)
			return roomReply{public}, nil
		}))
	}
	room("create", func(account int64, req roomRequest) (string, int64, error) {
		if req.Name == nil {
			return "", 0, auth.ErrBadRequest
		}
		return together.Create(account, *req.Name)
	})
	room("join", func(account int64, req roomRequest) (string, int64, error) {
		return together.Join(account, req.Code)
	})
	room("leave", func(account int64, req roomRequest) (string, int64, error) {
		id, err := together.Leave(account, req.Room)
		if err == nil {
			h.Left(account, id, req.Room)
		}
		return "", id, err
	})
	room("update", func(account int64, req roomRequest) (string, int64, error) {
		id, err := together.Update(account, req.Room, req.Name, req.TargetMs, req.Ranked)
		return "", id, err
	})
	room("cheer", func(account int64, req roomRequest) (string, int64, error) {
		id, err := together.Cheer(account, req.Room, req.To, req.Run)
		return "", id, err
	})

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			// Any origin may ask: the phone app's WebView is one. Nothing rides along with a
			// request by itself (no cookies), so there is nothing here for another site to borrow.
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Expose-Headers", "Retry-After")
			if r.Method == http.MethodOptions {
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
				w.Header().Set("Access-Control-Max-Age", "86400")
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		mux.ServeHTTP(w, r)
	}), h
}

// post is every JSON route: a capped body in, the answer or the protocol's error out.
func post[Req, Res any](limit int64, do func(context.Context, Req) (Res, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req Req
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, limit)).Decode(&req); err != nil {
			reply(w, http.StatusBadRequest, auth.ErrBadRequest)
			return
		}
		res, err := do(r.Context(), req)
		var known *auth.Error
		switch {
		case err == nil:
			reply(w, http.StatusOK, res)
		case errors.As(err, &known):
			reply(w, known.Status, known)
		default:
			// The request went away or something of ours broke. The error never holds a
			// password, a token or a cell value: nothing below puts one in.
			if r.Context().Err() == nil {
				log.Printf("%s: %v", r.URL.Path, err)
			}
			reply(w, http.StatusInternalServerError, &auth.Error{Code: "server"})
		}
	}
}

func reply(w http.ResponseWriter, status int, body any) {
	if e, ok := body.(*auth.Error); ok {
		if e.RetryAfter > 0 {
			w.Header().Set("Retry-After", strconv.Itoa(e.RetryAfter))
		}
		body = map[string]string{"error": e.Code}
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false) // cell values leave as they came
	enc.Encode(body)
}
