import { deriveAngularHints, defaultAngularHints } from "./hints";
import type { ProjectPatternSignals } from "../design-api-types";

function emptyPatterns(
  overrides: Partial<ProjectPatternSignals> = {},
): ProjectPatternSignals {
  return {
    usesSignals: false,
    usesObservables: false,
    usesHooks: false,
    usesCompositionApi: false,
    usesRxjs: false,
    angularStandalone: null,
    angularZoneless: false,
    stateStyle: null,
    renderingStyle: null,
    evidence: [],
    ...overrides,
  };
}

describe("deriveAngularHints", () => {
  test("null patterns collapse to safe defaults", () => {
    expect(deriveAngularHints(null)).toEqual(defaultAngularHints());
    expect(deriveAngularHints(undefined)).toEqual(defaultAngularHints());
  });

  test("empty patterns: standalone defaults to true, no signals, default CD", () => {
    const hints = deriveAngularHints(emptyPatterns());
    expect(hints.useSignals).toBe(false);
    expect(hints.standalone).toBe(true);
    expect(hints.zoneless).toBe(false);
    expect(hints.prefersObservables).toBe(false);
    expect(hints.changeDetection).toBe("default");
  });

  test("usesSignals flag turns on signals + OnPush", () => {
    const hints = deriveAngularHints(emptyPatterns({ usesSignals: true }));
    expect(hints.useSignals).toBe(true);
    expect(hints.changeDetection).toBe("onpush");
  });

  test("stateStyle='signals' is sufficient to turn on signals", () => {
    const hints = deriveAngularHints(
      emptyPatterns({ stateStyle: "signals" }),
    );
    expect(hints.useSignals).toBe(true);
    expect(hints.changeDetection).toBe("onpush");
  });

  test("angularStandalone=false produces a non-standalone component", () => {
    const hints = deriveAngularHints(
      emptyPatterns({ angularStandalone: false }),
    );
    expect(hints.standalone).toBe(false);
  });

  test("angularStandalone=null stays true (matches Angular CLI default)", () => {
    const hints = deriveAngularHints(
      emptyPatterns({ angularStandalone: null }),
    );
    expect(hints.standalone).toBe(true);
  });

  test("zoneless projects default to OnPush even without signals", () => {
    const hints = deriveAngularHints(
      emptyPatterns({ angularZoneless: true }),
    );
    expect(hints.zoneless).toBe(true);
    expect(hints.changeDetection).toBe("onpush");
  });

  test("usesObservables or usesRxjs sets prefersObservables", () => {
    expect(
      deriveAngularHints(emptyPatterns({ usesObservables: true }))
        .prefersObservables,
    ).toBe(true);
    expect(
      deriveAngularHints(emptyPatterns({ usesRxjs: true })).prefersObservables,
    ).toBe(true);
  });

  test("observables alone does not flip change detection to OnPush", () => {
    const hints = deriveAngularHints(
      emptyPatterns({ usesObservables: true, usesRxjs: true }),
    );
    expect(hints.prefersObservables).toBe(true);
    expect(hints.changeDetection).toBe("default");
  });

  test("signals + standalone + observables is a coherent A17+ project", () => {
    const hints = deriveAngularHints(
      emptyPatterns({
        usesSignals: true,
        usesObservables: true,
        usesRxjs: true,
        angularStandalone: true,
        stateStyle: "signals",
      }),
    );
    expect(hints.useSignals).toBe(true);
    expect(hints.standalone).toBe(true);
    expect(hints.prefersObservables).toBe(true);
    expect(hints.changeDetection).toBe("onpush");
  });
});

describe("defaultAngularHints", () => {
  test("returns a fresh object each call (no shared mutable state)", () => {
    const a = defaultAngularHints();
    const b = defaultAngularHints();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});
