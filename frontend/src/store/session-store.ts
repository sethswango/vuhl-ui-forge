import { create } from "zustand";
import { SessionContext } from "../lib/session-api";

type SessionStatus = "none" | "loading" | "ready" | "error";
type ApprovalStatus = "none" | "pending" | "approved" | "error";

interface SessionStore {
  sessionId: string | null;
  status: SessionStatus;
  context: SessionContext | null;
  error: string | null;

  approvalStatus: ApprovalStatus;
  selectedVariantIndex: number | null;

  setSessionId: (id: string | null) => void;
  setLoading: () => void;
  setContext: (context: SessionContext) => void;
  setError: (error: string) => void;
  clearSession: () => void;
  adoptServerSession: (id: string, name?: string) => void;

  setApprovalPending: (variantIndex: number) => void;
  setApprovalDone: () => void;
  setApprovalError: (error: string) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessionId: null,
  status: "none",
  context: null,
  error: null,
  approvalStatus: "none",
  selectedVariantIndex: null,

  setSessionId: (id) => set({ sessionId: id }),
  setLoading: () => set({ status: "loading", error: null }),
  setContext: (context) => set({ context, status: "ready", error: null }),
  setError: (error) => set({ error, status: "error" }),
  clearSession: () =>
    set({
      sessionId: null,
      status: "none",
      context: null,
      error: null,
      approvalStatus: "none",
      selectedVariantIndex: null,
    }),
  adoptServerSession: (id, name) =>
    // Fired when the backend mints a session mid-generation. We set the
    // store into a "ready" state with a minimal SessionContext so downstream
    // features (project context panel, spec dialog, handoff) can key off
    // ``sessionId`` immediately without waiting for a round-trip fetch.
    // Existing session data is preserved — this path assumes the server
    // only mints when the client had none.
    set((state) => {
      if (state.sessionId === id) return state;
      return {
        sessionId: id,
        status: "ready",
        context: { sessionId: id, ...(name ? { name } : {}) },
        error: null,
      };
    }),
  setApprovalPending: (variantIndex) =>
    set({ approvalStatus: "pending", selectedVariantIndex: variantIndex }),
  setApprovalDone: () => set({ approvalStatus: "approved" }),
  setApprovalError: (error) => set({ approvalStatus: "error", error }),
}));
