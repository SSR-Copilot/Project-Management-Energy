/**
 * Flow register and `invokeFlow` — unit tests.
 *
 * New prefix (UT-FLOW-nnn): the register had no test file at all, which is how two live
 * wrappers came to invoke action names that were not in it. `FLOW_REGISTER` is the
 * allow-list for `invokeFlow`, so the invariant worth pinning is not "these entries exist"
 * but "no wrapper can reach the transport with a name the register does not carry".
 *
 * Mock mode is the default under Vitest (`dataMode === "mock"`, see `platform/powerClient`),
 * so a registered wrapper resolves to `{ok: true, mock: true}` after the simulated latency
 * and never touches `dataClient.callAction`.
 */
import { describe, it, expect } from "vitest";
import * as flows from "./flowClient";
import {
  FLOW_REGISTER, resolveFlow, cancelGateApproval, cancelCheckListApproval,
  cancelModulePermission,
} from "./flowClient";
import { AppError } from "@/platform/errors";

const byName = (name: string) => FLOW_REGISTER.find((f) => f.name === name);

/** The message fragment the unregistered-name guard raises, and nothing else raises. */
const UNREGISTERED = "not in FLOW_REGISTER";

/* ════════════════════════════════════════════════════════════════ registration */

describe("UT-FLOW register", () => {
  it("UT-FLOW-001 the two cancel actions are registered as custom-API replacements", () => {
    for (const name of ["vsb_CancelGateApproval", "vsb_CancelCheckListApproval"]) {
      const d = byName(name);
      expect(d, `${name} must be in FLOW_REGISTER`).toBeDefined();
      expect(d!.disposition).toBe("customApi");
      // The reason has to say what it replaces — the register is read as documentation.
      expect(d!.reason).toMatch(/Cancellation/);
    }
  });

  it("UT-FLOW-002 vsb_CancelModulePermission is registered too", () => {
    // Found while fixing the two named in the brief: the module-permission cancel wrapper
    // had exactly the same defect and the same fix.
    const d = byName("vsb_CancelModulePermission");
    expect(d).toBeDefined();
    expect(d!.disposition).toBe("customApi");
    expect(d!.reason).toMatch(/Requestpermissioncancellation/);
  });

  it("UT-FLOW-003 the register carries no duplicate names", () => {
    const names = FLOW_REGISTER.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("UT-FLOW-004 every entry has a disposition and a non-empty reason", () => {
    const dispositions = ["keep", "customApi", "serverTriggered", "missing"];
    for (const d of FLOW_REGISTER) {
      expect(dispositions, d.name).toContain(d.disposition);
      expect(d.reason.length, d.name).toBeGreaterThan(0);
      expect(d.actions, d.name).toBeGreaterThanOrEqual(0);
    }
  });
});

/* ══════════════════════════════════════════════════════════ the unknown name */

describe("UT-FLOW unregistered names", () => {
  it("UT-FLOW-005 an unregistered action name is refused, not forwarded", () => {
    // The defect: `FLOW_REGISTER.find(...)` returned undefined, `d?.disposition` was not
    // "missing", and the call fell through to `dataClient.callAction` — `{ok: true}` in
    // mock mode, a raw Dataverse fault against a real environment.
    expect(() => resolveFlow("vsb_NotAThing")).toThrow(AppError);
    expect(() => resolveFlow("vsb_NotAThing")).toThrow(/not in FLOW_REGISTER/);
  });

  it("UT-FLOW-006 the refusal names the action and says what to do about it", () => {
    let caught: AppError | null = null;
    try {
      resolveFlow("PerformCommonRequestofGateApprovalCancellation"); // near-miss on a real name
    } catch (e) {
      caught = e as AppError;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect(caught!.message).toContain("PerformCommonRequestofGateApprovalCancellation");
    expect(caught!.message).toContain("Add it to the register");
    expect(caught!.source).toBe("PerformCommonRequestofGateApprovalCancellation");
  });

  it("UT-FLOW-007 a registered name resolves to its descriptor", () => {
    expect(resolveFlow("vsb_CancelGateApproval").disposition).toBe("customApi");
    expect(resolveFlow("ReportDevOpsBug").disposition).toBe("keep");
    expect(resolveFlow("SynchronizeStandardAssumptionCosts").disposition).toBe("missing");
  });

  it("UT-FLOW-008 a flow missing from the solution export still throws its own error", async () => {
    // The missing-flow guard is a *different* refusal and must not be swallowed by the new
    // unregistered-name one: the name IS registered, the definition is not shipped.
    await expect(flows.synchronizeStandardAssumptionCosts({})).rejects.toThrow(
      /not present in the solution export/,
    );
  });
});

/* ═══════════════════════════════════════════════════ every wrapper is covered */

describe("UT-FLOW wrapper coverage", () => {
  it("UT-FLOW-009 no exported wrapper invokes an unregistered action name", async () => {
    // The regression guard for the whole module: adding a wrapper whose action name is not
    // in the register fails here, not silently in production. `resolveFlow` is excluded
    // because it takes a name rather than a payload.
    const wrappers = Object.entries(flows).filter(
      ([name, value]) => typeof value === "function" && name !== "resolveFlow",
    ) as [string, (p: Record<string, unknown>) => Promise<unknown>][];

    expect(wrappers.length).toBeGreaterThan(8);

    const results = await Promise.all(
      wrappers.map(async ([name, fn]) => {
        try {
          await fn({});
          return { name, message: "" };
        } catch (e) {
          return { name, message: (e as Error).message };
        }
      }),
    );
    const offenders = results.filter((r) => r.message.includes(UNREGISTERED));
    expect(offenders.map((o) => o.name)).toEqual([]);
  });

  it("UT-FLOW-010 the two cancel wrappers now reach the transport instead of falling through", async () => {
    // Before the fix these resolved through the SAME `{ok: true}` mock path, so the only
    // observable difference is the register lookup — which UT-FLOW-001 pins — plus the fact
    // that they no longer raise the unregistered-name refusal.
    await expect(cancelGateApproval({ stateTrackingId: "t-1" }))
      .resolves.toMatchObject({ ok: true });
    await expect(cancelCheckListApproval({ checklistId: "c-1" }))
      .resolves.toMatchObject({ ok: true });
    await expect(cancelModulePermission({ permissionRequestId: "r-1" }))
      .resolves.toMatchObject({ ok: true });
  });
});
