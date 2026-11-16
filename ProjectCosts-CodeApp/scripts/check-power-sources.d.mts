/** Types for `check-power-sources.mjs` (imported by `src/test/powerSources.test.ts`). */
export const BULK_ACTION_NAMES: string[];
export function bulkEnvironmentProblems(
  registered: ReadonlySet<string>,
  sources: Readonly<Record<string, { entitySetName?: string } | undefined>> | undefined,
): string[];
export function checkPowerSources(): { registered: number; problems: string[] };
