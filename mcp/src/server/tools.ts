import { z } from "zod";
import type { ZodRawShape } from "zod";

import {
  addContext,
  createSession,
  extractDesignSpec,
  gatherProjectContext,
  getSessionExport,
  listSessions,
  refineVariant,
  selectVariant,
} from "./backend-client.js";

export interface McpToolDefinition<Shape extends ZodRawShape> {
  name: string;
  description: string;
  schema: Shape;
  handler: (
    args: z.infer<z.ZodObject<Shape>>,
    context: ToolContext
  ) => Promise<ToolResult>;
}

export interface ToolContext {
  getSessionUiUrl: (sessionId: string) => string;
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  [key: string]: unknown;
}

function textResult(
  text: string,
  structuredContent?: Record<string, unknown>
): ToolResult {
  return {
    content: [{ type: "text", text }],
    ...(structuredContent ? { structuredContent } : {}),
  };
}

const startDesignSessionTool: McpToolDefinition<{
  name: z.ZodString;
  stack: z.ZodOptional<z.ZodString>;
  inputMode: z.ZodOptional<z.ZodString>;
  metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}> = {
  name: "start_design_session",
  description: "Create a new VUHL UI Forge design session.",
  schema: {
    name: z.string().min(1),
    stack: z.string().optional(),
    inputMode: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  },
  handler: async ({ name, stack, inputMode, metadata }, ctx) => {
    const detail = await createSession({
      name,
      stack,
      input_mode: inputMode,
      metadata,
    });
    const sessionId = detail.session.id;
    const uiUrl = ctx.getSessionUiUrl(sessionId);
    return textResult(
      `Created design session ${sessionId}. Open ${uiUrl} to generate and review variants.`,
      {
        sessionId,
        uiUrl,
        session: detail.session,
      }
    );
  },
};

const provideContextTool: McpToolDefinition<{
  sessionId: z.ZodString;
  contextType: z.ZodDefault<z.ZodString>;
  payload: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}> = {
  name: "provide_context",
  description:
    "Attach gathered project or feature context to an existing session.",
  schema: {
    sessionId: z.string().min(1),
    contextType: z.string().default("gathered"),
    payload: z.record(z.unknown()),
  },
  handler: async ({ sessionId, contextType, payload }) => {
    const record = await addContext(sessionId, contextType, payload);
    return textResult(
      `Stored ${contextType} context on session ${sessionId}.`,
      {
        sessionId,
        context: record,
      }
    );
  },
};

const openDesignUiTool: McpToolDefinition<{
  sessionId: z.ZodString;
}> = {
  name: "open_design_ui",
  description:
    "Return the browser URL for the existing frontend UI with a bound session.",
  schema: {
    sessionId: z.string().min(1),
  },
  handler: async ({ sessionId }, ctx) => {
    const uiUrl = ctx.getSessionUiUrl(sessionId);
    return textResult(`Open the design UI at ${uiUrl}`, {
      sessionId,
      uiUrl,
    });
  },
};

const getDesignResultsTool: McpToolDefinition<{
  sessionId: z.ZodString;
}> = {
  name: "get_design_results",
  description:
    "Fetch the export payload for a session, including any selected variant.",
  schema: {
    sessionId: z.string().min(1),
  },
  handler: async ({ sessionId }) => {
    const payload = await getSessionExport(sessionId);
    const selected = payload.selected_variant;
    const summary = selected
      ? `Selected variant ${selected.variant_index} is ready for integration.`
      : `No selected variant yet. ${payload.variants.length} variants recorded.`;
    return textResult(summary, payload as unknown as Record<string, unknown>);
  },
};

const listDesignSessionsTool: McpToolDefinition<{
  statusFilter: z.ZodOptional<z.ZodString>;
  limit: z.ZodOptional<z.ZodNumber>;
}> = {
  name: "list_design_sessions",
  description: "List recent VUHL UI Forge sessions.",
  schema: {
    statusFilter: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  },
  handler: async ({ statusFilter, limit }) => {
    const sessions = await listSessions(statusFilter, limit ?? 25);
    return textResult(`Found ${sessions.length} sessions.`, { sessions });
  },
};

const selectDesignVariantTool: McpToolDefinition<{
  sessionId: z.ZodString;
  variantIndex: z.ZodNumber;
}> = {
  name: "select_design_variant",
  description: "Mark a recorded variant as the approved selection for export.",
  schema: {
    sessionId: z.string().min(1),
    variantIndex: z.number().int().min(0),
  },
  handler: async ({ sessionId, variantIndex }) => {
    const detail = await selectVariant(sessionId, variantIndex);
    return textResult(
      `Selected variant ${variantIndex} for session ${sessionId}.`,
      {
        sessionId,
        session: detail.session,
      }
    );
  },
};

const quickDesignTool: McpToolDefinition<{
  name: z.ZodString;
  stack: z.ZodOptional<z.ZodString>;
  inputMode: z.ZodOptional<z.ZodString>;
  instructions: z.ZodOptional<z.ZodString>;
  projectContext: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}> = {
  name: "quick_design",
  description:
    "Create a session, optionally attach quick context, and return the browser URL.",
  schema: {
    name: z.string().min(1),
    stack: z.string().optional(),
    inputMode: z.string().optional(),
    instructions: z.string().optional(),
    projectContext: z.record(z.unknown()).optional(),
  },
  handler: async (
    { name, stack, inputMode, instructions, projectContext },
    ctx
  ) => {
    const detail = await createSession({
      name,
      stack,
      input_mode: inputMode,
      metadata: projectContext,
    });
    const sessionId = detail.session.id;

    const payload: Record<string, unknown> = { ...(projectContext ?? {}) };
    if (instructions) {
      payload.instructions = instructions;
    }
    if (stack) {
      payload.stack = stack;
    }

    if (Object.keys(payload).length > 0) {
      await addContext(sessionId, "quick_design", payload);
    }

    const uiUrl = ctx.getSessionUiUrl(sessionId);
    return textResult(
      `Created quick design session ${sessionId}. Open ${uiUrl} to continue in the browser UI.`,
      {
        sessionId,
        uiUrl,
        session: detail.session,
      }
    );
  },
};

const gatherProjectContextTool: McpToolDefinition<{
  sessionId: z.ZodString;
  repoPath: z.ZodString;
  maxFiles: z.ZodOptional<z.ZodNumber>;
  maxComponents: z.ZodOptional<z.ZodNumber>;
  label: z.ZodOptional<z.ZodString>;
}> = {
  name: "gather_project_context",
  description:
    "Scan a target repo path and persist structured project context (framework, components, tokens, patterns) onto a session so later specs can reference it.",
  schema: {
    sessionId: z.string().min(1),
    repoPath: z.string().min(1),
    maxFiles: z.number().int().min(1).max(5000).optional(),
    maxComponents: z.number().int().min(1).max(1000).optional(),
    label: z.string().optional(),
  },
  handler: async ({ sessionId, repoPath, maxFiles, maxComponents, label }) => {
    const result = await gatherProjectContext(sessionId, {
      repoPath,
      maxFiles,
      maxComponents,
      label,
    });
    const project = result.project_context as {
      framework?: { name?: string; version?: string };
      components?: unknown[];
      files_scanned?: number;
    };
    const framework = project.framework?.name ?? "unknown";
    const version = project.framework?.version
      ? ` ${project.framework.version}`
      : "";
    const componentCount = Array.isArray(project.components)
      ? project.components.length
      : 0;
    const filesScanned = project.files_scanned ?? 0;
    return textResult(
      `Gathered ${framework}${version} context from ${repoPath}: ${componentCount} component(s), ${filesScanned} file(s) scanned.`,
      {
        sessionId,
        context: result.context,
        projectContext: result.project_context,
      }
    );
  },
};

const extractDesignSpecTool: McpToolDefinition<{
  sessionId: z.ZodString;
  variantIndex: z.ZodOptional<z.ZodNumber>;
  variantId: z.ZodOptional<z.ZodString>;
  persistAsContext: z.ZodOptional<z.ZodBoolean>;
}> = {
  name: "extract_design_spec",
  description:
    "Produce a structured design spec plus an annotated markdown handoff prompt for the selected variant, keyed to any gathered project context.",
  schema: {
    sessionId: z.string().min(1),
    variantIndex: z.number().int().min(0).optional(),
    variantId: z.string().min(1).optional(),
    persistAsContext: z.boolean().optional(),
  },
  handler: async ({
    sessionId,
    variantIndex,
    variantId,
    persistAsContext,
  }) => {
    if (variantIndex === undefined && variantId === undefined) {
      throw new Error("variantId or variantIndex is required");
    }
    const result = await extractDesignSpec(sessionId, {
      variantIndex,
      variantId,
      persistAsContext,
    });
    return textResult(
      `Extracted design spec for session ${sessionId}, variant ${result.variant_index}.`,
      {
        sessionId,
        variantIndex: result.variant_index,
        variantId: result.variant_id,
        spec: result.spec,
        annotatedMarkdown: result.annotated_markdown,
        contextRecord: result.context_record,
      }
    );
  },
};

const refineVariantTool: McpToolDefinition<{
  sessionId: z.ZodString;
  variantIndex: z.ZodNumber;
  text: z.ZodOptional<z.ZodString>;
  imageDataUrl: z.ZodOptional<z.ZodString>;
}> = {
  name: "refine_variant",
  description:
    "Queue a refinement pass (text and/or image) for an existing variant. The queued entry is consumed by the existing /generate-code WebSocket pipeline; no second streaming channel is used.",
  schema: {
    sessionId: z.string().min(1),
    variantIndex: z.number().int().min(0),
    text: z.string().optional(),
    imageDataUrl: z.string().optional(),
  },
  handler: async ({ sessionId, variantIndex, text, imageDataUrl }) => {
    if ((!text || !text.trim()) && !imageDataUrl) {
      throw new Error("Provide text and/or imageDataUrl for the refinement.");
    }
    const result = await refineVariant(sessionId, {
      variantIndex,
      text,
      imageDataUrl,
    });
    return textResult(
      `Queued refinement ${result.refinement_id} for variant ${variantIndex} on session ${sessionId}.`,
      {
        sessionId,
        variantIndex,
        refinementId: result.refinement_id,
        status: result.status,
        streamHint: result.stream_hint,
        contextRecord: result.context_record,
      }
    );
  },
};

const prepareImplementerHandoffTool: McpToolDefinition<{
  sessionId: z.ZodString;
  variantIndex: z.ZodOptional<z.ZodNumber>;
  variantId: z.ZodOptional<z.ZodString>;
  persistAsContext: z.ZodOptional<z.ZodBoolean>;
}> = {
  name: "prepare_implementer_handoff",
  description:
    "Build a ready-to-paste implementer prompt for Claude/Codex/Cursor by bundling the variant HTML, the backend design spec, and any gathered project context into a single markdown document. The Angular scaffold is omitted here; run the in-UI Angular conversion in VUHL UI Forge when the target framework is Angular.",
  schema: {
    sessionId: z.string().min(1),
    variantIndex: z.number().int().min(0).optional(),
    variantId: z.string().min(1).optional(),
    persistAsContext: z.boolean().optional(),
  },
  handler: async (
    { sessionId, variantIndex, variantId, persistAsContext },
    ctx
  ) => {
    if (variantIndex === undefined && variantId === undefined) {
      throw new Error("variantId or variantIndex is required");
    }
    const [spec, exportPayload] = await Promise.all([
      extractDesignSpec(sessionId, {
        variantIndex,
        variantId,
        persistAsContext,
      }),
      getSessionExport(sessionId),
    ]);

    const targetVariant = selectVariantFromExport(exportPayload.variants, {
      variantIndex: spec.variant_index,
      variantId: spec.variant_id,
    });
    if (!targetVariant) {
      throw new Error(
        `Variant ${spec.variant_id} (#${spec.variant_index}) was not found in the session export.`
      );
    }

    const projectContextPayload = findProjectContextPayload(
      exportPayload.contexts
    );
    const projectContextSummary = summarizeProjectContext(
      projectContextPayload
    );

    const implementerPrompt = composeMcpHandoffMarkdown({
      variantIndex: spec.variant_index,
      variantModel: targetVariant.model,
      annotatedMarkdown: spec.annotated_markdown,
      variantCode: targetVariant.code,
      projectContextSummary,
      uiUrl: ctx.getSessionUiUrl(sessionId),
    });

    return textResult(
      `Prepared implementer handoff for session ${sessionId}, variant ${spec.variant_index} (${implementerPrompt.length} chars).`,
      {
        sessionId,
        variantIndex: spec.variant_index,
        variantId: spec.variant_id,
        spec: spec.spec,
        annotatedMarkdown: spec.annotated_markdown,
        variantCode: targetVariant.code,
        variantModel: targetVariant.model,
        projectContextSummary,
        implementerPrompt,
        contextRecord: spec.context_record,
      }
    );
  },
};

interface VariantLike {
  id: string;
  variant_index: number;
  model: string;
  code: string;
}

function selectVariantFromExport(
  variants: readonly VariantLike[],
  target: { variantIndex: number; variantId: string }
): VariantLike | null {
  const byId = variants.find((variant) => variant.id === target.variantId);
  if (byId) return byId;
  const byIndex = variants.find(
    (variant) => variant.variant_index === target.variantIndex
  );
  return byIndex ?? null;
}

function findProjectContextPayload(
  contexts: readonly { context_type: string; payload: Record<string, unknown> }[]
): Record<string, unknown> | null {
  for (let i = contexts.length - 1; i >= 0; i -= 1) {
    const entry = contexts[i];
    if (entry.context_type === "project") {
      return entry.payload as Record<string, unknown>;
    }
  }
  return null;
}

interface ProjectContextSummary {
  framework: string;
  componentCount: number;
  tokenCount: number;
  stateStyle: string | null;
  repoPath: string | null;
}

function summarizeProjectContext(
  payload: Record<string, unknown> | null
): ProjectContextSummary | null {
  if (!payload) return null;
  const project = (payload.project_context ?? payload) as Record<
    string,
    unknown
  >;
  const framework = (project.framework ?? {}) as {
    name?: string;
    version?: string | null;
  };
  const frameworkName = typeof framework.name === "string" ? framework.name : "unknown";
  const frameworkVersion =
    typeof framework.version === "string" && framework.version
      ? ` ${framework.version}`
      : "";
  const components = Array.isArray(project.components) ? project.components : [];
  const cssTokens = (project.css_tokens ?? {}) as {
    tailwind_custom_classes?: unknown;
    tailwind_theme_keys?: unknown;
    css_custom_properties?: unknown;
    scss_variables?: unknown;
  };
  const tokenCount =
    countEntries(cssTokens.tailwind_custom_classes) +
    countEntries(cssTokens.tailwind_theme_keys) +
    countKeys(cssTokens.css_custom_properties) +
    countKeys(cssTokens.scss_variables);
  const patterns = (project.patterns ?? {}) as { state_style?: string | null };
  const repoPath =
    typeof project.repo_path === "string" ? project.repo_path : null;
  return {
    framework: `${frameworkName}${frameworkVersion}`,
    componentCount: components.length,
    tokenCount,
    stateStyle:
      typeof patterns.state_style === "string" ? patterns.state_style : null,
    repoPath,
  };
}

function countEntries(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function countKeys(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  return Object.keys(value as Record<string, unknown>).length;
}

function composeMcpHandoffMarkdown(input: {
  variantIndex: number;
  variantModel: string;
  annotatedMarkdown: string;
  variantCode: string;
  projectContextSummary: ProjectContextSummary | null;
  uiUrl: string;
}): string {
  const {
    variantIndex,
    variantModel,
    annotatedMarkdown,
    variantCode,
    projectContextSummary,
    uiUrl,
  } = input;

  const sections: string[] = [];
  sections.push("# Implementer handoff");
  sections.push(
    [
      "## At a glance",
      "",
      `- **Variant:** Option ${variantIndex + 1}`,
      `- **Model:** ${variantModel || "unspecified"}`,
      `- **Session UI:** ${uiUrl}`,
      `- **Target framework:** ${
        projectContextSummary?.framework ?? "not detected"
      }`,
    ].join("\n")
  );

  if (projectContextSummary) {
    const projectLines = [
      "## Project context",
      "",
      `- **Repo path:** ${
        projectContextSummary.repoPath
          ? `\`${projectContextSummary.repoPath}\``
          : "(unspecified)"
      }`,
      `- **Framework:** ${projectContextSummary.framework}`,
      `- **Reusable components discovered:** ${projectContextSummary.componentCount}`,
      `- **Design tokens discovered:** ${projectContextSummary.tokenCount}`,
    ];
    if (projectContextSummary.stateStyle) {
      projectLines.push(`- **State style:** ${projectContextSummary.stateStyle}`);
    }
    sections.push(projectLines.join("\n"));
  } else {
    sections.push(
      [
        "## Project context",
        "",
        "No project scan is attached to this session. Before implementing,",
        "ask the user to run `gather_project_context` (or the project-context",
        "scan in VUHL UI Forge) so the implementer can honour existing",
        "components, tokens, and naming conventions.",
      ].join("\n")
    );
  }

  sections.push(
    ["## Annotated design spec", "", annotatedMarkdown.trimEnd()].join("\n")
  );

  sections.push(
    [
      "## Selected variant HTML",
      "",
      "```html",
      variantCode.trimEnd(),
      "```",
    ].join("\n")
  );

  sections.push(
    [
      "## Angular bridge",
      "",
      "This bundle intentionally omits the Angular scaffold. If the target is",
      "Angular, open VUHL UI Forge for this session, click _Copy as Angular_",
      "on the selected variant, and paste that output in place of the raw HTML.",
    ].join("\n")
  );

  sections.push(
    [
      "## Implementer checklist",
      "",
      "- [ ] Place the new component files under the project's established folder layout.",
      "- [ ] Reuse the suggested components verbatim when a high-confidence match exists.",
      "- [ ] Bind colours, spacing, and typography to existing design tokens.",
      "- [ ] Run the repo's linter, formatter, and tests before opening a pull request.",
    ].join("\n")
  );

  return sections.join("\n\n").trimEnd() + "\n";
}

export const toolDefinitions: ReadonlyArray<McpToolDefinition<ZodRawShape>> = [
  startDesignSessionTool as unknown as McpToolDefinition<ZodRawShape>,
  provideContextTool as unknown as McpToolDefinition<ZodRawShape>,
  openDesignUiTool as unknown as McpToolDefinition<ZodRawShape>,
  getDesignResultsTool as unknown as McpToolDefinition<ZodRawShape>,
  listDesignSessionsTool as unknown as McpToolDefinition<ZodRawShape>,
  selectDesignVariantTool as unknown as McpToolDefinition<ZodRawShape>,
  quickDesignTool as unknown as McpToolDefinition<ZodRawShape>,
  gatherProjectContextTool as unknown as McpToolDefinition<ZodRawShape>,
  extractDesignSpecTool as unknown as McpToolDefinition<ZodRawShape>,
  refineVariantTool as unknown as McpToolDefinition<ZodRawShape>,
  prepareImplementerHandoffTool as unknown as McpToolDefinition<ZodRawShape>,
];

export function validateToolArgs(
  name: string,
  args: unknown
): { ok: true; value: unknown } | { ok: false; error: string } {
  const definition = toolDefinitions.find((tool) => tool.name === name);
  if (!definition) {
    return { ok: false, error: `Unknown tool: ${name}` };
  }
  const schema = z.object(definition.schema);
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.toString() };
  }
  return { ok: true, value: parsed.data };
}
