package sandbox

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

const (
	workspaceIdleTTL = 15 * time.Minute
	workspacePrefix  = "ferry-ws-"
)

type workspace struct {
	container string
	image     string
	lastUsed  time.Time
}

// workspaceManager keeps one long-lived container per run so the build/module
// caches and generated files survive across the code → test → review → rework
// cycle, instead of the ephemeral `docker run --rm` path that starts cold every
// invocation (and re-downloads dependencies each time).
type workspaceManager struct {
	mu sync.Mutex
	ws map[string]*workspace
}

var workspaces = newWorkspaceManager()

func newWorkspaceManager() *workspaceManager {
	m := &workspaceManager{ws: make(map[string]*workspace)}
	go m.reap()
	return m
}

// runDocker runs a docker subcommand and returns its combined output + error.
func runDocker(ctx context.Context, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "docker", args...)
	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	err := cmd.Run()
	return buf.String(), err
}

// toResult maps a docker invocation's output/error into a sandbox Result.
func toResult(runCtx context.Context, out string, err error) (Result, error) {
	res := Result{Output: truncate(out)}
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
		return res, fmt.Errorf("docker: %w", err)
	}
	return res, nil
}

func containerName(runID string) string { return workspacePrefix + runID }

// exec runs spec.Script inside the run's persistent container, creating it on
// first use.
func (m *workspaceManager) exec(ctx context.Context, spec Spec) (Result, error) {
	if _, err := exec.LookPath("docker"); err != nil {
		return Result{}, errors.New("docker not available in this environment")
	}
	timeout := spec.Timeout
	if timeout <= 0 {
		timeout = 60 * time.Second
	}
	runCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	name, err := m.ensure(ctx, spec.RunID, spec.Image)
	if err != nil {
		return Result{}, err
	}

	// Refresh the source tree (caches live under /tmp + /go, untouched), write
	// the latest files, then run the command.
	script := "rm -rf /work/* /work/.[!.]* 2>/dev/null || true\n" + buildScript(spec.Files, spec.Script)

	out, err := runDocker(runCtx, "exec", "-w", "/work", name, "sh", "-c", script)
	if err != nil && isContainerGone(out) {
		// Container was reaped or died — recreate once and retry.
		m.drop(spec.RunID)
		if name, err = m.ensure(ctx, spec.RunID, spec.Image); err == nil {
			out, err = runDocker(runCtx, "exec", "-w", "/work", name, "sh", "-c", script)
		}
	}
	return toResult(runCtx, out, err)
}

func (m *workspaceManager) ensure(ctx context.Context, runID, image string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if ws, ok := m.ws[runID]; ok && ws.image == image {
		ws.lastUsed = time.Now()
		return ws.container, nil
	}

	name := containerName(runID)
	_, _ = runDocker(ctx, "rm", "-f", name) // clear any stale/leftover container

	args := []string{"run", "-d", "--name", name}
	if rt := os.Getenv("SANDBOX_RUNTIME"); rt != "" {
		args = append(args, "--runtime", rt)
	}
	network := os.Getenv("SANDBOX_NETWORK")
	if network == "" {
		network = "bridge"
	}
	// Writable container (no --read-only / --rm) so files + caches persist; it
	// idles on `sleep infinity` and is torn down on completion or by the reaper.
	args = append(args,
		"--network", network,
		"--memory", "2g",
		"--cpus", "1.5",
		"--pids-limit", "512",
		"--security-opt", "no-new-privileges",
		"-w", "/work",
		image, "sh", "-c", "mkdir -p /work && sleep infinity",
	)
	if out, err := runDocker(ctx, args...); err != nil {
		return "", fmt.Errorf("create workspace container: %w: %s", err, strings.TrimSpace(out))
	}
	m.ws[runID] = &workspace{container: name, image: image, lastUsed: time.Now()}
	return name, nil
}

func (m *workspaceManager) drop(runID string) {
	m.mu.Lock()
	delete(m.ws, runID)
	m.mu.Unlock()
}

func (m *workspaceManager) remove(ctx context.Context, runID string) {
	m.mu.Lock()
	ws, ok := m.ws[runID]
	delete(m.ws, runID)
	m.mu.Unlock()
	if ok {
		_, _ = runDocker(ctx, "rm", "-f", ws.container)
	}
}

// reap tears down workspaces idle longer than workspaceIdleTTL, so abandoned or
// completed runs don't leak containers.
func (m *workspaceManager) reap() {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for range t.C {
		var stale []string
		m.mu.Lock()
		for id, ws := range m.ws {
			if time.Since(ws.lastUsed) > workspaceIdleTTL {
				stale = append(stale, ws.container)
				delete(m.ws, id)
			}
		}
		m.mu.Unlock()
		for _, name := range stale {
			c, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			_, _ = runDocker(c, "rm", "-f", name)
			cancel()
		}
	}
}

// SweepWorkspaces removes every ferry workspace container on the host. Called on
// runner startup to clear containers orphaned by a previous run.
func SweepWorkspaces(ctx context.Context) {
	out, err := runDocker(ctx, "ps", "-aq", "--filter", "name="+workspacePrefix)
	if err != nil {
		return
	}
	for _, id := range strings.Fields(out) {
		_, _ = runDocker(ctx, "rm", "-f", id)
	}
}

func isContainerGone(out string) bool {
	l := strings.ToLower(out)
	return strings.Contains(l, "no such container") || strings.Contains(l, "is not running")
}

// RemoveWorkspace tears down a run's workspace container (best-effort).
func RemoveWorkspace(ctx context.Context, runID string) {
	if runID != "" {
		workspaces.remove(ctx, runID)
	}
}
