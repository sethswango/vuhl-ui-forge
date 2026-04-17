export interface SessionSummary {
  id: string;
  name: string;
  status: string;
  stack: string | null;
  input_mode: string | null;
  metadata: Record<string, unknown>;
  selected_variant_id: string | null;
  created_at: string;
  updated_at: string;
  last_context_at: string | null;
  last_variant_at: string | null;
}

export interface SessionContextRecord {
  id: string;
  context_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface SessionVariantRecord {
  id: string;
  variant_index: number;
  model: string;
  code: string;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SessionDetail {
  session: SessionSummary;
  contexts: SessionContextRecord[];
  variants: SessionVariantRecord[];
}

export interface SessionExport extends SessionDetail {
  selected_variant: SessionVariantRecord | null;
}

export interface CreateSessionRequest {
  name: string;
  stack?: string;
  input_mode?: string;
  metadata?: Record<string, unknown>;
}

export interface GatherProjectContextRequest {
  repoPath: string;
  maxFiles?: number;
  maxComponents?: number;
  label?: string;
}

export interface GatherProjectContextResponse {
  context: SessionContextRecord;
  project_context: Record<string, unknown>;
}

export interface ExtractDesignSpecRequest {
  variantIndex?: number;
  variantId?: string;
  persistAsContext?: boolean;
}

export interface ExtractDesignSpecResponse {
  session_id: string;
  variant_index: number;
  variant_id: string;
  spec: Record<string, unknown>;
  annotated_markdown: string;
  context_record: SessionContextRecord | null;
}

export interface RefineVariantRequest {
  variantIndex: number;
  text?: string;
  imageDataUrl?: string;
}

export interface RefineVariantResponse {
  session_id: string;
  variant_index: number;
  refinement_id: string;
  status: string;
  stream_hint: Record<string, unknown>;
  context_record: SessionContextRecord | null;
}

const backendBaseUrl =
  process.env.VUHL_UI_FORGE_BACKEND_URL?.replace(/\/$/, "") ??
  "http://127.0.0.1:7001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${backendBaseUrl}${path}`, init);
  if (!response.ok) {
    throw new Error(`Backend request failed (${response.status}) for ${path}`);
  }
  return (await response.json()) as T;
}

export function getBackendBaseUrl(): string {
  return backendBaseUrl;
}

export async function createSession(
  payload: CreateSessionRequest
): Promise<SessionDetail> {
  return request<SessionDetail>("/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function addContext(
  sessionId: string,
  contextType: string,
  payload: Record<string, unknown>
): Promise<SessionContextRecord> {
  return request<SessionContextRecord>(`/sessions/${sessionId}/context`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      context_type: contextType,
      payload,
    }),
  });
}

export async function getSession(sessionId: string): Promise<SessionDetail> {
  return request<SessionDetail>(`/sessions/${sessionId}`);
}

export async function listSessions(
  statusFilter?: string,
  limit = 25
): Promise<SessionSummary[]> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (statusFilter) {
    params.set("status_filter", statusFilter);
  }
  return request<SessionSummary[]>(`/sessions?${params.toString()}`);
}

export async function selectVariant(
  sessionId: string,
  variantIndex: number
): Promise<SessionDetail> {
  return request<SessionDetail>(`/sessions/${sessionId}/select`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ variant_index: variantIndex }),
  });
}

export async function getSessionExport(
  sessionId: string
): Promise<SessionExport> {
  return request<SessionExport>(`/sessions/${sessionId}/export`);
}

export async function gatherProjectContext(
  sessionId: string,
  payload: GatherProjectContextRequest
): Promise<GatherProjectContextResponse> {
  const body: Record<string, unknown> = {
    repo_path: payload.repoPath,
  };
  if (payload.maxFiles !== undefined) {
    body.max_files = payload.maxFiles;
  }
  if (payload.maxComponents !== undefined) {
    body.max_components = payload.maxComponents;
  }
  if (payload.label !== undefined) {
    body.label = payload.label;
  }
  return request<GatherProjectContextResponse>(
    `/sessions/${sessionId}/context/project`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

export async function extractDesignSpec(
  sessionId: string,
  payload: ExtractDesignSpecRequest
): Promise<ExtractDesignSpecResponse> {
  const body: Record<string, unknown> = {};
  if (payload.variantIndex !== undefined) {
    body.variant_index = payload.variantIndex;
  }
  if (payload.variantId !== undefined) {
    body.variant_id = payload.variantId;
  }
  if (payload.persistAsContext !== undefined) {
    body.persist_as_context = payload.persistAsContext;
  }
  return request<ExtractDesignSpecResponse>(`/sessions/${sessionId}/spec`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function refineVariant(
  sessionId: string,
  payload: RefineVariantRequest
): Promise<RefineVariantResponse> {
  const body: Record<string, unknown> = {
    variant_index: payload.variantIndex,
  };
  if (payload.text !== undefined) {
    body.text = payload.text;
  }
  if (payload.imageDataUrl !== undefined) {
    body.image_data_url = payload.imageDataUrl;
  }
  return request<RefineVariantResponse>(`/sessions/${sessionId}/refine`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
