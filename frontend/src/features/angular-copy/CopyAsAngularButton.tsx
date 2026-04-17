import { useState } from "react";
import { LuClipboardCheck, LuClipboardCopy } from "react-icons/lu";
import copy from "copy-to-clipboard";
import { toast } from "react-hot-toast";

import { convertHtmlToAngular } from "../../lib/angular-convert";

interface CopyAsAngularButtonProps {
  code: string;
  componentName?: string;
  className?: string;
  compact?: boolean;
}

export function CopyAsAngularButton({
  code,
  componentName,
  className,
  compact,
}: CopyAsAngularButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = () => {
    if (!code.trim()) {
      toast.error("Nothing to copy — variant code is empty.");
      return;
    }
    try {
      const result = convertHtmlToAngular(code, { componentName });
      const followUpBlock =
        result.followUps.length > 0
          ? [
              "",
              "<!-- angular-convert follow-up notes:",
              ...result.followUps.map((note) => `  - ${note}`),
              "-->",
            ].join("\n")
          : "";
      const payload = [
        result.componentTs,
        followUpBlock,
        "",
        "<!-- angular-convert template preview -->",
        result.template,
      ]
        .filter((section) => section !== "")
        .join("\n");
      copy(payload, { format: "text/plain" });
      setCopied(true);
      const detail =
        result.followUps.length > 0
          ? `Angular scaffold copied. ${result.followUps.length} follow-up note${
              result.followUps.length === 1 ? "" : "s"
            } included.`
          : "Copied Angular scaffold to clipboard.";
      toast.success(detail);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Failed to convert HTML to Angular", err);
      toast.error("Failed to build Angular scaffold.");
    }
  };

  const Icon = copied ? LuClipboardCheck : LuClipboardCopy;
  const label = copied ? "Copied" : "Copy as Angular";

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleClick}
        title={label}
        aria-label={label}
        className={
          className ??
          "rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-zinc-800 dark:hover:text-gray-200"
        }
        data-testid="copy-as-angular"
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-md border border-violet-300 bg-white px-2 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-50 dark:border-violet-600 dark:bg-zinc-900 dark:text-violet-300 dark:hover:bg-violet-900/30"
      }
      data-testid="copy-as-angular"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
