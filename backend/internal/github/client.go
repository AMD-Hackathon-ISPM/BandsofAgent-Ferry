package github

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
)

var ErrNotFound = errors.New("repository not found")

type RepoInfo struct {
	Owner            string          `json:"owner"`
	Name             string          `json:"name"`
	DefaultBranch    string          `json:"defaultBranch"`
	Branches         []string        `json:"branches"`
	Language         string          `json:"language"`
	DetectedLanguage string          `json:"detectedLanguage"`
	DetectedLabel    string          `json:"detectedLabel"`
	Risk             MigrationRisk   `json:"risk"`
	Languages        map[string]int  `json:"languages"`
	DBMigration      DBMigrationInfo `json:"dbMigration"`
}

type MigrationRisk struct {
	Percentage int    `json:"percentage"`
	Level      string `json:"level"`
	Label      string `json:"label"`
	Selectable bool   `json:"selectable"`
}

type RepoSuggestion struct {
	FullName         string         `json:"fullName"`
	DetectedLanguage string         `json:"detectedLanguage"`
	DetectedLabel    string         `json:"detectedLabel"`
	Risk             MigrationRisk  `json:"risk"`
	Languages        map[string]int `json:"languages"`
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
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
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

type ghUser struct {
	Login string `json:"login"`
}

type ghBranch struct {
	Name string `json:"name"`
}

func (c *Client) currentUserLogin(ctx context.Context) (string, error) {
	body, status, err := c.get(ctx, "/user")
	if err != nil {
		return "", err
	}
	if status != 200 {
		return "", fmt.Errorf("github returned status %d", status)
	}

	var user ghUser
	if err := json.Unmarshal(body, &user); err != nil {
		return "", err
	}
	return strings.ToLower(user.Login), nil
}

func (c *Client) ResolveRepo(ctx context.Context, owner, name string) (*RepoInfo, error) {
	ownerLogin, err := c.currentUserLogin(ctx)
	if err != nil {
		return nil, err
	}
	if strings.ToLower(owner) != ownerLogin {
		return nil, ErrNotFound
	}

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
	languages, err := c.fetchLanguages(ctx, owner, name)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch languages: %w", err)
	}
	detected, label, percentage := detectRepoLanguage(lang, languages)
	risk := calculateMigrationRisk(percentage)
	if detected == "unsupported" {
		risk.Label = "Unsupported language"
		risk.Selectable = false
	} else if !risk.Selectable {
		risk.Label = fmt.Sprintf("Below 40%% %s language share", label)
	}

	return &RepoInfo{
		Owner:            repo.Owner.Login,
		Name:             repo.Name,
		DefaultBranch:    repo.DefaultBranch,
		Branches:         branches,
		Language:         lang,
		DetectedLanguage: detected,
		DetectedLabel:    label,
		Risk:             risk,
		Languages:        languagePercentages(languages),
		DBMigration:      c.DetectDBMigration(ctx, repo.Owner.Login, repo.Name, repo.DefaultBranch),
	}, nil
}

func (c *Client) ListUserRepos(ctx context.Context) ([]RepoSuggestion, error) {
	ownerLogin, err := c.currentUserLogin(ctx)
	if err != nil {
		return nil, err
	}

	var repos []ghRepo
	for page := 1; ; page++ {
		body, status, err := c.get(ctx, fmt.Sprintf("/user/repos?per_page=100&page=%d&sort=updated&affiliation=owner", page))
		if err != nil {
			return nil, err
		}
		if status != 200 {
			return nil, fmt.Errorf("github returned status %d", status)
		}

		var batch []ghRepo
		if err := json.Unmarshal(body, &batch); err != nil {
			return nil, err
		}
		for _, repo := range batch {
			if strings.ToLower(repo.Owner.Login) == ownerLogin {
				repos = append(repos, repo)
			}
		}
		if len(batch) < 100 {
			break
		}
	}

	suggestions := make([]RepoSuggestion, len(repos))
	var wg sync.WaitGroup
	sem := make(chan struct{}, 8)

	for i, repo := range repos {
		wg.Add(1)
		go func(i int, r ghRepo) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			lang := ""
			if r.Language != nil {
				lang = *r.Language
			}
			languages, err := c.fetchLanguages(ctx, r.Owner.Login, r.Name)
			if err != nil {
				languages = map[string]int{}
			}
			detected, label, percentage := detectRepoLanguage(lang, languages)
			risk := calculateMigrationRisk(percentage)
			if detected == "unsupported" {
				return
			}
			suggestions[i] = RepoSuggestion{
				FullName:         r.FullName,
				DetectedLanguage: detected,
				DetectedLabel:    label,
				Risk:             risk,
				Languages:        languagePercentages(languages),
			}
		}(i, repo)
	}
	wg.Wait()

	filtered := suggestions[:0]
	for _, suggestion := range suggestions {
		if suggestion.FullName != "" {
			filtered = append(filtered, suggestion)
		}
	}
	return filtered, nil
}

func (c *Client) fetchLanguages(ctx context.Context, owner, name string) (map[string]int, error) {
	body, status, err := c.get(ctx, fmt.Sprintf("/repos/%s/%s/languages", owner, name))
	if err != nil {
		return nil, err
	}
	if status == 404 {
		return nil, ErrNotFound
	}
	if status != 200 {
		return nil, fmt.Errorf("github returned status %d", status)
	}

	var languages map[string]int
	if err := json.Unmarshal(body, &languages); err != nil {
		return nil, err
	}
	return languages, nil
}

func languagePercentages(languages map[string]int) map[string]int {
	total := 0
	for _, bytes := range languages {
		total += bytes
	}
	if total == 0 {
		return map[string]int{}
	}

	percentages := make(map[string]int, len(languages))
	for language, bytes := range languages {
		if bytes <= 0 {
			continue
		}
		percentages[language] = int(float64(bytes)/float64(total)*100 + 0.5)
	}
	return percentages
}

func detectRepoLanguage(ghLang string, languages map[string]int) (string, string, int) {
	total := 0
	for _, bytes := range languages {
		total += bytes
	}
	if total == 0 {
		detected, label := detectLanguage(ghLang)
		return detected, label, 0
	}

	type candidate struct {
		key   string
		label string
		bytes int
	}

	candidates := []candidate{
		{key: "java", label: "Java", bytes: languages["Java"]},
		{key: "cobol", label: "COBOL", bytes: languages["COBOL"]},
		{key: "php", label: "PHP", bytes: languages["PHP"]},
	}

	best := candidate{key: "unsupported", label: ghLang}
	for _, c := range candidates {
		if c.bytes > best.bytes {
			best = c
		}
	}
	if best.bytes == 0 {
		detected, label := detectLanguage(ghLang)
		return detected, label, 0
	}

	return best.key, best.label, int(float64(best.bytes)/float64(total)*100 + 0.5)
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

func calculateMigrationRisk(percentage int) MigrationRisk {
	switch {
	case percentage >= 75:
		return MigrationRisk{
			Percentage: percentage,
			Level:      "high",
			Label:      "High probability of success",
			Selectable: true,
		}
	case percentage >= 50:
		return MigrationRisk{
			Percentage: percentage,
			Level:      "medium",
			Label:      "Proceed with caution",
			Selectable: true,
		}
	case percentage > 40:
		return MigrationRisk{
			Percentage: percentage,
			Level:      "low",
			Label:      "Most likely unsuccessful",
			Selectable: true,
		}
	default:
		return MigrationRisk{
			Percentage: percentage,
			Level:      "low",
			Label:      "Low probability of success",
			Selectable: true,
		}
	}
}
