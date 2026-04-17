import { useState } from "react";
import { LuFolderSearch, LuChevronDown, LuChevronUp, LuX } from "react-icons/lu";
import { toast } from "react-hot-toast";

import { useDesignStore } from "../../store/design-store";
import { useSessionStore } from "../../store/session-store";
import { gatherProjectContext } from "../../lib/design-api";
import {
  formatStateStyle,
  frameworkLabel,
  summarizeProjectContext,
} from "./helpers";

export function ProjectContextPanel() {
  const sessionId = useSessionStore((s) => s.sessionId);
  const projectPath = useDesignStore((s) => s.projectPath);
  const projectContext = useDesignStore((s) => s.projectContext);
  const scanStatus = useDesignStore((s) => s.scanStatus);
  const scanError = useDesignStore((s) => s.scanError);
  const setProjectPath = useDesignStore((s) => s.setProjectPath);
  const beginScan = useDesignStore((s) => s.beginScan);
  const scanSucceeded = useDesignStore((s) => s.scanSucceeded);
  const scanFailed = useDesignStore((s) => s.scanFailed);
  const clearProjectContext = useDesignStore((s) => s.clearProjectContext);

  const [isExpanded, setIsExpanded] = useState(false);
  const hasContext = projectContext !== null;
  const isScanning = scanStatus === "scanning";
  const canScan =
    !!sessionId && projectPath.trim().length > 0 && !isScanning;
  const summary = projectContext
    ? summarizeProjectContext(projectContext)
    : null;

  const handleScan = async () => {
    if (!sessionId) {
      toast.error("Create or open a session before scanning a project.");
      return;
    }
    const trimmed = projectPath.trim();
    if (trimmed.length === 0) return;

    beginScan();
    try {
      const result = await gatherProjectContext(sessionId, {
        repoPath: trimmed,
      });
      scanSucceeded(result.context);
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
          {!sessionId && (
            <div className="rounded-md border border-dashed border-slate-300 bg-white/60 p-2 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
              Session required. Start a design session before scanning a
              project for context.
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                sessionId
                  ? "Target repo path (e.g. C:\\dev\\my-app)"
                  : "Session required"
              }
              disabled={!sessionId}
              className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-300 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-violet-500 dark:focus:ring-violet-500/30 dark:disabled:bg-slate-900"
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
                onClick={clearProjectContext}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"
                title="Clear project context"
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
