package github

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"path"
	"sort"
	"strings"
)

const (
	maxSourceFiles  = 25
	maxFileBytes    = 40_000
	maxTotalBytes   = 120_000
	maxTreeListings = 400
)

var sourceExts = map[string][]string{
	"cobol": {".cbl", ".cob", ".cpy", ".cobol", ".pco"},
	"java":  {".java"},
	"php":   {".php"},
}

var alwaysInclude = map[string]bool{
	"pom.xml": true, "build.gradle": true, "build.gradle.kts": true,
	"composer.json": true, "makefile": true, "readme.md": true,
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

func (c *Client) FetchSourceDigest(ctx context.Context, owner, repo, branch, sourceLang string) (string, error) {
	if branch == "" {
		b, err := c.defaultBranch(ctx, owner, repo)
		if err != nil {
			return "", err
		}
		branch = b
	}

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

	exts := sourceExts[strings.ToLower(sourceLang)]

	var allPaths []string
	type pick struct {
		path string
		sha  string
		size int
	}
	var picks []pick
	for _, e := range tree.Tree {
		if e.Type != "blob" {
			continue
		}
		allPaths = append(allPaths, e.Path)
		base := strings.ToLower(path.Base(e.Path))
		if e.Size > 0 && e.Size <= maxFileBytes && (matchesExt(e.Path, exts) || alwaysInclude[base] || strings.HasSuffix(base, ".sql")) {
			picks = append(picks, pick{e.Path, e.SHA, e.Size})
		}
	}
	sort.Strings(allPaths)
	sort.Slice(picks, func(i, j int) bool { return picks[i].path < picks[j].path })

	var b strings.Builder
	fmt.Fprintf(&b, "REPOSITORY: %s/%s @ %s\n\n", owner, repo, branch)

	b.WriteString("FILE TREE:\n")
	for i, p := range allPaths {
		if i >= maxTreeListings {
			fmt.Fprintf(&b, "… (%d more files)\n", len(allPaths)-maxTreeListings)
			break
		}
		fmt.Fprintf(&b, "  %s\n", p)
	}
	b.WriteString("\n")

	if tree.Truncated {
		b.WriteString("(note: repository tree was truncated by GitHub — large repo)\n\n")
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
			content = content[:maxFileBytes] + "\n… (truncated)"
		}
		total += len(content)
		included++
		fmt.Fprintf(&b, "\n--- %s ---\n%s\n", p.path, content)
	}
	if included == 0 {
		b.WriteString("(no source files matched — analyze from the file tree above)\n")
	}

	return b.String(), nil
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

func matchesExt(p string, exts []string) bool {
	lower := strings.ToLower(p)
	for _, e := range exts {
		if strings.HasSuffix(lower, e) {
			return true
		}
	}
	return false
}
