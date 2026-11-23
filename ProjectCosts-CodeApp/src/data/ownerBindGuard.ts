/**
 * D158 — the owning-business-unit guard (CONVENTIONS rule 4).
 *
 * Every create on a project-scoped table must write `owningbusinessunit@odata.bind`. Omitting it never errors: the row is owned by
 * whoever saved it, and a colleague in another business unit later sees a grid that is quietly short. That is the worst shape a
 * defect can have, and the bind was written by about eight separate pieces of code, each returning `{}` when the project's
 * business unit was blank, so one forgotten `$select` of the column, or one drifted key, dropped it with no error anywhere.
 *
 * `ownerBindProblem` is the one check, made on the whole plan BEFORE anything is sent (`executePlan`): a create whose data binds the
 * row to a project (`<lookup>@odata.bind: /vsb_projects(<id>)`) and carries no owning-business-unit bind refuses the plan, and
 * nothing is saved. It applies to single creates and to the rows of a bulk create. The Generators screen (F6) and the bulk backend
 * already refuse in this case; this makes every screen do the same.
 *
 * A table that is not project-scoped (an admin table, the project itself) never binds `/vsb_projects(` and is not touched.
 * Switch: `OWNER_BIND_GUARD.refuseCreateWithoutOwner`; `false` is the old behaviour (the create goes out without the bind).
 */
import { ES } from "./dataverseNames";
import { OWNING_BU_BIND } from "./odata";
import type { PlannedWrite } from "./writePlan";

export interface OwnerBindGuardFlags {
  refuseCreateWithoutOwner: boolean;
}

export const OWNER_BIND_GUARD: Readonly<OwnerBindGuardFlags> = { refuseCreateWithoutOwner: true };

let override: Partial<OwnerBindGuardFlags> | null = null;

/** The switch in force: the shipped value, then the override a test installed. */
export const ownerBindGuard = (): Readonly<OwnerBindGuardFlags> => ({ ...OWNER_BIND_GUARD, ...override });

/** Test seam: replaces the switch for the rest of the run; `null` restores the shipped value. */
export function setOwnerBindGuard(next: Partial<OwnerBindGuardFlags> | null): void {
  override = next;
}

const PROJECT_BIND_VALUE = new RegExp(`^/${ES.projects}\\(`, "i");

/** Whether a create's data binds the row to a project, i.e. whether the table is project-scoped. */
export function bindsToProject(data: Readonly<Record<string, unknown>> | undefined): boolean {
  if (!data) return false;
  return Object.entries(data).some(([key, value]) =>
    key.toLowerCase().endsWith("@odata.bind") && typeof value === "string" && PROJECT_BIND_VALUE.test(value));
}

/** Whether a create's data carries the owning-business-unit bind with a value (the key is lower case, odata.ts). */
export function hasOwnerBind(data: Readonly<Record<string, unknown>> | undefined): boolean {
  const v = data?.[OWNING_BU_BIND];
  return typeof v === "string" && v.length > 0;
}

/** The first create of the plan that is project-scoped and has no owner bind, or null. Pure. */
export function ownerBindProblem(writes: readonly PlannedWrite[]): string | null {
  for (const w of writes) {
    if (w.op === "create") {
      if (bindsToProject(w.data) && !hasOwnerBind(w.data)) return message(w);
    } else if (w.op === "createMany") {
      if ((w.rows ?? []).some((r) => bindsToProject(r.data as Record<string, unknown>) && !hasOwnerBind(r.data as Record<string, unknown>))) {
        return message(w);
      }
    }
  }
  return null;
}

const message = (w: PlannedWrite): string =>
  `Nothing was saved: “${w.reason}” would create a row without an owning business unit, and colleagues in other business units would not see it. `
  + "This project has no business unit on record; ask an administrator to check it.";
