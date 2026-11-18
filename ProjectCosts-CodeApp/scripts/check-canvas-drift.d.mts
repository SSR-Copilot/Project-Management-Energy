/** Types for `check-canvas-drift.mjs` (imported by `src/test/canvasDrift.test.ts`). */
export interface DriftControl { file: string; control: string; type: string }
export interface DriftChange { file: string; control: string; from: string | null; to: string | null }
export interface DriftFormulaChange extends DriftChange { property: string }
export interface DriftReport {
  filesAdded: string[];
  filesRemoved: string[];
  controlsAdded: DriftControl[];
  controlsRemoved: DriftControl[];
  labelChanges: DriftChange[];
  versionChanges: DriftChange[];
  typeChanges: DriftChange[];
  formulaChanges: DriftFormulaChange[];
}
export const WATCHED_PROPERTIES: string[];
export function normalFormula(raw: string | null | undefined): string;
export function resolveSrcDir(dir: string): string | null;
export function compareCanvasTrees(baseSrc: string, liveSrc: string): DriftReport;
export function driftFails(report: DriftReport, opts?: { strict?: boolean }): boolean;
export function main(argv: string[], io?: { log?: (s: string) => void; err?: (s: string) => void }): number;
