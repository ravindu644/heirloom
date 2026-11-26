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
	maxPushBody    = 8 << 10  // a subscription and thirteen sentences of up to 80 characters
	maxAccountBody = 4 << 10  // register, login, logout: a few short strings
	maxPictureBody = 20 << 10 // 12000 bytes of picture as base64, and the token beside it
	maxSyncBody    = 1 << 20  // the same 1 MB as a frame on the socket
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
	accounts.OnRole = h.RoleChanged
	if bells != nil {
		h.OnTimer = bells.TimerChanged
	}

	// The e2e run polls /healthz and reads these three fields; the shape is fixed. A
	// server nobody has registered on yet says so with a fourth, and stops saying it for
	// good once somebody has: that is all a stranger may learn before signing in.
	type health struct {
		OK      bool   `json:"ok"`
		Version string `json:"version"`
		SQLite  string `json:"sqlite"`
		Setup   bool   `json:"setup,omitempty"`
	}
	settled, err1 := json.Marshal(health{true, version, sqliteVersion, false})
	fresh, err2 := json.Marshal(health{true, version, sqliteVersion, true})
	if err := errors.Join(err1, err2); err != nil {
		panic(err) // two strings and two bools always marshal
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
		if accounts.Fresh() {
			w.Write(fresh)
			return
		}
		w.Write(settled)
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

	// Invitations and admins (protocol section 10). The caller's role is read from the
	// database inside each call: nothing a device says about itself is believed.
	type staffRequest struct {
		Token    string `json:"token"`
		Device   string `json:"device"`
		Invite   string `json:"invite"`
		Username string `json:"username"`
		Role     string `json:"role"`
	}
	staff := func(path string, do func(caller int64, req staffRequest) (any, error)) {
		mux.HandleFunc("POST /api/"+path, post(maxAccountBody, func(_ context.Context, req staffRequest) (any, error) {
			if !auth.ValidDevice(req.Device) {
				return nil, auth.ErrBadRequest
			}
			caller, _, err := accounts.Check(req.Token, req.Device)
			if err != nil {
				return nil, err
			}
			return do(caller, req)
		}))
	}
	one := func(inv auth.Invitation, err error) (any, error) {
		return map[string]auth.Invitation{"invite": inv}, err
	}
	staff("invites/create", func(caller int64, _ staffRequest) (any, error) { return one(accounts.CreateInvite(caller)) })
	staff("invites/renew", func(caller int64, req staffRequest) (any, error) {
		return one(accounts.RenewInvite(caller, req.Invite))
	})
	staff("invites/list", func(caller int64, _ staffRequest) (any, error) {
		open, err := accounts.Invites(caller)
		return map[string][]auth.Invitation{"invites": open}, err
	})
	staff("invites/revoke", func(caller int64, req staffRequest) (any, error) {
		return struct{}{}, accounts.RevokeInvite(caller, req.Invite)
	})
	staff("admins/list", func(caller int64, _ staffRequest) (any, error) {
		admins, err := accounts.Admins(caller)
		return map[string][]auth.Person{"admins": admins}, err
	})
	staff("admins/set", func(caller int64, req staffRequest) (any, error) {
		return struct{}{}, accounts.SetRole(caller, req.Username, req.Role)
	})

	// A way back in. The owner's three calls are like the ones above. The two below them
	// carry no token: the link is the whole of the caller's standing, and whoever holds it
	// is told one username, the one it was made for, and nothing else about anybody.
	staff("resets/create", func(caller int64, req staffRequest) (any, error) {
		made, err := accounts.CreateReset(caller, req.Username)
		return map[string]auth.Reset{"reset": made}, err
	})
	staff("resets/list", func(caller int64, _ staffRequest) (any, error) {
		open, err := accounts.Resets(caller)
		return map[string][]auth.Reset{"resets": open}, err
	})
	staff("resets/revoke", func(caller int64, req staffRequest) (any, error) {
		return struct{}{}, accounts.RevokeReset(caller, req.Username)
	})
	type resetRequest struct {
		Reset    string `json:"reset"`
		Password string `json:"password"`
		Device   string `json:"device"`
	}
	mux.HandleFunc("POST /api/reset/look", post(maxAccountBody, func(_ context.Context, req resetRequest) (map[string]string, error) {
		username, err := accounts.LookReset(req.Reset)
		return map[string]string{"username": username}, err
	}))
	mux.HandleFunc("POST /api/reset", post(maxAccountBody, func(ctx context.Context, req resetRequest) (auth.Session, error) {
		return accounts.UseReset(ctx, req.Reset, req.Password, req.Device)
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
		Member   string  `json:"member"`
		Text     string  `json:"text"`
		At       *int64  `json:"at"` // null or left out: take one's own call back
		Call     string  `json:"call"`
		In       *bool   `json:"in"`
	}
	type roomReply struct {
		Room string `json:"room,omitempty"`
	}
	// do answers with the reply, and the room the members' devices are to look at again:
	// 0 for a request that changed nothing.
	answer := func(path string, do func(account int64, req roomRequest) (reply any, room int64, err error)) {
		mux.HandleFunc("POST /api/"+path, post(maxAccountBody, func(_ context.Context, req roomRequest) (any, error) {
			if !auth.ValidDevice(req.Device) {
				return nil, auth.ErrBadRequest
			}
			account, _, err := accounts.Check(req.Token, req.Device)
			if err != nil {
				return nil, err
			}
			reply, id, err := do(account, req)
			if err != nil {
				return nil, err
			}
			if id != 0 {
				h.Announce(id)
			}
			return reply, nil
		}))
	}
	room := func(path string, do func(account int64, req roomRequest) (public string, room int64, err error)) {
		answer("rooms/"+path, func(account int64, req roomRequest) (any, int64, error) {
			public, id, err := do(account, req)
			return roomReply{public}, id, err
		})
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
			h.Left(account, id)
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
	answer("rooms/remove", func(account int64, req roomRequest) (any, int64, error) {
		id, removed, err := together.Remove(account, req.Room, req.Member)
		if err == nil && removed != 0 {
			h.Left(removed, id) // their devices are told "gone"; Announce reaches members only
		}
		return struct{}{}, id, err
	})
	answer("rooms/note", func(account int64, req roomRequest) (any, int64, error) {
		note, id, err := together.Note(account, req.Room, req.Text)
		return map[string]string{"note": note}, id, err
	})
	answer("rooms/notes", func(account int64, req roomRequest) (any, int64, error) {
		notes, err := together.Notes(account, req.Room)
		return map[string][]rooms.Note{"notes": notes}, 0, err
	})
	answer("rooms/call", func(account int64, req roomRequest) (any, int64, error) {
		call, id, err := together.Call(account, req.Room, req.At)
		if call == "" {
			return struct{}{}, id, err
		}
		return map[string]string{"call": call}, id, err
	})
	answer("rooms/in", func(account int64, req roomRequest) (any, int64, error) {
		if req.In == nil {
			return nil, 0, auth.ErrBadRequest
		}
		id, err := together.In(account, req.Room, req.Call, *req.In)
		return struct{}{}, id, err
	})

	// A picture, for every room the account is in. Its bytes are never logged.
	type pictureRequest struct {
		Token   string  `json:"token"`
		Device  string  `json:"device"`
		Picture *string `json:"picture"`
	}
	mux.HandleFunc("POST /api/me/picture", post(maxPictureBody, func(_ context.Context, req pictureRequest) (any, error) {
		if !auth.ValidDevice(req.Device) {
			return nil, auth.ErrBadRequest
		}
		account, _, err := accounts.Check(req.Token, req.Device)
		if err != nil {
			return nil, err
		}
		hash, changed, err := together.SetPicture(account, req.Picture)
		if err != nil {
			return nil, err
		}
		if changed {
			h.AnnounceOf(account)
		}
		if hash == "" {
			return struct{}{}, nil
		}
		return map[string]string{"picture": hash}, nil
	}))
	mux.HandleFunc("GET /api/pictures/{hash}", func(w http.ResponseWriter, r *http.Request) {
		token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		account, err := accounts.Bearer(token)
		if !ok || errors.Is(err, auth.ErrToken) {
			reply(w, http.StatusUnauthorized, auth.ErrToken)
			return
		}
		var data []byte
		var kind string
		if err == nil {
			data, kind, err = together.Picture(account, r.PathValue("hash"))
		}
		var known *auth.Error
		if errors.As(err, &known) {
			reply(w, known.Status, known)
			return
		} else if err != nil {
			log.Printf("%s: %v", r.URL.Path, err)
			reply(w, http.StatusInternalServerError, &auth.Error{Code: "server"})
			return
		}
		// A new picture is a new hash, so this one never changes: the device keeps it.
		w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
		w.Header().Set("Content-Type", kind)
		w.Write(data)
	})

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/healthz" {
			// Any origin may ask: the phone app's WebView is one. Nothing rides along with a
			// request by itself (no cookies), so there is nothing here for another site to borrow.
			// /healthz is in this because that app asks it first, from its other origin, whether
			// an address is a heirloom server at all and whether it still needs setting up.
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Expose-Headers", "Retry-After")
			if r.Method == http.MethodOptions {
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
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
