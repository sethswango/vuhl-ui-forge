jest.mock("../config", () => ({
  HTTP_BACKEND_URL: "http://localhost:7001",
}));

import {
  createSession,
  fetchSessionContext,
  postSessionVariants,
  selectSessionVariant,
  fetchSessionExport,
} from "./session-api";

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("session-api", () => {
  afterEach(() => {
    mockFetch.mockReset();
  });

  describe("fetchSessionContext", () => {
    test("returns context on 200", async () => {
      const detail = {
        session: {
          id: "s1",
          name: "Fee Comparison",
          stack: "html_tailwind",
          input_mode: "image",
          metadata: { project: "title-portal" },
        },
        contexts: [
          {
            id: "ctx-1",
            context_type: "project",
            payload: {
              componentName: "FooComponent",
              instructions: "Build the fee comparison tab",
            },
          },
        ],
        variants: [],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(detail),
      });

      const result = await fetchSessionContext("s1");
      expect(result).toEqual({
        sessionId: "s1",
        name: "Fee Comparison",
        componentName: "FooComponent",
        stack: "html_tailwind",
        instructions: "Build the fee comparison tab",
        projectContext: { project: "title-portal" },
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/sessions/s1")
      );
    });

    test("returns null on 404", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await fetchSessionContext("missing");
      expect(result).toBeNull();
    });

    test("throws on other errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(fetchSessionContext("s1")).rejects.toThrow(
        "Failed to fetch session context: 500"
      );
    });
  });

  describe("postSessionVariants", () => {
    test("posts variants successfully", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await postSessionVariants("s1", [
        {
          variantIndex: 0,
          code: "<div>Hello</div>",
          stack: "html_tailwind",
          model: "gpt-5.4",
        },
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/sessions/s1/variants"),
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    test("throws on failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      await expect(
        postSessionVariants("s1", [
          {
            variantIndex: 0,
            code: "<div/>",
            stack: "html_tailwind",
          },
        ])
      ).rejects.toThrow("Failed to post session variants: 500");
    });
  });

  describe("selectSessionVariant", () => {
    test("posts selected variant index", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await selectSessionVariant("s1", 2);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/sessions/s1/select"),
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
    });
  });

  describe("fetchSessionExport", () => {
    test("returns export payload", async () => {
      const payload = {
        session: { id: "s1", name: "Fee Comparison" },
        contexts: [],
        variants: [],
        selected_variant: null,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(payload),
      });

      const result = await fetchSessionExport("s1");
      expect(result).toEqual(payload);
    });
  });

  describe("createSession", () => {
    function mockCreated(id = "s-new", name = "Untitled design") {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            session: {
              id,
              name,
              stack: null,
              input_mode: null,
              metadata: {},
            },
            contexts: [],
            variants: [],
          }),
      });
    }

    test("defaults to 'Untitled design' when no name provided", async () => {
      mockCreated();
      const result = await createSession();
      expect(result).toEqual({ sessionId: "s-new", name: "Untitled design" });

      const [, init] = mockFetch.mock.calls[0];
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({
        name: "Untitled design",
      });
    });

    test("trims + forwards provided name, stack, input_mode, metadata", async () => {
      mockCreated("s-1", "Fee Summary");
      await createSession({
        name: "  Fee Summary  ",
        stack: "html_tailwind",
        inputMode: "image",
        metadata: { origin: "scan" },
      });

      const [, init] = mockFetch.mock.calls[0];
      expect(JSON.parse(init.body as string)).toEqual({
        name: "Fee Summary",
        stack: "html_tailwind",
        input_mode: "image",
        metadata: { origin: "scan" },
      });
    });

    test("falls back to default when name is whitespace only", async () => {
      mockCreated();
      await createSession({ name: "   " });
      const [, init] = mockFetch.mock.calls[0];
      expect(JSON.parse(init.body as string)).toEqual({
        name: "Untitled design",
      });
    });

    test("drops empty metadata so we don't POST noise", async () => {
      mockCreated();
      await createSession({ metadata: {} });
      const [, init] = mockFetch.mock.calls[0];
      expect(JSON.parse(init.body as string)).toEqual({
        name: "Untitled design",
      });
    });

    test("truncates long names to 200 chars to match backend cap", async () => {
      mockCreated();
      const longName = "x".repeat(500);
      await createSession({ name: longName });
      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body as string);
      expect(body.name).toHaveLength(200);
    });

    test("throws when the backend rejects the request", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      await expect(createSession()).rejects.toThrow(
        "Failed to create session: 500"
      );
    });
  });
});
