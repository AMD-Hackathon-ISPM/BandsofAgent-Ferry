import { ARTIFACT_TYPES } from "@/lib/domain"
import type { AgentMessageVM, Artifact } from "@/lib/types"

/** Full repo-relative path for an artifact (falls back to the bare name). */
export function artifactPath(a: Artifact): string {
  return a.filePath || a.fileName
}

/**
 * Full paths fed to the Pierre file tree — using the repo-relative path (not the
 * bare filename) is what makes the tree nest by folder instead of rendering flat.
 */
export function buildArtifactPaths(artifacts: Artifact[]): string[] {
  return artifacts.map(artifactPath)
}

/** Resolve a selected tree path back to its artifact. */
export function artifactByPath(artifacts: Artifact[]): Map<string, Artifact> {
  return new Map(artifacts.map((a) => [artifactPath(a), a]))
}

/** Body to render, preferring full content over the preview snippet. */
export function artifactBody(artifact: Artifact): string {
  return artifact.content ?? artifact.preview ?? ""
}

/** True when only the truncated preview is available (no full content yet). */
export function isPreviewOnly(artifact: Artifact): boolean {
  return !artifact.content && Boolean(artifact.preview)
}

/** Basename for headers, e.g. `payroll/master.go` -> `master.go`. */
export function baseName(path: string): string {
  const i = path.lastIndexOf("/")
  return i === -1 ? path : path.slice(i + 1)
}

/** True when an artifact renders as a readable document rather than code. */
export function isReportArtifact(a: Artifact): boolean {
  return ARTIFACT_TYPES[a.type].language === "markdown"
}

/**
 * Files a message references, resolved against the run's artifacts. A message
 * advertises attachments through three payload keys, all repo-relative paths:
 *   `file`    — single file (legacy shape)
 *   `files`   — several files in one message
 *   `report`  — a markdown report to open in the reading modal
 * Resolved artifacts split into `code` (open in the viewer) and `reports` (open
 * in the modal); `unresolved` keeps any path with no artifact yet (e.g. a file
 * that streamed before its artifact landed) so the row can still show a badge.
 */
export function messageAttachments(
  message: AgentMessageVM,
  byPath: Map<string, Artifact>,
): { code: Artifact[]; reports: Artifact[]; unresolved: string[] } {
  const payload = message.payload
  const candidates: string[] = []
  if (typeof payload?.file === "string") candidates.push(payload.file)
  if (Array.isArray(payload?.files))
    for (const f of payload.files) if (typeof f === "string") candidates.push(f)
  if (typeof payload?.report === "string") candidates.push(payload.report)

  const code: Artifact[] = []
  const reports: Artifact[] = []
  const unresolved: string[] = []
  const seen = new Set<string>()
  for (const path of candidates) {
    if (seen.has(path)) continue
    seen.add(path)
    const artifact = byPath.get(path)
    if (!artifact) unresolved.push(path)
    else if (isReportArtifact(artifact)) reports.push(artifact)
    else code.push(artifact)
  }
  return { code, reports, unresolved }
}
