/**
 * The gap where `DataSourceInfo` and `RecordInfo` used to be.
 *
 * The canvas app greyed out commands from the platform's own answer:
 *
 *   ItemEnabled: DataSourceInfo('BoP Projects Contracts', DataSourceInfo.CreatePermission)
 *   ItemEnabled: And(Not(IsBlank(rec)), RecordInfo(rec, RecordInfo.EditPermission))
 *
 * `@microsoft/power-apps` 1.3.1 has NO equivalent. `DataClient` exposes CRUD plus
 * `executeAsync`, and `executeAsync` accepts only two Dataverse request shapes —
 * `getEntityMetadata` and `customapi`. `RetrievePrincipalAccess` is a Web API *function*
 * (GET with parameters), so it is not reachable through the `customapi` action path, and
 * table metadata describes what privileges EXIST, not which ones the caller holds.
 *
 * So this module is a seam, not an implementation of the canvas semantics. It ships the
 * honest option and leaves the other two one file away:
 *
 *   (a) OPTIMISTIC (here, `serverEnforcedProvider`) — commands are enabled, the server is
 *       the only authority, and a 403 becomes a clear message instead of a dead button.
 *       Nothing can be wrongly *allowed*: Dataverse still refuses. What is lost is the
 *       pre-emptive greying, so a user without rights learns on click rather than on sight.
 *   (b) A role→table matrix held in the app, read at bootstrap from the caller's security
 *       roles. Fast and pre-emptive, but the app then holds a second opinion about security
 *       that can drift from the server's.
 *   (c) A Dataverse Custom API that returns the caller's effective privileges, invoked
 *       through `executeAsync({ dataverseRequest: { action: "customapi", ... } })`. Correct
 *       and pre-emptive, but it is a solution component someone has to deploy.
 *
 * This is on the open-decision list. Whichever is chosen, `PrivilegeProvider` is the only
 * thing that changes.
 */
import { DataError } from "./errors";

export interface TablePrivileges {
  canRead: boolean;
  canCreate: boolean;
  canWrite: boolean;
  canDelete: boolean;
}

export const ALLOW_ALL: TablePrivileges = {
  canRead: true, canCreate: true, canWrite: true, canDelete: true,
};

export const DENY_ALL: TablePrivileges = {
  canRead: false, canCreate: false, canWrite: false, canDelete: false,
};

export interface PrivilegeProvider {
  /** Table-level, by entity set name. */
  forTable(entitySet: string): TablePrivileges;
  /** Record-level. The canvas `RecordInfo(record, EditPermission)`. */
  forRecord(entitySet: string, recordId: string): TablePrivileges;
}

/**
 * Option (a). Every command is offered; Dataverse decides.
 *
 * The important half of this strategy is not here — it is that every mutation goes through
 * `unwrap`, so a refusal surfaces as a `DataError` with `isForbidden` true and the UI can say
 * "you do not have permission to do this" rather than failing silently. The canvas app, by
 * contrast, wrapped only two of its mutation paths in `IfError`.
 */
export const serverEnforcedProvider: PrivilegeProvider = {
  forTable: () => ALLOW_ALL,
  forRecord: () => ALLOW_ALL,
};

/** Turns a caught error into the message a user should see for a refused action. */
export function permissionMessage(error: unknown, action: string): string | undefined {
  if (error instanceof DataError && error.isForbidden) {
    return `You do not have permission to ${action}. Ask your administrator if you believe you should.`;
  }
  return undefined;
}
