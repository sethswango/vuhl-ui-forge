// Project-aware Angular conversion hints.
//
// The Angular converter does a reasonable job on its own, but it doesn't know
// anything about the target project's Angular idioms. A Tailwind mockup that
// converts fine for Angular 16 ngmodule code looks wrong next to an Angular
// 17+ signals-first codebase, and vice versa.
//
// This module extracts that posture from the ProjectContext.patterns bundle
// the scanner already produces and hands it to the converter as a single,
// purpose-built hints object. Callers should prefer `deriveAngularHints` over
// hand-building the hints so the mapping stays in one place.

import type { ProjectPatternSignals } from "../design-api-types";

export type AngularChangeDetection = "default" | "onpush";

export interface AngularProjectHints {
  /**
   * Prefer signals-based state (`signal(...)`) over plain class fields.
   * Drives emission of `signal()` wrappers and the `signal` import.
   */
  useSignals: boolean;

  /**
   * Whether the target project uses Angular standalone components. When
   * false we still emit `standalone: false` and add a follow-up reminding
   * the implementer to wire the component through an NgModule.
   */
  standalone: boolean;

  /**
   * Target project runs in zoneless mode (Angular 18+ provideExperimentalZonelessChangeDetection).
   * Surfaces as a follow-up so the implementer knows to avoid Zone-dependent patterns.
   */
  zoneless: boolean;

  /**
   * The project leans on observables / RxJS for state. Surfaces as a
   * follow-up recommending `toSignal(...)` or `async` pipe bridging, so
   * the implementer doesn't naively rip out existing observable plumbing.
   */
  prefersObservables: boolean;

  /**
   * Change-detection strategy the generated component should declare.
   * Signals projects default to OnPush; zoneless strongly prefers OnPush.
   */
  changeDetection: AngularChangeDetection;
}

const DEFAULT_HINTS: AngularProjectHints = {
  useSignals: false,
  standalone: true,
  zoneless: false,
  prefersObservables: false,
  changeDetection: "default",
};

/**
 * Translate scanner output into Angular-specific hints. Unknown / missing
 * patterns collapse to the safe defaults (standalone, no signals, default
 * change detection), which matches Angular's own starter templates.
 */
export function deriveAngularHints(
  patterns: ProjectPatternSignals | null | undefined,
): AngularProjectHints {
  if (!patterns) return { ...DEFAULT_HINTS };

  const useSignals =
    patterns.usesSignals === true || patterns.stateStyle === "signals";

  // angularStandalone: null = unknown. Treat unknown as "yes, standalone" so
  // we match Angular CLI's current default and don't push implementers into
  // ngmodule work unless the scanner is confident otherwise.
  const standalone =
    patterns.angularStandalone === null ||
    patterns.angularStandalone === undefined
      ? true
      : patterns.angularStandalone === true;

  const zoneless = patterns.angularZoneless === true;

  const prefersObservables =
    patterns.usesObservables === true ||
    patterns.usesRxjs === true ||
    patterns.stateStyle === "observables";

  // Signals and zoneless projects should both default to OnPush. A project
  // that only uses observables (no signals) doesn't necessarily want OnPush,
  // so we stay conservative there.
  const changeDetection: AngularChangeDetection =
    useSignals || zoneless ? "onpush" : "default";

  return {
    useSignals,
    standalone,
    zoneless,
    prefersObservables,
    changeDetection,
  };
}

export function defaultAngularHints(): AngularProjectHints {
  return { ...DEFAULT_HINTS };
}
