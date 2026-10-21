/** Types for `check-control-labels.mjs` (imported by `src/test/controlLabels.test.ts`). */
export interface ControlFinding { file: string; line: number; tag: string; missing: string[] }
export interface ControlWarning { file: string; line: number; tag: string; ariaLabel: string }
export interface ControlIgnored { file: string; line: number; tag: string; reason: string }
export interface DuplicateTestId { file: string; id: string; lines: number[] }
export interface ScanResult {
  findings: ControlFinding[];
  warnings: ControlWarning[];
  ignored: ControlIgnored[];
  duplicates: DuplicateTestId[];
}
export const CONTROLS: Set<string>;
export const PRIMITIVE_PROPS: Record<string, { label: string[]; testid: string[] }>;
export function defaultFiles(): string[];
export function scan(files?: string[]): ScanResult;
