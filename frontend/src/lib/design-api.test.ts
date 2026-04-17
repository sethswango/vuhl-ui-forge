import {
  normalizeDesignSpec,
  normalizeProjectContext,
  normalizeRefineResponse,
} from "./design-api-types";

describe("normalizeProjectContext", () => {
  test("maps the Angular-signals fixture shape", () => {
    const raw = {
      repo_path: "C:/dev/example",
      framework: {
        name: "angular",
        version: "17.2.0",
        language: "typescript",
        package_manager: "yarn",
        build_tool: "angular-cli",
        evidence: ["angular.json", "package.json:@angular/core"],
      },
      components: [
        {
          name: "CardComponent",
          selector: "app-card",
          file_path: "src/app/shared/card/card.component.ts",
          kind: "angular_component",
          standalone: true,
          exported: true,
          inputs: [
            { name: "title", kind: "input", type: "string", required: true },
            { name: "subtitle", kind: "input" },
          ],
        },
      ],
      css_tokens: {
        tailwind_config_path: "tailwind.config.ts",
        tailwind_theme_keys: ["colors", "spacing"],
        tailwind_custom_classes: [".btn-primary"],
        css_custom_properties: { "--brand-primary": "#6d28d9" },
        scss_variables: { "$radius": "8px" },
        token_sources: ["tailwind.config.ts", "src/styles.scss"],
      },
      patterns: {
        uses_signals: true,
        uses_observables: false,
        uses_hooks: false,
        angular_standalone: true,
        angular_zoneless: false,
        state_style: "signals",
        rendering_style: "template",
        evidence: ["signal("],
      },
      conventions: {
        naming_style: "kebab-case files, PascalCase components",
        folder_layout: ["src/app/shared"],
        import_style: "relative within feature",
        notes: [],
      },
      files_scanned: 42,
      truncated: false,
      warnings: [],
    };

    const ctx = normalizeProjectContext(raw);

    expect(ctx.repoPath).toBe("C:/dev/example");
    expect(ctx.framework.name).toBe("angular");
    expect(ctx.framework.packageManager).toBe("yarn");
    expect(ctx.framework.buildTool).toBe("angular-cli");
    expect(ctx.components).toHaveLength(1);
    expect(ctx.components[0].filePath).toBe(
      "src/app/shared/card/card.component.ts",
    );
    expect(ctx.components[0].standalone).toBe(true);
    expect(ctx.components[0].inputs[0].required).toBe(true);
    expect(ctx.components[0].inputs[1].required).toBe(false);
    expect(ctx.cssTokens.tailwindConfigPath).toBe("tailwind.config.ts");
    expect(ctx.cssTokens.cssCustomProperties["--brand-primary"]).toBe("#6d28d9");
    expect(ctx.cssTokens.scssVariables["$radius"]).toBe("8px");
    expect(ctx.patterns.usesSignals).toBe(true);
    expect(ctx.patterns.stateStyle).toBe("signals");
    expect(ctx.conventions.folderLayout).toEqual(["src/app/shared"]);
    expect(ctx.filesScanned).toBe(42);
  });

  test("fills defaults for missing fields without throwing", () => {
    const ctx = normalizeProjectContext({});

    expect(ctx.repoPath).toBe("");
    expect(ctx.framework.name).toBe("unknown");
    expect(ctx.framework.version).toBeNull();
    expect(ctx.components).toEqual([]);
    expect(ctx.cssTokens.cssCustomProperties).toEqual({});
    expect(ctx.cssTokens.tokenSources).toEqual([]);
    expect(ctx.patterns.usesSignals).toBe(false);
    expect(ctx.patterns.angularStandalone).toBeNull();
    expect(ctx.conventions.folderLayout).toEqual([]);
    expect(ctx.filesScanned).toBe(0);
    expect(ctx.truncated).toBe(false);
    expect(ctx.warnings).toEqual([]);
  });

  test("drops non-string entries in evidence arrays rather than crashing", () => {
    const ctx = normalizeProjectContext({
      framework: { name: "react", evidence: ["hooks", 42, null, "JSX"] },
      patterns: { evidence: [true, "useMemo"] },
    });

    expect(ctx.framework.evidence).toEqual(["hooks", "JSX"]);
    expect(ctx.patterns.evidence).toEqual(["useMemo"]);
  });

  test("ignores non-string values inside css_custom_properties", () => {
    const ctx = normalizeProjectContext({
      css_tokens: {
        css_custom_properties: {
          "--valid": "#111",
          "--bad": 42,
          "--also-bad": null,
        },
      },
    });

    expect(ctx.cssTokens.cssCustomProperties).toEqual({ "--valid": "#111" });
  });
});

describe("normalizeDesignSpec", () => {
  test("maps a fully populated response", () => {
    const spec = normalizeDesignSpec({
      session_id: "abc",
      variant_index: 2,
      variant_id: "v-2",
      annotated_markdown: "# Spec\n...",
      spec: {
        summary: "Pricing card",
        alignment_notes: ["Use signals for list state."],
        reuse_suggestions: [
          {
            component_name: "PriceCardComponent",
            component_selector: "app-price-card",
            component_file: "src/app/shared/price-card/price-card.component.ts",
            rationale: "Matches pricing card semantics.",
            confidence: "high",
          },
        ],
        new_components_needed: ["CheckoutSummary"],
        project_context_used: true,
      },
    });

    expect(spec.sessionId).toBe("abc");
    expect(spec.variantIndex).toBe(2);
    expect(spec.variantId).toBe("v-2");
    expect(spec.annotatedMarkdown).toBe("# Spec\n...");
    expect(spec.spec.summary).toBe("Pricing card");
    expect(spec.spec.alignmentNotes).toEqual(["Use signals for list state."]);
    expect(spec.spec.reuseSuggestions).toHaveLength(1);
    expect(spec.spec.reuseSuggestions[0].componentName).toBe(
      "PriceCardComponent",
    );
    expect(spec.spec.reuseSuggestions[0].confidence).toBe("high");
    expect(spec.spec.newComponentsNeeded).toEqual(["CheckoutSummary"]);
    expect(spec.spec.projectContextUsed).toBe(true);
  });

  test("fills sensible defaults when the spec envelope is empty", () => {
    const spec = normalizeDesignSpec({});

    expect(spec.sessionId).toBe("");
    expect(spec.variantIndex).toBe(0);
    expect(spec.annotatedMarkdown).toBe("");
    expect(spec.spec.summary).toBe("");
    expect(spec.spec.alignmentNotes).toEqual([]);
    expect(spec.spec.reuseSuggestions).toEqual([]);
    expect(spec.spec.newComponentsNeeded).toEqual([]);
    expect(spec.spec.projectContextUsed).toBe(false);
  });
});

describe("normalizeRefineResponse", () => {
  test("maps the queued refinement result", () => {
    const result = normalizeRefineResponse({
      refinement_id: "ref-123",
      status: "queued",
      stream_hint: { channel: "websocket", endpoint: "/generate-code" },
    });

    expect(result.refinementId).toBe("ref-123");
    expect(result.status).toBe("queued");
    expect(result.streamHint).toEqual({
      channel: "websocket",
      endpoint: "/generate-code",
    });
  });

  test("defaults to 'queued' status and empty stream hint when absent", () => {
    const result = normalizeRefineResponse({});

    expect(result.status).toBe("queued");
    expect(result.streamHint).toEqual({});
  });
});
