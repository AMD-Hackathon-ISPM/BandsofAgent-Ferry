import type { AgentKey } from "@/lib/domain"
import type {
  AgentMessageVM,
  AgentRuntime,
  Project,
  RecentRunSummary,
  Run,
  User,
} from "@/lib/types"

const T0 = Date.now()
const ago = (sec: number) => new Date(T0 - sec * 1000).toISOString()

export const CURRENT_USER: User = {
  id: "u_1",
  name: "Mara Okafor",
  handle: "m-okafor",
  email: "mara@northwind.systems",
  role: "admin",
}

const payroll: Project = {
  id: "p_payroll",
  name: "Payroll Core",
  repoUrl: "github.com/northwind/payroll-cobol",
  repoOwner: "northwind",
  repoName: "payroll-cobol",
  sourceLanguage: "cobol",
  targetLanguage: "go",
  dbEnabled: true,
}

const ledger: Project = {
  id: "p_ledger",
  name: "Ledger Service",
  repoUrl: "github.com/northwind/ledger-java",
  repoOwner: "northwind",
  repoName: "ledger-java",
  sourceLanguage: "java",
  targetLanguage: "go",
  dbEnabled: false,
}

const claims: Project = {
  id: "p_claims",
  name: "Claims Intake",
  repoUrl: "github.com/northwind/claims-php",
  repoOwner: "northwind",
  repoName: "claims-php",
  sourceLanguage: "php",
  targetLanguage: "rust",
  dbEnabled: true,
}

function roster(
  overrides: Partial<Record<AgentKey, Omit<AgentRuntime, "key">>>,
): AgentRuntime[] {
  const base: AgentKey[] = [
    "router",
    "source_analyzer",
    "business_logic",
    "code_generator",
    "db_migration",
    "test_generator",
    "reviewer",
    "commander",
    "github_connector",
  ]
  return base.map((key) => ({ key, status: "idle", ...overrides[key] }))
}

const run7Messages: AgentMessageVM[] = [
  {
    id: "m1",
    agent: "router",
    type: "task_request",
    phase: "planning",
    summary: "Migration plan ready: 14 COBOL programs, 3 copybooks, 6 target Go packages.",
    payload: { programs: 14, copybooks: 3, targetPackages: 6, strategy: "module-by-module" },
    createdAt: ago(372),
  },
  {
    id: "m2",
    agent: "router",
    type: "handoff",
    phase: "planning",
    summary: "Source map handed to Source Analyzer.",
    targetAgent: "source_analyzer",
    createdAt: ago(366),
  },
  {
    id: "m3",
    agent: "source_analyzer",
    type: "finding",
    phase: "analysis",
    summary: "PAYROLL-MASTER drives gross-to-net. Four COMP-3 fields carry currency.",
    payload: { entrypoint: "PAYROLL-MASTER", comp3Fields: 4, lines: 1840 },
    createdAt: ago(330),
  },
  {
    id: "m4",
    agent: "source_analyzer",
    type: "finding",
    phase: "analysis",
    summary: "Three GOTO-heavy paragraphs in the tax routine. Flagged for careful translation.",
    payload: { paragraphs: ["CALC-FED-TAX", "CALC-STATE-TAX", "CALC-FICA"], risk: "control-flow" },
    createdAt: ago(300),
  },
  {
    id: "m5",
    agent: "source_analyzer",
    type: "handoff",
    phase: "analysis",
    summary: "Structure map handed to Business Logic.",
    targetAgent: "business_logic",
    createdAt: ago(294),
  },
  {
    id: "m6",
    agent: "business_logic",
    type: "finding",
    phase: "analysis",
    summary: "Net pay = gross − (federal + state + FICA). Overtime pays 1.5x past 40 hours.",
    payload: {
      rules: [
        "overtime = 1.5x after 40h/week",
        "FICA capped at annual wage base",
        "state tax varies by employee jurisdiction",
      ],
    },
    createdAt: ago(268),
  },
  {
    id: "m7",
    agent: "business_logic",
    type: "blocker",
    phase: "analysis",
    summary: "Rounding rule is ambiguous: half-up or banker's rounding. Needs a decision.",
    payload: { field: "NET-PAY", candidates: ["half-up", "banker's"] },
    createdAt: ago(250),
  },
  {
    id: "m8",
    agent: "commander",
    type: "decision",
    phase: "analysis",
    summary: "Use half-up rounding to match the legacy PAYROLL-MASTER output exactly.",
    payload: {
      decision: "half-up",
      rationale: "Legacy general ledger reconciles against half-up; banker's would drift by cents.",
    },
    createdAt: ago(236),
  },
  {
    id: "m9",
    agent: "business_logic",
    type: "handoff",
    phase: "analysis",
    summary: "Rules and rounding decision handed to Code Generator.",
    targetAgent: "code_generator",
    createdAt: ago(228),
  },
  {
    id: "m10",
    agent: "code_generator",
    type: "finding",
    phase: "translation",
    summary: "Translated PAYROLL-MASTER. COMP-3 currency mapped to shopspring/decimal.",
    payload: { file: "payroll/master.go", lines: 412, dependency: "github.com/shopspring/decimal" },
    createdAt: ago(196),
  },
  {
    id: "m11",
    agent: "code_generator",
    type: "artifact_created",
    phase: "translation",
    summary: "Generated payroll/master.go.",
    payload: { artifact: "target_code", file: "payroll/master.go" },
    createdAt: ago(192),
  },
  {
    id: "m12",
    agent: "code_generator",
    type: "artifact_created",
    phase: "translation",
    summary: "Generated payroll/tax.go.",
    payload: { artifact: "target_code", file: "payroll/tax.go" },
    createdAt: ago(170),
  },
  {
    id: "m12b",
    agent: "code_generator",
    type: "artifact_created",
    phase: "translation",
    summary: "Payroll package translated: 2 files plus translation notes.",
    payload: {
      files: ["payroll/master.go", "payroll/tax.go"],
      report: "reports/payroll-translation.md",
    },
    createdAt: ago(168),
  },
  {
    id: "m13",
    agent: "code_generator",
    type: "handoff",
    phase: "translation",
    summary: "Schema work handed to DB Migration.",
    targetAgent: "db_migration",
    createdAt: ago(150),
  },
  {
    id: "m14",
    agent: "db_migration",
    type: "finding",
    phase: "db_migration",
    summary: "payroll_history is MyISAM, 2.1M rows, one FULLTEXT index.",
    payload: { table: "payroll_history", engine: "MyISAM", rows: 2_100_000, fulltextIndexes: 1 },
    createdAt: ago(120),
  },
  {
    id: "m15",
    agent: "db_migration",
    type: "artifact_created",
    phase: "db_migration",
    summary: "Drafted migration and rollback SQL for the InnoDB conversion.",
    payload: { artifact: "db_migration_sql", statements: 6 },
    createdAt: ago(112),
  },
  {
    id: "m16",
    agent: "db_migration",
    type: "blocker",
    phase: "db_migration",
    summary: "InnoDB conversion needs a table rebuild: about 40s of write lock. Requires approval.",
    payload: { lockSeconds: 40, requiresDowntime: true, rows: 2_100_000 },
    requiresAction: true,
    createdAt: ago(96),
  },
  {
    id: "m17",
    agent: "db_migration",
    type: "handoff",
    phase: "db_migration",
    summary: "Tests can proceed while the plan waits. Handing to Test Generator.",
    targetAgent: "test_generator",
    createdAt: ago(90),
  },
  {
    id: "m18",
    agent: "test_generator",
    type: "finding",
    phase: "testing",
    summary: "Captured 38 golden cases from the legacy regression fixtures.",
    payload: { goldenCases: 38, source: "fixtures/payroll-1998..2024" },
    createdAt: ago(64),
  },
  {
    id: "m19",
    agent: "test_generator",
    type: "artifact_created",
    phase: "testing",
    summary: "Generated payroll/master_test.go.",
    payload: { artifact: "test_code", file: "payroll/master_test.go" },
    createdAt: ago(52),
  },
  {
    id: "m19b",
    agent: "test_generator",
    type: "artifact_created",
    phase: "testing",
    summary: "Golden suite ready with a coverage summary.",
    payload: {
      files: ["payroll/master_test.go"],
      report: "reports/golden-suite.md",
    },
    createdAt: ago(50),
  },
  {
    id: "m20",
    agent: "reviewer",
    type: "finding",
    phase: "testing",
    summary: "master.go matches 36 of 38 golden cases. Two diffs in leap-year proration.",
    payload: { passed: 36, total: 38, failing: ["1996 leap proration", "2024 leap proration"] },
    createdAt: ago(34),
  },
  {
    id: "m21",
    agent: "reviewer",
    type: "handoff",
    phase: "testing",
    summary: "Proration mismatch handed back to Code Generator.",
    targetAgent: "code_generator",
    createdAt: ago(28),
  },
  {
    id: "m22",
    agent: "code_generator",
    type: "finding",
    phase: "testing",
    summary: "Patching leap-year proration in master.go. Re-running the suite.",
    payload: { file: "payroll/master.go", change: "use 366-day basis in leap years" },
    createdAt: ago(8),
  },
]

export const RUN7_STREAM: AgentMessageVM[] = [
  {
    id: "s1",
    agent: "test_generator",
    type: "finding",
    phase: "testing",
    summary: "Suite re-run: 38 of 38 golden cases pass.",
    payload: { passed: 38, total: 38 },
    createdAt: ago(0),
  },
  {
    id: "s2",
    agent: "reviewer",
    type: "review",
    phase: "testing",
    summary: "Proration fix verified. The translation reconciles to the cent.",
    payload: { verdict: "pass", remaining: "DB plan approval" },
    createdAt: ago(0),
  },
  {
    id: "s3",
    agent: "commander",
    type: "task_request",
    phase: "testing",
    summary: "Hold the pull request until the database plan is approved.",
    targetAgent: "github_connector",
    createdAt: ago(0),
  },
  {
    id: "s4",
    agent: "test_generator",
    type: "artifact_created",
    phase: "testing",
    summary: "Generated payroll/tax_test.go.",
    payload: { artifact: "test_code", file: "payroll/tax_test.go" },
    createdAt: ago(0),
  },
  {
    id: "s5",
    agent: "reviewer",
    type: "finding",
    phase: "testing",
    summary: "Coverage on payroll package is 94%. No untested branches in tax.go.",
    payload: { coverage: 0.94, package: "payroll" },
    createdAt: ago(0),
  },
]

const run7: Run = {
  id: "run_7",
  runNumber: 7,
  project: payroll,
  status: "testing",
  currentPhase: "testing",
  bandRoomName: "payroll-core · run 7",
  sourceCommit: "9f3c1ab7d4e2",
  targetBranch: "ferry/payroll-go",
  startedAt: ago(380),
  agents: roster({
    router: { status: "done", currentTask: "Plan delivered", lastActionAt: ago(366) },
    source_analyzer: { status: "done", currentTask: "Structure mapped", lastActionAt: ago(294) },
    business_logic: { status: "done", currentTask: "Rules extracted", lastActionAt: ago(228) },
    code_generator: {
      status: "active",
      currentTask: "Patching leap-year proration",
      lastActionAt: ago(8),
    },
    db_migration: {
      status: "waiting",
      currentTask: "Awaiting approval on migration plan",
      lastActionAt: ago(96),
    },
    test_generator: { status: "active", currentTask: "Re-running golden suite", lastActionAt: ago(52) },
    reviewer: { status: "active", currentTask: "Reviewing payroll package", lastActionAt: ago(28) },
    commander: { status: "waiting", currentTask: "Holding for DB approval", lastActionAt: ago(236) },
    github_connector: { status: "idle" },
  }),
  messages: run7Messages,
  artifacts: [
    {
      id: "a1",
      type: "target_code",
      fileName: "payroll/master.go",
      sizeBytes: 14_730,
      createdBy: "code_generator",
      preview: `package payroll

import "github.com/shopspring/decimal"

// Master computes gross-to-net for one pay period.
func (e *Employee) Master(p Period) Paycheck {
\tgross := e.Rate.Mul(p.Hours)
\tif p.Hours.GreaterThan(decimal.NewFromInt(40)) {
\t\tot := p.Hours.Sub(decimal.NewFromInt(40))
\t\tgross = gross.Add(e.Rate.Mul(ot).Mul(decimal.NewFromFloat(1.5)))
\t}
\treturn Paycheck{Gross: gross, Net: e.net(gross)}
}`,
    },
    {
      id: "a2",
      type: "target_code",
      fileName: "payroll/tax.go",
      sizeBytes: 9_204,
      createdBy: "code_generator",
      preview: `package payroll

// federalTax replaces the legacy CALC-FED-TAX paragraph.
func federalTax(gross decimal.Decimal, j Jurisdiction) decimal.Decimal {
\tbracket := brackets[j]
\treturn bracket.apply(gross).RoundHalfUp(2)
}`,
    },
    {
      id: "a3",
      type: "db_migration_sql",
      fileName: "migrations/001_payroll_history_innodb.sql",
      sizeBytes: 1_180,
      createdBy: "db_migration",
      preview: `-- Convert payroll_history MyISAM -> InnoDB
ALTER TABLE payroll_history
  ENGINE = InnoDB,
  ALGORITHM = COPY,
  LOCK = SHARED;

-- FULLTEXT index is preserved under InnoDB (MySQL 5.6+)
ALTER TABLE payroll_history
  ADD FULLTEXT KEY ft_notes (notes);`,
    },
    {
      id: "a4",
      type: "db_rollback_sql",
      fileName: "migrations/001_payroll_history_innodb.down.sql",
      sizeBytes: 640,
      createdBy: "db_migration",
      preview: `-- Roll back to MyISAM
ALTER TABLE payroll_history ENGINE = MyISAM;`,
    },
    {
      id: "a5",
      type: "test_code",
      fileName: "payroll/master_test.go",
      sizeBytes: 7_910,
      createdBy: "test_generator",
      preview: `package payroll

// 38 golden cases lifted from the legacy regression fixtures.
func TestMaster_GoldenCases(t *testing.T) {
\tfor _, c := range goldenCases {
\t\tgot := c.emp.Master(c.period)
\t\tif !got.Net.Equal(c.wantNet) {
\t\t\tt.Fatalf("%s: net = %s, want %s", c.name, got.Net, c.wantNet)
\t\t}
\t}
}`,
    },
    {
      id: "a6",
      type: "migration_report",
      fileName: "reports/payroll-translation.md",
      sizeBytes: 3_980,
      createdBy: "code_generator",
      content: `# Payroll package translation

Translated **2 COBOL programs** into idiomatic Go. Source paragraphs map to
exported methods; fixed-point money uses \`github.com/shopspring/decimal\`.

## Files

- \`payroll/master.go\` — \`PAYROLL-MASTER\`, gross-to-net for one pay period
- \`payroll/tax.go\` — \`CALC-FED-TAX\`, federal bracket application

## Decisions

1. COMP-3 currency fields → \`decimal.Decimal\` to preserve rounding behavior.
2. Overtime kept at the legacy 1.5x multiplier past 40 hours.
3. Tax brackets pulled into a \`brackets\` table keyed by jurisdiction.

## Follow-ups

> Two golden cases differ on leap-year proration; tracked back to Code
> Generator for a 366-day basis fix.`,
    },
    {
      id: "a7",
      type: "risk_report",
      fileName: "reports/golden-suite.md",
      sizeBytes: 2_640,
      createdBy: "test_generator",
      content: `# Golden suite coverage

Captured **38 golden cases** from \`fixtures/payroll-1998..2024\` and ran them
against the translated package.

## Results

- 36 / 38 passing
- 2 failing, both in leap-year proration

## Failing cases

1. \`1996 leap proration\`
2. \`2024 leap proration\`

Both stem from a 365-day basis in \`master.go\`; a 366-day basis in leap years
is expected to clear them.`,
    },
  ],
  dbPlan: {
    id: "dbp_7",
    riskLevel: "high",
    requiresDowntime: true,
    estimatedSeconds: 40,
    riskFactors: [
      "2.1M-row table rebuild holds a write lock for ~40s",
      "FULLTEXT index must be recreated after conversion",
      "No online DDL path on the source MySQL 5.6 instance",
    ],
    migrationSqlPreview: `ALTER TABLE payroll_history
  ENGINE = InnoDB,
  ALGORITHM = COPY,
  LOCK = SHARED;`,
  },
  pr: null,
}

const run6: Run = {
  id: "run_6",
  runNumber: 6,
  project: payroll,
  status: "completed",
  currentPhase: null,
  bandRoomName: "payroll-core · run 6",
  sourceCommit: "1b08e7c44a91",
  targetBranch: "ferry/payroll-go-6",
  startedAt: ago(8 * 3600),
  completedAt: ago(8 * 3600 - 540),
  agents: roster({
    router: { status: "done" },
    source_analyzer: { status: "done" },
    business_logic: { status: "done" },
    code_generator: { status: "done" },
    db_migration: { status: "done" },
    test_generator: { status: "done" },
    reviewer: { status: "done" },
    commander: { status: "done" },
    github_connector: { status: "done", currentTask: "PR #214 opened" },
  }),
  messages: [
    {
      id: "r6m1",
      agent: "router",
      type: "task_request",
      phase: "planning",
      summary: "Plan ready: 9 programs, target Go. Reusing the run 5 structure map.",
      createdAt: ago(8 * 3600),
    },
    {
      id: "r6m2",
      agent: "code_generator",
      type: "artifact_created",
      phase: "translation",
      summary: "Generated benefits/enroll.go and benefits/accrual.go.",
      createdAt: ago(8 * 3600 - 200),
    },
    {
      id: "r6m3",
      agent: "test_generator",
      type: "finding",
      phase: "testing",
      summary: "All 52 golden cases pass on the first run.",
      createdAt: ago(8 * 3600 - 360),
    },
    {
      id: "r6m4",
      agent: "reviewer",
      type: "review",
      phase: "review",
      summary: "Artifacts reconcile. Coverage 96%. No blockers.",
      createdAt: ago(8 * 3600 - 470),
    },
    {
      id: "r6m5",
      agent: "commander",
      type: "decision",
      phase: "review",
      summary: "Approved. Ship the pull request.",
      payload: { decision: "ship" },
      createdAt: ago(8 * 3600 - 500),
    },
    {
      id: "r6m6",
      agent: "github_connector",
      type: "artifact_created",
      phase: "pr_generation",
      summary: "Opened PR #214 against main.",
      payload: { pr: 214 },
      createdAt: ago(8 * 3600 - 540),
    },
  ],
  artifacts: [
    {
      id: "r6a1",
      type: "target_code",
      fileName: "benefits/enroll.go",
      sizeBytes: 11_200,
      createdBy: "code_generator",
      preview: "package benefits\n\n// Enroll registers an employee in a plan.",
    },
    {
      id: "r6a2",
      type: "migration_report",
      fileName: "reports/run-6-summary.md",
      sizeBytes: 4_320,
      createdBy: "commander",
      preview: "# Run 6 — Payroll Core\n\n9 programs translated, 52/52 golden cases passing.",
    },
  ],
  dbPlan: {
    id: "dbp_6",
    riskLevel: "low",
    requiresDowntime: false,
    estimatedSeconds: 4,
    riskFactors: ["Small lookup table, online DDL available"],
    approvedBy: "Mara Okafor",
    approvedAt: ago(8 * 3600 - 420),
    migrationSqlPreview: "ALTER TABLE benefit_plans ENGINE = InnoDB, ALGORITHM = INPLACE;",
  },
  pr: {
    number: 214,
    url: "https://github.com/northwind/payroll-cobol/pull/214",
    title: "Migrate benefits module to Go",
    status: "merged",
    sourceBranch: "ferry/payroll-go-6",
    targetBranch: "main",
  },
}

const run5: Run = {
  id: "run_5",
  runNumber: 5,
  project: ledger,
  status: "failed",
  currentPhase: "translation",
  bandRoomName: "ledger-service · run 5",
  sourceCommit: "77af20c9b1de",
  targetBranch: "ferry/ledger-go",
  startedAt: ago(26 * 3600),
  completedAt: ago(26 * 3600 - 210),
  errorMessage:
    "Code Generator could not resolve a circular dependency between LedgerPosting and AccountSnapshot. Manual guidance needed before retry.",
  agents: roster({
    router: { status: "done" },
    source_analyzer: { status: "done" },
    business_logic: { status: "done" },
    code_generator: { status: "blocked", currentTask: "Circular dependency", lastActionAt: ago(26 * 3600 - 210) },
    commander: { status: "done" },
  }),
  messages: [
    {
      id: "r5m1",
      agent: "router",
      type: "task_request",
      phase: "planning",
      summary: "Plan ready: 22 Java classes across 4 packages.",
      createdAt: ago(26 * 3600),
    },
    {
      id: "r5m2",
      agent: "source_analyzer",
      type: "finding",
      phase: "analysis",
      summary: "LedgerPosting and AccountSnapshot reference each other at construction time.",
      createdAt: ago(26 * 3600 - 120),
    },
    {
      id: "r5m3",
      agent: "code_generator",
      type: "blocker",
      phase: "translation",
      summary: "Cannot express the circular construction in idiomatic Go without a design change.",
      payload: { cycle: ["LedgerPosting", "AccountSnapshot"] },
      requiresAction: true,
      createdAt: ago(26 * 3600 - 200),
    },
    {
      id: "r5m4",
      agent: "commander",
      type: "decision",
      phase: "translation",
      summary: "Stopping the run. This needs a human design decision before retry.",
      payload: { decision: "halt" },
      createdAt: ago(26 * 3600 - 210),
    },
  ],
  artifacts: [],
  dbPlan: null,
  pr: null,
}

const run4: Run = {
  id: "run_4",
  runNumber: 4,
  project: claims,
  status: "blocked",
  currentPhase: "db_migration",
  bandRoomName: "claims-intake · run 4",
  sourceCommit: "c0ffee114b2a",
  targetBranch: "ferry/claims-rust",
  startedAt: ago(3 * 86400),
  agents: roster({
    router: { status: "done" },
    source_analyzer: { status: "done" },
    business_logic: { status: "done" },
    code_generator: { status: "done" },
    db_migration: { status: "blocked", currentTask: "Critical plan awaiting approval", lastActionAt: ago(3 * 86400 - 600) },
    commander: { status: "waiting" },
  }),
  messages: [
    {
      id: "r4m1",
      agent: "code_generator",
      type: "artifact_created",
      phase: "translation",
      summary: "Translated claims intake handlers to Rust (axum).",
      createdAt: ago(3 * 86400 - 400),
    },
    {
      id: "r4m2",
      agent: "db_migration",
      type: "finding",
      phase: "db_migration",
      summary: "claims and claim_documents are MyISAM with cross-table triggers.",
      createdAt: ago(3 * 86400 - 520),
    },
    {
      id: "r4m3",
      agent: "db_migration",
      type: "blocker",
      phase: "db_migration",
      summary: "Conversion drops two triggers that enforce referential integrity. Critical risk. Requires approval.",
      payload: { droppedTriggers: ["trg_claim_doc_ins", "trg_claim_doc_del"], risk: "critical" },
      requiresAction: true,
      createdAt: ago(3 * 86400 - 600),
    },
  ],
  artifacts: [
    {
      id: "r4a1",
      type: "db_migration_sql",
      fileName: "migrations/claims_innodb.sql",
      sizeBytes: 2_040,
      createdBy: "db_migration",
      preview: "ALTER TABLE claims ENGINE = InnoDB;\nALTER TABLE claim_documents ENGINE = InnoDB;",
    },
  ],
  dbPlan: {
    id: "dbp_4",
    riskLevel: "critical",
    requiresDowntime: true,
    estimatedSeconds: 180,
    riskFactors: [
      "Two integrity-enforcing triggers are dropped by the conversion",
      "claim_documents has 7.4M rows; rebuild holds a 3-minute lock",
      "No verified rollback for the trigger behavior",
    ],
    migrationSqlPreview: "ALTER TABLE claims ENGINE = InnoDB;\nALTER TABLE claim_documents ENGINE = InnoDB;",
  },
  pr: null,
}

const run8: Run = {
  id: "run_8",
  runNumber: 8,
  project: ledger,
  status: "pending",
  currentPhase: null,
  bandRoomName: "ledger-service · run 8",
  sourceCommit: "e21d9a7c0b34",
  targetBranch: "ferry/ledger-go-8",
  agents: roster({
    router: { status: "waiting", currentTask: "Registering" },
  }),
  messages: [],
  artifacts: [],
  dbPlan: null,
  pr: null,
}

export const RUNS: Record<string, Run> = {
  run_7: run7,
  run_6: run6,
  run_5: run5,
  run_4: run4,
  run_8: run8,
}

export const RECENT_RUNS: RecentRunSummary[] = [
  {
    id: "run_7",
    runNumber: 7,
    projectName: payroll.name,
    sourceLanguage: payroll.sourceLanguage,
    targetLanguage: payroll.targetLanguage,
    status: "testing",
    updatedAt: ago(8),
    messageCount: run7Messages.length,
  },
  {
    id: "run_4",
    runNumber: 4,
    projectName: claims.name,
    sourceLanguage: claims.sourceLanguage,
    targetLanguage: claims.targetLanguage,
    status: "blocked",
    updatedAt: ago(3 * 86400 - 600),
    messageCount: 9,
  },
  {
    id: "run_6",
    runNumber: 6,
    projectName: payroll.name,
    sourceLanguage: payroll.sourceLanguage,
    targetLanguage: payroll.targetLanguage,
    status: "completed",
    updatedAt: ago(8 * 3600 - 540),
    messageCount: 41,
  },
  {
    id: "run_5",
    runNumber: 5,
    projectName: ledger.name,
    sourceLanguage: ledger.sourceLanguage,
    targetLanguage: ledger.targetLanguage,
    status: "failed",
    updatedAt: ago(26 * 3600 - 210),
    messageCount: 12,
  },
]

export function getRun(id: string): Run | undefined {
  return RUNS[id]
}
