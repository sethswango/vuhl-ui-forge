// Extract the user's original intent and iteration history from the commit
// chain, so the implementer handoff can carry that context forward.
//
// The handoff markdown used to omit this entirely — the implementer agent
// would see the generated HTML and the project context but have no idea
// what the user actually asked for or how they refined it. That made the
// handoff feel mechanical and left the implementer guessing at trade-offs.
//
// This module is pure and framework-agnostic so it can be unit tested
// without the store or browser.

import type { Commit, CommitHash } from "../../components/commits/types";

export interface UserIntentRefinement {
  text: string;
  imagesCount: number;
  selectedElementPreview?: string;
}

export interface UserIntent {
  initialPrompt: string;
  initialImagesCount: number;
  initialVideosCount: number;
  inputMode: "image" | "video" | "text" | "code" | "unknown";
  refinements: UserIntentRefinement[];
}

const MAX_SELECTED_ELEMENT_PREVIEW = 160;

/**
 * Walk the commit chain backwards from `headHash` until the root commit is
 * reached, then emit a structured user-intent record. The walk stops early
 * with `null` when the chain is broken (missing parent) or when the root
 * commit is a bare `code_create` (imported code — no user prompt exists).
 *
 * The returned object is flat and JSON-serializable so callers can pass it
 * straight into the handoff composer or persist it for debugging.
 */
export function extractUserIntent(
  commits: Record<CommitHash, Commit>,
  headHash: CommitHash | null,
): UserIntent | null {
  if (!headHash) return null;

  const chain = walkChain(commits, headHash);
  if (chain.length === 0) return null;

  const root = chain[0];
  if (root.type !== "ai_create") {
    // A valid intent chain must root in an `ai_create` commit. A
    // `code_create` root means the user imported code (no prompt exists).
    // An `ai_edit` root only happens when the chain is malformed (broken
    // parent link or cycle); either way we cannot synthesize an initial
    // prompt, so bail out and let the handoff fall back to the "no intent"
    // rendering.
    return null;
  }

  const rootInputs = root.inputs;

  const inputMode: UserIntent["inputMode"] = resolveInputMode(rootInputs);

  const refinements: UserIntentRefinement[] = [];
  for (const commit of chain.slice(1)) {
    if (commit.type !== "ai_edit") continue;
    const inputs = commit.inputs;
    refinements.push({
      text: (inputs.text ?? "").trim(),
      imagesCount: inputs.images?.length ?? 0,
      selectedElementPreview: truncateSelectedElement(
        inputs.selectedElementHtml,
      ),
    });
  }

  return {
    initialPrompt: (rootInputs.text ?? "").trim(),
    initialImagesCount: rootInputs.images?.length ?? 0,
    initialVideosCount: rootInputs.videos?.length ?? 0,
    inputMode,
    refinements,
  };
}

function walkChain(
  commits: Record<CommitHash, Commit>,
  headHash: CommitHash,
): Commit[] {
  const visited = new Set<CommitHash>();
  const chain: Commit[] = [];

  let cursor: CommitHash | null = headHash;
  let steps = 0;
  const MAX_STEPS = 256;

  while (cursor && !visited.has(cursor) && steps < MAX_STEPS) {
    visited.add(cursor);
    const commit: Commit | undefined = commits[cursor];
    if (!commit) return [];
    chain.push(commit);
    cursor = commit.parentHash;
    steps += 1;
  }

  if (steps >= MAX_STEPS) {
    // Defensive: the commit graph should be a strict tree. If we run past the
    // bound we assume a pathological cycle and bail rather than emit a
    // confused intent record.
    return [];
  }

  // walked newest → oldest; return oldest → newest so callers can iterate.
  return chain.reverse();
}

function resolveInputMode(inputs: {
  images?: string[];
  videos?: string[];
  text?: string;
}): UserIntent["inputMode"] {
  const hasImages = (inputs.images?.length ?? 0) > 0;
  const hasVideos = (inputs.videos?.length ?? 0) > 0;
  const hasText = (inputs.text ?? "").trim().length > 0;
  if (hasVideos) return "video";
  if (hasImages) return "image";
  if (hasText) return "text";
  return "unknown";
}

function truncateSelectedElement(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return undefined;
  if (collapsed.length <= MAX_SELECTED_ELEMENT_PREVIEW) return collapsed;
  return `${collapsed.slice(0, MAX_SELECTED_ELEMENT_PREVIEW - 1)}…`;
}
