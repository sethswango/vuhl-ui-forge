import { useEffect, useState } from "react";
import { LuFolderSearch, LuChevronDown, LuChevronUp, LuX } from "react-icons/lu";
import { toast } from "react-hot-toast";

import { useDesignStore } from "../../store/design-store";
import { gatherProjectContext } from "../../lib/design-api";
import { useSession } from "../../hooks/useSession";
import {
  formatStateStyle,
  frameworkLabel,
  summarizeProjectContext,
} from "./helpers";
import { loadProjectPath, saveProjectPath } from "./persistence";

export type ProjectContextPanelVariant = "compact" | "prominent";

export interface ProjectContextPanelProps {
  /**
   * Controls visual weight and default-expanded state.
   *
   * - ``"compact"`` (default) — used in the Sidebar once generation has
   *   started. Starts collapsed; assumes the user already knows what
   *   project context is and just wants a quick lever.
   * - ``"prominent"`` — used in the StartPane before the first generation.
   *   Starts expanded and shows intro copy so users understand why they
   *   should scan their project before their first prompt.
   */
  variant?: ProjectContextPanelVariant;
}

export function ProjectContextPanel({
  variant = "compact",
}: ProjectContextPanelProps = {}) {
  const projectPath = useDesignStore((s) => s.projectPath);
  const projectContext = useDesignStore((s) => s.projectContext);
  const scanStatus = useDesignStore((s) => s.scanStatus);
  const scanError = useDesignStore((s) => s.scanError);
  const setProjectPath = useDesignStore((s) => s.setProjectPath);
  const beginScan = useDesignStore((s) => s.beginScan);
  const scanSucceeded = useDesignStore((s) => s.scanSucceeded);
  const scanFailed = useDesignStore((s) => s.scanFailed);
  const clearProjectContext = useDesignStore((s) => s.clearProjectContext);

  const { ensureSession } = useSession();

  const [isExpanded, setIsExpanded] = useState(variant === "prominent");

  // Rehydrate the most recently scanned path from localStorage on mount so
  // returning users don't have to retype their repo path. We only backfill
  // when the store is empty — if another panel instance already populated
  // the store, skip to avoid clobbering fresher in-memory state.
  useEffect(() => {
    if (projectPath.trim().length > 0) return;
    const persisted = loadProjectPath();
    if (persisted.trim().length === 0) return;
    setProjectPath(persisted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasContext = projectContext !== null;
  const isScanning = scanStatus === "scanning";
  const canScan = projectPath.trim().length > 0 && !isScanning;
  const summary = projectContext
    ? summarizeProjectContext(projectContext)
    : null;

  const handleScan = async () => {
    const trimmed = projectPath.trim();
    if (trimmed.length === 0) return;

    beginScan();
    try {
      // A session is required by the backend to attach the scan record.
      // ``ensureSession`` mints one on demand when the user hasn't yet
      // kicked off a generation turn — this is the core Round 7 unlock
      // that lets project alignment inform the very first prompt instead
      // of only subsequent iterations.
      const activeSessionId = await ensureSession();
      const result = await gatherProjectContext(activeSessionId, {
        repoPath: trimmed,
      });
      scanSucceeded(result.context);
      saveProjectPath(trimmed);
      const label = frameworkLabel(result.context.framework.name);
      const componentCount = result.context.components.length;
      toast.success(
        `Scanned ${label} project — ${componentCount} component${
          componentCount === 1 ? "" : "s"
        } detected.`,
      );
      setIsExpanded(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      scanFailed(message);
      toast.error(`Project scan failed: ${message}`);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleScan();
    }
  };

  const displayLabel = summary
    ? `${summary.frameworkLabel}${
        summary.frameworkVersion ? ` ${summary.frameworkVersion}` : ""
      }`
    : "Project context";

  return (
    <div
      className="mb-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2 text-[12px] dark:border-slate-800 dark:bg-slate-900/40"
      data-testid="project-context-panel"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-slate-700 dark:text-slate-200">
          <LuFolderSearch className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate font-medium">{displayLabel}</span>
          {summary && summary.patternChips.length > 0 && (
            <div className="flex shrink-0 items-center gap-1">
              {summary.patternChips.slice(0, 3).map((chip) => (
                <span
                  key={chip}
                  className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  data-testid="project-context-chip"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
          {summary?.truncated && (
            <span
              className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
              title="Scan stopped at the file-count budget."
            >
              truncated
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="rounded-md px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-slate-200 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          aria-label={isExpanded ? "Collapse project context" : "Expand project context"}
          data-testid="project-context-toggle"
        >
          {isExpanded ? (
            <LuChevronUp className="h-3.5 w-3.5" />
          ) : (
            <LuChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-2 flex flex-col gap-2">
          {variant === "prominent" && !hasContext && (
            <div
              className="rounded-md border border-violet-200 bg-violet-50 px-2.5 py-2 text-[11px] leading-snug text-violet-900 dark:border-violet-800/60 dark:bg-violet-900/20 dark:text-violet-100"
              data-testid="project-context-intro"
            >
              Point the Forge at the repo you're designing for. We'll detect
              your framework, reusable components, and design tokens so the
              very first mockups align with your app — not a generic blank
              slate.
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={projectPath}
              onChange={(e) => {
                const next = e.target.value;
                setProjectPath(next);
                saveProjectPath(next);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Target repo path (e.g. C:\\dev\\my-app)"
              className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-violet-500 dark:focus:ring-violet-500/30"
              data-testid="project-context-path"
            />
            <button
              type="button"
              onClick={handleScan}
              disabled={!canScan}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                canScan
                  ? "bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400"
                  : "cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              }`}
              data-testid="project-context-scan"
            >
              {isScanning ? "Scanning…" : hasContext ? "Rescan" : "Scan"}
            </button>
            {hasContext && (
              <button
                type="button"
                onClick={() => {
                  clearProjectContext();
                  saveProjectPath("");
                }}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"
                title="Clear project context"
                data-testid="project-context-clear"
              >
                <LuX className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {scanError && (
            <div
              className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200"
              role="alert"
            >
              {scanError}
            </div>
          )}

          {summary && (
            <div className="grid gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span>
                  <span className="text-slate-500 dark:text-slate-400">Framework:</span>{" "}
                  <span className="font-medium">{summary.frameworkLabel}</span>
                </span>
                {summary.frameworkVersion && (
                  <span>
                    <span className="text-slate-500 dark:text-slate-400">Version:</span>{" "}
                    <span className="font-mono">{summary.frameworkVersion}</span>
                  </span>
                )}
                {formatStateStyle(summary.stateStyle) && (
                  <span>
                    <span className="text-slate-500 dark:text-slate-400">State:</span>{" "}
                    <span className="font-medium">
                      {formatStateStyle(summary.stateStyle)}
                    </span>
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span>
                  <span className="text-slate-500 dark:text-slate-400">Components:</span>{" "}
                  <span className="font-medium">{summary.componentCount}</span>
                </span>
                <span>
                  <span className="text-slate-500 dark:text-slate-400">CSS tokens:</span>{" "}
                  <span className="font-medium">{summary.cssPropertyCount}</span>
                </span>
                {summary.tailwindConfigPath && (
                  <span className="truncate" title={summary.tailwindConfigPath}>
                    <span className="text-slate-500 dark:text-slate-400">Tailwind:</span>{" "}
                    <span className="font-mono text-[10px]">
                      {summary.tailwindConfigPath}
                    </span>
                  </span>
                )}
              </div>
              {summary.warnings.length > 0 && (
                <ul className="mt-0.5 space-y-0.5 text-amber-800 dark:text-amber-300">
                  {summary.warnings.slice(0, 3).map((warning, index) => (
                    <li key={`${warning.slice(0, 24)}-${index}`}>⚠ {warning}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
