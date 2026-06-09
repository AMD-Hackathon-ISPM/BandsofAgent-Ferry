package band

import (
	"fmt"
	"regexp"
	"strings"
)

type Artifact struct {
	Kind   string
	Status string
	Body   string
}

var artifactRe = regexp.MustCompile(`(?s)\[ferry-artifact kind="([^"]*)" status="([^"]*)"\]\n(.*?)\n\[/ferry-artifact\]`)

func MarshalArtifact(a Artifact) string {
	return fmt.Sprintf("[ferry-artifact kind=%q status=%q]\n%s\n[/ferry-artifact]", a.Kind, a.Status, a.Body)
}

func ParseArtifacts(content string) ([]Artifact, string) {
	matches := artifactRe.FindAllStringSubmatch(content, -1)
	if matches == nil {
		return nil, content
	}
	arts := make([]Artifact, 0, len(matches))
	for _, m := range matches {
		arts = append(arts, Artifact{Kind: m[1], Status: m[2], Body: m[3]})
	}
	cleaned := strings.TrimSpace(artifactRe.ReplaceAllString(content, ""))
	return arts, cleaned
}
