import { useEffect, useReducer, useRef } from "react";
import { LuArrowUp, LuImagePlus, LuRefreshCw, LuX } from "react-icons/lu";
import { toast } from "react-hot-toast";

import { useAppStore } from "../../store/app-store";
import { useProjectStore } from "../../store/project-store";
import {
  CODE_GENERATION_MODEL_DESCRIPTIONS,
  CodeGenerationModel,
} from "../../lib/models";
import { useThrottle } from "../../hooks/useThrottle";

import { getIterateActions } from "./bridge";
import {
  MAX_ITERATE_IMAGES,
  canSubmit,
  hasBeforeAfter,
  initialIterateState,
  iterateReducer,
} from "./iterateReducer";
import { useIterateStore } from "./iterateStore";

const BEFORE_IFRAME_WIDTH = 1280;
const BEFORE_IFRAME_HEIGHT = 720;

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

function modelLabel(model: string | null | undefined): string | null {
  if (!model) return null;
  return (
    CODE_GENERATION_MODEL_DESCRIPTIONS[model as CodeGenerationModel]?.name ||
    model
  );
}

function BeforeThumbnail({ code, label }: { code: string; label: string | null }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const throttled = useThrottle(code, 300);

  useEffect(() => {
    if (iframeRef.current) {
      iframeRef.current.srcdoc = throttled;
    }
  }, [throttled]);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Before{label ? ` · ${label}` : ""}
      </span>
      <div
        className="w-40 overflow-hidden rounded border border-dashed border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900"
        style={{ height: `${(BEFORE_IFRAME_HEIGHT * 160) / BEFORE_IFRAME_WIDTH}px` }}
      >
        <iframe
          ref={iframeRef}
          title="iterate-before-preview"
          className="pointer-events-none origin-top-left"
          style={{
            width: `${BEFORE_IFRAME_WIDTH}px`,
            height: `${BEFORE_IFRAME_HEIGHT}px`,
            transform: `scale(${160 / BEFORE_IFRAME_WIDTH})`,
          }}
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
}

export interface IteratePaneProps {
  variantIndex: number;
  variantCode: string;
  variantModel: string | null | undefined;
  commitHash: string;
  isVariantComplete: boolean;
}

export function IteratePane({
  variantIndex,
  variantCode,
  variantModel,
  commitHash,
  isVariantComplete,
}: IteratePaneProps) {
  const [state, dispatch] = useReducer(iterateReducer, initialIterateState);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    beforeCode,
    beforeVariantIndex,
    beforeModel,
    submittedFromCommitHash,
    isExpanded,
    captureBefore,
    clearBefore,
    setExpanded,
  } = useIterateStore();

  const setUpdateInstruction = useAppStore((s) => s.setUpdateInstruction);
  const setUpdateImages = useAppStore((s) => s.setUpdateImages);
  const latestCommitHash = useProjectStore((s) => s.latestCommitHash);

  // When a new commit lands that follows our submission, inform the reducer.
  useEffect(() => {
    if (state.status !== "submitting") return;
    if (!latestCommitHash) return;
    if (latestCommitHash === submittedFromCommitHash) return;
    // The existing pipeline creates a new commit whose parentHash is the one
    // the refinement was submitted from. Once we see a newer commit, treat
    // the refinement as complete so the pane collapses its submitting state.
    dispatch({ type: "complete", afterCode: variantCode });
  }, [latestCommitHash, submittedFromCommitHash, state.status, variantCode]);

  if (!isVariantComplete) return null;

  const handleAddImageClick = () => {
    if (state.images.length >= MAX_ITERATE_IMAGES) {
      toast.error(
        `Iteration supports up to ${MAX_ITERATE_IMAGES} reference images.`,
      );
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const accepted = Array.from(files).filter(
      (f) => f.type === "image/png" || f.type === "image/jpeg",
    );
    if (accepted.length === 0) {
      toast.error("Only PNG or JPEG images are accepted.");
      return;
    }
    try {
      const urls = await Promise.all(accepted.map(fileToDataURL));
      dispatch({ type: "addImages", images: urls });
    } catch (err) {
      console.error("Error reading files for iterate pane", err);
      toast.error("Failed to read one or more images.");
    }
  };

  const handleSubmit = () => {
    if (!canSubmit(state)) return;
    const actions = getIterateActions();
    if (!actions.doUpdate) {
      toast.error("Iteration is not available right now.");
      return;
    }

    captureBefore({
      code: variantCode,
      variantIndex,
      model: variantModel ?? null,
      commitHash,
    });
    dispatch({
      type: "submit",
      beforeCode: variantCode,
      variantIndex,
    });

    // Replace any lingering Sidebar draft so the refinement is unambiguous —
    // the existing doUpdate flow reads updateInstruction/updateImages from
    // the app store.
    setUpdateInstruction(state.text);
    setUpdateImages(state.images);
    actions.doUpdate(state.text);
  };

  const beforeVisible =
    beforeCode !== null && beforeVariantIndex === variantIndex;

  const showPane = isExpanded || state.status === "submitting" || beforeVisible;

  return (
    <div
      className="mt-2 rounded-lg border border-violet-200 bg-violet-50/50 p-2 dark:border-violet-800/60 dark:bg-violet-900/20"
      data-testid="iterate-pane"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-violet-800 dark:text-violet-200">
          <LuRefreshCw className="h-3.5 w-3.5" />
          <span>Iterate on Option {variantIndex + 1}</span>
          {state.status === "submitting" && (
            <span className="text-[10px] uppercase tracking-wider text-violet-500 dark:text-violet-300">
              streaming…
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setExpanded(!showPane);
            if (showPane) clearBefore();
          }}
          className="rounded-md px-2 py-0.5 text-[11px] text-violet-600 hover:bg-violet-100 dark:text-violet-300 dark:hover:bg-violet-900/40"
        >
          {showPane ? "Collapse" : "Expand"}
        </button>
      </div>

      {showPane && (
        <div className="mt-2 flex flex-col gap-2">
          {beforeVisible && beforeCode && (
            <div className="flex items-start gap-2">
              <BeforeThumbnail
                code={beforeCode}
                label={modelLabel(beforeModel)}
              />
              {hasBeforeAfter(state) && (
                <div className="text-[11px] leading-tight text-violet-700 dark:text-violet-300">
                  <div className="font-semibold uppercase tracking-wider">
                    After
                  </div>
                  <div className="mt-0.5 text-violet-500 dark:text-violet-400">
                    Streamed into the same tile.
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="rounded-md border border-violet-300 bg-white dark:border-violet-700 dark:bg-zinc-900">
            <textarea
              ref={textareaRef}
              value={state.text}
              onChange={(e) => dispatch({ type: "setText", text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              rows={2}
              placeholder="Describe what to refine on this variant…"
              className="w-full resize-none border-0 bg-transparent px-2.5 py-2 text-[13px] leading-5 text-gray-800 placeholder:text-gray-400 focus:outline-none dark:text-zinc-100 dark:placeholder:text-zinc-500"
              data-testid="iterate-textarea"
            />
            {state.images.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-2 pb-2">
                {state.images.map((image, index) => (
                  <div
                    key={`${image.slice(0, 24)}-${index}`}
                    className="group relative h-10 w-10 overflow-hidden rounded border border-violet-200 dark:border-violet-700"
                  >
                    <img
                      src={image}
                      alt={`Iterate reference ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => dispatch({ type: "removeImage", index })}
                      className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-gray-900 text-white group-hover:flex"
                      aria-label={`Remove iterate image ${index + 1}`}
                    >
                      <LuX className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between border-t border-violet-200 px-1.5 py-1 dark:border-violet-800">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={handleAddImageClick}
                className="rounded-md p-1.5 text-violet-500 hover:bg-violet-100 dark:text-violet-300 dark:hover:bg-violet-900/40"
                title="Add reference image"
                disabled={state.status === "submitting"}
              >
                <LuImagePlus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit(state)}
                className={`rounded-md p-1.5 transition-colors ${
                  canSubmit(state)
                    ? "bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400"
                    : "cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-zinc-700 dark:text-zinc-500"
                }`}
                title="Submit refinement"
                data-testid="iterate-submit"
              >
                <LuArrowUp className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {state.errorMessage && (
            <div className="rounded-md border border-red-300 bg-red-50 px-2 py-1.5 text-[11px] text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-300">
              {state.errorMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
