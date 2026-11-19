/**
 * UT-CHKPERF-040.. — A1 (D138): `rowApprovalIn` over indexes built ONCE gives exactly what `rowApproval` gave
 * (the per-row rebuild it replaces is kept as the oracle).
 */
import { describe, expect, it } from "vitest";
import { CHOICE_PROCESS } from "@/data/dataverseNames";
import {
  approvalIndexes, approvalSettingIndex, rowApproval, rowApprovalIn, type ChecklistApprovalSetting, type ChecklistRow,
} from "./rules";

const MODE = CHOICE_PROCESS.approvalMode;
const setting = (i: number, over: Partial<ChecklistApprovalSetting> = {}): ChecklistApprovalSetting => ({
  id: `a-${i}`, projectDefaultChecklistId: `TPL-${i % 7}`, approvalMode: i % 2 ? MODE.onlyNotifications : MODE.formalApproval,
  gateActive: i % 3 !== 0, portfolioManagerMail: null, defaultApprovers: null, defaultContributors: null, defaultNotifications: null, ...over,
});
const row = (i: number, over: Partial<ChecklistRow> = {}): ChecklistRow => ({
  id: `r-${i}`, title: `T${i}`, clusterStateId: "s", gateRelevance: false, holdingDescription: null, isCompletionDate: false,
  completionDate: null, taskState: null, approvalChecklistState: null, note: null, sort: i,
  projectDefaultChecklistId: i % 11 === 10 ? null : `tpl-${i % 9}`, flowRunId: null, flowApprovalId: null, ...over,
});

/** The code before D138, verbatim: both maps rebuilt for the row. */
const oracle = (settings: ChecklistApprovalSetting[], r: ChecklistRow) => {
  const idx = (s: ChecklistApprovalSetting[], active: boolean) => approvalSettingIndex(s, active);
  const first = r.projectDefaultChecklistId ? idx(settings, false).get(r.projectDefaultChecklistId.toLowerCase()) ?? null : null;
  const active = r.projectDefaultChecklistId ? idx(settings, true).get(r.projectDefaultChecklistId.toLowerCase()) ?? null : null;
  return { first, active };
};

describe("rowApprovalIn (A1)", () => {
  it("UT-CHKPERF-040 gives the same answer as rowApproval and as the per-row rebuild for 60 rows x 30 settings (first match wins, case-insensitive, inactive first rows)", () => {
    const settings = Array.from({ length: 30 }, (_, i) => setting(i));
    const ix = approvalIndexes(settings);
    for (let i = 0; i < 60; i += 1) {
      const r = row(i);
      const viaIndex = rowApprovalIn(ix, r);
      expect(viaIndex).toEqual(rowApproval(settings, r));
      expect({ first: viaIndex.first, active: viaIndex.active }).toEqual(oracle(settings, r));
    }
  });

  it("UT-CHKPERF-041 no settings: nothing found, the row still gets its caption", () => {
    const r = row(1);
    expect(rowApprovalIn(approvalIndexes([]), r)).toEqual(rowApproval([], r));
    expect(rowApprovalIn(approvalIndexes([]), r).first).toBeNull();
  });
});
