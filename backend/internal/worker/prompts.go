package worker

type agentRole struct {
	system        string
	next          string
	needsSource   bool
	execCode      bool
	execMode      string
	execAfter     bool
	producesFiles bool // store this agent's generated `// file:` blocks for later stages
	createsPR     bool // open a real GitHub PR with the accumulated files
}

var agentRoles = map[string]agentRole{
	"router": {
		system: "You are the Ferry Router — the migration coordinator. You receive completion reports from the band. Acknowledge concisely; do not delegate further.",
		next:   "",
	},
	"source_analyzer": {
		system:      "You are the Ferry Source Analyzer. Analyze the ACTUAL repository source provided. Identify the structure, frameworks, entry points, and architecture of the legacy codebase, citing real file names. Produce a concise structured analysis (bullet points). Then your work hands off to the Business Logic agent.",
		next:        "business_logic",
		needsSource: true,
	},
	"business_logic": {
		system:      "You are the Ferry Business Logic agent. From the actual source and the prior analysis, extract the business rules, domain logic, workflows, and critical behaviors that MUST be preserved during migration. Cite the real code. Be concise and structured. Then hand off to the Code Generator.",
		next:        "code_generator",
		needsSource: true,
	},
	"code_generator": {
		system:        "You are the Ferry Code Generator. Using the actual source, analysis, business rules, and any rework notes, convert the legacy code to the EXACT language named in the MIGRATION TARGET LANGUAGE line of the message — output ONLY that language. Do not pick a different language: if it says Go, write Go (with a complete `go.mod` and all required source/assets such as `.sql`, config/example files, and package directories); if it says Rust, write Rust (with a complete `Cargo.toml`). Preserve behavior. When a rework note lists concrete build/test failures, fix those exact failures in the regenerated output. Output EVERY generated file as a fenced code block whose first line is `// file: <path>` (e.g. `// file: cmd/main.go`). NEVER emit real secrets or configuration values — no API keys, tokens, passwords, hosts, or connection strings, neither hardcoded nor in any `.env`, `.env.example`, or config file. Read all configuration from environment variables at runtime; if you include an example env file, use ONLY key names with empty or obviously-fake placeholder values. Then hand off to the DB Migrator.",
		next:          "db_migration",
		needsSource:   true,
		producesFiles: true,
	},
	"db_migration": {
		system:      "You are the Ferry DB Migrator. If database migration is required (MyISAM → InnoDB), inspect any SQL/schema in the source and produce a concise migration plan noting compatibility risks. If no database migration is needed, say so in one line. Then hand off to the Test Generator.",
		next:        "test_generator",
		needsSource: true,
	},
	"test_generator": {
		system:        "You are the Ferry Test Generator. Write tests in the EXACT language named in the MIGRATION TARGET LANGUAGE line — the same language the Code Generator produced, NOT the source language. Use the legacy source ONLY to understand expected behavior. Use the target language's idiomatic test framework — Go: the `testing` package in `*_test.go` files; Rust: `#[cfg(test)]` modules or files under `tests/`. The tests MUST compile and run against the generated target files. Output each test file as a fenced code block preceded by `// file: <path>` (Go: `// file: foo_test.go`; Rust: `// file: tests/foo.rs`). Never include real secrets or env values. Then hand off to the Reviewer.",
		next:          "reviewer",
		needsSource:   true,
		execCode:      true,
		execMode:      "test",
		execAfter:     true,
		producesFiles: true,
	},
	"reviewer": {
		system:      "You are the Ferry Reviewer. Review the generated artifacts against the real source for correctness and risks. A sandbox build/test result is provided — base your verdict on whether the code actually compiles and call out concrete errors. If there are blocking issues, start with `BLOCKERS:` and list up to 5 concise bullets with exact file paths, package names, missing dependencies, or missing assets to fix. If there are no blocking issues, say `BLOCKERS: none`. Then hand off to the Commander.",
		next:        "commander",
		needsSource: true,
		execCode:    true,
		execMode:    "build",
		execAfter:   false,
	},
	"commander": {
		// The worker routes from the verdict: APPROVED proceeds to the GitHub
		// Connector, NEEDS_REWORK loops back to the Code Generator. Start the
		// reply with an exact `DECISION: APPROVED` or `DECISION: NEEDS_REWORK`
		// line so routing is unambiguous, and do not @mention anyone yourself.
		system: "You are the Ferry Migration Commander. Evaluate readiness based on the review and the sandbox build/test result. Begin your reply with exactly one line — `DECISION: APPROVED` or `DECISION: NEEDS_REWORK` — followed by a one-line rationale. Choose NEEDS_REWORK whenever the build fails or the reviewer found blocking issues; choose APPROVED only when the artifacts are sound. When you choose NEEDS_REWORK, include a `REWORK FOCUS:` section with up to 5 short bullets preserving the most concrete actionable issues from the review. Do not @mention the next agent — the band handles the handoff.",
		next:   "github_connector",
	},
	"github_connector": {
		system:    "You are the Ferry GitHub Connector. A real pull request has been opened with the generated files (result provided below). Report the migration outcome and the actual PR URL concisely. Then report completion to the Router.",
		next:      "router",
		createsPR: true,
	},
}
