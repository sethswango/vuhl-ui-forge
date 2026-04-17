import {
  MAX_ITERATE_IMAGES,
  canSubmit,
  hasBeforeAfter,
  initialIterateState,
  iterateReducer,
} from "./iterateReducer";

describe("iterateReducer", () => {
  test("setText updates text and clears any prior error", () => {
    const state = iterateReducer(
      { ...initialIterateState, status: "error", errorMessage: "oops" },
      { type: "setText", text: "tweak the header" },
    );
    expect(state.text).toBe("tweak the header");
    expect(state.errorMessage).toBeNull();
  });

  test("addImages respects the max image cap", () => {
    const withOne = iterateReducer(initialIterateState, {
      type: "addImages",
      images: ["data:a", "data:b"],
    });
    expect(withOne.images).toEqual(["data:a", "data:b"]);

    const filler = Array.from(
      { length: MAX_ITERATE_IMAGES - 2 },
      (_, i) => `data:${i}`,
    );
    const atCap = iterateReducer(withOne, { type: "addImages", images: filler });
    expect(atCap.images.length).toBe(MAX_ITERATE_IMAGES);

    const overflow = iterateReducer(atCap, {
      type: "addImages",
      images: ["data:overflow"],
    });
    expect(overflow).toBe(atCap);
  });

  test("removeImage drops the target by index", () => {
    const state = iterateReducer(initialIterateState, {
      type: "addImages",
      images: ["a", "b", "c"],
    });
    const next = iterateReducer(state, { type: "removeImage", index: 1 });
    expect(next.images).toEqual(["a", "c"]);
  });

  test("submit without any input surfaces an error and stays idle", () => {
    const state = iterateReducer(initialIterateState, {
      type: "submit",
      beforeCode: "<div/>",
      variantIndex: 0,
    });
    expect(state.status).toBe("error");
    expect(state.errorMessage).toMatch(/text or an image/i);
  });

  test("submit with text flips to submitting and captures before snapshot", () => {
    const primed = iterateReducer(initialIterateState, {
      type: "setText",
      text: "swap palette",
    });
    const submitted = iterateReducer(primed, {
      type: "submit",
      beforeCode: "<section>v1</section>",
      variantIndex: 2,
    });
    expect(submitted.status).toBe("submitting");
    expect(submitted.beforeCode).toBe("<section>v1</section>");
    expect(submitted.variantIndex).toBe(2);
    expect(submitted.afterCode).toBeNull();
  });

  test("complete transitions from submitting to complete and clears draft inputs", () => {
    const submitted = iterateReducer(
      {
        ...initialIterateState,
        text: "swap palette",
        images: ["img1"],
        status: "submitting",
        beforeCode: "<a/>",
        variantIndex: 0,
      },
      { type: "complete", afterCode: "<b/>" },
    );
    expect(submitted.status).toBe("complete");
    expect(submitted.afterCode).toBe("<b/>");
    expect(submitted.beforeCode).toBe("<a/>");
    expect(submitted.text).toBe("");
    expect(submitted.images).toEqual([]);
    expect(hasBeforeAfter(submitted)).toBe(true);
  });

  test("complete is ignored when not submitting", () => {
    const state = iterateReducer(initialIterateState, {
      type: "complete",
      afterCode: "<x/>",
    });
    expect(state).toBe(initialIterateState);
  });

  test("fail records the error without losing the before snapshot", () => {
    const submitted = iterateReducer(
      {
        ...initialIterateState,
        status: "submitting",
        beforeCode: "<a/>",
        variantIndex: 1,
      },
      { type: "fail", errorMessage: "network down" },
    );
    expect(submitted.status).toBe("error");
    expect(submitted.errorMessage).toBe("network down");
    expect(submitted.beforeCode).toBe("<a/>");
  });

  test("canSubmit gates on input presence and submitting status", () => {
    expect(canSubmit(initialIterateState)).toBe(false);
    const typing = iterateReducer(initialIterateState, {
      type: "setText",
      text: "go",
    });
    expect(canSubmit(typing)).toBe(true);
    const working = { ...typing, status: "submitting" as const };
    expect(canSubmit(working)).toBe(false);
  });

  test("reset returns to the initial state snapshot", () => {
    const dirty = iterateReducer(
      {
        ...initialIterateState,
        text: "hi",
        images: ["a"],
        status: "complete",
        beforeCode: "<a/>",
        afterCode: "<b/>",
        variantIndex: 3,
      },
      { type: "reset" },
    );
    expect(dirty).toEqual(initialIterateState);
  });
});
