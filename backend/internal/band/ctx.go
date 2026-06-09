package band

import (
	"fmt"
	"regexp"
	"strings"
)

type RunCtx struct {
	Repo   string
	Branch string
	Src    string
	Tgt    string
	User   string
}

var ctxRe = regexp.MustCompile(`\[ferry-ctx ([^\]]*)\]`)
var kvRe = regexp.MustCompile(`(\w+)="([^"]*)"`)

func MarshalCtx(c RunCtx) string {
	return fmt.Sprintf(`[ferry-ctx repo=%q branch=%q src=%q tgt=%q user=%q]`, c.Repo, c.Branch, c.Src, c.Tgt, c.User)
}

func ParseCtx(content string) (RunCtx, bool) {
	m := ctxRe.FindStringSubmatch(content)
	if m == nil {
		return RunCtx{}, false
	}
	var c RunCtx
	for _, kv := range kvRe.FindAllStringSubmatch(m[1], -1) {
		switch kv[1] {
		case "repo":
			c.Repo = kv[2]
		case "branch":
			c.Branch = kv[2]
		case "src":
			c.Src = kv[2]
		case "tgt":
			c.Tgt = kv[2]
		case "user":
			c.User = kv[2]
		}
	}
	return c, c.Repo != ""
}

func StripCtx(content string) string {
	return strings.TrimSpace(ctxRe.ReplaceAllString(content, ""))
}
