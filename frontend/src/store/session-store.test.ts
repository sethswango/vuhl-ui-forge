import { useSessionStore } from "./session-store";

describe("session-store", () => {
  beforeEach(() => {
    // Reset store between tests
    useSessionStore.setState({
      sessionId: null,
      status: "none",
      context: null,
      error: null,
    });
  });

  test("initial state has no session", () => {
    const state = useSessionStore.getState();
    expect(state.sessionId).toBeNull();
    expect(state.status).toBe("none");
    expect(state.context).toBeNull();
    expect(state.error).toBeNull();
  });

  test("setSessionId stores the ID", () => {
    useSessionStore.getState().setSessionId("sess-123");
    expect(useSessionStore.getState().sessionId).toBe("sess-123");
  });

  test("setLoading transitions status and clears error", () => {
    useSessionStore.getState().setError("old error");
    useSessionStore.getState().setLoading();
    const state = useSessionStore.getState();
    expect(state.status).toBe("loading");
    expect(state.error).toBeNull();
  });

  test("setContext stores context and moves to ready", () => {
    const ctx = { sessionId: "sess-123", componentName: "FooComponent" };
    useSessionStore.getState().setContext(ctx);
    const state = useSessionStore.getState();
    expect(state.context).toEqual(ctx);
    expect(state.status).toBe("ready");
    expect(state.error).toBeNull();
  });

  test("setError stores error message and moves to error status", () => {
    useSessionStore.getState().setError("Network failure");
    const state = useSessionStore.getState();
    expect(state.error).toBe("Network failure");
    expect(state.status).toBe("error");
  });

  test("clearSession resets all fields", () => {
    useSessionStore.getState().setSessionId("sess-456");
    useSessionStore.getState().setContext({ sessionId: "sess-456" });
    useSessionStore.getState().clearSession();
    const state = useSessionStore.getState();
    expect(state.sessionId).toBeNull();
    expect(state.status).toBe("none");
    expect(state.context).toBeNull();
    expect(state.error).toBeNull();
  });

  test("adoptServerSession installs an ID + minimal context + ready status", () => {
    useSessionStore.getState().adoptServerSession("sess-auto", "Login form");
    const state = useSessionStore.getState();
    expect(state.sessionId).toBe("sess-auto");
    expect(state.status).toBe("ready");
    expect(state.context).toEqual({
      sessionId: "sess-auto",
      name: "Login form",
    });
    expect(state.error).toBeNull();
  });

  test("adoptServerSession omits name when the server didn't provide one", () => {
    useSessionStore.getState().adoptServerSession("sess-noname");
    const state = useSessionStore.getState();
    expect(state.sessionId).toBe("sess-noname");
    expect(state.context).toEqual({ sessionId: "sess-noname" });
  });

  test("adoptServerSession is idempotent when the same ID is adopted twice", () => {
    useSessionStore.getState().adoptServerSession("sess-abc", "First");
    const afterFirst = useSessionStore.getState().context;
    useSessionStore.getState().adoptServerSession("sess-abc", "Second");
    const afterSecond = useSessionStore.getState();
    // First adoption wins — a second server message should not overwrite
    // local state, because a live session does not need to be "re-adopted".
    expect(afterSecond.context).toBe(afterFirst);
    expect(afterSecond.sessionId).toBe("sess-abc");
  });

  test("adoptServerSession clears stale errors", () => {
    useSessionStore.getState().setError("Previous failure");
    useSessionStore.getState().adoptServerSession("sess-new");
    const state = useSessionStore.getState();
    expect(state.error).toBeNull();
    expect(state.status).toBe("ready");
  });
});
