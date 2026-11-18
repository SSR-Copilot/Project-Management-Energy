/** Types for `check-canvas-identities.mjs` (imported by `src/test/canvasIdentities.test.ts`). */
export interface CanvasFinding { code: "C1" | "C2" | "C3" | "C4" | "C5"; at: string; tag: string; id: string; msg: string }
export interface ModuleStats { canvas: number; derived: number; verified: number; labelChecked: number }
export const MODULES: [string, string, string[]][];
/** `msapp`: a canvas tree laid out like `ProjectDocs/_extracted/msapp` (`<msapp>/<app>/Src`), instead of the default. */
export function validate(opts?: { only?: string; msapp?: string }): { findings: CanvasFinding[]; stats: Map<string, ModuleStats> };
