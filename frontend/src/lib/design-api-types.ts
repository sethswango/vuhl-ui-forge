export interface ProjectFramework {
  name: string;
  version: string | null;
  language: string | null;
  packageManager: string | null;
  buildTool: string | null;
  evidence: string[];
}

export interface ProjectComponentInput {
  name: string;
  kind: string;
  type: string | null;
  required: boolean;
}

export interface ProjectComponent {
  name: string;
  selector: string | null;
  filePath: string;
  kind: string;
  inputs: ProjectComponentInput[];
  standalone: boolean | null;
  exported: boolean;
}

export interface ProjectCssTokens {
  tailwindConfigPath: string | null;
  tailwindThemeKeys: string[];
  tailwindCustomClasses: string[];
  cssCustomProperties: Record<string, string>;
  scssVariables: Record<string, string>;
  tokenSources: string[];
}

export interface ProjectPatternSignals {
  usesSignals: boolean;
  usesObservables: boolean;
  usesHooks: boolean;
  usesCompositionApi: boolean;
  usesRxjs: boolean;
  angularStandalone: boolean | null;
  angularZoneless: boolean;
  stateStyle: string | null;
  renderingStyle: string | null;
  evidence: string[];
}

export interface ProjectConventions {
  namingStyle: string | null;
  folderLayout: string[];
  importStyle: string | null;
  templateStyle: string | null;
  notes: string[];
}

export interface ProjectContext {
  repoPath: string;
  framework: ProjectFramework;
  components: ProjectComponent[];
  cssTokens: ProjectCssTokens;
  patterns: ProjectPatternSignals;
  conventions: ProjectConventions;
  filesScanned: number;
  truncated: boolean;
  warnings: string[];
}

export interface GatherProjectContextRequest {
  repoPath: string;
  maxFiles?: number;
  maxComponents?: number;
  label?: string;
}

export interface GatherProjectContextResult {
  context: ProjectContext;
  recordId: string;
}

export interface ExtractDesignSpecRequest {
  variantIndex?: number;
  variantId?: string;
  persistAsContext?: boolean;
}

export interface DesignSpecReuseSuggestion {
  componentName: string;
  componentSelector: string | null;
  componentFile: string | null;
  rationale: string;
  confidence: string;
}

export interface DesignSpecResult {
  sessionId: string;
  variantIndex: number;
  variantId: string;
  annotatedMarkdown: string;
  spec: {
    summary: string;
    alignmentNotes: string[];
    reuseSuggestions: DesignSpecReuseSuggestion[];
    newComponentsNeeded: string[];
    projectContextUsed: boolean;
  };
}

export interface QueueRefinementRequest {
  variantIndex: number;
  text?: string;
  imageDataUrl?: string;
}

export interface QueueRefinementResult {
  refinementId: string;
  status: string;
  streamHint: Record<string, unknown>;
}

interface RawFrameworkPayload {
  name?: string;
  version?: string | null;
  language?: string | null;
  package_manager?: string | null;
  build_tool?: string | null;
  evidence?: unknown;
}

interface RawComponentInputPayload {
  name?: string;
  kind?: string;
  type?: string | null;
  required?: boolean;
}

interface RawComponentPayload {
  name?: string;
  selector?: string | null;
  file_path?: string;
  kind?: string;
  inputs?: RawComponentInputPayload[];
  standalone?: boolean | null;
  exported?: boolean;
}

interface RawCssTokensPayload {
  tailwind_config_path?: string | null;
  tailwind_theme_keys?: unknown;
  tailwind_custom_classes?: unknown;
  css_custom_properties?: unknown;
  scss_variables?: unknown;
  token_sources?: unknown;
}

interface RawPatternsPayload {
  uses_signals?: boolean;
  uses_observables?: boolean;
  uses_hooks?: boolean;
  uses_composition_api?: boolean;
  uses_rxjs?: boolean;
  angular_standalone?: boolean | null;
  angular_zoneless?: boolean;
  state_style?: string | null;
  rendering_style?: string | null;
  evidence?: unknown;
}

interface RawConventionsPayload {
  naming_style?: string | null;
  folder_layout?: unknown;
  import_style?: string | null;
  template_style?: string | null;
  notes?: unknown;
}

interface RawProjectContextPayload {
  repo_path?: string;
  framework?: RawFrameworkPayload;
  components?: RawComponentPayload[];
  css_tokens?: RawCssTokensPayload;
  patterns?: RawPatternsPayload;
  conventions?: RawConventionsPayload;
  files_scanned?: number;
  truncated?: boolean;
  warnings?: unknown;
}

interface RawReuseSuggestionPayload {
  component_name?: string;
  component_selector?: string | null;
  component_file?: string | null;
  rationale?: string;
  confidence?: string;
}

interface RawSpecPayload {
  summary?: string;
  alignment_notes?: unknown;
  reuse_suggestions?: RawReuseSuggestionPayload[];
  new_components_needed?: unknown;
  project_context_used?: boolean;
}

interface RawExtractSpecResponse {
  session_id?: string;
  variant_index?: number;
  variant_id?: string;
  annotated_markdown?: string;
  spec?: RawSpecPayload;
}

interface RawRefineResponse {
  refinement_id?: string;
  status?: string;
  stream_hint?: Record<string, unknown>;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asOptionalBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(source)) {
    if (typeof raw === "string") out[key] = raw;
  }
  return out;
}

export function normalizeProjectContext(raw: unknown): ProjectContext {
  const payload = (raw ?? {}) as RawProjectContextPayload;
  const rawFramework = payload.framework ?? {};
  const framework: ProjectFramework = {
    name: asString(rawFramework.name, "unknown"),
    version: asOptionalString(rawFramework.version),
    language: asOptionalString(rawFramework.language),
    packageManager: asOptionalString(rawFramework.package_manager),
    buildTool: asOptionalString(rawFramework.build_tool),
    evidence: asStringArray(rawFramework.evidence),
  };

  const rawComponents = Array.isArray(payload.components)
    ? payload.components
    : [];
  const components: ProjectComponent[] = rawComponents.map(
    (entry: RawComponentPayload) => {
      const rawInputs = Array.isArray(entry.inputs) ? entry.inputs : [];
      return {
        name: asString(entry.name, "unnamed"),
        selector: asOptionalString(entry.selector),
        filePath: asString(entry.file_path, ""),
        kind: asString(entry.kind, "unknown"),
        inputs: rawInputs.map((input: RawComponentInputPayload) => ({
          name: asString(input.name, ""),
          kind: asString(input.kind, "input"),
          type: asOptionalString(input.type),
          required: asBool(input.required, false),
        })),
        standalone: asOptionalBool(entry.standalone),
        exported: asBool(entry.exported, true),
      };
    },
  );

  const rawTokens = payload.css_tokens ?? {};
  const cssTokens: ProjectCssTokens = {
    tailwindConfigPath: asOptionalString(rawTokens.tailwind_config_path),
    tailwindThemeKeys: asStringArray(rawTokens.tailwind_theme_keys),
    tailwindCustomClasses: asStringArray(rawTokens.tailwind_custom_classes),
    cssCustomProperties: asStringRecord(rawTokens.css_custom_properties),
    scssVariables: asStringRecord(rawTokens.scss_variables),
    tokenSources: asStringArray(rawTokens.token_sources),
  };

  const rawPatterns = payload.patterns ?? {};
  const patterns: ProjectPatternSignals = {
    usesSignals: asBool(rawPatterns.uses_signals, false),
    usesObservables: asBool(rawPatterns.uses_observables, false),
    usesHooks: asBool(rawPatterns.uses_hooks, false),
    usesCompositionApi: asBool(rawPatterns.uses_composition_api, false),
    usesRxjs: asBool(rawPatterns.uses_rxjs, false),
    angularStandalone: asOptionalBool(rawPatterns.angular_standalone),
    angularZoneless: asBool(rawPatterns.angular_zoneless, false),
    stateStyle: asOptionalString(rawPatterns.state_style),
    renderingStyle: asOptionalString(rawPatterns.rendering_style),
    evidence: asStringArray(rawPatterns.evidence),
  };

  const rawConventions = payload.conventions ?? {};
  const conventions: ProjectConventions = {
    namingStyle: asOptionalString(rawConventions.naming_style),
    folderLayout: asStringArray(rawConventions.folder_layout),
    importStyle: asOptionalString(rawConventions.import_style),
    templateStyle: asOptionalString(rawConventions.template_style),
    notes: asStringArray(rawConventions.notes),
  };

  return {
    repoPath: asString(payload.repo_path, ""),
    framework,
    components,
    cssTokens,
    patterns,
    conventions,
    filesScanned: asNumber(payload.files_scanned, 0),
    truncated: asBool(payload.truncated, false),
    warnings: asStringArray(payload.warnings),
  };
}

export function normalizeDesignSpec(raw: unknown): DesignSpecResult {
  const payload = (raw ?? {}) as RawExtractSpecResponse;
  const rawSpec = payload.spec ?? {};
  const rawSuggestions = Array.isArray(rawSpec.reuse_suggestions)
    ? rawSpec.reuse_suggestions
    : [];
  return {
    sessionId: asString(payload.session_id, ""),
    variantIndex: asNumber(payload.variant_index, 0),
    variantId: asString(payload.variant_id, ""),
    annotatedMarkdown: asString(payload.annotated_markdown, ""),
    spec: {
      summary: asString(rawSpec.summary, ""),
      alignmentNotes: asStringArray(rawSpec.alignment_notes),
      reuseSuggestions: rawSuggestions.map(
        (entry: RawReuseSuggestionPayload) => ({
          componentName: asString(entry.component_name, "unnamed"),
          componentSelector: asOptionalString(entry.component_selector),
          componentFile: asOptionalString(entry.component_file),
          rationale: asString(entry.rationale, ""),
          confidence: asString(entry.confidence, "medium"),
        }),
      ),
      newComponentsNeeded: asStringArray(rawSpec.new_components_needed),
      projectContextUsed: asBool(rawSpec.project_context_used, false),
    },
  };
}

export function normalizeRefineResponse(raw: unknown): QueueRefinementResult {
  const payload = (raw ?? {}) as RawRefineResponse;
  return {
    refinementId: asString(payload.refinement_id, ""),
    status: asString(payload.status, "queued"),
    streamHint:
      payload.stream_hint && typeof payload.stream_hint === "object"
        ? (payload.stream_hint as Record<string, unknown>)
        : {},
  };
}
