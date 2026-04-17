/**
 * Pure, testable core of the "ensure a session exists before this action"
 * protocol used by pre-generation features (project context scan, etc.).
 *
 * This module intentionally has no React, no Zustand, and no imports from
 * ``useSession``. It takes everything it needs as callbacks so it can be
 * exercised directly from unit tests without mounting the hook or shimming
 * a DOM. The only piece of shared state it owns is the module-scope
 * in-flight promise that lets concurrent callers share a single network
 * round-trip — exactly the behavior the real hook wants.
 *
 * The React hook in ``useSession`` binds this helper to the live store and
 * the URL-sync side effect; nothing else should reach in here.
 */

export interface EnsureSessionOptions<TRequest, TResult extends string> {
  /**
   * Read the *current* session id. We re-read on every call rather than
   * closing over a React-captured value so that two components mounting in
   * the same tick (both with a stale ``null`` in their closure) still see
   * a session that was just adopted by a peer.
   */
  getSessionId: () => string | null;

  /**
   * Mint a new session against the backend. Resolves to the new session's
   * id alongside any metadata the adopt hook needs.
   */
  create: (
    request: TRequest
  ) => Promise<{ sessionId: TResult; name?: string }>;

  /**
   * Called after ``create`` resolves so the caller can wire the new session
   * into its state store and sync the URL. Kept as an opaque callback so
   * this helper stays decoupled from Zustand and ``history.replaceState``.
   */
  adopt: (sessionId: TResult, meta?: { name?: string }) => void;
}

/**
 * In-flight promise for session creation. Module-scoped so that concurrent
 * callers (e.g. the user rapidly clicking a button that calls
 * ``ensureSession`` from two places) collapse onto a single backend request.
 *
 * Typed as ``string`` because the narrow ``TResult`` generic would otherwise
 * leak into the module variable — the helper validates the value at the
 * call-site before handing it back to the generic caller.
 */
let ensureSessionInFlight: Promise<string> | null = null;

/**
 * Resolve a live ``sessionId``, creating one on demand if necessary.
 *
 * - If a session already exists, returns its id without any network call.
 * - If another ``ensureSession`` call is already in flight, waits on that
 *   same promise so we never double-POST.
 * - Otherwise, mints a new session, adopts it into the caller's state, and
 *   returns the id.
 *
 * ``adopt`` is invoked *before* the returned promise resolves, so by the
 * time the caller's ``await`` returns, the store and URL are already in
 * sync. This ordering matters: downstream code (like a scan that
 * immediately posts to ``/sessions/<id>/context/project``) should be able
 * to read the session from the store without a double-render.
 */
export async function ensureSession<TRequest, TResult extends string = string>(
  request: TRequest,
  options: EnsureSessionOptions<TRequest, TResult>
): Promise<TResult> {
  const existing = options.getSessionId();
  if (existing) return existing as TResult;

  if (ensureSessionInFlight) {
    return (await ensureSessionInFlight) as TResult;
  }

  const flight = options
    .create(request)
    .then(({ sessionId, name }) => {
      options.adopt(sessionId, name !== undefined ? { name } : undefined);
      return sessionId as string;
    })
    .finally(() => {
      // Clear *after* adopt so subsequent callers see either the freshly
      // adopted session (via ``getSessionId``) or, on error, a clean slate
      // where they can retry. Leaving the promise set after failure would
      // strand every future caller on a rejected promise.
      ensureSessionInFlight = null;
    });

  ensureSessionInFlight = flight;
  return (await flight) as TResult;
}

/**
 * Test-only hook to reset the shared in-flight promise between cases.
 * Not exported from the public module barrel; imports should go directly
 * to ``session-ensure`` in tests.
 */
export function __resetEnsureSessionInFlightForTests(): void {
  ensureSessionInFlight = null;
}
