package web

import (
	"bytes"
	"compress/gzip"
	"io"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"testing/fstest"
)

// A build shaped like Vite's: index.html at the top, hashed names under assets/.
var (
	index  = "<!doctype html><title>heirloom</title>" + strings.Repeat("<p>focus</p>", 50)
	script = strings.Repeat("export const lap = 25 * 60 * 1000;\n", 200)
	font   = bytes.Repeat([]byte("wOF2 pretend this is compressed already "), 100)
	build  = fstest.MapFS{
		"index.html":              {Data: []byte(index)},
		"assets/index-DAknYR.js":  {Data: []byte(script)},
		"assets/index-D08sMp.css": {Data: []byte(strings.Repeat(".lap{color:red}", 100))},
		"assets/barlow-600.woff2": {Data: font},
		"assets/tiny.css":         {Data: []byte("a{}")},
		".keep":                   {},
	}
)

func app(t *testing.T, built fs.FS) http.Handler {
	t.Helper()
	h, err := Handler(built)
	if err != nil {
		t.Fatal(err)
	}
	return h
}

func get(h http.Handler, path, acceptEncoding string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "http://heirloom.test/", nil)
	// Set after the fact, so a path a browser would never send still arrives as written.
	req.URL.Path = path
	if acceptEncoding != "" {
		req.Header.Set("Accept-Encoding", acceptEncoding)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestIndexIsServedFreshAndLockedDown(t *testing.T) {
	rec := get(app(t, build), "/", "")
	if rec.Code != 200 || rec.Body.String() != index {
		t.Fatalf("/ = %d %q, want index.html", rec.Code, rec.Body.String())
	}
	for header, want := range map[string]string{
		"Content-Type":            "text/html; charset=utf-8",
		"Cache-Control":           "no-cache",
		"X-Content-Type-Options":  "nosniff",
		"Referrer-Policy":         "no-referrer",
		"Content-Security-Policy": CSP,
	} {
		if got := rec.Header().Get(header); got != want {
			t.Errorf("%s = %q, want %q", header, got, want)
		}
	}
}

// The policy is the thing between an injected script and the device's token, so its
// promises are spelled out here: a looser one must fail a test, not pass a review.
func TestPolicyAllowsOnlyWhatTheAppDoes(t *testing.T) {
	policy := map[string]string{}
	for directive := range strings.SplitSeq(CSP, ";") {
		name, sources, _ := strings.Cut(strings.TrimSpace(directive), " ")
		policy[name] = sources
	}
	for name, want := range map[string]string{
		"default-src":     "'none'",
		"script-src":      "'self'",
		"style-src":       "'self'",
		"style-src-attr":  "'unsafe-inline'",
		"font-src":        "'self'",
		"connect-src":     "'self'",
		"base-uri":        "'none'",
		"form-action":     "'none'",
		"frame-ancestors": "'none'",
	} {
		if policy[name] != want {
			t.Errorf("%s is %q, want %q", name, policy[name], want)
		}
		delete(policy, name)
	}
	if len(policy) != 0 {
		t.Errorf("the policy also says %v: say here why the app needs it", policy)
	}
}

func TestAssetsAreCachedForAYear(t *testing.T) {
	h := app(t, build)
	for path, want := range map[string]string{
		"/assets/index-DAknYR.js":  "text/javascript; charset=utf-8",
		"/assets/index-D08sMp.css": "text/css; charset=utf-8",
		"/assets/barlow-600.woff2": "font/woff2",
	} {
		rec := get(h, path, "")
		if rec.Code != 200 || rec.Header().Get("Content-Type") != want {
			t.Errorf("%s = %d %q, want 200 %q", path, rec.Code, rec.Header().Get("Content-Type"), want)
		}
		if got := rec.Header().Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
			t.Errorf("%s Cache-Control = %q, want a year and immutable", path, got)
		}
		if rec.Header().Get("X-Content-Type-Options") != "nosniff" {
			t.Errorf("%s is served without nosniff", path)
		}
	}
	// /index.html is the same file as /, and just as uncached.
	if rec := get(h, "/index.html", ""); rec.Code != 200 || rec.Header().Get("Cache-Control") != "no-cache" {
		t.Errorf("/index.html = %d, Cache-Control %q", rec.Code, rec.Header().Get("Cache-Control"))
	}
}

func TestGzipOnlyWhenAskedFor(t *testing.T) {
	h := app(t, build)
	for path, original := range map[string]string{"/": index, "/assets/index-DAknYR.js": script} {
		plain := get(h, path, "")
		if plain.Header().Get("Content-Encoding") != "" || plain.Body.String() != original {
			t.Errorf("%s without Accept-Encoding came back encoded as %q", path, plain.Header().Get("Content-Encoding"))
		}
		for _, accept := range []string{"gzip", "gzip, deflate, br, zstd", "deflate, gzip;q=0.5", "*"} {
			rec := get(h, path, accept)
			if rec.Header().Get("Content-Encoding") != "gzip" {
				t.Errorf("%s with %q was not gzipped", path, accept)
				continue
			}
			if rec.Body.Len() >= len(original) {
				t.Errorf("%s gzipped is %d bytes of %d", path, rec.Body.Len(), len(original))
			}
			zr, err := gzip.NewReader(rec.Body)
			if err != nil {
				t.Fatalf("%s: %v", path, err)
			}
			if got, err := io.ReadAll(zr); err != nil || string(got) != original {
				t.Errorf("%s does not decompress to the file: %v", path, err)
			}
		}
		for _, accept := range []string{"br", "identity", "gzip;q=0", "gzip; q=0.0, br", "x-gzip-ish"} {
			if rec := get(h, path, accept); rec.Header().Get("Content-Encoding") != "" || rec.Body.String() != original {
				t.Errorf("%s with %q came back encoded as %q", path, accept, rec.Header().Get("Content-Encoding"))
			}
		}
		// Either way a shared cache is told the answer depends on the question.
		if plain.Header().Get("Vary") != "Accept-Encoding" {
			t.Errorf("%s has no Vary: Accept-Encoding", path)
		}
	}
}

func TestContentLengthIsTheBytesSent(t *testing.T) {
	h := app(t, build)
	for _, accept := range []string{"", "gzip"} {
		rec := get(h, "/assets/index-DAknYR.js", accept)
		if got := rec.Header().Get("Content-Length"); got == "" || got != strconv.Itoa(rec.Body.Len()) {
			t.Errorf("Accept-Encoding %q: Content-Length %q for %d bytes", accept, got, rec.Body.Len())
		}
	}
}

// woff2 is compressed already, and a file too small to shrink is sent as it is.
func TestWhatWouldNotShrinkIsNotGzipped(t *testing.T) {
	h := app(t, build)
	rec := get(h, "/assets/barlow-600.woff2", "gzip")
	if rec.Header().Get("Content-Encoding") != "" || !bytes.Equal(rec.Body.Bytes(), font) {
		t.Errorf("woff2 came back encoded as %q, %d bytes of %d", rec.Header().Get("Content-Encoding"), rec.Body.Len(), len(font))
	}
	if rec := get(h, "/assets/tiny.css", "gzip"); rec.Header().Get("Content-Encoding") != "" || rec.Body.String() != "a{}" {
		t.Errorf("a 3 byte file came back encoded as %q: gzip would make it bigger", rec.Header().Get("Content-Encoding"))
	}
}

func TestUnknownPathIs404AndNotTheApp(t *testing.T) {
	h := app(t, build)
	for _, path := range []string{"/focus", "/assets/", "/assets", "/assets/missing.js", "/index.htm", "/.keep", "//", ""} {
		rec := get(h, path, "")
		if rec.Code != 404 || strings.Contains(rec.Body.String(), "heirloom") {
			t.Errorf("%q = %d %q, want a 404 that is not index.html", path, rec.Code, rec.Body.String())
		}
		if rec.Header().Get("X-Content-Type-Options") != "nosniff" || rec.Header().Get("Content-Security-Policy") != CSP {
			t.Errorf("the 404 for %q lacks the app's headers", path)
		}
	}
}

// The handler is given one folder of a bigger tree, as the binary gives it dist/. No
// spelling of a path gets at the rest.
func TestNoPathLeavesTheBuild(t *testing.T) {
	tree := fstest.MapFS{
		"dist/index.html":    {Data: []byte(index)},
		"dist/assets/app.js": {Data: []byte(script)},
		"secret.txt":         {Data: []byte("the database password")},
		"other/index.html":   {Data: []byte("another site")},
	}
	built, err := fs.Sub(tree, "dist")
	if err != nil {
		t.Fatal(err)
	}
	h := app(t, built)
	if rec := get(h, "/assets/app.js", ""); rec.Code != 200 {
		t.Fatalf("the build itself is not served: %d", rec.Code)
	}
	for _, path := range []string{
		"/../secret.txt", "/assets/../../secret.txt", "/..", "/../", "/assets/../index.html",
		"/%2e%2e/secret.txt", "/..%2fsecret.txt", `/..\secret.txt`, "/../other/index.html", "/./index.html", "/assets//app.js",
	} {
		rec := get(h, path, "")
		if rec.Code != 404 || strings.Contains(rec.Body.String(), "password") || strings.Contains(rec.Body.String(), "another site") {
			t.Errorf("%q = %d %q, want 404", path, rec.Code, rec.Body.String())
		}
	}
}

func TestBinaryWithoutTheAppSaysSo(t *testing.T) {
	h := app(t, fstest.MapFS{".keep": {}})
	rec := get(h, "/", "gzip")
	if rec.Code != 404 || rec.Body.String() != Missing+"\n" || !strings.HasPrefix(rec.Header().Get("Content-Type"), "text/plain") {
		t.Errorf("/ = %d %q (%s), want 404 and the sentence in plain text", rec.Code, rec.Body.String(), rec.Header().Get("Content-Type"))
	}
	if rec := get(h, "/assets/index.js", ""); rec.Code != 404 {
		t.Errorf("an asset of a build that is not there = %d, want 404", rec.Code)
	}
}

// What is embedded in this very test binary: a real build when the Makefile ran, only
// .keep on a fresh clone. Both must start, which is all `go test` on a clone needs.
func TestEmbeddedBuildStarts(t *testing.T) {
	h, err := App()
	if err != nil {
		t.Fatal(err)
	}
	rec := get(h, "/", "")
	if _, err := fs.Stat(dist, "dist/index.html"); err != nil {
		if rec.Code != 404 || rec.Body.String() != Missing+"\n" {
			t.Errorf("no build embedded, and / = %d %q", rec.Code, rec.Body.String())
		}
	} else if rec.Code != 200 {
		t.Errorf("a build is embedded, and / = %d", rec.Code)
	}
}
