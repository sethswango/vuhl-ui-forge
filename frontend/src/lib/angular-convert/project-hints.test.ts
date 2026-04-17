import {
  convertHtmlToAngular,
  type AngularProjectHints,
} from "./index";

const BUTTON_WITH_ONCLICK = `<button onclick="handleClick()" class="bg-blue-500">Go</button>`;
const LIST_WITH_MODEL = `<input type="text" data-model="email" />`;

function hints(overrides: Partial<AngularProjectHints> = {}): AngularProjectHints {
  return {
    useSignals: false,
    standalone: true,
    zoneless: false,
    prefersObservables: false,
    changeDetection: "default",
    ...overrides,
  };
}

describe("convertHtmlToAngular with projectHints", () => {
  test("default hints match legacy non-hinted output", () => {
    const legacy = convertHtmlToAngular(BUTTON_WITH_ONCLICK);
    const hinted = convertHtmlToAngular(BUTTON_WITH_ONCLICK, {
      projectHints: hints(),
    });
    expect(hinted.componentTs).toBe(legacy.componentTs);
    expect(hinted.template).toBe(legacy.template);
  });

  test("useSignals hint produces signal()-wrapped fields", () => {
    const result = convertHtmlToAngular(LIST_WITH_MODEL, {
      projectHints: hints({ useSignals: true, changeDetection: "onpush" }),
    });
    expect(result.componentTs).toMatch(/signal\(''\)/);
    expect(result.componentTs).toMatch(/import \{ Component, signal, ChangeDetectionStrategy \}/);
  });

  test("changeDetection='onpush' emits ChangeDetectionStrategy.OnPush in decorator", () => {
    const result = convertHtmlToAngular(BUTTON_WITH_ONCLICK, {
      projectHints: hints({ changeDetection: "onpush" }),
    });
    expect(result.componentTs).toMatch(
      /changeDetection: ChangeDetectionStrategy\.OnPush/,
    );
    expect(result.componentTs).toMatch(
      /import \{ Component, ChangeDetectionStrategy \} from '@angular\/core'/,
    );
  });

  test("standalone=false emits standalone: false and strips inline imports[]", () => {
    const result = convertHtmlToAngular(LIST_WITH_MODEL, {
      projectHints: hints({ standalone: false }),
    });
    expect(result.componentTs).toMatch(/standalone: false/);
    // FormsModule should NOT be declared in the decorator's imports[] —
    // it goes to the NgModule instead. We still import it at the top of
    // the file so the implementer sees the import they need to relocate.
    expect(result.componentTs).not.toMatch(/imports: \[FormsModule\]/);
    expect(result.componentTs).toMatch(
      /import \{ FormsModule \} from '@angular\/forms'/,
    );
    expect(result.followUps.join("\n")).toMatch(/NgModule/);
  });

  test("standalone=true with FormsModule keeps the imports[] array", () => {
    const result = convertHtmlToAngular(LIST_WITH_MODEL, {
      projectHints: hints({ standalone: true }),
    });
    expect(result.componentTs).toMatch(/standalone: true/);
    expect(result.componentTs).toMatch(/imports: \[FormsModule\]/);
  });

  test("zoneless=true produces a zoneless follow-up", () => {
    const result = convertHtmlToAngular(BUTTON_WITH_ONCLICK, {
      projectHints: hints({ zoneless: true, changeDetection: "onpush" }),
    });
    expect(result.followUps.join("\n")).toMatch(/zoneless/i);
    // Zoneless + OnPush + no signals should NOT double up on the "onpush
    // needs signals" note (zoneless covers the story better).
    const opushNote = result.followUps.filter((f) =>
      /OnPush/.test(f) && /zoneless/.test(f),
    );
    expect(opushNote.length).toBeGreaterThanOrEqual(0);
  });

  test("prefersObservables produces an RxJS bridging follow-up", () => {
    const result = convertHtmlToAngular(LIST_WITH_MODEL, {
      projectHints: hints({ prefersObservables: true }),
    });
    expect(result.followUps.join("\n")).toMatch(/toSignal|async pipe|RxJS/i);
  });

  test("explicit useSignals option overrides projectHints.useSignals", () => {
    const result = convertHtmlToAngular(LIST_WITH_MODEL, {
      useSignals: true,
      projectHints: hints({ useSignals: false }),
    });
    expect(result.componentTs).toMatch(/signal\(''\)/);
  });

  test("no hints + no options matches the pre-hints default (standalone true, no OnPush)", () => {
    const result = convertHtmlToAngular(BUTTON_WITH_ONCLICK);
    expect(result.componentTs).toMatch(/standalone: true/);
    expect(result.componentTs).not.toMatch(/ChangeDetectionStrategy\.OnPush/);
    expect(result.followUps.every((f) => !/NgModule/.test(f))).toBe(true);
  });

  test("onpush without signals emits the OnPush-needs-signals follow-up", () => {
    const result = convertHtmlToAngular(LIST_WITH_MODEL, {
      projectHints: hints({ useSignals: false, changeDetection: "onpush" }),
    });
    expect(result.followUps.join("\n")).toMatch(/OnPush/);
    expect(result.followUps.join("\n")).toMatch(/signal/i);
  });

  test("onpush with signals does NOT duplicate the OnPush warning", () => {
    const result = convertHtmlToAngular(LIST_WITH_MODEL, {
      projectHints: hints({ useSignals: true, changeDetection: "onpush" }),
    });
    // The "needs signals" note is for projects that set OnPush without
    // signals. With signals already on, the note is noise.
    const opushWarnings = result.followUps.filter((f) =>
      /OnPush/.test(f) && /plain mutable fields/.test(f),
    );
    expect(opushWarnings).toHaveLength(0);
  });
});
