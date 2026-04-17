import type { ProjectContext } from "../../lib/design-api-types";

export interface ProjectContextSummary {
  frameworkLabel: string;
  frameworkVersion: string | null;
  componentCount: number;
  stateStyle: string | null;
  renderingStyle: string | null;
  tailwindConfigPath: string | null;
  cssPropertyCount: number;
  patternChips: string[];
  truncated: boolean;
  warnings: string[];
}

const FRAMEWORK_LABELS: Record<string, string> = {
  angular: "Angular",
  react: "React",
  next: "Next.js",
  vue: "Vue",
  svelte: "Svelte",
  plain_html: "Plain HTML",
  python: "Python",
  unknown: "Unknown",
};

export function frameworkLabel(name: string): string {
  return FRAMEWORK_LABELS[name] ?? name;
}

export function summarizeProjectContext(
  context: ProjectContext,
): ProjectContextSummary {
  const chips: string[] = [];
  const { patterns, framework } = context;

  if (patterns.usesSignals) chips.push("signals");
  if (patterns.usesObservables) chips.push("observables");
  if (patterns.usesHooks) chips.push("hooks");
  if (patterns.usesCompositionApi) chips.push("composition");
  if (patterns.usesRxjs && !chips.includes("observables")) chips.push("rxjs");
  if (framework.name === "angular" && patterns.angularStandalone === true)
    chips.push("standalone");
  if (framework.name === "angular" && patterns.angularZoneless)
    chips.push("zoneless");

  return {
    frameworkLabel: frameworkLabel(framework.name),
    frameworkVersion: framework.version,
    componentCount: context.components.length,
    stateStyle: patterns.stateStyle,
    renderingStyle: patterns.renderingStyle,
    tailwindConfigPath: context.cssTokens.tailwindConfigPath,
    cssPropertyCount: Object.keys(context.cssTokens.cssCustomProperties).length,
    patternChips: chips,
    truncated: context.truncated,
    warnings: context.warnings,
  };
}

export function formatStateStyle(stateStyle: string | null): string | null {
  if (!stateStyle) return null;
  switch (stateStyle) {
    case "signals":
      return "Signals";
    case "observables":
      return "Observables";
    case "hooks":
      return "Hooks";
    case "composition":
      return "Composition API";
    case "classic":
      return "Classic";
    case "unknown":
      return null;
    default:
      return stateStyle;
  }
}
