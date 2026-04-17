/**
 * URL-sync helpers for session IDs.
 *
 * Round 6A establishes an invariant: if a user has a live session, the
 * browser URL must show ``?session=<id>``. That gives the tab a stable
 * identity across reloads, is shareable, and unblocks every downstream
 * feature that expects an addressable session (project context, spec,
 * implementer handoff). We keep the plumbing in one tiny module so the
 * store stays side-effect-free and tests can mock ``window`` cleanly.
 */

const SESSION_PARAM = "session";

/**
 * Write a session ID into the current URL's query string.
 *
 * Uses ``history.replaceState`` rather than ``pushState`` so the browser
 * back button still returns to the user's prior app state — from their
 * perspective nothing navigated. Idempotent: if the URL already carries
 * the same session, this is a no-op so we don't churn history entries or
 * trigger superfluous popstate listeners.
 */
export function writeSessionToUrl(sessionId: string): void {
  if (typeof window === "undefined") return;
  if (!sessionId) return;
  try {
    const url = new URL(window.location.href);
    const current = url.searchParams.get(SESSION_PARAM);
    if (current === sessionId) return;
    url.searchParams.set(SESSION_PARAM, sessionId);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
  } catch (err) {
    console.warn("Failed to sync session to URL", err);
  }
}

export function readSessionFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get(SESSION_PARAM);
  } catch {
    return null;
  }
}
