package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"heirloom/server/store"
)

func TestHealthz(t *testing.T) {
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	// One account, so this is a server in ordinary use: the three fields and no more.
	if _, err := db.Exec("insert into account (public_id, username, password, created, role) values ('a', 'ravi', '', 0, 'owner')"); err != nil {
		t.Fatal(err)
	}
	h, _ := newAPI(db, time.Now, "3.51.3", http.NotFoundHandler(), nil)

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /healthz = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", got)
	}
	// Byte for byte: the e2e run in tests/ reads this shape.
	if got, want := rec.Body.String(), `{"ok":true,"version":"dev","sqlite":"3.51.3"}`; got != want {
		t.Errorf("body = %s, want %s", got, want)
	}

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/healthz", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("POST /healthz = %d, want 405", rec.Code)
	}
}
