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
});
