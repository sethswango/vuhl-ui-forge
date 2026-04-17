// Decide whether the implementer handoff should include the Angular scaffold.
//
// Extracted from `CopyForClaudeButton.tsx` so it can be unit-tested without
// transitively pulling in the Vite-only `config.ts` module (which uses
// `import.meta.env` and breaks Jest's CommonJS transform).

export function shouldIncludeAngular(frameworkName: string | null): boolean {
  if (!frameworkName) return true;
  const normalized = frameworkName.trim().toLowerCase();
  if (!normalized || normalized === "unknown") return true;
  return normalized === "angular";
}
