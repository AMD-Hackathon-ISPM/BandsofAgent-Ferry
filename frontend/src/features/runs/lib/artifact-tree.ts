import type { Artifact } from "@/lib/types"

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
