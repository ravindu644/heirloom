// heirloomd is the heirloom server: one binary, one SQLite file.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"heirloom/server/store"
)

// Set by the Makefile with -X main.version=...
var version = "dev"

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "heirloomd:", err)
		os.Exit(1)
	}
}

func run() error {
	addr := flag.String("addr", "127.0.0.1:8787", "address to listen on")
	data := flag.String("data", "./data", "directory for the database, created if missing")
	showVersion := flag.Bool("version", false, "print the version and exit")
	flag.Parse()

	sqliteVersion, err := store.SQLiteVersion()
	if err != nil {
		return err
	}
	if *showVersion {
		fmt.Printf("heirloomd %s sqlite %s\n", version, sqliteVersion)
		return nil
	}

	db, err := store.Open(*data)
	if err != nil {
		return err
	}
	defer db.Close()

	// Listen before the start line, so a taken port is an error and not a lie in the log.
	ln, err := net.Listen("tcp", *addr)
	if err != nil {
		return fmt.Errorf("start: %w", err) // net's error already names the address
	}
	// Without a header timeout one idle client can hold a connection open forever.
	srv := &http.Server{Handler: handler(sqliteVersion), ReadHeaderTimeout: 10 * time.Second}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	served := make(chan error, 1)
	go func() { served <- srv.Serve(ln) }()
	log.Printf("heirloomd %s sqlite %s listening on %s", version, sqliteVersion, ln.Addr())

	select {
	case err := <-served:
		return fmt.Errorf("serve: %w", err)
	case <-ctx.Done():
	}
	// A second signal now kills the process the default way instead of being swallowed.
	stop()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shut down: %w", err)
	}
	if err := <-served; !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("serve: %w", err)
	}
	// Closing the last connection checkpoints the WAL and removes the -wal and -shm files.
	if err := db.Close(); err != nil {
		return fmt.Errorf("close database: %w", err)
	}
	return nil
}

func handler(sqliteVersion string) http.Handler {
	// The e2e run polls /healthz and reads these three fields; the shape is fixed.
	body, err := json.Marshal(struct {
		OK      bool   `json:"ok"`
		Version string `json:"version"`
		SQLite  string `json:"sqlite"`
	}{true, version, sqliteVersion})
	if err != nil {
		panic(err) // two strings and a bool always marshal
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write(body)
	})
	return mux
}
