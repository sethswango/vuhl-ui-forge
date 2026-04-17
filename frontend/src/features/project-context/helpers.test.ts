import type { ProjectContext } from "../../lib/design-api-types";
import {
  formatStateStyle,
  frameworkLabel,
  summarizeProjectContext,
} from "./helpers";

function baseContext(overrides: Partial<ProjectContext> = {}): ProjectContext {
  return {
    repoPath: "",
    framework: {
      name: "unknown",
      version: null,
      language: null,
      packageManager: null,
      buildTool: null,
      evidence: [],
    },
    components: [],
    cssTokens: {
      tailwindConfigPath: null,
      tailwindThemeKeys: [],
      tailwindCustomClasses: [],
      cssCustomProperties: {},
      scssVariables: {},
      tokenSources: [],
    },
    patterns: {
      usesSignals: false,
      usesObservables: false,
      usesHooks: false,
      usesCompositionApi: false,
      usesRxjs: false,
      angularStandalone: null,
      angularZoneless: false,
      stateStyle: null,
      renderingStyle: null,
      evidence: [],
    },
    conventions: {
      namingStyle: null,
      folderLayout: [],
      importStyle: null,
      templateStyle: null,
      notes: [],
    },
    filesScanned: 0,
    truncated: false,
    warnings: [],
    ...overrides,
  };
}

describe("frameworkLabel", () => {
  test("maps known framework ids to human labels", () => {
    expect(frameworkLabel("angular")).toBe("Angular");
    expect(frameworkLabel("react")).toBe("React");
    expect(frameworkLabel("next")).toBe("Next.js");
    expect(frameworkLabel("vue")).toBe("Vue");
    expect(frameworkLabel("plain_html")).toBe("Plain HTML");
    expect(frameworkLabel("unknown")).toBe("Unknown");
  });

  test("falls back to the raw id for anything unrecognized", () => {
    expect(frameworkLabel("elixir-phoenix")).toBe("elixir-phoenix");
  });
});

describe("summarizeProjectContext", () => {
  test("collects pattern chips for an Angular signals repo", () => {
    const ctx = baseContext({
      framework: {
        name: "angular",
        version: "17.2.0",
        language: "typescript",
        packageManager: null,
        buildTool: null,
        evidence: [],
      },
      patterns: {
        usesSignals: true,
        usesObservables: false,
        usesHooks: false,
        usesCompositionApi: false,
        usesRxjs: false,
        angularStandalone: true,
        angularZoneless: true,
        stateStyle: "signals",
        renderingStyle: "template",
        evidence: [],
      },
      components: [
        {
          name: "Card",
          selector: null,
          filePath: "",
          kind: "angular_component",
          inputs: [],
          standalone: true,
          exported: true,
        },
      ],
      cssTokens: {
        tailwindConfigPath: "tailwind.config.ts",
        tailwindThemeKeys: [],
        tailwindCustomClasses: [],
        cssCustomProperties: { "--primary": "#000", "--radius": "8px" },
        scssVariables: {},
        tokenSources: [],
      },
    });

    const summary = summarizeProjectContext(ctx);

    expect(summary.frameworkLabel).toBe("Angular");
    expect(summary.frameworkVersion).toBe("17.2.0");
    expect(summary.componentCount).toBe(1);
    expect(summary.stateStyle).toBe("signals");
    expect(summary.renderingStyle).toBe("template");
    expect(summary.tailwindConfigPath).toBe("tailwind.config.ts");
    expect(summary.cssPropertyCount).toBe(2);
    expect(summary.patternChips).toEqual([
      "signals",
      "standalone",
      "zoneless",
    ]);
    expect(summary.truncated).toBe(false);
  });

  test("surfaces hooks chip for React repos", () => {
    const ctx = baseContext({
      framework: {
        name: "react",
        version: null,
        language: "typescript",
        packageManager: null,
        buildTool: null,
        evidence: [],
      },
      patterns: {
        usesSignals: false,
        usesObservables: false,
        usesHooks: true,
        usesCompositionApi: false,
        usesRxjs: false,
        angularStandalone: null,
        angularZoneless: false,
        stateStyle: "hooks",
        renderingStyle: "jsx",
        evidence: [],
      },
    });

    const summary = summarizeProjectContext(ctx);

    expect(summary.frameworkLabel).toBe("React");
    expect(summary.patternChips).toEqual(["hooks"]);
  });

  test("dedupes rxjs chip when observables chip is already present", () => {
    const ctx = baseContext({
      patterns: {
        ...baseContext().patterns,
        usesObservables: true,
        usesRxjs: true,
      },
    });

    const summary = summarizeProjectContext(ctx);

    expect(summary.patternChips).toEqual(["observables"]);
  });

  test("propagates truncated + warnings", () => {
    const ctx = baseContext({
      truncated: true,
      warnings: ["Hit file cap at 2000."],
    });

    const summary = summarizeProjectContext(ctx);
    expect(summary.truncated).toBe(true);
    expect(summary.warnings).toEqual(["Hit file cap at 2000."]);
  });
});

describe("formatStateStyle", () => {
  test.each([
    ["signals", "Signals"],
    ["observables", "Observables"],
    ["hooks", "Hooks"],
    ["composition", "Composition API"],
    ["classic", "Classic"],
  ])("maps %s to %s", (input, expected) => {
    expect(formatStateStyle(input)).toBe(expected);
  });

  test("returns null for null or 'unknown'", () => {
    expect(formatStateStyle(null)).toBeNull();
    expect(formatStateStyle("unknown")).toBeNull();
  });

  test("passes through unrecognized values verbatim", () => {
    expect(formatStateStyle("custom-state-machine")).toBe(
      "custom-state-machine",
    );
  });
});
