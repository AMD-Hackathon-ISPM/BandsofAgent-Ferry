package github

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	maxSourceFiles  = 40
	maxFileBytes    = 40_000
	maxTotalBytes   = 180_000
	maxTreeListings = 800
	cloneTimeout    = 90 * time.Second
)

var sourceExts = map[string][]string{
	"cobol": {".cbl", ".cob", ".cpy", ".cobol", ".pco"},
	"java":  {".java", ".jsp", ".jspx", ".properties"},
	"php":   {".php", ".phtml", ".inc", ".blade.php", ".twig"},
}

var contextExts = []string{
	".sql", ".html", ".htm", ".css", ".scss", ".sass", ".less",
	".js", ".jsx", ".ts", ".tsx", ".json", ".xml", ".yml", ".yaml",
	".ini", ".cfg", ".conf", ".toml", ".md", ".txt", ".properties",
	".twig", ".mustache", ".hbs", ".handlebars", ".phtml", ".tpl",
}

var alwaysInclude = map[string]bool{
	"pom.xml": true, "build.gradle": true, "build.gradle.kts": true,
	"composer.json": true, "composer.lock": true, "package.json": true,
	"package-lock.json": true, "yarn.lock": true, "pnpm-lock.yaml": true,
	"makefile": true, "readme.md": true, ".env.example": true,
	"application.properties": true, "application.yml": true,
	"application.yaml": true, "web.xml": true,
}

var skippedDirs = map[string]bool{
	".git":         true,
	"node_modules": true,
	"vendor":       true,
	"dist":         true,
	"build":        true,
	"target":       true,
	"coverage":     true,
}

type ghTree struct {
	Tree []struct {
		Path string `json:"path"`
		Type string `json:"type"`
		Size int    `json:"size"`
		SHA  string `json:"sha"`
	} `json:"tree"`
	Truncated bool `json:"truncated"`
}

type ghBlob struct {
	Content  string `json:"content"`
	Encoding string `json:"encoding"`
}

type sourcePick struct {
	path  string
	sha   string
	size  int
	score int
}

func (c *Client) FetchSourceDigest(ctx context.Context, owner, repo, branch, sourceLang string) (string, error) {
	if branch == "" {
		b, err := c.defaultBranch(ctx, owner, repo)
		if err != nil {
			return "", err
		}
		branch = b
	}

	if digest, err := c.fetchSourceDigestFromClone(ctx, owner, repo, branch, sourceLang); err == nil && digest != "" {
		return digest, nil
	}

	return c.fetchSourceDigestFromAPI(ctx, owner, repo, branch, sourceLang)
}

func (c *Client) fetchSourceDigestFromClone(ctx context.Context, owner, repo, branch, sourceLang string) (string, error) {
	if _, err := exec.LookPath("git"); err != nil {
		return "", err
	}

	root, err := os.MkdirTemp("", "ferry-source-*")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(root)

	repoDir := filepath.Join(root, "repo")
	cloneCtx, cancel := context.WithTimeout(ctx, cloneTimeout)
	defer cancel()

	args := []string{"clone", "--depth", "1", "--single-branch"}
	if branch != "" {
		args = append(args, "--branch", branch)
	}
	args = append(args, fmt.Sprintf("https://github.com/%s/%s.git", owner, repo), repoDir)

	cmd := exec.CommandContext(cloneCtx, "git", args...)
	cmd.Env = c.gitCloneEnv()
	if out, err := cmd.CombinedOutput(); err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = err.Error()
		}
		return "", fmt.Errorf("git clone failed: %s", msg)
	}

	return buildDigestFromDir(repoDir, owner, repo, branch, sourceLang)
}

func (c *Client) gitCloneEnv() []string {
	env := append([]string{}, os.Environ()...)
	env = append(env, "GIT_TERMINAL_PROMPT=0")
	if c.token == "" {
		return env
	}
	env = append(env,
		"GIT_CONFIG_COUNT=1",
		"GIT_CONFIG_KEY_0=http.https://github.com/.extraheader",
		"GIT_CONFIG_VALUE_0=AUTHORIZATION: Bearer "+c.token,
	)
	return env
}

func buildDigestFromDir(root, owner, repo, branch, sourceLang string) (string, error) {
	var allPaths []string
	var picks []sourcePick

	err := filepath.WalkDir(root, func(full string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if full == root {
			return nil
		}

		rel, err := filepath.Rel(root, full)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		name := strings.ToLower(d.Name())

		if d.IsDir() {
			if skippedDirs[name] {
				return filepath.SkipDir
			}
			return nil
		}

		allPaths = append(allPaths, rel)

		info, err := d.Info()
		if err != nil || info.Size() <= 0 || info.Size() > maxFileBytes {
			return nil
		}

		score := sourcePriority(rel, sourceLang)
		if score == 0 {
			return nil
		}

		picks = append(picks, sourcePick{
			path:  rel,
			size:  int(info.Size()),
			score: score,
		})
		return nil
	})
	if err != nil {
		return "", err
	}

	sort.Strings(allPaths)
	sort.Slice(picks, func(i, j int) bool {
		if picks[i].score != picks[j].score {
			return picks[i].score > picks[j].score
		}
		return picks[i].path < picks[j].path
	})

	var b strings.Builder
	fmt.Fprintf(&b, "REPOSITORY: %s/%s @ %s\n", owner, repo, branch)
	b.WriteString("(source digest built from a shallow git clone)\n\n")

	b.WriteString("FILE TREE:\n")
	for i, p := range allPaths {
		if i >= maxTreeListings {
			fmt.Fprintf(&b, "... (%d more files)\n", len(allPaths)-maxTreeListings)
			break
		}
		fmt.Fprintf(&b, "  %s\n", p)
	}
	b.WriteString("\n")

	b.WriteString("SOURCE FILES:\n")
	total := 0
	included := 0
	for _, p := range picks {
		if included >= maxSourceFiles || total >= maxTotalBytes {
			break
		}
		content, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(p.path)))
		if err != nil {
			continue
		}
		if len(content) > maxFileBytes {
			content = append(content[:maxFileBytes], []byte("\n... (truncated)")...)
		}
		total += len(content)
		included++
		fmt.Fprintf(&b, "\n--- %s ---\n%s\n", p.path, string(content))
	}
	if included == 0 {
		b.WriteString("(no source files matched - analyze from the file tree above)\n")
	}

	return b.String(), nil
}

func sourcePriority(rel, sourceLang string) int {
	lower := strings.ToLower(rel)
	base := strings.ToLower(path.Base(lower))

	if alwaysInclude[base] {
		return 280
	}
	if isSourceFile(lower, sourceLang) {
		return 320 + contentDirBonus(lower)
	}
	if strings.HasSuffix(lower, ".sql") {
		return 300 + contentDirBonus(lower)
	}
	if hasAnySuffix(lower, contextExts) {
		return 220 + contentDirBonus(lower)
	}
	if strings.Contains(lower, "/templates/") || strings.Contains(lower, "/views/") ||
		strings.Contains(lower, "/resources/") || strings.Contains(lower, "/content/") ||
		strings.Contains(lower, "/public/") || strings.Contains(lower, "/static/") ||
		strings.Contains(lower, "/webapp/") {
		return 160
	}
	return 0
}

func isSourceFile(rel, sourceLang string) bool {
	return hasAnySuffix(strings.ToLower(rel), sourceExts[strings.ToLower(sourceLang)])
}

func contentDirBonus(rel string) int {
	for _, seg := range []string{"/templates/", "/views/", "/resources/", "/content/", "/public/", "/static/", "/webapp/"} {
		if strings.Contains(rel, seg) {
			return 20
		}
	}
	return 0
}

func hasAnySuffix(s string, suffixes []string) bool {
	for _, suffix := range suffixes {
		if strings.HasSuffix(s, suffix) {
			return true
		}
	}
	return false
}

func (c *Client) fetchSourceDigestFromAPI(ctx context.Context, owner, repo, branch, sourceLang string) (string, error) {
	body, status, err := c.get(ctx, fmt.Sprintf("/repos/%s/%s/git/trees/%s?recursive=1", owner, repo, branch))
	if err != nil {
		return "", fmt.Errorf("fetch tree: %w", err)
	}
	if status == 404 {
		return "", ErrNotFound
	}
	if status != 200 {
		return "", fmt.Errorf("fetch tree: github status %d", status)
	}

	var tree ghTree
	if err := json.Unmarshal(body, &tree); err != nil {
		return "", fmt.Errorf("parse tree: %w", err)
	}

	var allPaths []string
	var picks []sourcePick
	for _, e := range tree.Tree {
		if e.Type != "blob" {
			continue
		}
		allPaths = append(allPaths, e.Path)
		if e.Size > 0 && e.Size <= maxFileBytes {
			if score := sourcePriority(e.Path, sourceLang); score > 0 {
				picks = append(picks, sourcePick{path: e.Path, sha: e.SHA, size: e.Size, score: score})
			}
		}
	}
	sort.Strings(allPaths)
	sort.Slice(picks, func(i, j int) bool {
		if picks[i].score != picks[j].score {
			return picks[i].score > picks[j].score
		}
		return picks[i].path < picks[j].path
	})

	var b strings.Builder
	fmt.Fprintf(&b, "REPOSITORY: %s/%s @ %s\n\n", owner, repo, branch)

	b.WriteString("FILE TREE:\n")
	for i, p := range allPaths {
		if i >= maxTreeListings {
			fmt.Fprintf(&b, "... (%d more files)\n", len(allPaths)-maxTreeListings)
			break
		}
		fmt.Fprintf(&b, "  %s\n", p)
	}
	b.WriteString("\n")

	if tree.Truncated {
		b.WriteString("(note: repository tree was truncated by GitHub - large repo)\n\n")
	}

	b.WriteString("SOURCE FILES:\n")
	total := 0
	included := 0
	for _, p := range picks {
		if included >= maxSourceFiles || total >= maxTotalBytes {
			break
		}
		content, err := c.fetchBlob(ctx, owner, repo, p.sha)
		if err != nil {
			continue
		}
		if len(content) > maxFileBytes {
			content = content[:maxFileBytes] + "\n... (truncated)"
		}
		total += len(content)
		included++
		fmt.Fprintf(&b, "\n--- %s ---\n%s\n", p.path, content)
	}
	if included == 0 {
		b.WriteString("(no source files matched - analyze from the file tree above)\n")
	}

	return b.String(), nil
}

// DBMigrationInfo reports whether a repo has a MyISAM schema eligible for the
// MyISAM -> InnoDB database migration.
type DBMigrationInfo struct {
	Available bool   `json:"available"`
	Label     string `json:"label"`
}

const maxSQLFilesScanned = 12

// DetectDBMigration scans the repo's .sql files for MyISAM table definitions.
// It's best-effort: any fetch failure just yields "not available" rather than
// erroring the whole repo resolution.
func (c *Client) DetectDBMigration(ctx context.Context, owner, repo, branch string) DBMigrationInfo {
	none := DBMigrationInfo{Available: false, Label: "No MyISAM database schema detected"}
	if branch == "" {
		b, err := c.defaultBranch(ctx, owner, repo)
		if err != nil {
			return none
		}
		branch = b
	}

	body, status, err := c.get(ctx, fmt.Sprintf("/repos/%s/%s/git/trees/%s?recursive=1", owner, repo, branch))
	if err != nil || status != 200 {
		return none
	}
	var tree ghTree
	if err := json.Unmarshal(body, &tree); err != nil {
		return none
	}

	type sqlFile struct {
		path string
		sha  string
	}
	var sqlFiles []sqlFile
	for _, e := range tree.Tree {
		if e.Type == "blob" && e.Size > 0 && e.Size <= maxFileBytes &&
			strings.HasSuffix(strings.ToLower(e.Path), ".sql") {
			sqlFiles = append(sqlFiles, sqlFile{e.Path, e.SHA})
		}
	}
	if len(sqlFiles) == 0 {
		return DBMigrationInfo{Available: false, Label: "No SQL schema found in this repository"}
	}

	checked := 0
	for _, f := range sqlFiles {
		if checked >= maxSQLFilesScanned {
			break
		}
		content, err := c.fetchBlob(ctx, owner, repo, f.sha)
		if err != nil {
			continue
		}
		checked++
		if strings.Contains(strings.ToLower(content), "myisam") {
			return DBMigrationInfo{Available: true, Label: "MyISAM tables detected - eligible for InnoDB migration"}
		}
	}
	return DBMigrationInfo{Available: false, Label: "SQL found, but no MyISAM tables to migrate"}
}

func (c *Client) defaultBranch(ctx context.Context, owner, repo string) (string, error) {
	body, status, err := c.get(ctx, fmt.Sprintf("/repos/%s/%s", owner, repo))
	if err != nil {
		return "", err
	}
	if status == 404 {
		return "", ErrNotFound
	}
	if status != 200 {
		return "", fmt.Errorf("fetch repo: github status %d", status)
	}
	var r ghRepo
	if err := json.Unmarshal(body, &r); err != nil {
		return "", err
	}
	if r.DefaultBranch == "" {
		return "main", nil
	}
	return r.DefaultBranch, nil
}

func (c *Client) fetchBlob(ctx context.Context, owner, repo, sha string) (string, error) {
	body, status, err := c.get(ctx, fmt.Sprintf("/repos/%s/%s/git/blobs/%s", owner, repo, sha))
	if err != nil {
		return "", err
	}
	if status != 200 {
		return "", fmt.Errorf("fetch blob: github status %d", status)
	}
	var blob ghBlob
	if err := json.Unmarshal(body, &blob); err != nil {
		return "", err
	}
	if blob.Encoding != "base64" {
		return blob.Content, nil
	}
	decoded, err := base64.StdEncoding.DecodeString(strings.ReplaceAll(blob.Content, "\n", ""))
	if err != nil {
		return "", err
	}
	return string(decoded), nil
}
