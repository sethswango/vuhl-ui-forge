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
