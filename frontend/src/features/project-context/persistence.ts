/**
 * localStorage-backed persistence for the last project path the user scanned.
 *
 * Why persist? Once a user points the tool at their target repo (e.g.
 * ``C:/dev/my-angular-app``), they almost always want to design against the
 * same repo on subsequent visits. Forcing them to retype a long absolute
 * path on every reload creates the exact friction the app is meant to
 * eliminate. Persisting also preserves continuity when a browser tab is
 * accidentally closed mid-session — the path is restored without needing
 * the full session record.
 *
 * Kept as a pure helper module (not inside the Zustand store or React hook)
 * so it can be imported from tests, the panel, and potential future
 * persistence surfaces without dragging React or store wiring along.
 *
 * Guards against missing ``window``/``localStorage`` (test runner uses the
 * Node environment) and against quota or access errors raised by strict
 * privacy modes. Failures are non-fatal — the panel will simply start with
 * an empty path.
 */

const PROJECT_PATH_KEY = "vuhl-ui-forge.project-context.path";
const MAX_PATH_LENGTH = 1024;

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadProjectPath(): string {
  const storage = safeStorage();
  if (!storage) return "";
  try {
    const raw = storage.getItem(PROJECT_PATH_KEY);
    if (typeof raw !== "string") return "";
    return raw.slice(0, MAX_PATH_LENGTH);
  } catch {
    return "";
  }
}

export function saveProjectPath(path: string): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    if (path.trim().length === 0) {
      storage.removeItem(PROJECT_PATH_KEY);
      return;
    }
    storage.setItem(PROJECT_PATH_KEY, path.slice(0, MAX_PATH_LENGTH));
  } catch {
    // Persistence is a best-effort convenience; swallow quota / privacy errors.
  }
}

export const PROJECT_PATH_STORAGE_KEY = PROJECT_PATH_KEY;
