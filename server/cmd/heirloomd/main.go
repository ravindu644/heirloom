// heirloomd is the heirloom server: one binary, one SQLite file.
package main

import (
	"context"
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

	"heirloom/server/auth"
	"heirloom/server/store"
	"heirloom/server/web"
)

// Set by the Makefile with -X main.version=...
var version = "dev"

// How often the server asks whether today has its backup yet. The copy itself is made
// once a day; this only decides how soon after midnight UTC, and after a start.
const backupCheck = 10 * time.Minute

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
	invite := flag.Bool("invite", false, "print one invite code for the database in -data and exit")
	flag.Parse()

	sqliteVersion, err := store.SQLiteVersion()
	if err != nil {
		return err
	}
	if *showVersion {
		fmt.Printf("heirloomd %s sqlite %s\n", version, sqliteVersion)
		return nil
	}

	if *invite {
		code, err := newInvite(*data)
		if err != nil {
			return err
		}
		fmt.Println(code)
		return nil
	}

	db, err := store.Open(*data)
	if err != nil {
		return err
	}
	defer db.Close()

	// Listen before the start line, so a taken port is an error and not a lie in the log.
	tcp, err := net.Listen("tcp", *addr)
	if err != nil {
		return fmt.Errorf("start: %w", err) // net's error already names the address
	}
	ln := limit(tcp, maxConns)
	app, err := web.App()
	if err != nil {
		return err
	}
	api, sockets := newAPI(db, time.Now, sqliteVersion, app)
	// Without these one idle client can hold a connection, and a megabyte of body, forever.
	// A socket is not cut by them: the deadlines are lifted when it takes the connection over.
	srv := &http.Server{Handler: api, ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 30 * time.Second, IdleTimeout: 2 * time.Minute}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	served := make(chan error, 1)
	go func() { served <- srv.Serve(ln) }()
	log.Printf("heirloomd %s sqlite %s listening on %s", version, sqliteVersion, ln.Addr())

	// The daily copy, from inside the server: no second process, no cron line to forget.
	// A failure is one line in the log and nothing more; tomorrow it is tried again.
	backedUp := make(chan struct{})
	go func() {
		defer close(backedUp)
		backups := store.NewBackups(*data)
		every := time.NewTicker(backupCheck)
		defer every.Stop()
		for {
			// The error names files and SQLite's complaint, never what is in the database.
			if _, err := backups.Tick(time.Now()); err != nil {
				log.Printf("backup: %v", err)
			}
			select {
			case <-ctx.Done():
				return
			case <-every.C:
			}
		}
	}()

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
	// Shutdown does not know about sockets. Close them and wait, so nothing is mid-write.
	sockets.Close()
	// A copy in the making has its own connection. Let it finish: ours must be the last
	// to close, or the -wal file is left behind.
	<-backedUp
	// Closing the last connection checkpoints the WAL and removes the -wal and -shm files.
	if err := db.Close(); err != nil {
		return fmt.Errorf("close database: %w", err)
	}
	return nil
}

// newInvite is "heirloomd -invite". It opens the database for itself, which is safe beside
// a running server: SQLite lets a second process write between the first one's commits.
func newInvite(data string) (string, error) {
	db, err := store.Open(data)
	if err != nil {
		return "", err
	}
	defer db.Close()
	return auth.New(db, time.Now, nil).Invite()
}
