import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

import { toolDefinitions, validateToolArgs, type ToolContext } from "./tools.js";

const EXPECTED_TOOL_NAMES = [
  "start_design_session",
  "provide_context",
  "open_design_ui",
  "get_design_results",
  "list_design_sessions",
  "select_design_variant",
  "quick_design",
  "gather_project_context",
  "extract_design_spec",
  "refine_variant",
  "prepare_implementer_handoff",
];

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function installFetchStub(
  responder: (call: FetchCall) => { status?: number; body: unknown }
): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const call: FetchCall = { url, init };
    calls.push(call);
    const { status = 200, body } = responder(call);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

const testContext: ToolContext = {
  getSessionUiUrl: (sessionId: string) =>
    `http://127.0.0.1:5173/?session=${encodeURIComponent(sessionId)}`,
};

function findTool(name: string) {
  const tool = toolDefinitions.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`Tool ${name} is not registered`);
  }
  return tool;
}

describe("tool registration", () => {
  it("registers every expected tool name exactly once", () => {
    const registered = toolDefinitions.map((tool) => tool.name).sort();
    const expected = [...EXPECTED_TOOL_NAMES].sort();
    assert.deepEqual(registered, expected);
    const unique = new Set(registered);
    assert.equal(unique.size, registered.length, "tool names must be unique");
  });

  it("every tool has a non-empty description and schema object", () => {
    for (const tool of toolDefinitions) {
      assert.ok(
        tool.description && tool.description.length > 0,
        `${tool.name} must have a description`
      );
      assert.ok(
        tool.schema && typeof tool.schema === "object",
        `${tool.name} must expose a Zod schema shape`
      );
    }
  });
});

describe("validateToolArgs", () => {
  it("reports an error for an unknown tool", () => {
    const result = validateToolArgs("does_not_exist", {});
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /Unknown tool/);
    }
  });

  it("accepts a valid gather_project_context payload", () => {
    const result = validateToolArgs("gather_project_context", {
      sessionId: "sess-1",
      repoPath: "/tmp/repo",
    });
    assert.equal(result.ok, true);
  });

  it("rejects gather_project_context without repoPath", () => {
    const result = validateToolArgs("gather_project_context", {
      sessionId: "sess-1",
    });
    assert.equal(result.ok, false);
  });

  it("rejects gather_project_context with out-of-range maxFiles", () => {
    const result = validateToolArgs("gather_project_context", {
      sessionId: "sess-1",
      repoPath: "/tmp/repo",
      maxFiles: 100000,
    });
    assert.equal(result.ok, false);
  });

  it("accepts extract_design_spec with a variantIndex", () => {
    const result = validateToolArgs("extract_design_spec", {
      sessionId: "sess-1",
      variantIndex: 0,
    });
    assert.equal(result.ok, true);
  });

  it("rejects extract_design_spec missing sessionId", () => {
    const result = validateToolArgs("extract_design_spec", { variantIndex: 0 });
    assert.equal(result.ok, false);
  });

  it("accepts refine_variant with text only", () => {
    const result = validateToolArgs("refine_variant", {
      sessionId: "sess-1",
      variantIndex: 0,
      text: "tighten spacing",
    });
    assert.equal(result.ok, true);
  });

  it("rejects refine_variant with a negative variantIndex", () => {
    const result = validateToolArgs("refine_variant", {
      sessionId: "sess-1",
      variantIndex: -1,
      text: "x",
    });
    assert.equal(result.ok, false);
  });
});

describe("gather_project_context handler", () => {
  let stub: ReturnType<typeof installFetchStub>;

  before(() => {
    stub = installFetchStub(() => ({
      body: {
        context: {
          id: "ctx-1",
          context_type: "project",
          payload: {},
          created_at: "2024-01-01T00:00:00Z",
        },
        project_context: {
          framework: { name: "angular", version: "17.0" },
          components: [{ name: "CardComponent" }],
          files_scanned: 3,
        },
      },
    }));
  });

  after(() => stub.restore());

  it("POSTs to /context/project with snake_case body and surfaces a summary", async () => {
    const tool = findTool("gather_project_context");
    const result = await tool.handler(
      {
        sessionId: "sess-1",
        repoPath: "/tmp/repo",
        maxFiles: 50,
        label: "primary",
      },
      testContext
    );

    assert.equal(stub.calls.length, 1);
    const call = stub.calls[0];
    assert.ok(call.url.endsWith("/sessions/sess-1/context/project"));
    assert.equal(call.init?.method, "POST");
    const body = JSON.parse(call.init?.body as string);
    assert.deepEqual(body, {
      repo_path: "/tmp/repo",
      max_files: 50,
      label: "primary",
    });
    assert.ok(
      result.content[0]?.text.includes("angular"),
      "text should mention the detected framework"
    );
    assert.equal(result.structuredContent?.sessionId, "sess-1");
  });
});

describe("extract_design_spec handler", () => {
  let stub: ReturnType<typeof installFetchStub>;

  before(() => {
    stub = installFetchStub(() => ({
      body: {
        session_id: "sess-1",
        variant_index: 1,
        variant_id: "var-1",
        spec: { summary: "ok" },
        annotated_markdown: "# Spec",
        context_record: null,
      },
    }));
  });

  after(() => stub.restore());

  it("throws when neither variantId nor variantIndex is supplied", async () => {
    const tool = findTool("extract_design_spec");
    await assert.rejects(
      () => tool.handler({ sessionId: "sess-1" }, testContext),
      /variantId or variantIndex/i
    );
    assert.equal(stub.calls.length, 0);
  });

  it("POSTs to /spec with snake_case body when variantIndex is supplied", async () => {
    const tool = findTool("extract_design_spec");
    const result = await tool.handler(
      { sessionId: "sess-1", variantIndex: 1, persistAsContext: true },
      testContext
    );

    assert.equal(stub.calls.length, 1);
    const call = stub.calls[0];
    assert.ok(call.url.endsWith("/sessions/sess-1/spec"));
    const body = JSON.parse(call.init?.body as string);
    assert.deepEqual(body, { variant_index: 1, persist_as_context: true });
    assert.equal(result.structuredContent?.variantIndex, 1);
    assert.equal(result.structuredContent?.annotatedMarkdown, "# Spec");
  });
});

describe("prepare_implementer_handoff validation", () => {
  it("registers the tool", () => {
    const registered = toolDefinitions.map((tool) => tool.name);
    assert.ok(registered.includes("prepare_implementer_handoff"));
  });

  it("accepts a variantIndex without variantId", () => {
    const result = validateToolArgs("prepare_implementer_handoff", {
      sessionId: "sess-1",
      variantIndex: 0,
    });
    assert.equal(result.ok, true);
  });

  it("rejects when both variantIndex and variantId are missing", async () => {
    const tool = findTool("prepare_implementer_handoff");
    await assert.rejects(
      () => tool.handler({ sessionId: "sess-1" }, testContext),
      /variantId or variantIndex/i
    );
  });

  it("rejects missing sessionId", () => {
    const result = validateToolArgs("prepare_implementer_handoff", {
      variantIndex: 0,
    });
    assert.equal(result.ok, false);
  });

  it("rejects a negative variantIndex", () => {
    const result = validateToolArgs("prepare_implementer_handoff", {
      sessionId: "sess-1",
      variantIndex: -1,
    });
    assert.equal(result.ok, false);
  });
});

describe("prepare_implementer_handoff handler", () => {
  let stub: ReturnType<typeof installFetchStub>;

  before(() => {
    stub = installFetchStub((call) => {
      if (call.url.endsWith("/sessions/sess-1/spec")) {
        return {
          body: {
            session_id: "sess-1",
            variant_index: 2,
            variant_id: "var-3",
            spec: {
              summary: "Dashboard card",
              alignment_notes: ["Reuse CardComponent"],
              reuse_suggestions: [],
              new_components_needed: [],
              project_context_used: true,
            },
            annotated_markdown: "# Design Spec\n\nReuse CardComponent.",
            context_record: null,
          },
        };
      }
      if (call.url.endsWith("/sessions/sess-1/export")) {
        return {
          body: {
            session: {
              id: "sess-1",
              name: "test",
              status: "active",
              stack: null,
              input_mode: null,
              metadata: {},
              selected_variant_id: null,
              created_at: "2026-04-17T00:00:00Z",
              updated_at: "2026-04-17T00:00:00Z",
              last_context_at: null,
              last_variant_at: null,
            },
            contexts: [
              {
                id: "ctx-1",
                context_type: "project",
                payload: {
                  project_context: {
                    repo_path: "C:/dev/target",
                    framework: { name: "angular", version: "17.3.0" },
                    components: [
                      { name: "CardComponent" },
                      { name: "ButtonComponent" },
                    ],
                    css_tokens: {
                      tailwind_custom_classes: ["btn-primary"],
                      tailwind_theme_keys: ["colors.brand"],
                      css_custom_properties: { "--color-brand": "#6d28d9" },
                      scss_variables: {},
                    },
                    patterns: { state_style: "signals" },
                  },
                },
                created_at: "2026-04-17T00:00:00Z",
              },
            ],
            variants: [
              {
                id: "var-1",
                variant_index: 0,
                model: "claude-sonnet-4",
                code: "<div>v1</div>",
                status: "complete",
                metadata: {},
                created_at: "2026-04-17T00:00:00Z",
                updated_at: "2026-04-17T00:00:00Z",
              },
              {
                id: "var-3",
                variant_index: 2,
                model: "gpt-5.4-medium",
                code: "<section class='card'>Hello</section>",
                status: "complete",
                metadata: {},
                created_at: "2026-04-17T00:00:00Z",
                updated_at: "2026-04-17T00:00:00Z",
              },
            ],
            selected_variant: null,
          },
        };
      }
      return { status: 404, body: { detail: "unexpected url" } };
    });
  });

  after(() => stub.restore());

  it("calls both /spec and /export and returns a composed implementer prompt", async () => {
    const tool = findTool("prepare_implementer_handoff");
    const result = await tool.handler(
      { sessionId: "sess-1", variantIndex: 2, persistAsContext: true },
      testContext
    );

    const urls = stub.calls.map((call) => call.url);
    assert.ok(urls.some((url) => url.endsWith("/sessions/sess-1/spec")));
    assert.ok(urls.some((url) => url.endsWith("/sessions/sess-1/export")));

    const implementerPrompt = result.structuredContent
      ?.implementerPrompt as string | undefined;
    assert.ok(
      implementerPrompt && implementerPrompt.length > 0,
      "implementerPrompt should be present"
    );
    assert.ok(implementerPrompt!.startsWith("# Implementer handoff"));
    assert.ok(implementerPrompt!.includes("**Variant:** Option 3"));
    assert.ok(implementerPrompt!.includes("**Model:** gpt-5.4-medium"));
    assert.ok(implementerPrompt!.includes("angular 17.3.0"));
    assert.ok(implementerPrompt!.includes("**Reusable components discovered:** 2"));
    assert.ok(implementerPrompt!.includes("**State style:** signals"));
    assert.ok(implementerPrompt!.includes("## Annotated design spec"));
    assert.ok(implementerPrompt!.includes("Reuse CardComponent."));
    assert.ok(implementerPrompt!.includes("## Selected variant HTML"));
    assert.ok(
      implementerPrompt!.includes("<section class='card'>Hello</section>")
    );
    assert.ok(implementerPrompt!.includes("Copy as Angular"));

    assert.equal(
      result.structuredContent?.variantId,
      "var-3",
      "variantId should be surfaced verbatim"
    );
    assert.equal(result.structuredContent?.variantIndex, 2);
    assert.equal(
      result.structuredContent?.variantCode,
      "<section class='card'>Hello</section>"
    );
    assert.equal(result.structuredContent?.variantModel, "gpt-5.4-medium");

    const projectSummary = result.structuredContent
      ?.projectContextSummary as
      | {
          framework?: string;
          componentCount?: number;
          tokenCount?: number;
          stateStyle?: string | null;
          repoPath?: string | null;
        }
      | null;
    assert.ok(projectSummary);
    assert.equal(projectSummary!.framework, "angular 17.3.0");
    assert.equal(projectSummary!.componentCount, 2);
    assert.equal(projectSummary!.tokenCount, 3);
    assert.equal(projectSummary!.stateStyle, "signals");
    assert.equal(projectSummary!.repoPath, "C:/dev/target");

    assert.ok(
      result.content[0]?.text.includes("variant 2"),
      "text summary should reference the variant index"
    );
  });
});

describe("prepare_implementer_handoff without project context", () => {
  let stub: ReturnType<typeof installFetchStub>;

  before(() => {
    stub = installFetchStub((call) => {
      if (call.url.endsWith("/sessions/sess-2/spec")) {
        return {
          body: {
            session_id: "sess-2",
            variant_index: 0,
            variant_id: "var-0",
            spec: {
              summary: "plain",
              alignment_notes: [],
              reuse_suggestions: [],
              new_components_needed: [],
              project_context_used: false,
            },
            annotated_markdown: "# plain spec",
            context_record: null,
          },
        };
      }
      if (call.url.endsWith("/sessions/sess-2/export")) {
        return {
          body: {
            session: {
              id: "sess-2",
              name: "test",
              status: "active",
              stack: null,
              input_mode: null,
              metadata: {},
              selected_variant_id: null,
              created_at: "2026-04-17T00:00:00Z",
              updated_at: "2026-04-17T00:00:00Z",
              last_context_at: null,
              last_variant_at: null,
            },
            contexts: [],
            variants: [
              {
                id: "var-0",
                variant_index: 0,
                model: "claude-opus-4",
                code: "<div>hi</div>",
                status: "complete",
                metadata: {},
                created_at: "2026-04-17T00:00:00Z",
                updated_at: "2026-04-17T00:00:00Z",
              },
            ],
            selected_variant: null,
          },
        };
      }
      return { status: 404, body: { detail: "unexpected url" } };
    });
  });

  after(() => stub.restore());

  it("surfaces a missing-scan hint in the implementer prompt", async () => {
    const tool = findTool("prepare_implementer_handoff");
    const result = await tool.handler(
      { sessionId: "sess-2", variantIndex: 0 },
      testContext
    );
    const implementerPrompt = result.structuredContent
      ?.implementerPrompt as string;
    assert.ok(implementerPrompt.includes("No project scan is attached"));
    assert.ok(implementerPrompt.includes("gather_project_context"));
    assert.equal(result.structuredContent?.projectContextSummary, null);
  });
});

describe("refine_variant handler", () => {
  let stub: ReturnType<typeof installFetchStub>;

  before(() => {
    stub = installFetchStub(() => ({
      body: {
        session_id: "sess-1",
        variant_index: 2,
        refinement_id: "ref-1",
        status: "queued",
        stream_hint: { channel: "websocket", endpoint: "/generate-code" },
        context_record: null,
      },
    }));
  });

  after(() => stub.restore());

  it("throws when neither text nor imageDataUrl is supplied", async () => {
    const tool = findTool("refine_variant");
    await assert.rejects(
      () => tool.handler({ sessionId: "sess-1", variantIndex: 2 }, testContext),
      /text/i
    );
    assert.equal(stub.calls.length, 0);
  });

  it("throws when text is only whitespace and no image is provided", async () => {
    const tool = findTool("refine_variant");
    await assert.rejects(
      () =>
        tool.handler(
          { sessionId: "sess-1", variantIndex: 2, text: "   " },
          testContext
        ),
      /text/i
    );
  });

  it("POSTs to /refine with snake_case body and stream hint in structured content", async () => {
    const tool = findTool("refine_variant");
    const result = await tool.handler(
      {
        sessionId: "sess-1",
        variantIndex: 2,
        text: "more padding",
        imageDataUrl: "data:image/png;base64,AAA",
      },
      testContext
    );

    assert.equal(stub.calls.length, 1);
    const call = stub.calls[0];
    assert.ok(call.url.endsWith("/sessions/sess-1/refine"));
    const body = JSON.parse(call.init?.body as string);
    assert.deepEqual(body, {
      variant_index: 2,
      text: "more padding",
      image_data_url: "data:image/png;base64,AAA",
    });
    assert.equal(result.structuredContent?.refinementId, "ref-1");
    const streamHint = result.structuredContent?.streamHint as
      | Record<string, unknown>
      | undefined;
    assert.equal(streamHint?.endpoint, "/generate-code");
  });
});
