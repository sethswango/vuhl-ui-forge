import { LuFileCode } from "react-icons/lu";

import { specCacheKey, useDesignStore } from "../../store/design-store";
import { useSessionStore } from "../../store/session-store";

interface DesignSpecTriggerButtonProps {
  commitHash: string;
  variantIndex: number;
  disabled?: boolean;
}

export function DesignSpecTriggerButton({
  commitHash,
  variantIndex,
  disabled = false,
}: DesignSpecTriggerButtonProps) {
  const sessionId = useSessionStore((s) => s.sessionId);
  const openSpec = useDesignStore((s) => s.openSpec);
  const cacheKey = specCacheKey({ commitHash, variantIndex });
  const specEntry = useDesignStore((s) => s.specByVariant[cacheKey] ?? null);

  const hasSpec = specEntry?.status === "ready" && specEntry.result !== null;
  const isLoading = specEntry?.status === "loading";
  const isDisabled = disabled || !sessionId || isLoading;
  const title = !sessionId
    ? "Start a session to generate a design spec"
    : hasSpec
      ? "View the design spec handoff"
      : "Generate a design spec handoff";

  return (
    <button
      type="button"
      onClick={() => openSpec({ commitHash, variantIndex })}
      disabled={isDisabled}
      title={title}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
        hasSpec
          ? "border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-900/30 dark:text-violet-200 dark:hover:bg-violet-900/50"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
      } ${isDisabled ? "cursor-not-allowed opacity-60 hover:bg-white dark:hover:bg-slate-950" : ""}`}
      data-testid="design-spec-trigger"
    >
      <LuFileCode className="h-3.5 w-3.5" />
      {hasSpec ? "View Spec" : isLoading ? "Generating…" : "Design Spec"}
    </button>
  );
}
