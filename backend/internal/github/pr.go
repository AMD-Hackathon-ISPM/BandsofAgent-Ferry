package github

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// OpenPullRequest creates a branch, commits files, and opens a PR using the
// GitHub Git Data API (no local git needed). Returns the PR HTML URL and number.
func (c *Client) OpenPullRequest(ctx context.Context, owner, repo, base, head, title, body string, files map[string]string) (string, int, error) {
	if c.token == "" {
		return "", 0, fmt.Errorf("a GitHub token is required to open a pull request")
	}
	if len(files) == 0 {
		return "", 0, fmt.Errorf("no files to commit")
	}
	if base == "" {
		b, err := c.defaultBranch(ctx, owner, repo)
		if err != nil {
			return "", 0, err
		}
		base = b
	}

	// 1. Base branch tip commit + its tree.
	var ref struct {
		Object struct {
			SHA string `json:"sha"`
		} `json:"object"`
	}
	if err := c.send(ctx, http.MethodGet, fmt.Sprintf("/repos/%s/%s/git/ref/heads/%s", owner, repo, base), nil, &ref); err != nil {
		return "", 0, fmt.Errorf("get base ref: %w", err)
	}
	baseSHA := ref.Object.SHA

	var baseCommit struct {
		Tree struct {
			SHA string `json:"sha"`
		} `json:"tree"`
	}
	if err := c.send(ctx, http.MethodGet, fmt.Sprintf("/repos/%s/%s/git/commits/%s", owner, repo, baseSHA), nil, &baseCommit); err != nil {
		return "", 0, fmt.Errorf("get base commit: %w", err)
	}

	// 2. Blob + tree entry per file.
	type treeEntry struct {
		Path string `json:"path"`
		Mode string `json:"mode"`
		Type string `json:"type"`
		SHA  string `json:"sha"`
	}
	entries := make([]treeEntry, 0, len(files))
	for path, content := range files {
		var blob struct {
			SHA string `json:"sha"`
		}
		err := c.send(ctx, http.MethodPost, fmt.Sprintf("/repos/%s/%s/git/blobs", owner, repo),
			map[string]string{"content": content, "encoding": "utf-8"}, &blob)
		if err != nil {
			return "", 0, fmt.Errorf("create blob %s: %w", path, err)
		}
		entries = append(entries, treeEntry{Path: path, Mode: "100644", Type: "blob", SHA: blob.SHA})
	}

	// 3. New tree based on the base tree.
	var tree struct {
		SHA string `json:"sha"`
	}
	if err := c.send(ctx, http.MethodPost, fmt.Sprintf("/repos/%s/%s/git/trees", owner, repo),
		map[string]interface{}{"base_tree": baseCommit.Tree.SHA, "tree": entries}, &tree); err != nil {
		return "", 0, fmt.Errorf("create tree: %w", err)
	}

	// 4. Commit.
	var commit struct {
		SHA string `json:"sha"`
	}
	if err := c.send(ctx, http.MethodPost, fmt.Sprintf("/repos/%s/%s/git/commits", owner, repo),
		map[string]interface{}{"message": title, "tree": tree.SHA, "parents": []string{baseSHA}}, &commit); err != nil {
		return "", 0, fmt.Errorf("create commit: %w", err)
	}

	// 5. Create the branch (force-update if it already exists).
	err := c.send(ctx, http.MethodPost, fmt.Sprintf("/repos/%s/%s/git/refs", owner, repo),
		map[string]string{"ref": "refs/heads/" + head, "sha": commit.SHA}, nil)
	if err != nil {
		if uErr := c.send(ctx, http.MethodPatch, fmt.Sprintf("/repos/%s/%s/git/refs/heads/%s", owner, repo, head),
			map[string]interface{}{"sha": commit.SHA, "force": true}, nil); uErr != nil {
			return "", 0, fmt.Errorf("create/update branch: %w", err)
		}
	}

	// 6. Open the PR.
	var pr struct {
		HTMLURL string `json:"html_url"`
		Number  int    `json:"number"`
	}
	err = c.send(ctx, http.MethodPost, fmt.Sprintf("/repos/%s/%s/pulls", owner, repo),
		map[string]string{"title": title, "head": head, "base": base, "body": body}, &pr)
	if err != nil {
		return "", 0, fmt.Errorf("open pull request: %w", err)
	}
	return pr.HTMLURL, pr.Number, nil
}

// send performs an authenticated JSON request against the GitHub API.
func (c *Client) send(ctx context.Context, method, path string, body, out interface{}) error {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, "https://api.github.com"+path, reader)
	if err != nil {
		return err
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 400))
		return fmt.Errorf("github %s %s: status %d: %s", method, path, resp.StatusCode, strings.TrimSpace(string(snippet)))
	}
	if out != nil {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil && err != io.EOF {
			return err
		}
	}
	return nil
}
