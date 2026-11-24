# heirloom. `make check` runs every check and reports each one; the rest build and run things.
SHELL := /bin/bash
TOKENS := client/src/ui/tokens.css
VERSION := $(shell git describe --always --dirty 2>/dev/null || echo dev)
GOBUILD := CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.version=$(VERSION)"

# The S10's address and login live in .local/ENV.md and nowhere else.
S10_USER := $(shell sed -n 's/^- SSH user: *\([A-Za-z0-9_-]*\).*/\1/p' .local/ENV.md 2>/dev/null)
S10_ADDR := $(shell sed -n 's/^- Address: *\([A-Za-z0-9.:-]*\).*/\1/p' .local/ENV.md 2>/dev/null)
S10 := $(S10_USER)@$(S10_ADDR)
need-s10 = @test -n "$(S10_USER)" -a -n "$(S10_ADDR)" || { echo "No S10 address or SSH user in .local/ENV.md. Copy .local/ENV.example.md and fill it in."; exit 1; }

CHECKS := lint-design contracts test-tools style types pure test-core test-server test-sync sim budget e2e
.PHONY: check $(CHECKS) tokens web server dev dev-web dev-server apk deploy s10-rss

# -k: one failing check does not hide the others.
check:
	@$(MAKE) -k --no-print-directory $(CHECKS)

tokens: $(TOKENS)
$(TOKENS): DESIGN.md tools/tokens.mjs
	node tools/tokens.mjs

lint-design:
	@pnpm exec design.md lint DESIGN.md | node -e 'const s = JSON.parse(require("fs").readFileSync(0)).summary; console.log("design lint:", s.errors, "errors,", s.warnings, "warnings"); process.exit(s.errors ? 1 : 0)'

contracts:
	node tools/contracts-check.mjs

test-tools:
	node --test "tools/*.test.mjs"

style: tokens
	node tools/style-check.mjs

types: tokens
	pnpm exec tsc --noEmit

# core/ is pure: time and storage are handed in, so the same code runs in tests, the simulator
# and the phone. A global here would work in the browser and lie everywhere else.
pure:
	@! grep -rnE '\b(document|window|navigator|localStorage)\.|\bindexedDB\b|new WebSocket|\bfetch\(|\bset(Timeout|Interval)\(|Date\.now|new Date\(\)|Math\.random' client/src/core --include='*.ts' --exclude='*.test.ts' || { echo "client/src/core must stay pure: pass these in"; exit 1; }
	@echo "pure: client/src/core uses no globals"

test-core:
	node --test "client/src/**/*.test.ts"

# Real devices' code against the real server, in Node: the scenarios of ARCHITECTURE section 4,
# then many devices editing at random with the network coming and going.
test-sync: server
	node --test "tests/sync/*.test.ts"

sim: server
	node tools/sim/sim.ts --seed 20261124

test-server:
	cd server && go vet ./... && go test ./...

web: tokens
	pnpm exec vite build

server:
	cd server && $(GOBUILD) -o bin/heirloomd ./cmd/heirloomd
	cd server && GOOS=linux GOARCH=arm64 $(GOBUILD) -o bin/heirloomd-arm64 ./cmd/heirloomd

budget: web server
	node tools/budget.mjs

e2e: web server
	pnpm exec playwright test -c tests/e2e

dev: tokens
	@$(MAKE) -j2 --no-print-directory dev-web dev-server
dev-web:
	pnpm exec vite
dev-server:
	cd server && go run ./cmd/heirloomd -data ../.local/data

apk: web
	cd android && ./gradlew assembleDebug

# Section 9 adds the systemd unit and its restart. Until then the binary only lands in the home folder.
deploy: server
	$(need-s10)
	scp server/bin/heirloomd-arm64 $(S10):heirloomd

# Idle memory on the real hardware: run it on localhost there for 3 s, read VmRSS, stop it.
s10-rss:
	$(need-s10)
	@ssh $(S10) 'd=$$(mktemp -d); ./heirloomd -addr 127.0.0.1:18787 -data $$d & p=$$!; sleep 3; ./heirloomd -version; grep VmRSS /proc/$$p/status; kill $$p; wait $$p 2>/dev/null; rm -rf $$d'
