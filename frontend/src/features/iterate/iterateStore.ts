import { create } from "zustand";

// Persistent cross-commit slice for the iteration feature.
// The submit flow captures the pre-refinement code into `beforeCode` and
// remembers which commit hash the refinement was kicked off from. The
// subsequent commit is tagged via `pendingCommitHash` so the pane knows when
// the next refinement stream has landed.

export interface IteratePersistedState {
  // Last captured "before" snapshot — survives the commit change triggered by
  // a refinement so the user can still see the prior version side-by-side.
  beforeCode: string | null;
  beforeVariantIndex: number | null;
  beforeModel: string | null;

  // Hash of the commit the refinement was submitted from. The follow-on
  // commit (created by the existing update pipeline) will have this as its
  // parentHash.
  submittedFromCommitHash: string | null;

  // Set to true when the pane should be auto-expanded (e.g., right after the
  // user selects a variant explicitly). Pane can also be toggled manually.
  isExpanded: boolean;

  captureBefore: (args: {
    code: string;
    variantIndex: number;
    model: string | null;
    commitHash: string;
  }) => void;
  clearBefore: () => void;
  setExpanded: (expanded: boolean) => void;
}

export const useIterateStore = create<IteratePersistedState>((set) => ({
  beforeCode: null,
  beforeVariantIndex: null,
  beforeModel: null,
  submittedFromCommitHash: null,
  isExpanded: false,

  captureBefore: ({ code, variantIndex, model, commitHash }) =>
    set({
      beforeCode: code,
      beforeVariantIndex: variantIndex,
      beforeModel: model,
      submittedFromCommitHash: commitHash,
    }),

  clearBefore: () =>
    set({
      beforeCode: null,
      beforeVariantIndex: null,
      beforeModel: null,
      submittedFromCommitHash: null,
    }),

  setExpanded: (expanded) => set({ isExpanded: expanded }),
}));
