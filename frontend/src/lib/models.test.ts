import {
  DEFAULT_MODEL_PRESET,
  MODEL_PRESET_DESCRIPTIONS,
  MODEL_PRESET_ORDER,
  ModelPreset,
  isModelPreset,
} from "./models";

describe("ModelPreset registry", () => {
  test("DEFAULT_MODEL_PRESET is a known preset", () => {
    expect(MODEL_PRESET_ORDER).toContain(DEFAULT_MODEL_PRESET);
  });

  test("MODEL_PRESET_ORDER has no duplicates", () => {
    const unique = new Set<string>(MODEL_PRESET_ORDER);
    expect(unique.size).toBe(MODEL_PRESET_ORDER.length);
  });

  test("MODEL_PRESET_DESCRIPTIONS has an entry for each preset in the order", () => {
    for (const preset of MODEL_PRESET_ORDER) {
      const entry = MODEL_PRESET_DESCRIPTIONS[preset];
      expect(entry).toBeDefined();
      expect(entry.label).toBeTruthy();
      expect(entry.tagline).toBeTruthy();
      expect(entry.detail).toBeTruthy();
    }
  });

  test("preset labels are unique and human-readable", () => {
    const labels = MODEL_PRESET_ORDER.map(
      (p) => MODEL_PRESET_DESCRIPTIONS[p].label
    );
    const unique = new Set(labels);
    expect(unique.size).toBe(labels.length);
  });

  test("presets in order match the expected product set", () => {
    // If this list changes, we want an explicit reminder that the backend
    // MODEL_PRESETS dict in routes/model_choice_sets.py must be updated too.
    expect([...MODEL_PRESET_ORDER]).toEqual([
      "balanced",
      "fast",
      "quality",
      "diverse",
    ]);
  });
});

describe("isModelPreset", () => {
  test("returns true for every preset in MODEL_PRESET_ORDER", () => {
    for (const preset of MODEL_PRESET_ORDER) {
      expect(isModelPreset(preset)).toBe(true);
    }
  });

  test("returns false for unknown strings", () => {
    expect(isModelPreset("super-fast")).toBe(false);
    expect(isModelPreset("")).toBe(false);
    expect(isModelPreset("BALANCED")).toBe(false);
  });

  test("returns false for non-string input", () => {
    const cases: unknown[] = [null, undefined, 42, true, {}, [], Symbol("x")];
    for (const bad of cases) {
      expect(isModelPreset(bad)).toBe(false);
    }
  });

  test("narrows the type when used as a guard", () => {
    const raw: unknown = "quality";
    if (isModelPreset(raw)) {
      // Compile-time check that the type narrows to ModelPreset.
      const preset: ModelPreset = raw;
      expect(MODEL_PRESET_DESCRIPTIONS[preset].label).toBe("Quality");
    } else {
      throw new Error("Expected 'quality' to be a known preset");
    }
  });
});
