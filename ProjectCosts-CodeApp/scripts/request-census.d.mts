/** Types for `request-census.mjs` (imported by `src/test/requestCensus.test.ts`). */
export interface CensusEntry {
  seq: number;
  scenario: string;
  type: "http" | "data" | "action" | "retry" | "note" | "error";
  t?: number;
  level?: string;
  slow: boolean;
  ids: string[];
  [field: string]: unknown;
}
export interface ParsedCapture { entries: CensusEntry[]; ignored: number; scenarios: string[] }
export interface CensusSummary {
  scenario: string;
  lines: number;
  requests: {
    http: number;
    byMethod: Record<string, number>;
    byStatus: Record<string, number>;
    readsByTable: Record<string, number>;
    data: { lines: number; byKind: Record<string, { lines: number; calls: number; rows: number; failed: number }> };
    actionSummaries: number;
    actionRequestsReported: number;
  };
  duplicates: {
    http: { extra: number; top: Array<Record<string, unknown>> };
    data: { extra: number; top: Array<Record<string, unknown>> };
  };
  waves: { method: "timestamps" | "elapsed-estimate" | "none"; scenario?: number; maxPerAction?: number; sumPerAction?: number; note?: string };
  ms: { total: number; average: number; p95: number; max: number };
  slow: { http: number; data: number; action: number };
  throttled429: number;
  serverErrors5xx: number;
  clientErrors4xx: number;
  retries: { lines: number; byStatus: Record<string, number>; waitMs: number };
  errorLines: { count: number; byStatus: Record<string, number> };
  actions: Array<Record<string, unknown>>;
}
export const DEFAULT_SCENARIO: string;
export function parseVsbLines(text: string): ParsedCapture;
export function summarise(parsed: ParsedCapture, opts?: { scenario?: string }): CensusSummary;
export function summariseAll(parsed: ParsedCapture, names?: string[]): CensusSummary[];
export function percentile(values: number[], p: number): number;
export function chainDepth(items: Array<{ start: number; end: number }>, toleranceMs?: number): number;
export function toMarkdown(summaries: CensusSummary[], ignored?: number): string;
