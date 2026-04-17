import { __internal, extractHtml, sanitizeForIframe } from "./extractHtml";

const { stripMarkdownFences } = __internal;

describe("stripMarkdownFences", () => {
  test("removes ```html opening fence on its own line", () => {
    const input = ["```html", "<html><body>ok</body></html>", "```"].join("\n");
    expect(stripMarkdownFences(input)).toBe(
      ["", "<html><body>ok</body></html>", ""].join("\n"),
    );
  });

  test("removes bare ``` fences without a language tag", () => {
    const input = ["```", "<div>ok</div>", "```"].join("\n");
    expect(stripMarkdownFences(input)).toBe(["", "<div>ok</div>", ""].join("\n"));
  });

  test("removes indented fences (leading whitespace)", () => {
    const input = ["   ```html", "<html></html>", "   ```"].join("\n");
    expect(stripMarkdownFences(input)).toBe(
      ["", "<html></html>", ""].join("\n"),
    );
  });

  test("tolerates CRLF line endings", () => {
    const input = "```html\r\n<html></html>\r\n```\r\n";
    const result = stripMarkdownFences(input);
    // Fence lines (including their trailing \r) are removed; the non-fence
    // <html> line is preserved and extractable.
    expect(result).not.toContain("```");
    expect(result).toContain("<html></html>");
    expect(extractHtml(input)).toBe("<html></html>");
  });

  test("does not strip backticks embedded inside real HTML", () => {
    const input = "<pre><code>```</code></pre>";
    expect(stripMarkdownFences(input)).toBe(input);
  });

  test("handles language tags with hyphens/plus characters", () => {
    const input = ["```c++", "<html></html>", "```objective-c", "```"].join("\n");
    expect(stripMarkdownFences(input)).toBe(
      ["", "<html></html>", "", ""].join("\n"),
    );
  });

  test("returns the empty string unchanged", () => {
    expect(stripMarkdownFences("")).toBe("");
  });
});

describe("extractHtml", () => {
  test("returns the <html> block when the document is complete", () => {
    const input = "<html><body>hi</body></html>";
    expect(extractHtml(input)).toBe("<html><body>hi</body></html>");
  });

  test("preserves attributes on the opening <html> tag", () => {
    const input = '<html lang="en"><body>hi</body></html>';
    expect(extractHtml(input)).toBe('<html lang="en"><body>hi</body></html>');
  });

  test("strips text before and after the html block", () => {
    const input = "Sure! Here is the code:\n<html><body>x</body></html>\nEnjoy!";
    expect(extractHtml(input)).toBe("<html><body>x</body></html>");
  });

  test("strips markdown fences before extracting", () => {
    const input = [
      "```html",
      "<html><body>fenced</body></html>",
      "```",
    ].join("\n");
    expect(extractHtml(input)).toBe("<html><body>fenced</body></html>");
  });

  test("returns partial document when </html> has not arrived yet (streaming)", () => {
    const input = "```html\n<html><body>stream";
    expect(extractHtml(input)).toBe("<html><body>stream");
  });

  test("returns empty string when there is no <html> tag", () => {
    expect(extractHtml("<div>hello</div>")).toBe("");
    expect(extractHtml("just some commentary")).toBe("");
  });

  test("handles empty input defensively", () => {
    expect(extractHtml("")).toBe("");
  });

  test("picks up the LAST <html> when duplicates exist (ignores example block)", () => {
    const input = [
      "Here is an example:",
      "<html><body>example</body></html>",
      "And the real one:",
      "<html><body>real</body></html>",
    ].join("\n");
    expect(extractHtml(input)).toBe("<html><body>real</body></html>");
  });
});

describe("sanitizeForIframe", () => {
  test("returns the extracted html block when present", () => {
    const input = "```html\n<html><body>ok</body></html>\n```";
    expect(sanitizeForIframe(input)).toBe("<html><body>ok</body></html>");
  });

  test("falls back to fence-stripped text when no <html> tag is present", () => {
    const input = "```html\n<div>fragment</div>\n```";
    const result = sanitizeForIframe(input);
    // Fences removed, fragment preserved.
    expect(result).toContain("<div>fragment</div>");
    expect(result).not.toContain("```");
  });

  test("never returns empty string for a partial stream that only has fences", () => {
    // Streaming edge case: opening fence has arrived, nothing else yet.
    // extractHtml would return "" here; sanitizeForIframe must not.
    const input = "```html\n";
    // Result is the fence-stripped text. It may be whitespace-only, but it
    // should never re-introduce the literal ``` fence into the iframe.
    expect(sanitizeForIframe(input)).not.toContain("```");
  });

  test("handles null/undefined defensively", () => {
    expect(sanitizeForIframe(null)).toBe("");
    expect(sanitizeForIframe(undefined)).toBe("");
    expect(sanitizeForIframe("")).toBe("");
  });

  test("passes complete html documents through untouched", () => {
    const input = '<!DOCTYPE html><html lang="en"><body>x</body></html>';
    expect(sanitizeForIframe(input)).toBe(
      '<html lang="en"><body>x</body></html>',
    );
  });

  test("returns the fragment when the model forgets the <html> wrapper entirely", () => {
    const input = "<section><h1>Hello</h1><p>World</p></section>";
    expect(sanitizeForIframe(input)).toBe(
      "<section><h1>Hello</h1><p>World</p></section>",
    );
  });

  test("streams a partial document gracefully (no </html> yet)", () => {
    const input = "```html\n<html><head><title>Streaming";
    expect(sanitizeForIframe(input)).toBe("<html><head><title>Streaming");
  });

  test("is idempotent when applied twice", () => {
    const input = "```html\n<html><body>x</body></html>\n```";
    const once = sanitizeForIframe(input);
    const twice = sanitizeForIframe(once);
    expect(twice).toBe(once);
  });
});
