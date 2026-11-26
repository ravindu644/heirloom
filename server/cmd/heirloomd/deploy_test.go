package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// The unit is not Go, so nothing else here would notice a typo in it. It lives in install.sh,
// between <<'UNIT' and UNIT, which writes it.
func TestUnitFileSaysWhatItMust(t *testing.T) {
	script, err := os.ReadFile("../../../install.sh")
	if err != nil {
		t.Fatal(err)
	}
	_, after, ok := strings.Cut(string(script), "<<'UNIT'\n")
	data, _, ok2 := strings.Cut(after, "\nUNIT\n")
	if !ok || !ok2 {
		t.Fatal("install.sh holds no unit between <<'UNIT' and UNIT")
	}
	data += "\n"
	lines := map[string]bool{}
	for line := range strings.SplitSeq(string(data), "\n") {
		if line = strings.TrimSpace(line); line != "" && !strings.HasPrefix(line, "#") {
			lines[line] = true
		}
	}
	for _, want := range []string{
		"User=heirloomd",
		"ExecStart=/usr/local/bin/heirloomd -addr 0.0.0.0:8787 -data /var/lib/heirloomd",
		"StateDirectory=heirloomd",
		"StateDirectoryMode=0700",
		"UMask=0077",
		"Environment=GOMEMLIMIT=64MiB",
		"Restart=on-failure",
		"NoNewPrivileges=yes",
		"ProtectSystem=strict",
		"PrivateTmp=yes",
		"WantedBy=multi-user.target",
	} {
		if !lines[want] {
			t.Errorf("the unit lacks the line %q", want)
		}
	}
	// The home network may reach it, and the unit must say what that means beside the line.
	for _, said := range []string{"plain http", "tunnel", "before giving its address"} {
		if !strings.Contains(string(data), said) {
			t.Errorf("the unit listens on every address and does not say %q", said)
		}
	}

	// systemd's own reading of it, where this machine has systemd.
	analyze, err := exec.LookPath("systemd-analyze")
	if err != nil {
		t.Skip("no systemd-analyze on this machine: the unit was only read, not parsed by systemd")
	}
	// verify wants the binary to exist, and it is not installed here: this test binary stands in.
	self, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	unit := filepath.Join(t.TempDir(), "heirloomd.service")
	if err := os.WriteFile(unit, []byte(strings.Replace(string(data), "ExecStart=/usr/local/bin/heirloomd", "ExecStart="+self, 1)), 0o600); err != nil {
		t.Fatal(err)
	}
	if out, err := exec.Command(analyze, "verify", "--recursive-errors=no", unit).CombinedOutput(); err != nil || len(out) != 0 {
		t.Errorf("systemd-analyze verify: %v\n%s", err, out)
	}
}
