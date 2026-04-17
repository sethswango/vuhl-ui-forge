import { useState } from "react";
import copy from "copy-to-clipboard";
import { toast } from "react-hot-toast";
import {
  LuClipboardCheck,
  LuClipboardCopy,
  LuDownload,
  LuLoader,
} from "react-icons/lu";

import { extractDesignSpec } from "../../lib/design-api";
import type { DesignSpecResult } from "../../lib/design-api-types";
import { specCacheKey, useDesignStore } from "../../store/design-store";
import { useSessionStore } from "../../store/session-store";
import { convertHtmlToAngular } from "../../lib/angular-convert";
import { composeHandoff, type AngularScaffold } from "./composeHandoff";
import { shouldIncludeAngular } from "./frameworkGate";

interface CopyForClaudeButtonProps {
  commitHash: string;
  variantIndex: number;
  variantCode: string;
  variantModel?: string | null;
}

export function CopyForClaudeButton({
  commitHash,
  variantIndex,
  variantCode,
  variantModel,
}: CopyForClaudeButtonProps) {
  const sessionId = useSessionStore((s) => s.sessionId);
  const projectContext = useDesignStore((s) => s.projectContext);
  const cacheKey = specCacheKey({ commitHash, variantIndex });
  const specEntry = useDesignStore((s) => s.specByVariant[cacheKey] ?? null);
  const beginSpecFetch = useDesignStore((s) => s.beginSpecFetch);
  const specFetchSucceeded = useDesignStore((s) => s.specFetchSucceeded);
  const specFetchFailed = useDesignStore((s) => s.specFetchFailed);

  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const disabled =
    !sessionId || variantCode.trim().length === 0 || busy;

  async function ensureSpec(): Promise<DesignSpecResult | null> {
    if (!sessionId) return null;
    if (specEntry?.status === "ready" && specEntry.result) {
      return specEntry.result;
    }
    const key = { commitHash, variantIndex };
    beginSpecFetch(key);
    try {
      const result = await extractDesignSpec(sessionId, {
        variantIndex,
        persistAsContext: true,
      });
      specFetchSucceeded(key, result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      specFetchFailed(key, message);
      throw err;
    }
  }

  function buildAngularScaffold(): AngularScaffold | null {
    if (!shouldIncludeAngular(projectContext?.framework?.name ?? null)) {
      return null;
    }
    try {
      const conversion = convertHtmlToAngular(variantCode);
      return {
        componentTs: conversion.componentTs,
        template: conversion.template,
        styles: null,
        imports: conversion.imports,
        followUps: conversion.followUps,
      };
    } catch (err) {
      console.warn(
        "Angular scaffold conversion failed; handoff will omit the scaffold.",
        err,
      );
      return null;
    }
  }

  async function buildMarkdown(): Promise<string | null> {
    const spec = await ensureSpec();
    if (!spec) return null;
    return composeHandoff({
      variantIndex,
      variantCode,
      variantModel: variantModel ?? null,
      specResult: spec,
      projectContext: projectContext ?? null,
      angularConversion: buildAngularScaffold(),
    });
  }

  async function handleCopy() {
    if (disabled) return;
    setBusy(true);
    try {
      const markdown = await buildMarkdown();
      if (!markdown) {
        toast.error("Start a design session first.");
        return;
      }
      const ok = copy(markdown);
      if (!ok) {
        toast.error("Could not copy the handoff to your clipboard.");
        return;
      }
      setCopied(true);
      toast.success(
        `Copied implementer handoff (${markdown.length.toLocaleString()} chars).`,
      );
      window.setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.error("Failed to compose implementer handoff", err);
      const detail = err instanceof Error ? err.message : "unknown error";
      toast.error(`Could not build handoff: ${detail}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    if (disabled) return;
    setBusy(true);
    try {
      const markdown = await buildMarkdown();
      if (!markdown) {
        toast.error("Start a design session first.");
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
    } catch (err) {
      console.error("Failed to download implementer handoff", err);
      const detail = err instanceof Error ? err.message : "unknown error";
      toast.error(`Could not build handoff: ${detail}`);
    } finally {
      setBusy(false);
    }
  }

  const Icon = copied
    ? LuClipboardCheck
    : busy
      ? LuLoader
      : LuClipboardCopy;
  const title = !sessionId
    ? "Start a design session first"
    : variantCode.trim().length === 0
      ? "Variant has no code yet"
      : "Copy a ready-to-paste implementer prompt for Claude, Codex, or Cursor";

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={handleCopy}
        disabled={disabled}
        title={title}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
          disabled
            ? "cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            : "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
        }`}
        data-testid="copy-for-claude"
      >
        <Icon
          className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`}
          aria-hidden="true"
        />
        {copied ? "Copied" : busy ? "Building…" : "Copy for Claude"}
      </button>
      <button
        type="button"
        onClick={handleDownload}
        disabled={disabled}
        title="Download handoff as .md"
        aria-label="Download implementer handoff"
        className={`inline-flex items-center rounded-md border border-emerald-300 bg-white p-1 text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-700 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-emerald-900/30`}
        data-testid="download-handoff"
      >
        <LuDownload className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}

