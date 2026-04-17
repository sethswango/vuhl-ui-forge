import { create } from "zustand";
import type { DesignSpecResult, ProjectContext } from "../lib/design-api-types";

type ScanStatus = "idle" | "scanning" | "ready" | "error";
type SpecStatus = "idle" | "loading" | "ready" | "error";

interface SpecEntry {
  status: SpecStatus;
  result: DesignSpecResult | null;
  error: string | null;
}

export interface SpecCacheKey {
  commitHash: string;
  variantIndex: number;
}

export function specCacheKey(key: SpecCacheKey): string {
  return `${key.commitHash}::${key.variantIndex}`;
}

interface DesignStore {
  projectPath: string;
  projectContext: ProjectContext | null;
  scanStatus: ScanStatus;
  scanError: string | null;
  lastScannedAt: number | null;

  specByVariant: Record<string, SpecEntry>;
  openSpecKey: string | null;

  setProjectPath: (path: string) => void;
  beginScan: () => void;
  scanSucceeded: (context: ProjectContext) => void;
  scanFailed: (error: string) => void;
  clearProjectContext: () => void;

  beginSpecFetch: (key: SpecCacheKey) => void;
  specFetchSucceeded: (key: SpecCacheKey, result: DesignSpecResult) => void;
  specFetchFailed: (key: SpecCacheKey, error: string) => void;
  openSpec: (key: SpecCacheKey) => void;
  closeSpec: () => void;
  clearSpec: (key: SpecCacheKey) => void;
}

export const useDesignStore = create<DesignStore>((set) => ({
  projectPath: "",
  projectContext: null,
  scanStatus: "idle",
  scanError: null,
  lastScannedAt: null,

  specByVariant: {},
  openSpecKey: null,

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

  beginSpecFetch: (key: SpecCacheKey) => {
    const cacheKey = specCacheKey(key);
    set((state) => ({
      specByVariant: {
        ...state.specByVariant,
        [cacheKey]: {
          status: "loading",
          result: state.specByVariant[cacheKey]?.result ?? null,
          error: null,
        },
      },
    }));
  },
  specFetchSucceeded: (key: SpecCacheKey, result: DesignSpecResult) => {
    const cacheKey = specCacheKey(key);
    set((state) => ({
      specByVariant: {
        ...state.specByVariant,
        [cacheKey]: { status: "ready", result, error: null },
      },
    }));
  },
  specFetchFailed: (key: SpecCacheKey, error: string) => {
    const cacheKey = specCacheKey(key);
    set((state) => ({
      specByVariant: {
        ...state.specByVariant,
        [cacheKey]: {
          status: "error",
          result: state.specByVariant[cacheKey]?.result ?? null,
          error,
        },
      },
    }));
  },
  openSpec: (key: SpecCacheKey) => set({ openSpecKey: specCacheKey(key) }),
  closeSpec: () => set({ openSpecKey: null }),
  clearSpec: (key: SpecCacheKey) =>
    set((state) => {
      const cacheKey = specCacheKey(key);
      const next = { ...state.specByVariant };
      delete next[cacheKey];
      return { specByVariant: next };
    }),
}));

export type { DesignStore, SpecEntry, SpecStatus, ScanStatus };
