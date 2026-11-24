// Package web serves the built web app out of the binary, so the server is still one file.
package web

import (
	"bytes"
	"compress/gzip"
	"embed"
	"fmt"
	"io/fs"
	"net/http"
	"path"
	"strconv"
	"strings"
)

// The Makefile copies client/dist here before it builds. A fresh clone holds only .keep,
// which is why the pattern says all: without it a folder of dotfiles embeds nothing and
// the build fails.
//
//go:embed all:dist
var dist embed.FS

// CSP allows what the app does and nothing else. The device's token lives in IndexedDB,
// where any script on the page can read it, so the point is that no script but ours runs.
//
//	default-src 'none'               whatever is not named below is refused
//	script-src 'self'                our own files only: no inline script, no eval
//	style-src 'self'                 our own stylesheet
//	style-src-attr 'unsafe-inline'   the bars set their width in a style attribute
//	font-src 'self'                  the Barlow files in /assets
//	connect-src 'self'               fetch and the socket, to this server (http to ws, https to wss)
//	base-uri 'none'                  an injected <base> cannot repoint our relative paths
//	form-action 'none'               the app posts no forms, so nothing can be made to
//	frame-ancestors 'none'           nobody frames the app to trick a tap out of someone
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; " +
	"font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

// Missing is what / answers when the binary was built without the web app.
const Missing = "This heirloomd was built without the web app: build it with make server."

// Ours, not mime.TypeByExtension: that one reads the system's tables, and the phone's
// container has none. Types that are text are gzipped; the rest are compressed already.
var types = map[string]struct {
	name string
	text bool
}{
	".html":        {"text/html; charset=utf-8", true},
	".js":          {"text/javascript; charset=utf-8", true},
	".css":         {"text/css; charset=utf-8", true},
	".json":        {"application/json", true},
	".webmanifest": {"application/manifest+json", true},
	".svg":         {"image/svg+xml", true},
	".txt":         {"text/plain; charset=utf-8", true},
	".woff2":       {"font/woff2", false},
	".png":         {"image/png", false},
	".ico":         {"image/x-icon", false},
}

type file struct {
	body, gzipped []byte // gzipped is nil when the file is not text or would not shrink
	contentType   string
	cache         string
}

// App serves the build that was embedded when this binary was made.
func App() (http.Handler, error) {
	built, err := fs.Sub(dist, "dist")
	if err != nil {
		return nil, fmt.Errorf("open embedded web app: %w", err)
	}
	return Handler(built)
}

// Handler serves the files of a build: / is index.html, and a path that is not a file is
// a 404. The app routes by hash, so there is no falling back to index.html.
//
// Everything is read, and the text gzipped, once, here. A request is then one map lookup
// by exact name, so no path, however it is spelled, reaches anything but these files.
func Handler(built fs.FS) (http.Handler, error) {
	files := map[string]file{}
	zw, _ := gzip.NewWriterLevel(nil, gzip.BestCompression) // the level is a constant, so no error
	err := fs.WalkDir(built, ".", func(name string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || strings.HasPrefix(d.Name(), ".") {
			return err
		}
		body, err := fs.ReadFile(built, name)
		if err != nil {
			return err
		}
		kind, known := types[path.Ext(name)]
		if !known {
			kind.name = "application/octet-stream"
		}
		// Vite puts a hash of the content in every name under assets/, so those never
		// change. Anything else is asked about again, and a new build shows at the next load.
		f := file{body: body, contentType: kind.name, cache: "no-cache"}
		if strings.HasPrefix(name, "assets/") {
			f.cache = "public, max-age=31536000, immutable"
		}
		if kind.text {
			var small bytes.Buffer
			zw.Reset(&small)
			zw.Write(body)
			zw.Close()
			if small.Len() < len(body) {
				f.gzipped = small.Bytes()
			}
		}
		files["/"+name] = f
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("read web app: %w", err)
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy", CSP)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		name := r.URL.Path
		if name == "/" {
			name = "/index.html"
		}
		f, ok := files[name]
		if !ok {
			if _, built := files["/index.html"]; !built && r.URL.Path == "/" {
				http.Error(w, Missing, http.StatusNotFound)
				return
			}
			http.NotFound(w, r)
			return
		}
		body := f.body
		if f.gzipped != nil {
			// A cache between us and the browser must keep the two forms apart.
			h.Set("Vary", "Accept-Encoding")
			if acceptsGzip(r.Header.Get("Accept-Encoding")) {
				h.Set("Content-Encoding", "gzip")
				body = f.gzipped
			}
		}
		h.Set("Content-Type", f.contentType)
		h.Set("Cache-Control", f.cache)
		h.Set("Content-Length", strconv.Itoa(len(body)))
		w.Write(body) // net/http drops the body of a HEAD by itself
	}), nil
}

// acceptsGzip reads an Accept-Encoding header: gzip (or *) listed, and not with q=0.
func acceptsGzip(header string) bool {
	for part := range strings.SplitSeq(header, ",") {
		coding, params, _ := strings.Cut(strings.TrimSpace(part), ";")
		if coding = strings.TrimSpace(coding); coding != "gzip" && coding != "*" {
			continue
		}
		q := strings.TrimPrefix(strings.ReplaceAll(params, " ", ""), "q=")
		if v, err := strconv.ParseFloat(q, 64); params == "" || err != nil || v > 0 {
			return true
		}
	}
	return false
}
