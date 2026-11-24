package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// The unit file is not Go, so nothing else here would notice a typo in it.
func TestUnitFileSaysWhatItMust(t *testing.T) {
	data, err := os.ReadFile("../../deploy/heirloomd.service")
	if err != nil {
		t.Fatal(err)
	}
	lines := map[string]bool{}
	for line := range strings.SplitSeq(string(data), "\n") {
		if line = strings.TrimSpace(line); line != "" && !strings.HasPrefix(line, "#") {
			lines[line] = true
		}
	}
	for _, want := range []string{
		"User=heirloomd",
		"ExecStart=/usr/local/bin/heirloomd -addr 127.0.0.1:8787 -data /var/lib/heirloomd",
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
	// It must never listen where the network can reach it.
	if strings.Contains(string(data), "0.0.0.0") || strings.Contains(string(data), "-addr :") {
		t.Error("the unit listens beyond the loopback")
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
