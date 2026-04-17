import { useMemo } from "react";
import { LuRefreshCw } from "react-icons/lu";

import {
  CODE_GENERATION_MODEL_DESCRIPTIONS,
  CodeGenerationModel,
} from "../../lib/models";
import { getIterateActions } from "../iterate/bridge";

export interface ModelSwitcherProps {
  // Current per-variant model assignments, indexed by variant index. Values
  // come from the backend's variantModels message — never hardcoded.
  variantModels: Array<string | undefined | null>;
  selectedVariantIndex: number;
  disabled?: boolean;
}

function modelLabel(model: string): string {
  return (
    CODE_GENERATION_MODEL_DESCRIPTIONS[model as CodeGenerationModel]?.name ||
    model
  );
}

export function ModelSwitcher({
  variantModels,
  selectedVariantIndex,
  disabled = false,
}: ModelSwitcherProps) {
  const uniqueModels = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const model of variantModels) {
      if (!model) continue;
      if (seen.has(model)) continue;
      seen.add(model);
      ordered.push(model);
    }
    return ordered;
  }, [variantModels]);

  if (uniqueModels.length === 0) return null;

  const activeModel = variantModels[selectedVariantIndex] || null;
  const canRerun = !disabled;

  const handleRerun = () => {
    const actions = getIterateActions();
    if (actions.regenerate) {
      actions.regenerate();
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white/70 px-2 py-1.5 text-[11px] dark:border-zinc-800 dark:bg-zinc-950/40"
      data-testid="model-switcher"
    >
      <span className="uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Models
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {uniqueModels.map((model) => {
          const isActive = model === activeModel;
          return (
            <span
              key={model}
              className={`rounded-full px-2 py-0.5 font-medium ${
                isActive
                  ? "bg-violet-600 text-white dark:bg-violet-500"
                  : "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-gray-300"
              }`}
              title={model}
            >
              {modelLabel(model)}
            </span>
          );
        })}
      </div>
      <button
        type="button"
        onClick={handleRerun}
        disabled={!canRerun}
        className={`ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
          canRerun
            ? "text-violet-700 hover:bg-violet-100 dark:text-violet-300 dark:hover:bg-violet-900/30"
            : "cursor-not-allowed text-gray-400 dark:text-zinc-600"
        }`}
        title="Re-run the variant grid for an A/B comparison"
      >
        <LuRefreshCw className="h-3 w-3" />
        Re-run grid
      </button>
    </div>
  );
}
