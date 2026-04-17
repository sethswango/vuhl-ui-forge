// Pure state + reducer for the "Iterate on selected variant" pane.
// The UI is a thin shell around this reducer. Keeping transitions pure makes
// the behavior testable without mounting the DOM.

export const MAX_ITERATE_IMAGES = 5;

export type IterateStatus = "idle" | "submitting" | "complete" | "error";

export interface IterateState {
  text: string;
  images: string[];
  status: IterateStatus;
  beforeCode: string | null;
  afterCode: string | null;
  variantIndex: number | null;
  errorMessage: string | null;
}

export const initialIterateState: IterateState = {
  text: "",
  images: [],
  status: "idle",
  beforeCode: null,
  afterCode: null,
  variantIndex: null,
  errorMessage: null,
};

export type IterateAction =
  | { type: "setText"; text: string }
  | { type: "addImages"; images: string[] }
  | { type: "removeImage"; index: number }
  | { type: "clearImages" }
  | { type: "reset" }
  | {
      type: "submit";
      beforeCode: string;
      variantIndex: number;
    }
  | { type: "complete"; afterCode: string }
  | { type: "fail"; errorMessage: string };

export function iterateReducer(
  state: IterateState,
  action: IterateAction,
): IterateState {
  switch (action.type) {
    case "setText":
      return { ...state, text: action.text, errorMessage: null };

    case "addImages": {
      if (action.images.length === 0) return state;
      const remaining = MAX_ITERATE_IMAGES - state.images.length;
      if (remaining <= 0) return state;
      const accepted = action.images.slice(0, remaining);
      return {
        ...state,
        images: [...state.images, ...accepted],
        errorMessage: null,
      };
    }

    case "removeImage":
      return {
        ...state,
        images: state.images.filter((_, idx) => idx !== action.index),
      };

    case "clearImages":
      return { ...state, images: [] };

    case "reset":
      return { ...initialIterateState };

    case "submit":
      if (!state.text.trim() && state.images.length === 0) {
        return {
          ...state,
          status: "error",
          errorMessage: "Provide text or an image before iterating.",
        };
      }
      return {
        ...state,
        status: "submitting",
        beforeCode: action.beforeCode,
        afterCode: null,
        variantIndex: action.variantIndex,
        errorMessage: null,
      };

    case "complete":
      if (state.status !== "submitting") return state;
      return {
        ...state,
        status: "complete",
        afterCode: action.afterCode,
        text: "",
        images: [],
      };

    case "fail":
      return {
        ...state,
        status: "error",
        errorMessage: action.errorMessage,
      };

    default:
      return state;
  }
}

export function canSubmit(state: IterateState): boolean {
  if (state.status === "submitting") return false;
  return state.text.trim().length > 0 || state.images.length > 0;
}

export function hasBeforeAfter(state: IterateState): boolean {
  return state.beforeCode !== null && state.afterCode !== null;
}
