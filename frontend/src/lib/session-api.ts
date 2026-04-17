import { HTTP_BACKEND_URL } from "../config";

export interface SessionContext {
  sessionId: string;
  name?: string;
  componentName?: string;
  stack?: string;
  instructions?: string;
  projectContext?: Record<string, unknown>;
}

export interface CreateSessionRequest {
  name?: string;
  stack?: string;
  inputMode?: string;
  metadata?: Record<string, unknown>;
}

export interface CreatedSession {
  sessionId: string;
  name: string;
}

interface SessionContextRecord {
  id: string;
  context_type: string;
  payload: Record<string, unknown>;
}

interface SessionDetailResponse {
  session: {
    id: string;
    name: string;
    stack: string | null;
    input_mode: string | null;
    metadata: Record<string, unknown>;
  };
  contexts: SessionContextRecord[];
  variants: Array<unknown>;
}

export interface SessionVariantPayload {
  variantIndex: number;
  code: string;
  stack: string;
  model?: string;
}

export interface SessionExport {
  session: SessionDetailResponse["session"];
  contexts: SessionContextRecord[];
  variants: Array<{
    id: string;
    variant_index: number;
    model: string;
    code: string;
    status: string;
    metadata: Record<string, unknown>;
  }>;
  selected_variant: {
    id: string;
    variant_index: number;
    model: string;
    code: string;
    status: string;
    metadata: Record<string, unknown>;
  } | null;
}

const baseUrl = HTTP_BACKEND_URL.replace(/\/$/, "");

function normalizeSessionContext(detail: SessionDetailResponse): SessionContext {
  const mergedPayload = detail.contexts.reduce<Record<string, unknown>>(
    (acc, record) => ({ ...acc, ...record.payload }),
    {}
  );

  return {
    sessionId: detail.session.id,
    name: detail.session.name,
    componentName:
      typeof mergedPayload.componentName === "string"
        ? mergedPayload.componentName
        : undefined,
    stack:
      typeof mergedPayload.stack === "string"
        ? mergedPayload.stack
        : detail.session.stack ?? undefined,
    instructions:
      typeof mergedPayload.instructions === "string"
        ? mergedPayload.instructions
        : typeof mergedPayload.prompt === "string"
          ? mergedPayload.prompt
          : undefined,
    projectContext:
      typeof mergedPayload.projectContext === "object" &&
      mergedPayload.projectContext !== null
        ? (mergedPayload.projectContext as Record<string, unknown>)
        : detail.session.metadata,
  };
}

const DEFAULT_SESSION_NAME = "Untitled design";

/**
 * Create a new backend session.
 *
 * Used when the frontend needs a ``sessionId`` before the user triggers a
 * generation turn (e.g. to scan project context on the StartPane). Keeping
 * this client-side allows pre-generation features to light up without
 * waiting on the auto-session minted by ``/generate-code``.
 *
 * The backend requires ``name`` to be non-empty; we default to a gentle
 * placeholder if the caller doesn't provide one. The name can be overwritten
 * later once the first prompt lands (see ``_derive_session_name`` in
 * ``routes/generate_code.py``), but having a real value up front keeps
 * session listings readable even if no generation ever follows.
 */
export async function createSession(
  request: CreateSessionRequest = {}
): Promise<CreatedSession> {
  const body: Record<string, unknown> = {
    name: (request.name?.trim() || DEFAULT_SESSION_NAME).slice(0, 200),
  };
  if (request.stack) body.stack = request.stack;
  if (request.inputMode) body.input_mode = request.inputMode;
  if (request.metadata && Object.keys(request.metadata).length > 0) {
    body.metadata = request.metadata;
  }

  const res = await fetch(`${baseUrl}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Failed to create session: ${res.status}`);
  }
  const detail = (await res.json()) as SessionDetailResponse;
  return {
    sessionId: detail.session.id,
    name: detail.session.name,
  };
}

export async function fetchSessionContext(
  sessionId: string
): Promise<SessionContext | null> {
  const res = await fetch(`${baseUrl}/sessions/${sessionId}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Failed to fetch session context: ${res.status}`);
  }
  const detail = (await res.json()) as SessionDetailResponse;
  return normalizeSessionContext(detail);
}

export async function postSessionVariants(
  sessionId: string,
  variants: SessionVariantPayload[]
): Promise<void> {
  for (const variant of variants) {
    const res = await fetch(`${baseUrl}/sessions/${sessionId}/variants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variant_index: variant.variantIndex,
        model: variant.model ?? "unknown",
        code: variant.code,
        metadata: { stack: variant.stack },
      }),
    });
    if (!res.ok) {
      throw new Error(`Failed to post session variants: ${res.status}`);
    }
  }
}

export async function selectSessionVariant(
  sessionId: string,
  variantIndex: number
): Promise<void> {
  const res = await fetch(`${baseUrl}/sessions/${sessionId}/select`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ variant_index: variantIndex }),
  });
  if (!res.ok) {
    throw new Error(`Failed to select session variant: ${res.status}`);
  }
}

export async function fetchSessionExport(
  sessionId: string
): Promise<SessionExport> {
  const res = await fetch(`${baseUrl}/sessions/${sessionId}/export`);
  if (!res.ok) {
    throw new Error(`Failed to fetch session export: ${res.status}`);
  }
  return (await res.json()) as SessionExport;
}
