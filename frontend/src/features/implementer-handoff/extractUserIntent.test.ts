import { extractUserIntent } from "./extractUserIntent";
import type { Commit, CommitHash } from "../../components/commits/types";

const FIXED_DATE = new Date("2026-04-17T00:00:00.000Z");

function aiCreateCommit(
  hash: CommitHash,
  overrides: {
    text?: string;
    images?: string[];
    videos?: string[];
    parentHash?: CommitHash | null;
  } = {},
): Commit {
  return {
    type: "ai_create",
    hash,
    parentHash: overrides.parentHash ?? null,
    isCommitted: true,
    dateCreated: FIXED_DATE,
    variants: [],
    selectedVariantIndex: 0,
    inputs: {
      text: overrides.text ?? "",
      images: overrides.images ?? [],
      videos: overrides.videos ?? [],
    },
  };
}

function aiEditCommit(
  hash: CommitHash,
  parentHash: CommitHash,
  overrides: {
    text?: string;
    images?: string[];
    videos?: string[];
    selectedElementHtml?: string;
  } = {},
): Commit {
  return {
    type: "ai_edit",
    hash,
    parentHash,
    isCommitted: true,
    dateCreated: FIXED_DATE,
    variants: [],
    selectedVariantIndex: 0,
    inputs: {
      text: overrides.text ?? "",
      images: overrides.images ?? [],
      videos: overrides.videos ?? [],
      selectedElementHtml: overrides.selectedElementHtml,
    },
  };
}

function codeCreateCommit(hash: CommitHash): Commit {
  return {
    type: "code_create",
    hash,
    parentHash: null,
    isCommitted: true,
    dateCreated: FIXED_DATE,
    variants: [],
    selectedVariantIndex: 0,
    inputs: null,
  };
}

function mapOf(...commits: Commit[]): Record<CommitHash, Commit> {
  const out: Record<CommitHash, Commit> = {};
  for (const commit of commits) {
    out[commit.hash] = commit;
  }
  return out;
}

describe("extractUserIntent", () => {
  it("returns null when no head hash is provided", () => {
    expect(extractUserIntent({}, null)).toBeNull();
    expect(extractUserIntent({}, "")).toBeNull();
  });

  it("returns null when the head hash is missing from the commit map", () => {
    const commits = mapOf(aiCreateCommit("root", { text: "hi" }));
    expect(extractUserIntent(commits, "missing")).toBeNull();
  });

  it("returns null when a parent in the chain is missing", () => {
    const edit = aiEditCommit("edit", "missing-parent", { text: "add color" });
    const commits = mapOf(edit);
    expect(extractUserIntent(commits, "edit")).toBeNull();
  });

  it("returns null for a code_create root (imported code, no user prompt)", () => {
    const commits = mapOf(codeCreateCommit("root"));
    expect(extractUserIntent(commits, "root")).toBeNull();
  });

  it("emits an initial prompt when there are no refinements yet", () => {
    const root = aiCreateCommit("root", {
      text: "Dashboard with a hero card",
      images: ["dataurl-1"],
    });
    const intent = extractUserIntent(mapOf(root), "root");

    expect(intent).toEqual({
      initialPrompt: "Dashboard with a hero card",
      initialImagesCount: 1,
      initialVideosCount: 0,
      inputMode: "image",
      refinements: [],
    });
  });

  it("captures refinements in oldest-first order and preserves selected-element context", () => {
    const root = aiCreateCommit("root", { text: "Landing page with CTA" });
    const firstEdit = aiEditCommit("e1", "root", {
      text: "Make the CTA larger and more colorful",
    });
    const secondEdit = aiEditCommit("e2", "e1", {
      text: "Add a muted subtitle below the CTA",
      images: ["dataurl-2"],
      selectedElementHtml:
        "<button class='cta primary'>Sign up</button>",
    });

    const intent = extractUserIntent(
      mapOf(root, firstEdit, secondEdit),
      "e2",
    );

    expect(intent).not.toBeNull();
    expect(intent?.initialPrompt).toBe("Landing page with CTA");
    expect(intent?.inputMode).toBe("text");
    expect(intent?.refinements).toHaveLength(2);
    expect(intent?.refinements[0]).toEqual({
      text: "Make the CTA larger and more colorful",
      imagesCount: 0,
      selectedElementPreview: undefined,
    });
    expect(intent?.refinements[1]).toEqual({
      text: "Add a muted subtitle below the CTA",
      imagesCount: 1,
      selectedElementPreview:
        "<button class='cta primary'>Sign up</button>",
    });
  });

  it("trims and collapses whitespace in selected-element previews", () => {
    const root = aiCreateCommit("root", { text: "Header" });
    const edit = aiEditCommit("e1", "root", {
      text: "Tweak it",
      selectedElementHtml:
        "<header\n  class='main'>\n   <span>Hi</span>\n</header>",
    });

    const intent = extractUserIntent(mapOf(root, edit), "e1");
    expect(intent?.refinements[0].selectedElementPreview).toBe(
      "<header class='main'> <span>Hi</span> </header>",
    );
  });

  it("truncates very long selected-element snippets with an ellipsis", () => {
    const root = aiCreateCommit("root", { text: "Header" });
    const longHtml = "<div>" + "x".repeat(400) + "</div>";
    const edit = aiEditCommit("e1", "root", {
      text: "Tweak it",
      selectedElementHtml: longHtml,
    });
    const intent = extractUserIntent(mapOf(root, edit), "e1");
    const preview = intent?.refinements[0].selectedElementPreview ?? "";
    expect(preview.length).toBeLessThanOrEqual(160);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("flags the input mode as 'video' when videos are attached", () => {
    const root = aiCreateCommit("root", {
      text: "Turn this recording into a page",
      videos: ["dataurl-vid"],
    });
    const intent = extractUserIntent(mapOf(root), "root");
    expect(intent?.inputMode).toBe("video");
    expect(intent?.initialVideosCount).toBe(1);
  });

  it("flags the input mode as 'unknown' when no text, image, or video is present", () => {
    const root = aiCreateCommit("root", {});
    const intent = extractUserIntent(mapOf(root), "root");
    expect(intent?.inputMode).toBe("unknown");
    expect(intent?.initialPrompt).toBe("");
  });

  it("trims whitespace around the initial prompt", () => {
    const root = aiCreateCommit("root", { text: "   Hello world   \n" });
    const intent = extractUserIntent(mapOf(root), "root");
    expect(intent?.initialPrompt).toBe("Hello world");
  });

  it("returns an empty record for a code_create with subsequent edits (no initial user prompt to anchor)", () => {
    const root = codeCreateCommit("root");
    const edit = aiEditCommit("e1", "root", { text: "Add dark mode toggle" });
    const intent = extractUserIntent(mapOf(root, edit), "e1");
    expect(intent).toBeNull();
  });

  it("bails safely on pathological cycles", () => {
    // Manually construct two commits that point at each other (this should
    // never happen in practice; verify the walker detects and bails).
    const loopA: Commit = {
      type: "ai_edit",
      hash: "a",
      parentHash: "b",
      isCommitted: true,
      dateCreated: FIXED_DATE,
      variants: [],
      selectedVariantIndex: 0,
      inputs: { text: "a", images: [], videos: [] },
    };
    const loopB: Commit = {
      type: "ai_edit",
      hash: "b",
      parentHash: "a",
      isCommitted: true,
      dateCreated: FIXED_DATE,
      variants: [],
      selectedVariantIndex: 0,
      inputs: { text: "b", images: [], videos: [] },
    };
    const intent = extractUserIntent(mapOf(loopA, loopB), "a");
    // The walker visits a → b → a (seen) and stops. The first-seen root is
    // `loopB`, which is an ai_edit commit (not ai_create), so we refuse to
    // synthesize an initial prompt from it.
    expect(intent).toBeNull();
  });
});
