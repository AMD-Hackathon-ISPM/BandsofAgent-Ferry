import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Minimal, dependency-free markdown renderer for agent messages. It is not a
 * full CommonMark implementation — just enough structure (headings, bold,
 * inline code, fenced code blocks, lists, blockquotes, paragraphs) to turn the
 * band's raw LLM output into something readable instead of a wall of asterisks.
 * Output is built as React nodes (no dangerouslySetInnerHTML), so it is safe.
 */

type Block =
  | { kind: "code"; text: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "para"; text: string }

const LIST_RE = /^\s*([-*+]|\d+\.)\s+/
const HEADING_RE = /^(#{1,6})\s+(.*)$/
const QUOTE_RE = /^\s*>\s?/
const FENCE_RE = /^```/

function parseBlocks(content: string): Block[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n")
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (FENCE_RE.test(line)) {
      const buf: string[] = []
      i++
      while (i < lines.length && !FENCE_RE.test(lines[i])) {
        buf.push(lines[i])
        i++
      }
      i++ // consume closing fence
      blocks.push({ kind: "code", text: buf.join("\n") })
      continue
    }

    if (line.trim() === "") {
      i++
      continue
    }

    const heading = line.match(HEADING_RE)
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2].trim() })
      i++
      continue
    }

    if (LIST_RE.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line)
      const items: string[] = []
      while (i < lines.length && LIST_RE.test(lines[i])) {
        items.push(lines[i].replace(LIST_RE, ""))
        i++
      }
      blocks.push({ kind: "list", ordered, items })
      continue
    }

    if (QUOTE_RE.test(line)) {
      const buf: string[] = []
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        buf.push(lines[i].replace(QUOTE_RE, ""))
        i++
      }
      blocks.push({ kind: "quote", text: buf.join("\n") })
      continue
    }

    const buf: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !FENCE_RE.test(lines[i]) &&
      !HEADING_RE.test(lines[i]) &&
      !LIST_RE.test(lines[i]) &&
      !QUOTE_RE.test(lines[i])
    ) {
      buf.push(lines[i])
      i++
    }
    blocks.push({ kind: "para", text: buf.join("\n") })
  }

  return blocks
}

const INLINE_RE = /(`[^`]+`|\*\*[^*]+\*\*)/g

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let last = 0
  let token = 0
  let m: RegExpExecArray | null
  INLINE_RE.lastIndex = 0
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const t = m[0]
    if (t.startsWith("`")) {
      nodes.push(
        <code
          key={`${keyPrefix}-c${token}`}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-primary-bright"
        >
          {t.slice(1, -1)}
        </code>,
      )
    } else {
      nodes.push(
        <strong key={`${keyPrefix}-b${token}`} className="font-semibold text-foreground">
          {t.slice(2, -2)}
        </strong>,
      )
    }
    last = m.index + t.length
    token++
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function renderBlock(block: Block, i: number): React.ReactNode {
  switch (block.kind) {
    case "code":
      return (
        <pre
          key={i}
          className="overflow-x-auto border border-border bg-background/60 p-2.5 text-[11px] leading-relaxed text-foreground/85"
        >
          <code className="font-mono">{block.text}</code>
        </pre>
      )
    case "heading":
      return (
        <p
          key={i}
          className={cn(
            "font-semibold text-foreground",
            block.level <= 1 ? "text-[13px]" : "text-[12.5px]",
          )}
        >
          {renderInline(block.text, `h${i}`)}
        </p>
      )
    case "list": {
      const items = block.items.map((item, j) => (
        <li key={j} className="break-words">
          {renderInline(item, `l${i}-${j}`)}
        </li>
      ))
      return block.ordered ? (
        <ol key={i} className="ml-4 list-decimal space-y-0.5 marker:text-muted-foreground">
          {items}
        </ol>
      ) : (
        <ul key={i} className="ml-4 list-disc space-y-0.5 marker:text-muted-foreground">
          {items}
        </ul>
      )
    }
    case "quote":
      return (
        <blockquote
          key={i}
          className="border-l-2 border-border pl-2.5 whitespace-pre-wrap break-words text-muted-foreground"
        >
          {renderInline(block.text, `q${i}`)}
        </blockquote>
      )
    default:
      return (
        <p key={i} className="whitespace-pre-wrap break-words">
          {renderInline(block.text, `p${i}`)}
        </p>
      )
  }
}

export function Markdown({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  const blocks = React.useMemo(() => parseBlocks(content), [content])
  return (
    <div
      className={cn(
        "flex flex-col gap-2 text-[12px] leading-relaxed text-foreground/90",
        className,
      )}
    >
      {blocks.map((b, i) => renderBlock(b, i))}
    </div>
  )
}
