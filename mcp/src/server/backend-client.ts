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
