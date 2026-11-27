# heirloom. `make check` runs every check and reports each one; the rest build and run things.
SHELL := /bin/bash
TOKENS := client/src/ui/tokens.css
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
GOBUILD := CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.version=$(VERSION)"

# The server's address and login live in .local/ENV.md and nowhere else.
HOST_USER := $(shell sed -n 's/^- SSH user: *\([A-Za-z0-9_-]*\).*/\1/p' .local/ENV.md 2>/dev/null)
HOST_ADDR := $(shell sed -n 's/^- Address: *\([A-Za-z0-9.:-]*\).*/\1/p' .local/ENV.md 2>/dev/null)
HOST := $(HOST_USER)@$(HOST_ADDR)
need-host = @test -n "$(HOST_USER)" -a -n "$(HOST_ADDR)" || { echo "No server address or SSH user in .local/ENV.md. Copy .local/ENV.example.md and fill it in."; exit 1; }

CHECKS := lint-design contracts test-tools style audit types pure test-core test-android test-server test-sync sim budget e2e
.PHONY: help check $(CHECKS) tokens web server dev dev-web dev-server apk release-apk bump deploy server-rss

# A bare `make` lists what there is; it used to start the ten-minute check.
help:
	@echo "heirloom $(VERSION)"
	@echo ""
	@echo "Check:"
	@echo "  make check        - Every check below, each one reported"
	@echo "  make test-core    - The client's tests (core, sync, ui)"
	@echo "  make test-server  - go vet and go test"
	@echo "  make test-android - The phone's native code, on the JVM"
	@echo "  make test-sync    - Real devices' code against a real server"
	@echo "  make e2e          - The app in browsers against a real server"
	@echo "  make audit        - Every demo state against DESIGN.md"
	@echo "  make types | style | contracts | lint-design | budget | sim | pure | test-tools"
	@echo ""
	@echo "Build and run:"
	@echo "  make dev          - Vite beside heirloomd, data in .local/data"
	@echo "  make web          - The built web app"
	@echo "  make server       - heirloomd for here and for arm64, the web app inside"
	@echo "  make apk          - The debug APK (SERVER=http://host:8787 to fill in an address)"
	@echo "  make release-apk  - The signed APK for friends"
	@echo ""
	@echo "The server (address and login from .local/ENV.md):"
	@echo "  make deploy       - Build for its CPU, copy it there, run install.sh"
	@echo "  make server-rss   - Its memory now"
	@echo ""
	@echo "Other:"
	@echo "  make bump NEW=x.y.z - Set the version (package.json)"
	@echo "  make tokens       - DESIGN.md to tokens.css"

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

# What the browser drew, in every state of every screen, against DESIGN.md.
audit: tokens
	node tools/design-audit.mjs

types: tokens
	pnpm exec tsc --noEmit

# core/ is pure: time and storage are handed in, so the same code runs in tests, the simulator
# and the phone. A global here would work in the browser and lie everywhere else.
pure:
	@! grep -rnE '\b(document|window|navigator|localStorage)\.|\bindexedDB\b|new WebSocket|\bfetch\(|\bset(Timeout|Interval)\(|Date\.now|new Date\(\)|Math\.random' client/src/core --include='*.ts' --exclude='*.test.ts' || { echo "client/src/core must stay pure: pass these in"; exit 1; }
	@echo "pure: client/src/core uses no globals"

test-core:
	node --test "client/src/**/*.test.ts"

# The phone's native drawer and its background service, on the JVM: their decisions against the
# fixtures and the rules capacitor.ts used to hold. No phone needed.
test-android:
	cd android && JAVA_HOME=$(JDK21) ./gradlew testDebugUnitTest -q

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

# The binary carries the web app: the build is copied to where go:embed can reach it.
server: web
	rm -rf server/web/dist && mkdir -p server/web/dist && cp -r client/dist/. server/web/dist/ && touch server/web/dist/.keep
	cd server && $(GOBUILD) -o bin/heirloomd ./cmd/heirloomd
	cd server && GOOS=linux GOARCH=arm64 $(GOBUILD) -o bin/heirloomd-arm64 ./cmd/heirloomd

budget: server
	node tools/budget.mjs

e2e: server
	pnpm exec playwright test -c tests/e2e

dev: tokens
	@$(MAKE) -j2 --no-print-directory dev-web dev-server
dev-web:
	pnpm exec vite
dev-server:
	cd server && go run ./cmd/heirloomd -data ../.local/data

# The phone app carries its own copy of the web app and asks for its server (another origin for
# it). `make apk SERVER=http://your.host:8787` fills the address in for the people that APK is
# handed to; a device test through `adb reverse` uses SERVER=http://localhost:8787.
SERVER ?=
# Capacitor 8 needs Java 21. Where yours lives: `make apk JDK21=/path`, or JDK21 in the environment.
JDK21 ?= $(HOME)/.jdks/jdk-21
apk: tokens
	VITE_APP=1 VITE_SERVER_URL=$(SERVER) pnpm exec vite build --outDir dist-app
	pnpm exec cap sync android
	cd android && JAVA_HOME=$(JDK21) ./gradlew assembleDebug

# The APK for friends, signed with release.keystore at the repo root (gitignored) and the
# passwords KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD from ~/.gradle/gradle.properties; without
# them it is signed with the debug key. CI does the same from secrets (.github/workflows/ci.yml).
# The same key must sign every update for as long as the app lives.
release-apk: tokens
	VITE_APP=1 VITE_SERVER_URL=$(SERVER) pnpm exec vite build --outDir dist-app
	pnpm exec cap sync android
	cd android && JAVA_HOME=$(JDK21) ./gradlew assembleRelease

# One version for the app: "version" in package.json. The APK's versionCode is worked out from it
# and the commit count (android/app/build.gradle); a v* tag must match it (CI checks).
bump:
	@echo "$(NEW)" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$$' || { echo "Usage: make bump NEW=x.y.z"; exit 1; }
	@sed -i 's/^  "version": ".*",/  "version": "$(NEW)",/' package.json
	@echo "[+] Version $$(node -p 'require("./package.json").version') set. Commit it, then tag v$(NEW) to release."

# Builds for the server's own CPU (it is asked), puts the binary there and runs install.sh with
# it, the same script a release installs with. A sudo password, if the server needs one, goes
# from .local/ENV.md straight into ssh's stdin: never in a variable, an argument or the log.
deploy: server
	$(need-host)
	@arch=$$(ssh $(HOST) uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/') && \
	(cd server && GOOS=linux GOARCH=$$arch $(GOBUILD) -o bin/heirloomd-$$arch ./cmd/heirloomd) && \
	scp install.sh server/bin/heirloomd-$$arch $(HOST): && \
	sed -n 's/^- Root via: sudo; password: *//p' .local/ENV.md | ssh $(HOST) "cd && sudo -S -p '' env HEIRLOOMD_BINARY=heirloomd-$$arch sh install.sh"

# Memory of the running service on the real hardware.
server-rss:
	$(need-host)
	@ssh $(HOST) 'p=$$(systemctl show -p MainPID --value heirloomd); test "$$p" -gt 0 && grep VmRSS /proc/$$p/status || { echo "heirloomd is not running on the server"; exit 1; }'
