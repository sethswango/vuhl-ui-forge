import {
  ensureSession,
  __resetEnsureSessionInFlightForTests,
} from "./session-ensure";

describe("ensureSession", () => {
  beforeEach(() => {
    __resetEnsureSessionInFlightForTests();
  });

  test("returns the existing session without calling create", async () => {
    const create = jest.fn();
    const adopt = jest.fn();
    const result = await ensureSession(
      {},
      {
        getSessionId: () => "s-existing",
        create,
        adopt,
      }
    );

    expect(result).toBe("s-existing");
    expect(create).not.toHaveBeenCalled();
    expect(adopt).not.toHaveBeenCalled();
  });

  test("creates a session and adopts it when none exists", async () => {
    const adoptCalls: Array<[string, { name?: string } | undefined]> = [];
    const create = jest.fn(async () => ({
      sessionId: "s-new",
      name: "Untitled design",
    }));
    const adopt = jest.fn((id: string, meta?: { name?: string }) => {
      adoptCalls.push([id, meta]);
    });

    const result = await ensureSession(
      { name: "Hello" },
      {
        getSessionId: () => null,
        create,
        adopt,
      }
    );

    expect(result).toBe("s-new");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({ name: "Hello" });
    expect(adoptCalls).toEqual([["s-new", { name: "Untitled design" }]]);
  });

  test("omits the meta object when no name is returned", async () => {
    const adopt = jest.fn();
    await ensureSession(
      {},
      {
        getSessionId: () => null,
        create: async () => ({ sessionId: "s-anon" }),
        adopt,
      }
    );

    expect(adopt).toHaveBeenCalledWith("s-anon", undefined);
  });

  test("collapses concurrent callers onto a single create()", async () => {
    let resolveCreate!: (result: {
      sessionId: string;
      name?: string;
    }) => void;
    const create = jest.fn(
      () =>
        new Promise<{ sessionId: string; name?: string }>((resolve) => {
          resolveCreate = resolve;
        })
    );
    const adopt = jest.fn();

    const a = ensureSession(
      {},
      { getSessionId: () => null, create, adopt }
    );
    const b = ensureSession(
      {},
      { getSessionId: () => null, create, adopt }
    );
    const c = ensureSession(
      {},
      { getSessionId: () => null, create, adopt }
    );

    // All three should be waiting on the single pending create.
    expect(create).toHaveBeenCalledTimes(1);

    resolveCreate({ sessionId: "s-shared", name: "Race" });
    const [ra, rb, rc] = await Promise.all([a, b, c]);

    expect([ra, rb, rc]).toEqual(["s-shared", "s-shared", "s-shared"]);
    // Adopt only fires once — the winner handles state, others just await.
    expect(adopt).toHaveBeenCalledTimes(1);
    expect(adopt).toHaveBeenCalledWith("s-shared", { name: "Race" });
  });

  test("a second caller sees the freshly adopted session immediately", async () => {
    // Simulate a store whose session id flips once create() resolves. The
    // real store works this way (adopt updates state synchronously), so
    // we want ``ensureSession`` to route a follow-up call through the
    // fast path rather than queuing another network round-trip.
    let currentSessionId: string | null = null;
    const create = jest.fn(async () => ({ sessionId: "s-first" }));
    const adopt = jest.fn((id: string) => {
      currentSessionId = id;
    });

    const first = await ensureSession(
      {},
      {
        getSessionId: () => currentSessionId,
        create,
        adopt,
      }
    );
    expect(first).toBe("s-first");
    expect(create).toHaveBeenCalledTimes(1);

    const second = await ensureSession(
      {},
      {
        getSessionId: () => currentSessionId,
        create,
        adopt,
      }
    );
    expect(second).toBe("s-first");
    // Fast path — we did NOT hit create again.
    expect(create).toHaveBeenCalledTimes(1);
  });

  test("clears the in-flight promise when create rejects, so the next caller can retry", async () => {
    const create = jest
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ sessionId: "s-recovered", name: "Retry" });
    const adopt = jest.fn();

    await expect(
      ensureSession(
        {},
        { getSessionId: () => null, create, adopt }
      )
    ).rejects.toThrow("boom");

    // Second call should retry create, not re-use the rejected promise.
    const result = await ensureSession(
      {},
      { getSessionId: () => null, create, adopt }
    );
    expect(result).toBe("s-recovered");
    expect(create).toHaveBeenCalledTimes(2);
    expect(adopt).toHaveBeenCalledTimes(1);
    expect(adopt).toHaveBeenCalledWith("s-recovered", { name: "Retry" });
  });

  test("does not call adopt when create rejects", async () => {
    const create = jest.fn().mockRejectedValueOnce(new Error("offline"));
    const adopt = jest.fn();

    await expect(
      ensureSession(
        {},
        { getSessionId: () => null, create, adopt }
      )
    ).rejects.toThrow("offline");
    expect(adopt).not.toHaveBeenCalled();
  });

  test("forwards the request object to create verbatim", async () => {
    const create = jest.fn(async () => ({ sessionId: "s-req" }));
    const adopt = jest.fn();
    const request = { name: "Fee Summary", stack: "html_tailwind" };

    await ensureSession(request, {
      getSessionId: () => null,
      create,
      adopt,
    });
    expect(create).toHaveBeenCalledWith(request);
  });
});
