// Modal dialog that previews the implementer handoff markdown before the
// user hands it off to Claude / Codex / Cursor.
//
// Before this existed, the Copy/Download buttons were a leap of faith — the
// user had no way to verify what was about to be pasted into another agent.
// This dialog gives them a clear, read-only view of the final markdown plus
// inline copy/download so verification and action live in one place.

import { useEffect, useState } from "react";
import copy from "copy-to-clipboard";
import { toast } from "react-hot-toast";
import {
  LuClipboardCheck,
  LuClipboardCopy,
  LuDownload,
} from "react-icons/lu";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";

export interface HandoffPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  markdown: string;
  variantIndex: number;
}

export function HandoffPreviewDialog({
  open,
  onOpenChange,
  markdown,
  variantIndex,
}: HandoffPreviewDialogProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const charCount = markdown.length;
  const lineCount = markdown.length > 0 ? markdown.split("\n").length : 0;

  function handleCopy() {
    if (markdown.length === 0) {
      toast.error("Nothing to copy.");
      return;
    }
    const ok = copy(markdown);
    if (!ok) {
      toast.error("Could not copy the handoff to your clipboard.");
      return;
    }
    setCopied(true);
    toast.success(
      `Copied implementer handoff (${charCount.toLocaleString()} chars).`,
    );
    window.setTimeout(() => setCopied(false), 1800);
  }

  function handleDownload() {
    if (markdown.length === 0) {
      toast.error("Nothing to download.");
      return;
    }
    const blob = new Blob([markdown], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `implementer-handoff-variant-${variantIndex + 1}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    toast.success("Handoff downloaded.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="handoff-preview-dialog"
        className="flex max-h-[85vh] w-full max-w-4xl flex-col gap-4 sm:max-w-4xl"
      >
        <DialogHeader>
          <DialogTitle>Implementer handoff preview</DialogTitle>
          <DialogDescription>
            This is the exact markdown that will be handed off to the
            implementer agent. Review it before pasting so the agent gets the
            user intent, project context, and variant code as one bundle.
          </DialogDescription>
        </DialogHeader>

        <HandoffPreviewBody markdown={markdown} />

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          <span
            className="text-xs text-muted-foreground"
            data-testid="handoff-preview-meta"
          >
            {charCount.toLocaleString()} chars · {lineCount.toLocaleString()}{" "}
            lines
          </span>
          <div className="flex items-center gap-2">
            <DialogClose asChild>
              <Button variant="outline" type="button">
                Close
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="outline"
              onClick={handleDownload}
              data-testid="handoff-preview-download"
            >
              <LuDownload className="mr-1 h-4 w-4" aria-hidden="true" />
              Download .md
            </Button>
            <Button
              type="button"
              onClick={handleCopy}
              data-testid="handoff-preview-copy"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {copied ? (
                <LuClipboardCheck
                  className="mr-1 h-4 w-4"
                  aria-hidden="true"
                />
              ) : (
                <LuClipboardCopy className="mr-1 h-4 w-4" aria-hidden="true" />
              )}
              {copied ? "Copied" : "Copy to clipboard"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface HandoffPreviewBodyProps {
  markdown: string;
}

function HandoffPreviewBody({ markdown }: HandoffPreviewBodyProps) {
  if (markdown.length === 0) {
    return (
      <div
        className="flex h-48 items-center justify-center rounded-md border bg-muted/40 text-sm text-muted-foreground"
        data-testid="handoff-preview-empty"
      >
        Nothing to preview yet — the handoff is still being built.
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-hidden rounded-md border bg-zinc-950">
      <pre
        data-testid="handoff-preview-body"
        className="m-0 h-full max-h-[60vh] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-[12px] leading-5 text-zinc-100"
      >
        {markdown}
      </pre>
    </div>
  );
}
