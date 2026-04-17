import { describe, expect, test, beforeEach } from "@jest/globals";

import {
  specCacheKey,
  useDesignStore,
  type SpecCacheKey,
} from "./design-store";
import type { DesignSpecResult } from "../lib/design-api-types";

const FIXTURE_SPEC: DesignSpecResult = {
  sessionId: "sess-1",
  variantIndex: 0,
  variantId: "variant-1",
  annotatedMarkdown: "# spec",
  spec: {
    summary: "summary",
    alignmentNotes: [],
    reuseSuggestions: [],
    newComponentsNeeded: [],
    projectContextUsed: false,
  },
};

function cacheValue(key: SpecCacheKey) {
  return useDesignStore.getState().specByVariant[specCacheKey(key)];
}

describe("design-store", () => {
  beforeEach(() => {
    useDesignStore.setState({
      projectPath: "",
      projectContext: null,
      scanStatus: "idle",
      scanError: null,
      lastScannedAt: null,
      specByVariant: {},
      openSpecKey: null,
    });
  });

  test("specCacheKey encodes commit + variant index into a stable string", () => {
    expect(specCacheKey({ commitHash: "abc", variantIndex: 0 })).toBe("abc::0");
    expect(specCacheKey({ commitHash: "abc", variantIndex: 1 })).toBe("abc::1");
    expect(specCacheKey({ commitHash: "def", variantIndex: 0 })).toBe("def::0");
  });

  test("cache entries at the same variantIndex in different commits do not collide", () => {
    const keyA: SpecCacheKey = { commitHash: "commit-a", variantIndex: 0 };
    const keyB: SpecCacheKey = { commitHash: "commit-b", variantIndex: 0 };

    useDesignStore.getState().specFetchSucceeded(keyA, {
      ...FIXTURE_SPEC,
      annotatedMarkdown: "spec-a",
    });

    useDesignStore.getState().specFetchSucceeded(keyB, {
      ...FIXTURE_SPEC,
      annotatedMarkdown: "spec-b",
    });

    expect(cacheValue(keyA)?.result?.annotatedMarkdown).toBe("spec-a");
    expect(cacheValue(keyB)?.result?.annotatedMarkdown).toBe("spec-b");
  });

  test("iterating to a new commit does not show the old cached spec", () => {
    const oldKey: SpecCacheKey = { commitHash: "old", variantIndex: 0 };
    useDesignStore.getState().specFetchSucceeded(oldKey, {
      ...FIXTURE_SPEC,
      annotatedMarkdown: "stale",
    });

    const newKey: SpecCacheKey = { commitHash: "new", variantIndex: 0 };
    expect(cacheValue(newKey)).toBeUndefined();
  });

  test("beginSpecFetch preserves previous result while marking loading", () => {
    const key: SpecCacheKey = { commitHash: "c", variantIndex: 0 };

    useDesignStore.getState().specFetchSucceeded(key, {
      ...FIXTURE_SPEC,
      annotatedMarkdown: "first",
    });

    useDesignStore.getState().beginSpecFetch(key);

    const entry = cacheValue(key);
    expect(entry?.status).toBe("loading");
    expect(entry?.result?.annotatedMarkdown).toBe("first");
    expect(entry?.error).toBeNull();
  });

  test("specFetchFailed keeps the last good result when we have one", () => {
    const key: SpecCacheKey = { commitHash: "c", variantIndex: 0 };

    useDesignStore.getState().specFetchSucceeded(key, {
      ...FIXTURE_SPEC,
      annotatedMarkdown: "good",
    });

    useDesignStore.getState().specFetchFailed(key, "boom");

    const entry = cacheValue(key);
    expect(entry?.status).toBe("error");
    expect(entry?.result?.annotatedMarkdown).toBe("good");
    expect(entry?.error).toBe("boom");
  });

  test("openSpec and closeSpec track the active cache key", () => {
    const key: SpecCacheKey = { commitHash: "c", variantIndex: 2 };

    useDesignStore.getState().openSpec(key);
    expect(useDesignStore.getState().openSpecKey).toBe("c::2");

    useDesignStore.getState().closeSpec();
    expect(useDesignStore.getState().openSpecKey).toBeNull();
  });

  test("clearSpec removes only the specified entry", () => {
    const keep: SpecCacheKey = { commitHash: "keep", variantIndex: 0 };
    const drop: SpecCacheKey = { commitHash: "drop", variantIndex: 0 };

    useDesignStore.getState().specFetchSucceeded(keep, FIXTURE_SPEC);
    useDesignStore.getState().specFetchSucceeded(drop, FIXTURE_SPEC);

    useDesignStore.getState().clearSpec(drop);

    expect(cacheValue(keep)).toBeDefined();
    expect(cacheValue(drop)).toBeUndefined();
  });
});
