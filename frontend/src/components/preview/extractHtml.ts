// Extract HTML content emitted by an LLM, tolerating markdown code fences
// that models sometimes wrap around HTML even when asked not to. This is
// the mirror of the backend's `extract_html_content` helper and should be
// kept roughly in sync so previews stay stable across the streaming path.

// Matches a markdown fence line on its own line, optionally indented and
// optionally tagged with a language. Intentionally anchored with `^` / `$`
// under the `m` flag so backticks embedded inside real HTML (e.g. inside a
// `<code>` block) are never stripped.
const FENCE_LINE_RE = /^[\t ]*`{3,}[\w+-]*[\t \r]*$/gm;

function stripMarkdownFences(text: string): string {
  if (!text) return text;
  return text.replace(FENCE_LINE_RE, "");
}

// Find the `<html ...>` block in `code` and return the slice from that tag
// up through the matching `</html>` (or to the end of the string if the
// stream hasn't produced the closing tag yet). Returns "" when no `<html>`
// tag is present — preserved for the existing video-mode caller that uses
// the empty return as a "not HTML yet" signal.
export function extractHtml(code: string): string {
  if (!code) return "";

  const cleaned = stripMarkdownFences(code);

  const htmlStartMatch = cleaned.match(/<html[^>]*>/i);
  if (!htmlStartMatch) {
    return "";
  }

  const lastHtmlStartIndex = cleaned.lastIndexOf(htmlStartMatch[0]);
  const closeIndex = cleaned.indexOf("</html>", lastHtmlStartIndex);

  if (closeIndex !== -1) {
    return cleaned.slice(lastHtmlStartIndex, closeIndex + "</html>".length);
  }

  // Streaming: we have `<html>` but haven't seen `</html>` yet. Return the
  // partial document so the preview can render progressively.
  return cleaned.slice(lastHtmlStartIndex);
}

// Prepare an arbitrary LLM output blob for injection into `iframe.srcdoc`.
//
// This is deliberately forgiving: if the model emits a full `<html>`
// document we extract it cleanly; if it emits a fragment without an `<html>`
// wrapper (common for partial streams or when a model ignores instructions)
// we return the fence-stripped text so the iframe still shows something
// useful. Returning an empty string when no `<html>` tag is present — as
// `extractHtml` does for its legacy caller — would leave the user staring
// at a blank preview during streaming, which is exactly the fragility this
// helper exists to prevent.
export function sanitizeForIframe(code: string | null | undefined): string {
  if (!code) return "";

  const cleaned = stripMarkdownFences(code);
  const extracted = extractHtml(cleaned);
  if (extracted) return extracted;

  // No `<html>` tag present. Fall back to the fence-stripped text so
  // fragments like `<div>...</div>` still render and early streaming chunks
  // don't produce a blank iframe.
  return cleaned;
}

// Exported for tests only. Kept deliberately narrow.
export const __internal = { stripMarkdownFences };
