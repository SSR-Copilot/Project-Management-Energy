/** Types for `generators-orphans.mjs` (imported by `src/test/generatorsOrphans.test.ts`). */
export type ClassId = "B1" | "B2" | "B3" | "B4" | "B5" | "B6" | "B7" | "B8";
export interface ClassMeta { label: string; set: string; id: string; name: string; lookups: string[]; reportOnly: boolean }
export const API_PATH: string;
export const MAX_PAGES: number;
export const DELETE_CONCURRENCY: number;
export const MAX_TRIES: number;
export const CHUNK: number;
export const REQUEST_TIMEOUT_MS: number;
export const OM_SUBACCOUNT_NAME: string;
export const CLASSES: Record<ClassId, ClassMeta>;
export const CLASS_IDS: ClassId[];
export const APPLY_CLASSES: ClassId[];

export type Row = Record<string, unknown>;
export interface Options {
  apply: boolean; dryRun: boolean; yesDelete: boolean;
  input?: string; project?: string; out?: string; class?: string; manifest?: string;
  mode: "report" | "apply"; errors: string[];
}
export interface ClassEntry { id: string; name: string; lookups: Record<string, string>; reason?: string; typeId?: string; rank?: number; createdon?: string }
export interface Snapshot {
  omSubaccountIds?: string[];
  B1?: Row[]; B2?: Row[]; B3?: Row[]; B4?: Row[]; B5?: Row[]; B6?: Row[]; B7?: Row[]; B8costs?: Row[]; B8allocations?: Row[];
  truncated?: Record<string, boolean>; skipped?: string[];
}
export interface Classification {
  classes: Record<ClassId, ClassEntry[]>;
  counts: Record<ClassId, number>;
  details: { B4Groups: { typeId: string; bridges: number }[]; B4BridgeRows: number; B8NoAllocation: number; B8AllNullTurbine: number; unreadable: Record<string, number> };
}
export interface Io {
  readFile(p: string): string; writeFile(p: string, text: string): void; mkdirp(p: string): void; tmpdir(): string;
}
export interface FetchResponseLike { status: number; headers?: { get(name: string): string | null }; json(): Promise<unknown> }
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; signal?: AbortSignal; redirect?: string }) => Promise<FetchResponseLike>;
export interface Deps {
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike; sleep?: (ms: number) => Promise<void>; now?: () => Date; timeoutMs?: number;
  io?: Io; log?: (line: string) => void; err?: (line: string) => void;
}
export interface Context {
  ok: true; base: string; origin: string; request(method: string, url: string, extraHeaders?: Record<string, string>): Promise<FetchResponseLike>;
}

export function isGuid(v: unknown): boolean;
export function parseArgs(argv: string[]): Options;
export function applyProblems(o: Pick<Options, "class" | "manifest" | "dryRun" | "yesDelete">): string[];
export function rowUnreadable(cls: string, row: unknown): boolean;
export function hasChildren(ctx: Context, typeId: string): Promise<boolean>;
export function rowInClass(cls: string, row: unknown, omIds?: ReadonlySet<string>): boolean;
export function classify(snapshot: Snapshot | undefined): Classification;
export function csvCell(v: unknown): string;
export function toCsv(cls: ClassId, entries: ClassEntry[]): string;
export function retryAfterMs(header: string | null | undefined, nowMs: number): number | undefined;
export function readEnv(env: Record<string, string | undefined> | undefined): { ok: true; origin: string; base: string; token: string } | { ok: false; message: string };
export function makeContext(deps: Deps): Context | { ok: false; message: string };
export function fetchPaged(ctx: Context, set: string, query?: { select?: string[]; filter?: string; orderby?: string[] }): Promise<{ rows: Row[]; truncated: boolean }>;
export function readOmSubaccounts(ctx: Context): Promise<string[]>;
export function readSnapshot(ctx: Context, opts?: { project?: string }): Promise<Snapshot>;
export function parseManifest(text: string): { ids: string[]; bad: number };
export const defaultIo: Io;
export function runReport(o: Options, deps?: Deps): Promise<number>;
export function runApply(o: Options, deps?: Deps): Promise<number>;
export function main(argv: string[], deps?: Deps): Promise<number>;
