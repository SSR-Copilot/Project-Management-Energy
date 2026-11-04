/** Types for `gen-parity-manifest.mjs` (imported by `src/test/genParityManifest.test.ts`). */
export const PROBE_INPUTS: string[];
export function kebab(s: string): string;

export interface ErrorLabel {
  name: string; line: number; input: string | null; text: string; textLine: number; visible: string; visibleLine: number;
  messages: string[]; templates: string[];
}
export interface ScreenModel {
  screenName: string;
  controlCount: number;
  controls: { name: string; type: string; family: string; line: number; parent: string | null; accessibleLabel: string | null;
    text: string | null; tooltip: string | null; visible: string | null; displayMode: string | null }[];
  inputs: { name: string; line: number; type: string; family: string; errorLabels: string[]; placeholder: string | null; onChange: string }[];
  errorLabels: ErrorLabel[];
  messages: { text: string; source: string; line: number }[];
  notifies: { control: string; property: string; line: number; text: string; literal: boolean }[];
  commandBars: { name: string; line: number; itemsLine: number; inPanel: boolean; onSelect: string; onSelectLine: number;
    items: { key: string; caption: string; captionIsFormula: boolean; enabled: string; visible: string }[] }[];
  buttons: { name: string; line: number; type: string; caption: string | null; inPanel: boolean; onSelect: string; onSelectLine: number; displayMode: string; visible: string }[];
  dropdowns: { name: string; line: number; type: string; items: string; itemsLine: number; defaultSelected: string; onChange: string }[];
  toggles: { name: string; line: number; type: string; label: string; checked: string; onChange: string }[];
  panels: { name: string; line: number; visible: string; save: string | null; cancel: string | null }[];
  dialogs: { name: string; line: number; title: string; description: string; visible: string; onConfirm: string; onConfirmLine: number }[];
  galleries: { name: string; line: number; items: string; itemsLine: number }[];
  timers: { name: string; line: number; onTimerEnd: string; start: string }[];
  writes: { control: string; property: string; line: number; fn: string; target: string; columns: string[] }[];
  accessible: { name: string; line: number; label: string | null; formula: string | null }[];
  tooltips: { name: string; line: number; tooltip: string | null; formula: string | null }[];
  visibility: { name: string; family: string; property: string; line: number; formula: string }[];
  screenEvents: { property: string; line: number; formula: string }[];
}
export function extractScreen(text: string): ScreenModel;

export interface GenContext {
  app: "projectcosts" | "projectmanagement";
  dataSources: Map<string, { logicalName: string; entitySet: string }>;
  entities: Map<string, { primaryIdAttribute?: string }>;
  attributes: Map<string, Record<string, { displayName?: string; type?: string }>>;
  services: Map<string, { service: string; module: string }>;
  canvasNav: { menu: string; key: string; caption: string; target: string | null }[];
  codeNav: Map<string, string>;
  fragments: string[];
  codeFiles: string[];
  codeIds: Set<string>;
}
export interface DraftOptions { slug: string; title: string; yaml: string; canvasVersion?: string; date?: string }
export function testIdsIn(texts: string[]): Set<string>;
export function canvasNavFrom(appYamlText: string): GenContext["canvasNav"];
export function codeNavFrom(navigationTs: string): Map<string, string>;
export function loadContext(opts: { app: string; screenName: string; root?: string }): GenContext;
export function resolveTables(model: ScreenModel, ctx: GenContext): {
  tables: { display: string; logicalName: string; entitySet: string; name: string; primaryKey: string; service: string | null;
    serviceModule: string | null; ops: Set<string>; columns: Map<string, { logical: string; type?: string } | null>; sources: string[];
    projectLookup: string | null; parent: { table: string; lookup: string } | null; tagColumn: string | null; deleteOrder: number }[];
  collections: string[];
};
export function resolveOpen(model: ScreenModel, ctx: GenContext): { spec: Record<string, string>; note: string[] };
export function buildManifestDraft(model: ScreenModel, ctx: GenContext, opts: DraftOptions): string;
export function buildRuleMap(model: ScreenModel, ctx: GenContext, opts: DraftOptions): string;
export function locateYaml(arg: string, app?: string): { file: string; app: string; yaml: string };
export function generate(opts: { yaml: string; app?: string; slug?: string; outDir?: string; rulemapDir?: string; canvasVersion?: string; date?: string; root?: string }): {
  manifestFile: string; ruleMapFile: string; slug: string; app: string; counts: Record<string, number>;
};
