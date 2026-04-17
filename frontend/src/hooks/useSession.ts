import { useCallback, useEffect } from "react";
import { useSessionStore } from "../store/session-store";
import {
  CreateSessionRequest,
  createSession,
  fetchSessionContext,
  selectSessionVariant,
} from "../lib/session-api";
import { ensureSession as ensureSessionCore } from "../lib/session-ensure";
import { readSessionFromUrl, writeSessionToUrl } from "../lib/session-url";

function getSessionIdFromUrl(): string | null {
  return readSessionFromUrl();
}

export function useSession() {
  const {
    sessionId,
    status,
    context,
    error,
    approvalStatus,
    selectedVariantIndex,
    setSessionId,
    setLoading,
    setContext,
    setError,
    setApprovalPending,
    setApprovalDone,
    setApprovalError,
    adoptServerSession,
  } = useSessionStore();

  useEffect(() => {
    const urlSessionId = getSessionIdFromUrl();
    if (!urlSessionId) return;
    if (urlSessionId === sessionId) return;

    setSessionId(urlSessionId);
    setLoading();

    let cancelled = false;
    fetchSessionContext(urlSessionId)
      .then((ctx) => {
        if (cancelled) return;
        if (ctx) {
          setContext(ctx);
        } else {
          // Session not found on backend — still store the ID so variants
          // can be posted later, but mark status as ready with no context.
          setContext({
            sessionId: urlSessionId,
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load session context", err);
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
    // Only re-run when the URL session ID changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const approveVariant = useCallback(
    async (variantIndex: number) => {
      if (!sessionId) return;
      setApprovalPending(variantIndex);
      try {
        await selectSessionVariant(sessionId, variantIndex);
        setApprovalDone();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Failed to approve variant", err);
        setApprovalError(msg);
      }
    },
    [sessionId, setApprovalPending, setApprovalDone, setApprovalError]
  );

  const adoptSessionFromServer = useCallback(
    (id: string, meta?: { name?: string }) => {
      // Mutation order matters: update the store first so any React subtree
      // re-reading ``sessionId`` (spec dialog, project panel, handoff button)
      // immediately sees the live session. URL sync follows — it's a
      // side-effect that only needs to happen once, and doesn't gate
      // downstream state.
      adoptServerSession(id, meta?.name);
      writeSessionToUrl(id);
    },
    [adoptServerSession]
  );

  /**
   * Resolve a live ``sessionId``, creating a backend session on demand if
   * one does not already exist. Use this whenever a pre-generation feature
   * (e.g. project context scan) needs a session but the user hasn't yet
   * triggered a generation turn.
   *
   * Idempotent: if a session is already active, the current ID is returned
   * without network traffic. Concurrent callers during the "no session"
   * window share a single in-flight ``createSession`` promise so only one
   * session is ever minted per racing click.
   *
   * The core logic lives in ``lib/session-ensure`` so it can be exercised
   * without React. We read the session id from the live store rather than
   * the hook's captured ``sessionId`` to avoid a stale-closure window when
   * two components call ``ensureSession`` in the same render tick.
   */
  const ensureSession = useCallback(
    async (request: CreateSessionRequest = {}): Promise<string> => {
      return ensureSessionCore(request, {
        getSessionId: () => useSessionStore.getState().sessionId,
        create: createSession,
        adopt: adoptSessionFromServer,
      });
    },
    [adoptSessionFromServer]
  );

  return {
    sessionId,
    status,
    context,
    error,
    approvalStatus,
    selectedVariantIndex,
    isSessionActive: sessionId !== null,
    approveVariant,
    adoptSessionFromServer,
    ensureSession,
  };
}
