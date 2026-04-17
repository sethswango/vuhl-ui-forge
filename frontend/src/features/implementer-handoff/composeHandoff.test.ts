import { composeHandoff, type AngularScaffold } from "./composeHandoff";
import type {
  DesignSpecResult,
  ProjectContext,
} from "../../lib/design-api-types";

const FIXED_STAMP = "2026-04-17T00:00:00.000Z";

function baseSpec(overrides: Partial<DesignSpecResult> = {}): DesignSpecResult {
  return {
    sessionId: "sess-1",
    variantIndex: 2,
    variantId: "var-3",
    annotatedMarkdown: "# Auto-generated spec markdown (not used in tests)",
    spec: {
      summary: "Dashboard card with rounded borders and a primary CTA.",
      alignmentNotes: [
        "Reuse `CardComponent` for the outer container.",
        "Bind the CTA to a signal-backed click handler.",
      ],
      reuseSuggestions: [
        {
          componentName: "CardComponent",
          componentSelector: "app-card",
          componentFile: "src/app/ui/card.component.ts",
          rationale: "Root <section class='card'> matches this component.",
          confidence: "high",
        },
      ],
      newComponentsNeeded: ["metric-chip"],
      projectContextUsed: true,
    },
    ...overrides,
  };
}

function baseProjectContext(
  overrides: Partial<ProjectContext> = {},
): ProjectContext {
  return {
    repoPath: "C:/dev/target-app",
    framework: {
      name: "angular",
      version: "17.3.0",
      language: "typescript",
      packageManager: "yarn",
      buildTool: "angular-cli",
      evidence: ["angular.json", "package.json#dependencies.@angular/core"],
    },
    components: [
      {
        name: "CardComponent",
        selector: "app-card",
        filePath: "src/app/ui/card.component.ts",
        kind: "angular",
        inputs: [],
        standalone: true,
        exported: true,
      },
      {
        name: "ButtonComponent",
        selector: "app-button",
        filePath: "src/app/ui/button.component.ts",
        kind: "angular",
        inputs: [],
        standalone: true,
        exported: true,
      },
    ],
    cssTokens: {
      tailwindConfigPath: "tailwind.config.ts",
      tailwindThemeKeys: ["colors.brand", "spacing"],
      tailwindCustomClasses: ["btn-primary"],
      cssCustomProperties: { "--color-brand": "#6d28d9" },
      scssVariables: { "$spacing-lg": "24px" },
      tokenSources: ["tailwind.config.ts", "src/styles/tokens.scss"],
    },
    patterns: {
      usesSignals: true,
      usesObservables: true,
      usesHooks: false,
      usesCompositionApi: false,
      usesRxjs: true,
      angularStandalone: true,
      angularZoneless: true,
      stateStyle: "signals",
      renderingStyle: "standalone-components",
      evidence: ["uses signal() in card.component.ts"],
    },
    conventions: {
      namingStyle: "kebab-case",
      folderLayout: ["src/app/ui", "src/app/features"],
      importStyle: "absolute",
      templateStyle: "inline-html",
      notes: ["components live next to their template"],
    },
    filesScanned: 128,
    truncated: false,
    warnings: [],
    ...overrides,
  };
}

describe("composeHandoff", () => {
  it("emits a standalone document even without project context", () => {
    const spec = baseSpec();
    const markdown = composeHandoff({
      variantIndex: 2,
      variantCode: "<section class='card'>Hello</section>",
      variantModel: "claude-sonnet-4",
      specResult: spec,
      projectContext: null,
      generatedAt: FIXED_STAMP,
    });

    expect(markdown.startsWith("# Implementer handoff")).toBe(true);
    expect(markdown).toContain("## At a glance");
    expect(markdown).toContain("**Variant:** Option 3");
    expect(markdown).toContain("**Model:** claude-sonnet-4");
    expect(markdown).toContain(`**Generated at:** ${FIXED_STAMP}`);
    expect(markdown).toContain("**Target framework:** not detected");
    expect(markdown).toContain("## Goal");
    expect(markdown).toContain(
      "integrate this design into the existing project without regressing",
    );
    expect(markdown).toContain("## Project context");
    expect(markdown).toContain("No project scan was attached.");
    expect(markdown).toContain("## Alignment notes");
    expect(markdown).toContain("Reuse `CardComponent`");
    expect(markdown).toContain("## Reuse candidates");
    expect(markdown).toContain("**CardComponent**");
    expect(markdown).toContain("## New components likely needed");
    expect(markdown).toContain("- metric-chip");
    expect(markdown).toContain("## Selected variant HTML");
    expect(markdown).toContain("<section class='card'>Hello</section>");
    expect(markdown).not.toContain("## Angular scaffold");
    expect(markdown).toContain("## Implementer checklist");
    expect(markdown).toContain("- [ ] Place the new component files");
  });

  it("summarizes the project context when available", () => {
    const spec = baseSpec();
    const context = baseProjectContext();
    const markdown = composeHandoff({
      variantIndex: 0,
      variantCode: "<div>ok</div>",
      variantModel: null,
      specResult: spec,
      projectContext: context,
      generatedAt: FIXED_STAMP,
    });

    expect(markdown).toContain("**Repo path:** `C:/dev/target-app`");
    expect(markdown).toContain("**Framework:** angular 17.3.0");
    expect(markdown).toContain("**State style:** signals");
    expect(markdown).toContain("angular signals");
    expect(markdown).toContain("rxjs observables");
    expect(markdown).toContain("standalone components");
    expect(markdown).toContain("zoneless change detection");
    expect(markdown).toContain(
      "**Reusable components discovered:** 2 — CardComponent `app-card`",
    );
    expect(markdown).toMatch(
      /\*\*Design tokens:\*\*[^\n]*tailwind custom class/,
    );
    expect(markdown).toMatch(/\*\*Conventions:\*\*[^\n]*naming: kebab-case/);
    expect(markdown).toContain(
      "Bind any colours, spacing, and typography to the project's existing design tokens (sources: `tailwind.config.ts`, `src/styles/tokens.scss`)",
    );
  });

  it("drops an empty alignment section and keeps the summary blockquote", () => {
    const spec = baseSpec({
      spec: {
        summary: "A tight, information-dense card.",
        alignmentNotes: [],
        reuseSuggestions: [],
        newComponentsNeeded: [],
        projectContextUsed: false,
      },
    });

    const markdown = composeHandoff({
      variantIndex: 0,
      variantCode: "<div />",
      variantModel: undefined,
      specResult: spec,
      projectContext: null,
      generatedAt: FIXED_STAMP,
    });

    expect(markdown).toContain("> A tight, information-dense card.");
    expect(markdown).not.toContain("## Alignment notes");
    expect(markdown).not.toContain("## Reuse candidates");
    expect(markdown).not.toContain("## New components likely needed");
    expect(markdown).toContain("**Model:** unspecified");
  });

  it("includes the Angular scaffold and its follow-up notes only when provided", () => {
    const spec = baseSpec();
    const scaffold: AngularScaffold = {
      componentTs: "@Component({ selector: 'app-new' }) export class X {}",
      template: "<section class='card'></section>",
      styles: ".card { display: block; }",
      followUps: [
        "Add `FormsModule` to the imports array if you keep the two-way binding.",
        "Replace the scaffold's local signal with the actual parent input.",
      ],
    };

    const markdown = composeHandoff({
      variantIndex: 1,
      variantCode: "<section>ok</section>",
      variantModel: "gpt-5.4-medium",
      specResult: spec,
      projectContext: baseProjectContext(),
      angularConversion: scaffold,
      generatedAt: FIXED_STAMP,
    });

    expect(markdown).toContain("## Angular scaffold (bridge output)");
    expect(markdown).toContain("### `component.ts`");
    expect(markdown).toContain(
      "@Component({ selector: 'app-new' }) export class X {}",
    );
    expect(markdown).toContain("### `component.html`");
    expect(markdown).toContain("### `component.scss`");
    expect(markdown).toContain(".card { display: block; }");
    expect(markdown).toContain("### Angular follow-up notes");
    expect(markdown).toContain("- Add `FormsModule` to the imports array");
    expect(markdown).toContain(
      "Reconcile the Angular scaffold with the real component pattern",
    );
  });

  it("omits the scaffold section entirely when no conversion is provided", () => {
    const spec = baseSpec();
    const markdown = composeHandoff({
      variantIndex: 0,
      variantCode: "<div />",
      variantModel: "claude-opus-4",
      specResult: spec,
      projectContext: null,
      generatedAt: FIXED_STAMP,
    });

    expect(markdown).not.toContain("## Angular scaffold");
    expect(markdown).not.toContain("Reconcile the Angular scaffold");
  });

  it("mentions scan warnings when present", () => {
    const spec = baseSpec();
    const context = baseProjectContext({
      warnings: ["skipped 2 files over 500kb"],
    });
    const markdown = composeHandoff({
      variantIndex: 0,
      variantCode: "<div />",
      specResult: spec,
      projectContext: context,
      generatedAt: FIXED_STAMP,
    });

    expect(markdown).toContain("**Scan warnings:** `skipped 2 files over 500kb`");
  });
});
