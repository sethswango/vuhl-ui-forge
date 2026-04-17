// Model preset keys — MUST match backend MODEL_PRESETS in
// routes/model_choice_sets.py. The preset controls the 4-model slate
// used for the create grid when the user has all three provider keys.
// With partial keys the backend falls back to its key-subset logic.
export type ModelPreset = "balanced" | "fast" | "quality" | "diverse";

export const MODEL_PRESET_ORDER: readonly ModelPreset[] = [
  "balanced",
  "fast",
  "quality",
  "diverse",
] as const;

export const DEFAULT_MODEL_PRESET: ModelPreset = "balanced";

export interface ModelPresetDescription {
  label: string;
  tagline: string;
  detail: string;
}

export const MODEL_PRESET_DESCRIPTIONS: Record<
  ModelPreset,
  ModelPresetDescription
> = {
  balanced: {
    label: "Balanced",
    tagline: "Default mix",
    detail:
      "A curated mix of Gemini Flash, GPT-5, and Gemini Pro. Good speed, good variety — the safe default.",
  },
  fast: {
    label: "Fast",
    tagline: "Fastest iteration",
    detail:
      "All Gemini Flash. Cheapest and quickest — use when you want to explore lots of directions quickly.",
  },
  quality: {
    label: "Quality",
    tagline: "Best fidelity",
    detail:
      "Claude Opus, GPT-5 xhigh, Gemini Pro high. Slower and pricier, but the strongest single-shot designs.",
  },
  diverse: {
    label: "Diverse",
    tagline: "Maximum variance",
    detail:
      "One model from each provider. Maximizes stylistic spread when you want four genuinely different mockups.",
  },
};

export function isModelPreset(value: unknown): value is ModelPreset {
  return (
    typeof value === "string" &&
    (MODEL_PRESET_ORDER as readonly string[]).includes(value)
  );
}

// Keep in sync with backend (llm.py)
// Order here matches dropdown order
export enum CodeGenerationModel {
  CLAUDE_OPUS_4_6 = "claude-opus-4-6",
  CLAUDE_SONNET_4_6 = "claude-sonnet-4-6",
  CLAUDE_4_5_OPUS_2025_11_01 = "claude-opus-4-5-20251101",
  CLAUDE_4_5_SONNET_2025_09_29 = "claude-sonnet-4-5-20250929",
  GPT_5_2_CODEX_LOW = "gpt-5.2-codex (low thinking)",
  GPT_5_2_CODEX_MEDIUM = "gpt-5.2-codex (medium thinking)",
  GPT_5_2_CODEX_HIGH = "gpt-5.2-codex (high thinking)",
  GPT_5_2_CODEX_XHIGH = "gpt-5.2-codex (xhigh thinking)",
  GPT_5_3_CODEX_LOW = "gpt-5.3-codex (low thinking)",
  GPT_5_3_CODEX_MEDIUM = "gpt-5.3-codex (medium thinking)",
  GPT_5_3_CODEX_HIGH = "gpt-5.3-codex (high thinking)",
  GPT_5_3_CODEX_XHIGH = "gpt-5.3-codex (xhigh thinking)",
  GEMINI_3_FLASH_PREVIEW_HIGH = "gemini-3-flash-preview (high thinking)",
  GEMINI_3_FLASH_PREVIEW_MINIMAL = "gemini-3-flash-preview (minimal thinking)",
  GEMINI_3_1_PRO_PREVIEW_HIGH = "gemini-3.1-pro-preview (high thinking)",
  GEMINI_3_1_PRO_PREVIEW_MEDIUM = "gemini-3.1-pro-preview (medium thinking)",
  GEMINI_3_1_PRO_PREVIEW_LOW = "gemini-3.1-pro-preview (low thinking)",
}

// Will generate a static error if a model in the enum above is not in the descriptions
export const CODE_GENERATION_MODEL_DESCRIPTIONS: {
  [key in CodeGenerationModel]: { name: string; inBeta: boolean };
} = {
  "gpt-5.2-codex (low thinking)": {
    name: "GPT 5.2 Codex (low)",
    inBeta: true,
  },
  "gpt-5.2-codex (medium thinking)": {
    name: "GPT 5.2 Codex (medium)",
    inBeta: true,
  },
  "gpt-5.2-codex (high thinking)": {
    name: "GPT 5.2 Codex (high)",
    inBeta: true,
  },
  "gpt-5.2-codex (xhigh thinking)": {
    name: "GPT 5.2 Codex (xhigh)",
    inBeta: true,
  },
  "gpt-5.3-codex (low thinking)": {
    name: "GPT 5.3 Codex (low)",
    inBeta: true,
  },
  "gpt-5.3-codex (medium thinking)": {
    name: "GPT 5.3 Codex (medium)",
    inBeta: true,
  },
  "gpt-5.3-codex (high thinking)": {
    name: "GPT 5.3 Codex (high)",
    inBeta: true,
  },
  "gpt-5.3-codex (xhigh thinking)": {
    name: "GPT 5.3 Codex (xhigh)",
    inBeta: true,
  },
  "claude-opus-4-5-20251101": { name: "Claude Opus 4.5", inBeta: false },
  "claude-opus-4-6": { name: "Claude Opus 4.6", inBeta: false },
  "claude-sonnet-4-6": { name: "Claude Sonnet 4.6", inBeta: false },
  "claude-sonnet-4-5-20250929": { name: "Claude Sonnet 4.5", inBeta: false },
  "gemini-3-flash-preview (high thinking)": {
    name: "Gemini 3 Flash (high)",
    inBeta: true,
  },
  "gemini-3-flash-preview (minimal thinking)": {
    name: "Gemini 3 Flash (minimal)",
    inBeta: true,
  },
  "gemini-3.1-pro-preview (high thinking)": {
    name: "Gemini 3.1 Pro (high)",
    inBeta: true,
  },
  "gemini-3.1-pro-preview (medium thinking)": {
    name: "Gemini 3.1 Pro (medium)",
    inBeta: true,
  },
  "gemini-3.1-pro-preview (low thinking)": {
    name: "Gemini 3.1 Pro (low)",
    inBeta: true,
  },
};
