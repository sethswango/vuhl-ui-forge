/**
 * Tests the tiny URL-sync module that backs Round 6A's auto-session flow.
 *
 * Jest runs under a node environment here (not jsdom), so we stub just
 * enough of the browser surface — ``window.location`` and
 * ``window.history`` — to exercise the code without pulling in jsdom.
 * The real callers only use ``href``, ``pathname``/``search``/``hash``,
 * and ``replaceState``, so a minimal mock is faithful.
 */
import { readSessionFromUrl, writeSessionToUrl } from "./session-url";

type HistoryMock = {
  replaceState: jest.Mock;
  state: Record<string, unknown>;
};

function installWindow(
  href: string
): { history: HistoryMock; setHref: (next: string) => void } {
  const urlRef = { value: new URL(href) };
  const history: HistoryMock = {
    state: { k: "v" },
    replaceState: jest.fn((_state: unknown, _title: string, url: string) => {
      urlRef.value = new URL(url, urlRef.value.origin);
    }),
  };

  (global as unknown as { window: unknown }).window = {
    get location() {
      return {
        get href() {
          return urlRef.value.toString();
        },
        get pathname() {
          return urlRef.value.pathname;
        },
        get search() {
          return urlRef.value.search;
        },
        get hash() {
          return urlRef.value.hash;
        },
      };
    },
    history,
  };

  return {
    history,
    setHref: (next) => {
      urlRef.value = new URL(next);
    },
  };
}

function uninstallWindow() {
  delete (global as unknown as { window?: unknown }).window;
}

describe("session-url", () => {
  afterEach(() => {
    uninstallWindow();
    jest.clearAllMocks();
  });

  test("writeSessionToUrl sets the session query param via replaceState", () => {
    const { history } = installWindow("http://localhost:5173/forge");

    writeSessionToUrl("sess-abc");

    expect(history.replaceState).toHaveBeenCalledTimes(1);
    const [, , url] = history.replaceState.mock.calls[0];
    expect(url).toBe("/forge?session=sess-abc");
  });

  test("writeSessionToUrl preserves unrelated query params", () => {
    const { history } = installWindow("http://localhost:5173/?stack=html");

    writeSessionToUrl("sess-xyz");

    const [, , url] = history.replaceState.mock.calls[0];
    // Order-insensitive check: both params land in the final URL.
    expect(url.startsWith("/?")).toBe(true);
    const qs = new URLSearchParams(url.slice(2));
    expect(qs.get("stack")).toBe("html");
    expect(qs.get("session")).toBe("sess-xyz");
  });

  test("writeSessionToUrl is a no-op when the same session is already present", () => {
    const { history } = installWindow(
      "http://localhost:5173/forge?session=sess-abc"
    );

    writeSessionToUrl("sess-abc");

    expect(history.replaceState).not.toHaveBeenCalled();
  });

  test("writeSessionToUrl updates when the URL already has a different session", () => {
    const { history } = installWindow(
      "http://localhost:5173/forge?session=old"
    );

    writeSessionToUrl("new");

    expect(history.replaceState).toHaveBeenCalledTimes(1);
    const [, , url] = history.replaceState.mock.calls[0];
    expect(url).toBe("/forge?session=new");
  });

  test("writeSessionToUrl ignores empty IDs to avoid polluting the URL", () => {
    const { history } = installWindow("http://localhost:5173/forge");

    writeSessionToUrl("");

    expect(history.replaceState).not.toHaveBeenCalled();
  });

  test("writeSessionToUrl no-ops when window is unavailable (SSR-safe)", () => {
    uninstallWindow();

    expect(() => writeSessionToUrl("sess-abc")).not.toThrow();
  });

  test("writeSessionToUrl preserves the hash fragment", () => {
    const { history } = installWindow("http://localhost:5173/forge#spec");

    writeSessionToUrl("sess-abc");

    const [, , url] = history.replaceState.mock.calls[0];
    expect(url).toBe("/forge?session=sess-abc#spec");
  });

  test("readSessionFromUrl returns the session query param", () => {
    installWindow("http://localhost:5173/?session=sess-42");

    expect(readSessionFromUrl()).toBe("sess-42");
  });

  test("readSessionFromUrl returns null when absent", () => {
    installWindow("http://localhost:5173/");

    expect(readSessionFromUrl()).toBeNull();
  });

  test("readSessionFromUrl returns null when window is unavailable", () => {
    uninstallWindow();
    expect(readSessionFromUrl()).toBeNull();
  });
});
