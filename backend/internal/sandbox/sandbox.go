package sandbox

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"sort"
	"strings"
	"time"
)

type Spec struct {
	Image   string
	Files   map[string]string
	Script  string
	Timeout time.Duration
}

type Result struct {
	Output   string `json:"output"`
	ExitCode int    `json:"exitCode"`
	TimedOut bool   `json:"timedOut"`
}

const (
	maxOutputBytes = 16_000
	heredoc        = "FERRY_EOF_8f3c1a"
)

func Run(ctx context.Context, spec Spec) (Result, error) {
	if _, err := exec.LookPath("docker"); err != nil {
		return Result{}, errors.New("docker not available in this environment")
	}
	if spec.Timeout <= 0 {
		spec.Timeout = 60 * time.Second
	}

	script := buildScript(spec.Files, spec.Script)

	runCtx, cancel := context.WithTimeout(ctx, spec.Timeout)
	defer cancel()

	args := []string{"run", "--rm"}

	if rt := os.Getenv("SANDBOX_RUNTIME"); rt != "" {
		args = append(args, "--runtime", rt)
	}
	args = append(args,
		"--network", "none",
		"--memory", "768m",
		"--cpus", "1.5",
		"--pids-limit", "256",
		"--security-opt", "no-new-privileges",
		"--read-only",
		"--tmpfs", "/work:rw,exec,size=256m",
		"--tmpfs", "/tmp:rw,exec,size=128m",
		"-w", "/work",
		spec.Image,
		"sh", "-c", script,
	)

	cmd := exec.CommandContext(runCtx, "docker", args...)
	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	err := cmd.Run()

	res := Result{Output: truncate(buf.String())}
	if runCtx.Err() == context.DeadlineExceeded {
		res.TimedOut = true
		return res, nil
	}
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			res.ExitCode = exitErr.ExitCode()
			return res, nil
		}
		return res, fmt.Errorf("docker run: %w", err)
	}
	return res, nil
}

func buildScript(files map[string]string, userScript string) string {
	var b strings.Builder
	paths := make([]string, 0, len(files))
	for p := range files {
		paths = append(paths, p)
	}
	sort.Strings(paths)
	for _, p := range paths {
		dir := p
		if i := strings.LastIndex(p, "/"); i >= 0 {
			dir = p[:i]
			fmt.Fprintf(&b, "mkdir -p %q\n", dir)
		}
		content := files[p]

		content = strings.ReplaceAll(content, heredoc, heredoc+"_x")
		fmt.Fprintf(&b, "cat > %q <<'%s'\n%s\n%s\n", p, heredoc, content, heredoc)
	}
	b.WriteString(userScript)
	return b.String()
}

func truncate(s string) string {
	if len(s) <= maxOutputBytes {
		return s
	}
	return s[:maxOutputBytes] + "\n… (output truncated)"
}
