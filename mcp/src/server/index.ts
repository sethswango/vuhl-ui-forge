import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getBackendBaseUrl } from "./backend-client.js";
import { toolDefinitions, ToolContext } from "./tools.js";

const serverName = "vuhl-ui-forge";
const serverVersion = "0.1.0";
const frontendBaseUrl =
  process.env.VUHL_UI_FORGE_FRONTEND_URL?.replace(/\/$/, "") ??
  "http://127.0.0.1:5173";
const httpPort = Number(process.env.VUHL_UI_FORGE_MCP_PORT ?? "3001");

function getSessionUiUrl(sessionId: string): string {
  return `${frontendBaseUrl}/?session=${encodeURIComponent(sessionId)}`;
}

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: serverName,
    version: serverVersion,
  });

  const context: ToolContext = { getSessionUiUrl };

  for (const tool of toolDefinitions) {
    server.tool(
      tool.name,
      tool.description,
      tool.schema,
      async (args: Record<string, unknown>) => {
        const typedArgs = args as Parameters<typeof tool.handler>[0];
        return tool.handler(typedArgs, context);
      }
    );
  }

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
      toolNames: toolDefinitions.map((tool) => tool.name),
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
