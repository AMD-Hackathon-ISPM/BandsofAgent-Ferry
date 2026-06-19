package worker

import (
	"fmt"
	"sort"
	"strings"
)

// maxDiffLinesPerFile caps how many +/- lines we show per modified file so the
// reviewer prompt stays small even when a file is rewritten wholesale.
const maxDiffLinesPerFile = 30

// changedFilesReport compares the previous and current file sets (keyed by path)
// and returns a concise, reviewer-friendly description of what a rework changed:
// added, modified, and removed paths, with a short line-level diff for modified
// files so the reviewer can confirm the flagged blockers were addressed without
// re-reading whole files. Returns "" when nothing changed.
func changedFilesReport(prev, cur map[string]string) string {
	var added, modified, removed []string
	for path, body := range cur {
		old, ok := prev[path]
		if !ok {
			added = append(added, path)
		} else if old != body {
			modified = append(modified, path)
		}
	}
	for path := range prev {
		if _, ok := cur[path]; !ok {
			removed = append(removed, path)
		}
	}
	if len(added)+len(modified)+len(removed) == 0 {
		return ""
	}
	sort.Strings(added)
	sort.Strings(modified)
	sort.Strings(removed)

	var b strings.Builder
	b.WriteString("CHANGED FILES (this rework):\n")
	for _, p := range added {
		fmt.Fprintf(&b, "  + %s (new)\n", p)
	}
	for _, p := range modified {
		fmt.Fprintf(&b, "  ~ %s (modified)\n", p)
	}
	for _, p := range removed {
		fmt.Fprintf(&b, "  - %s (removed)\n", p)
	}
	for _, p := range modified {
		if d := lineDiff(prev[p], cur[p]); d != "" {
			fmt.Fprintf(&b, "\n--- %s\n%s\n", p, d)
		}
	}
	return strings.TrimRight(b.String(), "\n")
}

// lineDiff returns a compact set-based +/- line summary (not a true unified
// diff — just enough signal for the reviewer), capped per side.
func lineDiff(old, neu string) string {
	oldSet := lineMultiset(old)
	newSet := lineMultiset(neu)

	var b strings.Builder
	added := 0
	for _, l := range nonEmptyLines(neu) {
		if newSet[l] > oldSet[l] {
			fmt.Fprintf(&b, "+ %s\n", l)
			oldSet[l]++ // consume so duplicate lines aren't reported repeatedly
			added++
			if added >= maxDiffLinesPerFile {
				b.WriteString("+ … (truncated)\n")
				break
			}
		}
	}
	removed := 0
	for _, l := range nonEmptyLines(old) {
		if oldSet[l] > newSet[l] {
			fmt.Fprintf(&b, "- %s\n", l)
			newSet[l]++
			removed++
			if removed >= maxDiffLinesPerFile {
				b.WriteString("- … (truncated)\n")
				break
			}
		}
	}
	return strings.TrimRight(b.String(), "\n")
}

func lineMultiset(s string) map[string]int {
	m := map[string]int{}
	for _, l := range nonEmptyLines(s) {
		m[l]++
	}
	return m
}

// fileManifest is the concise doc stored for a file-producing agent: a sorted
// list of the paths it wrote, instead of dumping the raw code into the doc store.
func fileManifest(agentName string, files map[string]string, rework int) string {
	paths := make([]string, 0, len(files))
	for p := range files {
		paths = append(paths, p)
	}
	sort.Strings(paths)
	var b strings.Builder
	if rework > 0 {
		fmt.Fprintf(&b, "%s — files written (rework %d):\n", agentName, rework)
	} else {
		fmt.Fprintf(&b, "%s — files written:\n", agentName)
	}
	for _, p := range paths {
		fmt.Fprintf(&b, "- %s\n", p)
	}
	return strings.TrimRight(b.String(), "\n")
}

func nonEmptyLines(s string) []string {
	raw := strings.Split(strings.ReplaceAll(s, "\r\n", "\n"), "\n")
	out := make([]string, 0, len(raw))
	for _, l := range raw {
		if t := strings.TrimSpace(l); t != "" {
			out = append(out, t)
		}
	}
	return out
}
