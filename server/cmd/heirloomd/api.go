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
	"heirloom/server/sync"
)

const (
	maxAccountBody = 4 << 10 // register, login, logout: a few short strings
	maxSyncBody    = 1 << 20 // the same 1 MB as a frame on the socket
)

// newAPI wires the routes of contracts/protocol.md. The hub comes back too, because its
// sockets outlive their HTTP requests and have to be closed by hand at shutdown.
func newAPI(db *sql.DB, now func() time.Time, sqliteVersion string) (http.Handler, *hub.Hub) {
	var h *hub.Hub
	accounts := auth.New(db, now, func(token string) { h.Kick(token) })
	h = hub.New(accounts, sync.New(db, now), now)

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
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write(health)
	})
	mux.HandleFunc("GET /api/ws", h.ServeWS)
	mux.HandleFunc("POST /api/sync", post(maxSyncBody, func(_ context.Context, req hub.SyncRequest) (hub.SyncReply, error) {
		return h.Sync(req)
	}))
	mux.HandleFunc("POST /api/register", post(maxAccountBody, func(ctx context.Context, c credentials) (auth.Session, error) {
		return accounts.Register(ctx, c.Invite, c.Username, c.Password, c.Device)
	}))
	mux.HandleFunc("POST /api/login", post(maxAccountBody, func(ctx context.Context, c credentials) (auth.Session, error) {
		return accounts.Login(ctx, c.Username, c.Password, c.Device)
	}))
	mux.HandleFunc("POST /api/logout", post(maxAccountBody, func(_ context.Context, c credentials) (struct{}, error) {
		return struct{}{}, accounts.Logout(c.Token)
	}))

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
