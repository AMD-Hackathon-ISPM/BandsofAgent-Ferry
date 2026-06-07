package github

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
)

var ErrNotFound = errors.New("repository not found")

type RepoInfo struct {
	Owner            string   `json:"owner"`
	Name             string   `json:"name"`
	DefaultBranch    string   `json:"defaultBranch"`
	Branches         []string `json:"branches"`
	Language         string   `json:"language"`
	DetectedLanguage string   `json:"detectedLanguage"`
	DetectedLabel    string   `json:"detectedLabel"`
}

type Client struct {
	token string
}

func NewClient(token string) *Client {
	return &Client{token: token}
}

func (c *Client) get(ctx context.Context, path string) ([]byte, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com"+path, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	return body, resp.StatusCode, err
}

type ghRepo struct {
	Name          string  `json:"name"`
	FullName      string  `json:"full_name"`
	DefaultBranch string  `json:"default_branch"`
	Language      *string `json:"language"`
	Owner         struct {
		Login string `json:"login"`
	} `json:"owner"`
}

type ghBranch struct {
	Name string `json:"name"`
}

func (c *Client) ResolveRepo(ctx context.Context, owner, name string) (*RepoInfo, error) {
	body, status, err := c.get(ctx, fmt.Sprintf("/repos/%s/%s", owner, name))
	if err != nil {
		return nil, fmt.Errorf("github request failed: %w", err)
	}
	if status == 404 {
		return nil, ErrNotFound
	}
	if status != 200 {
		return nil, fmt.Errorf("github returned status %d", status)
	}

	var repo ghRepo
	if err := json.Unmarshal(body, &repo); err != nil {
		return nil, fmt.Errorf("failed to parse repo: %w", err)
	}

	branchBody, _, err := c.get(ctx, fmt.Sprintf("/repos/%s/%s/branches?per_page=100", owner, name))
	if err != nil {
		return nil, fmt.Errorf("failed to fetch branches: %w", err)
	}

	var ghBranches []ghBranch
	if err := json.Unmarshal(branchBody, &ghBranches); err != nil {
		return nil, fmt.Errorf("failed to parse branches: %w", err)
	}

	branches := make([]string, len(ghBranches))
	for i, b := range ghBranches {
		branches[i] = b.Name
	}

	lang := ""
	if repo.Language != nil {
		lang = *repo.Language
	}
	detected, label := detectLanguage(lang)

	return &RepoInfo{
		Owner:            repo.Owner.Login,
		Name:             repo.Name,
		DefaultBranch:    repo.DefaultBranch,
		Branches:         branches,
		Language:         lang,
		DetectedLanguage: detected,
		DetectedLabel:    label,
	}, nil
}

func (c *Client) ListUserRepos(ctx context.Context) ([]string, error) {
	body, status, err := c.get(ctx, "/user/repos?per_page=100&sort=updated&type=all")
	if err != nil {
		return nil, err
	}
	if status != 200 {
		return nil, fmt.Errorf("github returned status %d", status)
	}

	var repos []ghRepo
	if err := json.Unmarshal(body, &repos); err != nil {
		return nil, err
	}

	var suggestions []string
	for _, r := range repos {
		lang := ""
		if r.Language != nil {
			lang = *r.Language
		}
		detected, _ := detectLanguage(lang)
		if detected != "unsupported" {
			suggestions = append(suggestions, r.FullName)
		}
	}
	return suggestions, nil
}

func detectLanguage(ghLang string) (string, string) {
	switch ghLang {
	case "COBOL":
		return "cobol", "COBOL"
	case "Java":
		return "java", "Java"
	case "PHP":
		return "php", "PHP"
	default:
		return "unsupported", ghLang
	}
}
