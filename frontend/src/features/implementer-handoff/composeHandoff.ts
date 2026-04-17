// Pure composition of the implementer handoff markdown.
//
// The handoff is the last-mile bundle the user feeds to Claude/Codex/Cursor
// so the implementer agent can land the selected variant into the real
// project without stitching pieces together from separate chat windows.
//
// Inputs intentionally mirror the shapes already produced elsewhere in the
// frontend:
//   - variantCode: the raw HTML variant as streamed from /generate-code
//   - specResult: the backend-produced DesignSpecResult (alignment notes,
//     reuse suggestions, new-component hints, annotated markdown)
//   - projectContext: optional project scan (framework / components / tokens
//     / patterns / conventions)
//   - angularConversion: optional result of convertHtmlToAngular for projects
//     whose framework is "angular" or undetected
//
// The function is pure and synchronous so it can be unit-tested without a
// browser, store, or fetch mock.

import type {
  DesignSpecResult,
  ProjectContext,
  ProjectFramework,
} from "../../lib/design-api-types";

export interface ComposeHandoffInput {
  variantIndex: number;
  variantCode: string;
  variantModel?: string | null;
  specResult: DesignSpecResult;
  projectContext?: ProjectContext | null;
  angularConversion?: AngularScaffold | null;
  /**
   * Override the timestamp stamped into the handoff metadata. Defaults to a
   * fresh `new Date().toISOString()`. Tests should pin it to keep snapshots
   * stable.
   */
  generatedAt?: string;
}

export interface AngularScaffold {
  componentTs: string;
  template: string;
  styles?: string | null;
  imports?: string[];
  followUps?: string[];
}

const HEADING = "# Implementer handoff";
const GOAL_STATEMENT =
  "integrate this design into the existing project without regressing component reuse, design tokens, or framework idioms";

export function composeHandoff(input: ComposeHandoffInput): string {
  const {
    variantIndex,
    variantCode,
    variantModel,
    specResult,
    projectContext,
    angularConversion,
    generatedAt,
  } = input;

  const sections: string[] = [];

  sections.push(HEADING);
  sections.push(buildMetadataBlock(variantIndex, variantModel, projectContext, generatedAt));
  sections.push(buildGoalSection(specResult));

  const contextSection = buildProjectContextSection(projectContext);
  if (contextSection) sections.push(contextSection);

  const alignmentSection = buildAlignmentSection(specResult);
  if (alignmentSection) sections.push(alignmentSection);

  const reuseSection = buildReuseSection(specResult);
  if (reuseSection) sections.push(reuseSection);

  const newComponentsSection = buildNewComponentsSection(specResult);
  if (newComponentsSection) sections.push(newComponentsSection);

  sections.push(buildVariantCodeSection(variantCode));

  const angularSection = buildAngularSection(angularConversion);
  if (angularSection) sections.push(angularSection);

  sections.push(buildImplementerChecklist(projectContext, angularConversion));

  return sections.join("\n\n").trimEnd() + "\n";
}

function buildMetadataBlock(
  variantIndex: number,
  variantModel: string | null | undefined,
  projectContext: ProjectContext | null | undefined,
  generatedAt: string | undefined,
): string {
  const stamp = generatedAt ?? new Date().toISOString();
  const modelDisplay = variantModel?.trim() ? variantModel.trim() : "unspecified";
  const frameworkDisplay = describeFramework(projectContext?.framework ?? null);

  return [
    "## At a glance",
    "",
    `- **Variant:** Option ${variantIndex + 1}`,
    `- **Model:** ${modelDisplay}`,
    `- **Target framework:** ${frameworkDisplay}`,
    `- **Generated at:** ${stamp}`,
  ].join("\n");
}

function buildGoalSection(specResult: DesignSpecResult): string {
  const summary = specResult.spec.summary.trim();
  const lines = [
    "## Goal",
    "",
    `Your job as the implementer is to ${GOAL_STATEMENT}.`,
  ];
  if (summary) {
    lines.push("", `> ${summary.replace(/\n+/g, " ")}`);
  }
  return lines.join("\n");
}

function buildProjectContextSection(
  projectContext: ProjectContext | null | undefined,
): string | null {
  if (!projectContext) {
    return [
      "## Project context",
      "",
      "_No project scan was attached._ Before implementing, ask the user to",
      "run the project-context scan in VUHL UI Forge so that component reuse,",
      "design tokens, and naming conventions can be honoured.",
    ].join("\n");
  }

  const lines: string[] = ["## Project context", ""];
  const { framework, components, cssTokens, patterns, conventions, repoPath } =
    projectContext;

  lines.push(`- **Repo path:** \`${repoPath || "(unspecified)"}\``);
  lines.push(`- **Framework:** ${describeFramework(framework)}`);
  if (framework.language) {
    lines.push(`- **Language:** ${framework.language}`);
  }
  if (framework.packageManager) {
    lines.push(`- **Package manager:** ${framework.packageManager}`);
  }

  const stateSignals = summarizePatternSignals(patterns);
  if (stateSignals) {
    lines.push(`- **State style:** ${stateSignals}`);
  }

  if (components.length > 0) {
    const sample = components
      .slice(0, 6)
      .map((component) => {
        const selector = component.selector
          ? ` \`${component.selector}\``
          : "";
        return `${component.name}${selector}`;
      })
      .join(", ");
    const overflow =
      components.length > 6 ? ` (+${components.length - 6} more)` : "";
    lines.push(
      `- **Reusable components discovered:** ${components.length} — ${sample}${overflow}`,
    );
  } else {
    lines.push("- **Reusable components discovered:** none");
  }

  const tokenSummary = summarizeTokens(cssTokens);
  if (tokenSummary) {
    lines.push(`- **Design tokens:** ${tokenSummary}`);
  }

  const conventionSummary = summarizeConventions(conventions);
  if (conventionSummary) {
    lines.push(`- **Conventions:** ${conventionSummary}`);
  }

  if (projectContext.warnings.length > 0) {
    lines.push(
      `- **Scan warnings:** ${projectContext.warnings
        .slice(0, 3)
        .map((warning) => `\`${warning}\``)
        .join("; ")}`,
    );
  }

  return lines.join("\n");
}

function buildAlignmentSection(specResult: DesignSpecResult): string | null {
  const notes = specResult.spec.alignmentNotes.filter(
    (note) => note.trim().length > 0,
  );
  if (notes.length === 0) return null;
  const bullets = notes.map((note) => `- ${note.trim()}`).join("\n");
  return ["## Alignment notes", "", bullets].join("\n");
}

function buildReuseSection(specResult: DesignSpecResult): string | null {
  const suggestions = specResult.spec.reuseSuggestions;
  if (suggestions.length === 0) return null;
  const lines: string[] = ["## Reuse candidates", ""];
  for (const entry of suggestions) {
    const selector = entry.componentSelector
      ? ` (\`${entry.componentSelector}\`)`
      : "";
    lines.push(
      `- **${entry.componentName}**${selector} — confidence: ${entry.confidence}`,
    );
    if (entry.componentFile) {
      lines.push(`  - file: \`${entry.componentFile}\``);
    }
    if (entry.rationale) {
      lines.push(`  - rationale: ${entry.rationale}`);
    }
  }
  return lines.join("\n");
}

function buildNewComponentsSection(
  specResult: DesignSpecResult,
): string | null {
  const names = specResult.spec.newComponentsNeeded.filter(
    (name) => name.trim().length > 0,
  );
  if (names.length === 0) return null;
  const bullets = names.map((name) => `- ${name.trim()}`).join("\n");
  return ["## New components likely needed", "", bullets].join("\n");
}

function buildVariantCodeSection(variantCode: string): string {
  const trimmed = variantCode.trimEnd();
  return ["## Selected variant HTML", "", "```html", trimmed, "```"].join(
    "\n",
  );
}

function buildAngularSection(
  scaffold: AngularScaffold | null | undefined,
): string | null {
  if (!scaffold) return null;

  const sections: string[] = ["## Angular scaffold (bridge output)", ""];
  sections.push(
    "The bridge converter produced a starting Angular 17+ standalone",
    "component. Treat this as a first draft; align it with the project's",
    "actual component pattern before committing.",
  );

  sections.push("", "### `component.ts`", "", "```ts", scaffold.componentTs.trimEnd(), "```");
  sections.push("", "### `component.html`", "", "```html", scaffold.template.trimEnd(), "```");

  if (scaffold.styles && scaffold.styles.trim().length > 0) {
    sections.push(
      "",
      "### `component.scss`",
      "",
      "```scss",
      scaffold.styles.trimEnd(),
      "```",
    );
  }

  const followUps = (scaffold.followUps ?? []).filter(
    (note) => note.trim().length > 0,
  );
  if (followUps.length > 0) {
    sections.push("", "### Angular follow-up notes", "");
    for (const note of followUps) {
      sections.push(`- ${note}`);
    }
  }

  return sections.join("\n");
}

function buildImplementerChecklist(
  projectContext: ProjectContext | null | undefined,
  scaffold: AngularScaffold | null | undefined,
): string {
  const lines: string[] = ["## Implementer checklist", ""];
  lines.push(
    "- [ ] Place the new component files under the project's established folder layout.",
  );
  lines.push(
    "- [ ] Reuse the suggested components verbatim when a high-confidence match exists; only add new components where none apply.",
  );
  if (projectContext?.cssTokens?.tokenSources?.length) {
    lines.push(
      `- [ ] Bind any colours, spacing, and typography to the project's existing design tokens (sources: ${projectContext.cssTokens.tokenSources
        .map((source) => `\`${source}\``)
        .join(", ")}).`,
    );
  } else {
    lines.push(
      "- [ ] Bind colours, spacing, and typography to the project's existing design tokens; do not hard-code values.",
    );
  }
  if (scaffold) {
    lines.push(
      "- [ ] Reconcile the Angular scaffold with the real component pattern (signals / inputs / lifecycle hooks) and remove the scaffold's convenience wrappers where they conflict.",
    );
  }
  lines.push(
    "- [ ] Run the repo's linter, formatter, and tests before opening a pull request.",
  );
  lines.push(
    "- [ ] Capture a quick before/after visual for the impacted view(s) so the reviewer can verify the change at a glance.",
  );
  return lines.join("\n");
}

function describeFramework(framework: ProjectFramework | null): string {
  if (!framework) return "not detected";
  const name = framework.name?.trim() || "unknown";
  const version = framework.version?.trim();
  if (!version) return name;
  return `${name} ${version}`;
}

function summarizePatternSignals(
  patterns: ProjectContext["patterns"] | null | undefined,
): string | null {
  if (!patterns) return null;
  const signals: string[] = [];
  if (patterns.stateStyle) signals.push(patterns.stateStyle);
  if (patterns.usesSignals) signals.push("angular signals");
  if (patterns.usesObservables || patterns.usesRxjs)
    signals.push("rxjs observables");
  if (patterns.usesHooks) signals.push("react hooks");
  if (patterns.usesCompositionApi) signals.push("vue composition api");
  if (patterns.angularStandalone === true) signals.push("standalone components");
  if (patterns.angularZoneless) signals.push("zoneless change detection");
  if (signals.length === 0) return null;
  return dedupe(signals).join(", ");
}

function summarizeTokens(tokens: ProjectContext["cssTokens"]): string | null {
  if (!tokens) return null;
  const pieces: string[] = [];
  if (tokens.tailwindCustomClasses.length > 0) {
    pieces.push(
      `${tokens.tailwindCustomClasses.length} tailwind custom class${tokens.tailwindCustomClasses.length === 1 ? "" : "es"}`,
    );
  }
  if (tokens.tailwindThemeKeys.length > 0) {
    pieces.push(`${tokens.tailwindThemeKeys.length} tailwind theme key${tokens.tailwindThemeKeys.length === 1 ? "" : "s"}`);
  }
  const cssVarCount = Object.keys(tokens.cssCustomProperties).length;
  if (cssVarCount > 0) {
    pieces.push(`${cssVarCount} css custom propert${cssVarCount === 1 ? "y" : "ies"}`);
  }
  const scssCount = Object.keys(tokens.scssVariables).length;
  if (scssCount > 0) {
    pieces.push(`${scssCount} scss variable${scssCount === 1 ? "" : "s"}`);
  }
  if (pieces.length === 0) return null;
  return pieces.join(", ");
}

function summarizeConventions(
  conventions: ProjectContext["conventions"],
): string | null {
  if (!conventions) return null;
  const pieces: string[] = [];
  if (conventions.namingStyle) pieces.push(`naming: ${conventions.namingStyle}`);
  if (conventions.importStyle) pieces.push(`imports: ${conventions.importStyle}`);
  if (conventions.templateStyle)
    pieces.push(`templates: ${conventions.templateStyle}`);
  if (conventions.folderLayout.length > 0) {
    const sample = conventions.folderLayout.slice(0, 3).join(", ");
    pieces.push(`folders: ${sample}`);
  }
  if (pieces.length === 0) return null;
  return pieces.join("; ");
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}
