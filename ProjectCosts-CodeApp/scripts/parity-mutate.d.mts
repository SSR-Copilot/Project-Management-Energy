/** Types for `parity-mutate.mjs` (imported by `src/test/parityMutate.test.ts`). */
export interface Mutation { id: string; layer: string; file: string; find: string; replace: string; expectKey: string }
export interface MutationState {
  screen: string;
  appliedAt: string;
  mutations: { id: string; layer: string; file: string; expectKey: string }[];
  files: { file: string; originalSha256: string; mutatedSha256: string; original: string }[];
}
export const STATE_FILE: string;
export function gitDirty(root: string, rel: string): boolean;
export function readState(root?: string): MutationState | null;
export function loadMutations(screen: string | undefined, root?: string): Mutation[];
export function apply(opts: { screen: string | undefined; root?: string; isDirty?: (rel: string) => boolean; now?: () => string; dryRun?: boolean }): {
  applied: { id: string; file: string }[];
  planned?: { id: string; file: string }[];
};
export function revert(opts?: { root?: string; screen?: string }): { restored: string[]; screen: string | null };
export function status(opts?: { root?: string }): null | {
  screen: string; appliedAt: string; mutations: MutationState["mutations"];
  files: { file: string; state: "mutated" | "original" | "changed" }[];
};
export function check(opts: { screen: string; runDir: string; baselineDir?: string; root?: string }): {
  results: { id: string; layer: string; found: boolean; keys: string[] }[];
  missed: string[];
  warnings: string[];
};
