import { create } from "zustand";
import type { DesignSpecResult, ProjectContext } from "../lib/design-api-types";

type ScanStatus = "idle" | "scanning" | "ready" | "error";
type SpecStatus = "idle" | "loading" | "ready" | "error";

interface SpecEntry {
  status: SpecStatus;
  result: DesignSpecResult | null;
  error: string | null;
}

interface DesignStore {
  projectPath: string;
  projectContext: ProjectContext | null;
  scanStatus: ScanStatus;
  scanError: string | null;
  lastScannedAt: number | null;

  specByVariant: Record<number, SpecEntry>;
  openSpecVariant: number | null;

  setProjectPath: (path: string) => void;
  beginScan: () => void;
  scanSucceeded: (context: ProjectContext) => void;
  scanFailed: (error: string) => void;
  clearProjectContext: () => void;

  beginSpecFetch: (variantIndex: number) => void;
  specFetchSucceeded: (variantIndex: number, result: DesignSpecResult) => void;
  specFetchFailed: (variantIndex: number, error: string) => void;
  openSpec: (variantIndex: number) => void;
  closeSpec: () => void;
  clearSpec: (variantIndex: number) => void;
}

export const useDesignStore = create<DesignStore>((set) => ({
  projectPath: "",
  projectContext: null,
  scanStatus: "idle",
  scanError: null,
  lastScannedAt: null,

  specByVariant: {},
  openSpecVariant: null,

  setProjectPath: (path: string) => set({ projectPath: path }),
  beginScan: () => set({ scanStatus: "scanning", scanError: null }),
  scanSucceeded: (context: ProjectContext) =>
    set({
      projectContext: context,
      scanStatus: "ready",
      scanError: null,
      lastScannedAt: Date.now(),
    }),
  scanFailed: (error: string) =>
    set({ scanStatus: "error", scanError: error }),
  clearProjectContext: () =>
    set({
      projectContext: null,
      scanStatus: "idle",
      scanError: null,
      lastScannedAt: null,
    }),

  beginSpecFetch: (variantIndex: number) =>
    set((state) => ({
      specByVariant: {
        ...state.specByVariant,
        [variantIndex]: {
          status: "loading",
          result: state.specByVariant[variantIndex]?.result ?? null,
          error: null,
        },
      },
    })),
  specFetchSucceeded: (variantIndex: number, result: DesignSpecResult) =>
    set((state) => ({
      specByVariant: {
        ...state.specByVariant,
        [variantIndex]: { status: "ready", result, error: null },
      },
    })),
  specFetchFailed: (variantIndex: number, error: string) =>
    set((state) => ({
      specByVariant: {
        ...state.specByVariant,
        [variantIndex]: {
          status: "error",
          result: state.specByVariant[variantIndex]?.result ?? null,
          error,
        },
      },
    })),
  openSpec: (variantIndex: number) => set({ openSpecVariant: variantIndex }),
  closeSpec: () => set({ openSpecVariant: null }),
  clearSpec: (variantIndex: number) =>
    set((state) => {
      const next = { ...state.specByVariant };
      delete next[variantIndex];
      return { specByVariant: next };
    }),
}));

export type { DesignStore, SpecEntry, SpecStatus, ScanStatus };
