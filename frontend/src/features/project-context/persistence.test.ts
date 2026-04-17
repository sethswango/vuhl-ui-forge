import {
  PROJECT_PATH_STORAGE_KEY,
  loadProjectPath,
  saveProjectPath,
} from "./persistence";

/**
 * Minimal localStorage double sufficient for these tests. We avoid pulling in
 * jsdom or a full DOM shim just for this helper — the persistence module is
 * intentionally tiny and reaches for ``window.localStorage`` behind a safety
 * check, so a shim at ``global.window`` is enough to exercise both the happy
 * path and the quota-error / missing-storage branches.
 */
function installWindow(impl?: Partial<Storage>) {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear: jest.fn(() => store.clear()),
    key: jest.fn((index: number) => Array.from(store.keys())[index] ?? null),
    getItem: jest.fn((key: string) =>
      store.has(key) ? store.get(key)! : null
    ),
    setItem: jest.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: jest.fn((key: string) => {
      store.delete(key);
    }),
    ...impl,
  };
  (globalThis as { window?: unknown }).window = { localStorage: storage };
  return { storage, store };
}

function uninstallWindow() {
  delete (globalThis as { window?: unknown }).window;
}

describe("project-context persistence", () => {
  afterEach(() => {
    uninstallWindow();
  });

  describe("loadProjectPath", () => {
    test("returns empty string when window is undefined", () => {
      uninstallWindow();
      expect(loadProjectPath()).toBe("");
    });

    test("returns empty string when localStorage has nothing stored", () => {
      installWindow();
      expect(loadProjectPath()).toBe("");
    });

    test("returns the persisted path verbatim", () => {
      const { storage } = installWindow();
      storage.setItem(PROJECT_PATH_STORAGE_KEY, "C:/dev/my-app");
      expect(loadProjectPath()).toBe("C:/dev/my-app");
    });

    test("truncates overly long values defensively", () => {
      const { storage } = installWindow();
      const huge = "a".repeat(2000);
      storage.setItem(PROJECT_PATH_STORAGE_KEY, huge);
      const result = loadProjectPath();
      expect(result.length).toBe(1024);
      expect(result).toBe("a".repeat(1024));
    });

    test("swallows getItem exceptions and returns empty", () => {
      installWindow({
        getItem: () => {
          throw new Error("blocked");
        },
      });
      expect(loadProjectPath()).toBe("");
    });

    test("returns empty string when getItem returns a non-string value", () => {
      installWindow({
        // Simulate a corrupted entry — some browsers surface ``null`` for
        // non-string localStorage rows, but a rogue extension could also
        // return an object shape.
        getItem: () => 42 as unknown as string,
      });
      expect(loadProjectPath()).toBe("");
    });
  });

  describe("saveProjectPath", () => {
    test("no-ops silently when window is undefined", () => {
      uninstallWindow();
      expect(() => saveProjectPath("C:/dev/my-app")).not.toThrow();
    });

    test("writes the path under the stable storage key", () => {
      const { storage, store } = installWindow();
      saveProjectPath("C:/dev/my-app");
      expect(storage.setItem).toHaveBeenCalledWith(
        PROJECT_PATH_STORAGE_KEY,
        "C:/dev/my-app"
      );
      expect(store.get(PROJECT_PATH_STORAGE_KEY)).toBe("C:/dev/my-app");
    });

    test("removes the entry when the path becomes empty", () => {
      const { storage, store } = installWindow();
      store.set(PROJECT_PATH_STORAGE_KEY, "C:/dev/prev");
      saveProjectPath("");
      expect(storage.removeItem).toHaveBeenCalledWith(
        PROJECT_PATH_STORAGE_KEY
      );
      expect(store.has(PROJECT_PATH_STORAGE_KEY)).toBe(false);
    });

    test("removes the entry when the path is only whitespace", () => {
      const { storage } = installWindow();
      saveProjectPath("   \t\n");
      expect(storage.removeItem).toHaveBeenCalledWith(
        PROJECT_PATH_STORAGE_KEY
      );
    });

    test("truncates absurdly long paths before writing", () => {
      const { storage } = installWindow();
      saveProjectPath("x".repeat(5000));
      const call = (storage.setItem as jest.Mock).mock.calls[0];
      expect(call[0]).toBe(PROJECT_PATH_STORAGE_KEY);
      expect((call[1] as string).length).toBe(1024);
    });

    test("swallows setItem exceptions (quota / privacy mode) without throwing", () => {
      installWindow({
        setItem: () => {
          throw new Error("QuotaExceeded");
        },
      });
      expect(() => saveProjectPath("C:/dev/my-app")).not.toThrow();
    });
  });
});
