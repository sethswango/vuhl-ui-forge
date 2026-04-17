import React from "react";

import {
  DEFAULT_MODEL_PRESET,
  MODEL_PRESET_DESCRIPTIONS,
  MODEL_PRESET_ORDER,
  ModelPreset,
  isModelPreset,
} from "../../lib/models";

export type ModelPresetSelectorVariant = "compact" | "prominent";

export interface ModelPresetSelectorProps {
  value: ModelPreset | undefined;
  onChange: (next: ModelPreset) => void;
  variant?: ModelPresetSelectorVariant;
  disabled?: boolean;
  className?: string;
}

/**
 * The ModelPresetSelector lets the user pick the 4-model slate used for the
 * create grid. Presets are mood-based rather than model-level: the point is
 * "balanced vs fast vs quality vs diverse", not "which specific model should
 * slot 3 use". Under partial-key setups the backend silently falls back to
 * its key-subset logic, so this stays a preference (not a guarantee).
 *
 * Variants:
 * - ``prominent`` — full-width card with tagline + detail, used on the
 *   StartPane where users actually make the decision.
 * - ``compact`` — inline pill row with tooltips, used inside the generation
 *   workspace once the grid is running so users can re-run with a different
 *   preset without losing their place.
 */
export const ModelPresetSelector: React.FC<ModelPresetSelectorProps> = ({
  value,
  onChange,
  variant = "prominent",
  disabled = false,
  className = "",
}) => {
  const resolved: ModelPreset = isModelPreset(value)
    ? value
    : DEFAULT_MODEL_PRESET;
  const active = MODEL_PRESET_DESCRIPTIONS[resolved];

  const handleSelect = (preset: ModelPreset) => {
    if (disabled) return;
    if (preset === resolved) return;
    onChange(preset);
  };

  if (variant === "compact") {
    return (
      <div
        className={`flex flex-wrap items-center gap-1.5 ${className}`.trim()}
        data-testid="model-preset-selector"
        role="radiogroup"
        aria-label="Model preset"
      >
        <span className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Preset
        </span>
        {MODEL_PRESET_ORDER.map((preset) => {
          const desc = MODEL_PRESET_DESCRIPTIONS[preset];
          const isActive = preset === resolved;
          return (
            <button
              key={preset}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => handleSelect(preset)}
              disabled={disabled}
              title={desc.detail}
              data-preset={preset}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                isActive
                  ? "bg-violet-600 text-white dark:bg-violet-500"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              {desc.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <section
      className={`rounded-xl border border-gray-200 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/40 ${className}`.trim()}
      data-testid="model-preset-selector"
      aria-label="Model preset"
    >
      <header className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Generation preset
          </h3>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {active.detail}
          </p>
        </div>
      </header>
      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        role="radiogroup"
        aria-label="Generation preset options"
      >
        {MODEL_PRESET_ORDER.map((preset) => {
          const desc = MODEL_PRESET_DESCRIPTIONS[preset];
          const isActive = preset === resolved;
          return (
            <button
              key={preset}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => handleSelect(preset)}
              disabled={disabled}
              data-preset={preset}
              className={`flex flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left transition-colors ${
                isActive
                  ? "border-violet-500 bg-violet-50 text-violet-900 shadow-sm dark:border-violet-400 dark:bg-violet-900/30 dark:text-violet-50"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-gray-200 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <span className="text-sm font-semibold">{desc.label}</span>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                {desc.tagline}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default ModelPresetSelector;
