/**
 * What the Team screen refreshes after a write (OPT-13).
 *
 * Before, every Save or Delete re-read everything under `["pmTeam", projectId]`: the project (and its two Entra lookups) and the
 * members. The screen writes only `vsb_projectmembers` (`planSaveMember`, `planDeleteMember`) and no flow or plugin is triggered
 * by that table (`hooks.ts` header, `04-flow-inventory.md`), so the project row cannot change. Now a write names only the
 * queries that READ the table it wrote.
 *
 * `TEAM_TABLE_READERS` is the one place a table is mapped to the queries that read it; `reload.test.ts` (UT-TEAM-OPT-2xx) proves
 * that every table a real plan writes has all its readers in the reload list, and that every query `hooks.ts` defines is mapped
 * (a query added later fails the suite until it is mapped here). Revert: put `qk.teamAll(projectId)` back in `teamReloadKeys`.
 */
import type { QueryKey } from "@tanstack/react-query";
import { ES } from "@/data/dataverseNames";
import { qk } from "@/data/keys";

/** The queries that read each table. The members query also joins the descriptions, so it reads that table too. */
export const TEAM_TABLE_READERS: Readonly<Record<string, (projectId: string) => readonly QueryKey[]>> = {
  [ES.projectMembers]: (id) => [qk.team(id, "members")],
  [ES.projectMemberDescriptions]: (id) => [qk.teamMemberDescriptions, qk.team(id, "members")],
  [ES.projects]: (id) => [qk.team(id, "project")],
};

/** The tables a Team save or delete writes (the plans' own `entitySet`s). */
export const TEAM_WRITE_TABLES: readonly string[] = [ES.projectMembers];

/** The keys refreshed after a Team write: the readers of every table it writes, without duplicates. */
export function teamReloadKeys(projectId: string | undefined): readonly QueryKey[] {
  const id = projectId ?? "";
  const seen = new Set<string>();
  return TEAM_WRITE_TABLES.flatMap((table) => TEAM_TABLE_READERS[table]!(id)).filter((key) => {
    const text = JSON.stringify(key);
    if (seen.has(text)) return false;
    seen.add(text);
    return true;
  });
}
