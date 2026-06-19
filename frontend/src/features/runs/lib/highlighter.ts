import * as React from "react"
import { createHighlighterCore, type HighlighterCore } from "shiki/core"
import { createJavaScriptRegexEngine } from "shiki/engine/javascript"

/**
 * Fine-grained Shiki highlighter. Only the languages the bands actually emit are
 * bundled, the engine is the wasm-free JS regex engine, and the whole thing is a
 * lazy singleton so it stays out of the initial bundle until a code viewer opens.
 */

const SUPPORTED_LANGS = new Set(["go", "sql", "markdown"])

/** Map an artifact's declared language to a Shiki language id (or plaintext). */
export function resolveLang(language: string): string {
  const l = language.toLowerCase()
  if (SUPPORTED_LANGS.has(l)) return l
  if (l === "md") return "markdown"
  return "text"
}

let highlighterPromise: Promise<HighlighterCore> | null = null

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [
        import("shiki/themes/github-light.mjs"),
        import("shiki/themes/github-dark.mjs"),
      ],
      langs: [
        import("shiki/langs/go.mjs"),
        import("shiki/langs/sql.mjs"),
        import("shiki/langs/markdown.mjs"),
      ],
      engine: createJavaScriptRegexEngine(),
    })
  }
  return highlighterPromise
}

const htmlCache = new Map<string, string>()

/**
 * Render code to dual-theme HTML. `defaultColor: false` emits `--shiki-light` /
 * `--shiki-dark` custom properties on every token, so light/dark switches by CSS
 * alone (see `.dark .shiki` in index.css) with no re-highlight.
 */
export async function highlightToHtml(
  code: string,
  language: string,
): Promise<string> {
  const lang = resolveLang(language)
  const key = `${lang}::${code}`
  const cached = htmlCache.get(key)
  if (cached) return cached

  const highlighter = await getHighlighter()
  const html = highlighter.codeToHtml(code, {
    lang,
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
  })
  htmlCache.set(key, html)
  return html
}

/**
 * Highlight `code` for React. Returns `null` while the highlighter loads so the
 * caller can show a skeleton, then the dual-theme HTML string.
 */
export function useHighlighted(code: string, language: string): string | null {
  const [html, setHtml] = React.useState<string | null>(() =>
    htmlCache.get(`${resolveLang(language)}::${code}`) ?? null,
  )

  React.useEffect(() => {
    let alive = true
    const cached = htmlCache.get(`${resolveLang(language)}::${code}`)
    if (cached) {
      Promise.resolve().then(() => {
        if (alive) setHtml(cached)
      })
      return () => {
        alive = false
      }
    }
    Promise.resolve().then(() => {
      if (alive) setHtml(null)
    })
    highlightToHtml(code, language)
      .then((result) => {
        if (alive) setHtml(result)
      })
      .catch(() => {
        if (alive) setHtml(null)
      })
    return () => {
      alive = false
    }
  }, [code, language])

  return html
}
