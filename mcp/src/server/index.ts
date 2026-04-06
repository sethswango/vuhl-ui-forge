import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  addContext,
  createSession,
  getBackendBaseUrl,
  getSessionExport,
  listSessions,
  selectVariant,
} from "./backend-client.js";

const serverName = "vuhl-ui-forge";
const serverVersion = "0.1.0";
const frontendBaseUrl =
  process.env.VUHL_UI_FORGE_FRONTEND_URL?.replace(/\/$/, "") ??
  "http://127.0.0.1:5173";
const httpPort = Number(process.env.VUHL_UI_FORGE_MCP_PORT ?? "3001");

function textResult(
  text: string,
  structuredContent?: Record<string, unknown>
) {
  return {
    content: [{ type: "text" as const, text }],
    ...(structuredContent ? { structuredContent } : {}),
  };
}

function getSessionUiUrl(sessionId: string): string {
  return `${frontendBaseUrl}/?session=${encodeURIComponent(sessionId)}`;
}

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: serverName,
    version: serverVersion,
  });

  server.tool(
    "start_design_session",
    "Create a new VUHL UI Forge design session.",
    {
      name: z.string().min(1),
      stack: z.string().optional(),
      inputMode: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    },
    async ({ name, stack, inputMode, metadata }) => {
      const detail = await createSession({
        name,
        stack,
        input_mode: inputMode,
        metadata,
      });
      const sessionId = detail.session.id;
      const uiUrl = getSessionUiUrl(sessionId);
      return textResult(
        `Created design session ${sessionId}. Open ${uiUrl} to generate and review variants.`,
        {
          sessionId,
          uiUrl,
          session: detail.session,
        }
      );
    }
  );

  server.tool(
    "provide_context",
    "Attach gathered project or feature context to an existing session.",
    {
      sessionId: z.string().min(1),
      contextType: z.string().default("gathered"),
      payload: z.record(z.unknown()),
    },
    async ({ sessionId, contextType, payload }) => {
      const record = await addContext(sessionId, contextType, payload);
      return textResult(
        `Stored ${contextType} context on session ${sessionId}.`,
        {
          sessionId,
          context: record,
        }
      );
    }
  );

  server.tool(
    "open_design_ui",
    "Return the browser URL for the existing frontend UI with a bound session.",
    {
      sessionId: z.string().min(1),
    },
    async ({ sessionId }) => {
      const uiUrl = getSessionUiUrl(sessionId);
      return textResult(`Open the design UI at ${uiUrl}`, {
        sessionId,
        uiUrl,
      });
    }
  );

  server.tool(
    "get_design_results",
    "Fetch the export payload for a session, including any selected variant.",
    {
      sessionId: z.string().min(1),
    },
    async ({ sessionId }) => {
      const payload = await getSessionExport(sessionId);
      const selected = payload.selected_variant;
      const summary = selected
        ? `Selected variant ${selected.variant_index} is ready for integration.`
        : `No selected variant yet. ${payload.variants.length} variants recorded.`;
      return textResult(summary, payload as unknown as Record<string, unknown>);
    }
  );

  server.tool(
    "list_design_sessions",
    "List recent VUHL UI Forge sessions.",
    {
      statusFilter: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async ({ statusFilter, limit }) => {
      const sessions = await listSessions(statusFilter, limit ?? 25);
      return textResult(`Found ${sessions.length} sessions.`, { sessions });
    }
  );

  server.tool(
    "select_design_variant",
    "Mark a recorded variant as the approved selection for export.",
    {
      sessionId: z.string().min(1),
      variantIndex: z.number().int().min(0),
    },
    async ({ sessionId, variantIndex }) => {
      const detail = await selectVariant(sessionId, variantIndex);
      return textResult(
        `Selected variant ${variantIndex} for session ${sessionId}.`,
        {
          sessionId,
          session: detail.session,
        }
      );
    }
  );

  server.tool(
    "quick_design",
    "Create a session, optionally attach quick context, and return the browser URL.",
    {
      name: z.string().min(1),
      stack: z.string().optional(),
      inputMode: z.string().optional(),
      instructions: z.string().optional(),
      projectContext: z.record(z.unknown()).optional(),
    },
    async ({ name, stack, inputMode, instructions, projectContext }) => {
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

      const uiUrl = getSessionUiUrl(sessionId);
      return textResult(
        `Created quick design session ${sessionId}. Open ${uiUrl} to continue in the browser UI.`,
        {
          sessionId,
          uiUrl,
          session: detail.session,
        }
      );
    }
  );

  return server;
}

async function runStdioServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${serverName} MCP server running on stdio`);
}

async function runHttpServer(): Promise<void> {
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      name: serverName,
      version: serverVersion,
      backendBaseUrl: getBackendBaseUrl(),
      frontendBaseUrl,
    });
  });

  app.get("/ui/:sessionId", (req, res) => {
    res.redirect(getSessionUiUrl(req.params.sessionId));
  });

  app.get("/", (_req, res) => {
    res.type("html").send(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>VUHL UI Forge MCP</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 2rem; line-height: 1.5; }
            code { background: #f4f4f4; padding: 0.1rem 0.3rem; border-radius: 4px; }
          </style>
        </head>
        <body>
          <h1>VUHL UI Forge MCP</h1>
          <p>This process exposes MCP tools over stdio and coordinates with the main browser UI.</p>
          <p>Frontend UI: <a href="${frontendBaseUrl}">${frontendBaseUrl}</a></p>
          <p>Backend API: <a href="${getBackendBaseUrl()}">${getBackendBaseUrl()}</a></p>
          <p>Health check: <a href="/health">/health</a></p>
        </body>
      </html>
    `);
  });

  app.listen(httpPort, () => {
    console.error(`${serverName} helper server listening on http://127.0.0.1:${httpPort}`);
  });
}

async function main(): Promise<void> {
  const mode = process.argv.includes("--http") ? "http" : "stdio";
  if (mode === "http") {
    await runHttpServer();
    return;
  }
  await runStdioServer();
}

main().catch((error) => {
  console.error("Fatal error in VUHL UI Forge MCP:", error);
  process.exit(1);
});
