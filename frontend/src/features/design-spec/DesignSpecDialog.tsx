import { useEffect, useState } from "react";
import copy from "copy-to-clipboard";
import { toast } from "react-hot-toast";
import { LuCheck, LuClipboardCopy, LuDownload, LuLoader } from "react-icons/lu";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { extractDesignSpec } from "../../lib/design-api";
import { useDesignStore } from "../../store/design-store";
import { useSessionStore } from "../../store/session-store";

const CONFIDENCE_BADGE_CLASS: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  medium: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  low: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
};

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const className =
    CONFIDENCE_BADGE_CLASS[confidence.toLowerCase()] ??
    CONFIDENCE_BADGE_CLASS.medium;
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${className}`}
      data-testid="spec-confidence-badge"
    >
      {confidence}
    </span>
  );
}

interface DesignSpecDialogProps {
  variantIndex: number;
  variantCode: string;
}

export function DesignSpecDialog({
  variantIndex,
  variantCode,
}: DesignSpecDialogProps) {
  const sessionId = useSessionStore((s) => s.sessionId);
  const openSpecVariant = useDesignStore((s) => s.openSpecVariant);
  const closeSpec = useDesignStore((s) => s.closeSpec);
  const specEntry = useDesignStore(
    (s) => s.specByVariant[variantIndex] ?? null,
  );
  const beginSpecFetch = useDesignStore((s) => s.beginSpecFetch);
  const specFetchSucceeded = useDesignStore((s) => s.specFetchSucceeded);
  const specFetchFailed = useDesignStore((s) => s.specFetchFailed);

  const [copied, setCopied] = useState(false);

  const isOpen = openSpecVariant === variantIndex;

  useEffect(() => {
    if (!isOpen) return;
    if (!sessionId) return;
    if (specEntry && (specEntry.status === "loading" || specEntry.status === "ready"))
      return;

    let cancelled = false;
    beginSpecFetch(variantIndex);
    extractDesignSpec(sessionId, {
      variantIndex,
      persistAsContext: true,
    })
      .then((result) => {
        if (cancelled) return;
        specFetchSucceeded(variantIndex, result);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : String(error);
        specFetchFailed(variantIndex, message);
      });

    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    sessionId,
    specEntry,
    variantIndex,
    beginSpecFetch,
    specFetchSucceeded,
    specFetchFailed,
  ]);

  useEffect(() => {
    if (!isOpen) setCopied(false);
  }, [isOpen]);

  const handleOpenChange = (next: boolean) => {
    if (!next) closeSpec();
  };

  const result = specEntry?.result ?? null;
  const status = specEntry?.status ?? "idle";
  const error = specEntry?.error ?? null;

  const handleCopy = () => {
    if (!result) return;
    const ok = copy(result.annotatedMarkdown);
    if (!ok) {
      toast.error("Could not copy the handoff to your clipboard.");
      return;
    }
    setCopied(true);
    toast.success("Handoff copied to clipboard.");
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!result) return;
    const blob = new Blob([result.annotatedMarkdown], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `design-spec-variant-${variantIndex + 1}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const codeLength = variantCode.trim().length;
  const canFetch = !!sessionId && codeLength > 0;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-3xl w-[92vw] max-h-[85vh] overflow-hidden p-0 sm:rounded-xl"
        data-testid="design-spec-dialog"
      >
        <div className="flex h-full max-h-[85vh] flex-col">
          <DialogHeader className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <DialogTitle className="flex items-center gap-2 text-base">
              Design spec — Option {variantIndex + 1}
              {result?.spec.projectContextUsed ? (
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-violet-700 dark:bg-violet-900/40 dark:text-violet-200">
                  Project-aware
                </span>
              ) : (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  Generic
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              An annotated handoff for the implementer. Copy the full document
              into Claude, Cursor, or a ticket.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {!canFetch && (
              <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-[12px] text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                {!sessionId
                  ? "This view requires an active session. Start a design session first."
                  : "Pick a completed variant before generating a spec."}
              </div>
            )}

            {canFetch && status === "loading" && (
              <div
                className="flex items-center gap-2 text-[12px] text-slate-600 dark:text-slate-400"
                role="status"
                aria-live="polite"
              >
                <LuLoader className="h-3.5 w-3.5 animate-spin" />
                Extracting structured spec from the rendered variant…
              </div>
            )}

            {canFetch && status === "error" && (
              <div
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200"
                role="alert"
              >
                {error ?? "Spec generation failed."}
              </div>
            )}

            {canFetch && status === "ready" && result && (
              <div className="flex flex-col gap-4">
                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Summary
                  </h3>
                  <p className="mt-1 text-[13px] text-slate-800 dark:text-slate-100">
                    {result.spec.summary || "(No summary generated.)"}
                  </p>
                </section>

                {result.spec.alignmentNotes.length > 0 && (
                  <section>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Alignment notes
                    </h3>
                    <ul className="mt-1 space-y-1 text-[12px] text-slate-700 dark:text-slate-200">
                      {result.spec.alignmentNotes.map((note, index) => (
                        <li
                          key={`${note.slice(0, 24)}-${index}`}
                          className="rounded-md border border-violet-200 bg-violet-50/70 px-2 py-1 dark:border-violet-900/60 dark:bg-violet-900/20"
                        >
                          {note}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {result.spec.reuseSuggestions.length > 0 && (
                  <section>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Reuse candidates ({result.spec.reuseSuggestions.length})
                    </h3>
                    <ul className="mt-1 space-y-1.5">
                      {result.spec.reuseSuggestions.map((entry, index) => (
                        <li
                          key={`${entry.componentName}-${index}`}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-800 dark:bg-slate-950/60"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-[12px] font-medium text-slate-900 dark:text-slate-100">
                                {entry.componentName}
                              </span>
                              {entry.componentSelector && (
                                <code className="truncate rounded bg-slate-100 px-1 text-[10px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                  {entry.componentSelector}
                                </code>
                              )}
                            </div>
                            <ConfidenceBadge confidence={entry.confidence} />
                          </div>
                          {entry.componentFile && (
                            <div
                              className="mt-0.5 truncate font-mono text-[10px] text-slate-500 dark:text-slate-400"
                              title={entry.componentFile}
                            >
                              {entry.componentFile}
                            </div>
                          )}
                          {entry.rationale && (
                            <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                              {entry.rationale}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {result.spec.newComponentsNeeded.length > 0 && (
                  <section>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      New components suggested
                    </h3>
                    <ul className="mt-1 flex flex-wrap gap-1">
                      {result.spec.newComponentsNeeded.map((name, index) => (
                        <li
                          key={`${name}-${index}`}
                          className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-800 dark:bg-violet-900/40 dark:text-violet-200"
                        >
                          {name}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section>
                  <div className="flex items-center justify-between">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Handoff markdown
                    </h3>
                    <span className="text-[10px] text-slate-400">
                      {result.annotatedMarkdown.length.toLocaleString()} chars
                    </span>
                  </div>
                  <pre
                    className="mt-1 max-h-72 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                    data-testid="design-spec-markdown"
                  >
                    {result.annotatedMarkdown}
                  </pre>
                </section>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/60">
            <button
              type="button"
              onClick={handleDownload}
              disabled={status !== "ready" || !result}
              className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <LuDownload className="h-3.5 w-3.5" />
              Download .md
            </button>
            <button
              type="button"
              onClick={handleCopy}
              disabled={status !== "ready" || !result}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                status === "ready" && result
                  ? "bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400"
                  : "cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              }`}
              data-testid="design-spec-copy"
            >
              {copied ? (
                <>
                  <LuCheck className="h-3.5 w-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <LuClipboardCopy className="h-3.5 w-3.5" />
                  Copy handoff
                </>
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
