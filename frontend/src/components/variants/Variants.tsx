import { useProjectStore } from "../../store/project-store";
import { useEffect, useRef, useState } from "react";
import { useThrottle } from "../../hooks/useThrottle";
import {
  CODE_GENERATION_MODEL_DESCRIPTIONS,
  CodeGenerationModel,
} from "../../lib/models";
import WorkingPulse from "../core/WorkingPulse";
import { useSessionStore } from "../../store/session-store";
import { IteratePane } from "../../features/iterate/IteratePane";
import { ModelSwitcher } from "../../features/model-switcher/ModelSwitcher";
import { CopyAsAngularButton } from "../../features/angular-copy/CopyAsAngularButton";
import { useIterateStore } from "../../features/iterate/iterateStore";

const IFRAME_WIDTH = 1280;
const IFRAME_HEIGHT = 550;

interface VariantThumbnailProps {
  code: string;
  isSelected: boolean;
}

function VariantThumbnail({ code, isSelected }: VariantThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(0.1);

  const throttledCode = useThrottle(code, isSelected ? 300 : 2000);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateScale = () => {
      const containerWidth = container.offsetWidth;
      setScale(containerWidth / IFRAME_WIDTH);
    };

    updateScale();
    const resizeObserver = new ResizeObserver(updateScale);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe) {
      iframe.srcdoc = throttledCode;
    }
  }, [throttledCode]);

  const scaledHeight = IFRAME_HEIGHT * scale;

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900"
      style={{ height: `${scaledHeight}px` }}
    >
      <iframe
        ref={iframeRef}
        title="variant-preview"
        className="pointer-events-none origin-top-left"
        style={{
          width: `${IFRAME_WIDTH}px`,
          height: `${IFRAME_HEIGHT}px`,
          transform: `scale(${scale})`,
        }}
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}

function formatModelName(model: string | undefined | null): string | null {
  if (!model) return null;
  return (
    CODE_GENERATION_MODEL_DESCRIPTIONS[model as CodeGenerationModel]?.name ||
    model
  );
}

function Variants() {
  const { head, commits, updateSelectedVariantIndex } = useProjectStore();
  const sessionId = useSessionStore((s) => s.sessionId);
  const setExpanded = useIterateStore((s) => s.setExpanded);

  const commit = head ? commits[head] : null;
  const variants = commit?.variants || [];
  const selectedVariantIndex = commit?.selectedVariantIndex || 0;
  const selectedVariant = variants[selectedVariantIndex];

  const handleVariantClick = (index: number) => {
    if (index === selectedVariantIndex || !head) return;
    updateSelectedVariantIndex(head, index);
    setExpanded(true);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
        const code = event.code;
        if (code >= "Digit1" && code <= "Digit9") {
          const variantIndex = parseInt(code.replace("Digit", "")) - 1;
          if (
            commit &&
            variantIndex < variants.length &&
            variants.length > 1 &&
            !commit.isCommitted
          ) {
            event.preventDefault();
            handleVariantClick(variantIndex);
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants.length, commit?.isCommitted, selectedVariantIndex, head]);

  if (head === null || !commit) {
    return null;
  }

  if (variants.length <= 1 || commit.isCommitted) {
    return <div className="mt-2"></div>;
  }

  const variantModels = variants.map((v) => v.model ?? null);
  const isAnyGenerating = variants.some((v) => v.status === "generating");
  const isSelectedComplete = selectedVariant?.status === "complete";
  const selectedCode = selectedVariant?.code || "";
  const showModelLabels = sessionId !== null || variantModels.some((m) => !!m);

  return (
    <div className="pt-2 pb-1">
      <div className="mb-2">
        <ModelSwitcher
          variantModels={variantModels}
          selectedVariantIndex={selectedVariantIndex}
          disabled={isAnyGenerating}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {variants.map((variant, index) => {
          let statusColor = "bg-gray-300 dark:bg-gray-600";
          if (variant.status === "complete") statusColor = "bg-green-500";
          else if (variant.status === "error" || variant.status === "cancelled")
            statusColor = "bg-red-500";

          const isActive = index === selectedVariantIndex;
          const label = formatModelName(variant.model);

          return (
            <div
              key={index}
              className={`relative w-full rounded cursor-pointer overflow-hidden transition-shadow ${
                isActive
                  ? "ring-2 ring-violet-500 dark:ring-violet-400 shadow-[0_0_0_1px_rgba(139,92,246,0.35)]"
                  : "ring-1 ring-gray-200 dark:ring-gray-700 hover:ring-gray-300 dark:hover:ring-gray-600"
              }`}
              onClick={() => handleVariantClick(index)}
              aria-current={isActive ? "true" : undefined}
              data-variant-index={index}
            >
              {isActive && (
                <span
                  className="pointer-events-none absolute left-1.5 top-1.5 z-10 rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow"
                  data-testid="active-variant-indicator"
                >
                  Active
                </span>
              )}
              <VariantThumbnail
                code={variant.code}
                isSelected={isActive}
              />
              <div className="flex items-center px-2 py-1 bg-white dark:bg-zinc-900">
                <span className="inline-flex min-w-0 items-center text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  <span
                    className={`w-2 h-2 rounded-full mr-1.5 ${statusColor}`}
                  />
                  Option {index + 1}
                  {index < 9 && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-mono ml-1">
                      (⌥{index + 1})
                    </span>
                  )}
                </span>
                {showModelLabels && label && (
                  <span
                    className="ml-2 truncate rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-zinc-800 dark:text-gray-300"
                    title={variant.model || undefined}
                    data-testid="variant-model-label"
                  >
                    {label}
                  </span>
                )}
                {variant.status === "generating" && (
                  <div
                    className="ml-auto shrink-0 inline-flex items-center"
                    role="status"
                    aria-live="polite"
                    aria-label="Working"
                  >
                    <WorkingPulse />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isSelectedComplete && selectedCode.trim().length > 0 && (
        <>
          <div className="mt-2 flex items-center justify-end">
            <CopyAsAngularButton code={selectedCode} />
          </div>
          <IteratePane
            variantIndex={selectedVariantIndex}
            variantCode={selectedCode}
            variantModel={selectedVariant?.model}
            commitHash={commit.hash}
            isVariantComplete={isSelectedComplete}
          />
        </>
      )}
    </div>
  );
}

export default Variants;
