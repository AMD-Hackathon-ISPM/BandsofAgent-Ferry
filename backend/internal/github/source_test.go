package github

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBuildDigestFromDirSkipsSymlinks(t *testing.T) {
	root := t.TempDir()
	outside := filepath.Join(t.TempDir(), "secret.java")
	if err := os.WriteFile(outside, []byte("outside secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "App.java"), []byte("class App {}"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "Leak.java")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}

	digest, err := buildDigestFromDir(root, "acme", "app", "main", "java")
	if err != nil {
		t.Fatalf("buildDigestFromDir: %v", err)
	}
	if strings.Contains(digest, "outside secret") {
		t.Fatalf("digest included symlink target content:\n%s", digest)
	}
	if strings.Contains(digest, "Leak.java") {
		t.Fatalf("digest included symlink path:\n%s", digest)
	}
	if !strings.Contains(digest, "App.java") {
		t.Fatalf("digest missing regular source file:\n%s", digest)
	}
}
