import { HTTP_BACKEND_URL } from "../config";
import {
  normalizeDesignSpec,
  normalizeProjectContext,
  normalizeRefineResponse,
} from "./design-api-types";
import type {
  DesignSpecResult,
  ExtractDesignSpecRequest,
  GatherProjectContextRequest,
  GatherProjectContextResult,
  QueueRefinementRequest,
  QueueRefinementResult,
} from "./design-api-types";

export * from "./design-api-types";

const baseUrl = HTTP_BACKEND_URL.replace(/\/$/, "");

interface RawGatherResponse {
  context?: { id?: string };
  project_context?: unknown;
}

async function parseErrorDetail(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: unknown };
    if (typeof data.detail === "string") return data.detail;
  } catch {
    // fall through to generic message
  }
  return `HTTP ${response.status}`;
}

export async function gatherProjectContext(
  sessionId: string,
  request: GatherProjectContextRequest,
): Promise<GatherProjectContextResult> {
  const body: Record<string, unknown> = { repo_path: request.repoPath };
  if (typeof request.maxFiles === "number") body.max_files = request.maxFiles;
  if (typeof request.maxComponents === "number")
    body.max_components = request.maxComponents;
  if (request.label) body.label = request.label;

  const response = await fetch(
    `${baseUrl}/sessions/${sessionId}/context/project`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    const detail = await parseErrorDetail(response);
    throw new Error(detail);
  }
  const data = (await response.json()) as RawGatherResponse;
  return {
    context: normalizeProjectContext(data.project_context),
    recordId: typeof data.context?.id === "string" ? data.context.id : "",
  };
}

export async function extractDesignSpec(
  sessionId: string,
  request: ExtractDesignSpecRequest,
): Promise<DesignSpecResult> {
  const body: Record<string, unknown> = {};
  if (typeof request.variantIndex === "number")
    body.variant_index = request.variantIndex;
  if (request.variantId) body.variant_id = request.variantId;
  if (typeof request.persistAsContext === "boolean")
    body.persist_as_context = request.persistAsContext;

  const response = await fetch(`${baseUrl}/sessions/${sessionId}/spec`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await parseErrorDetail(response);
    throw new Error(detail);
  }
  const data = await response.json();
  return normalizeDesignSpec(data);
}

export async function queueRefinement(
  sessionId: string,
  request: QueueRefinementRequest,
): Promise<QueueRefinementResult> {
  const body: Record<string, unknown> = {
    variant_index: request.variantIndex,
  };
  if (request.text) body.text = request.text;
  if (request.imageDataUrl) body.image_data_url = request.imageDataUrl;

  const response = await fetch(`${baseUrl}/sessions/${sessionId}/refine`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await parseErrorDetail(response);
    throw new Error(detail);
  }
  const data = await response.json();
  return normalizeRefineResponse(data);
}
