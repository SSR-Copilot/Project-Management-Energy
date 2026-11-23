/**
 * UT-OWNER-001.. — D158: a create on a project-scoped table without the owning-business-unit bind is refused before anything is sent
 * (CONVENTIONS rule 4). The guard is a pure check on the plan plus one call in `executePlan`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@microsoft/power-apps/data", () => ({ getClient: vi.fn() }));
vi.mock("../../.power/schemas/appschemas/dataSourcesInfo", () => ({ dataSourcesInfo: { vsb_things: { primaryKey: "vsb_thingid" } } }));

import { bindsToProject, hasOwnerBind, ownerBindProblem, setOwnerBindGuard } from "./ownerBindGuard";
import { PlanRefusedError, executePlan } from "./executePlan";
import { createMany, type PlannedWrite, type WritePlan } from "./writePlan";
import { OWNING_BU_BIND } from "./odata";

const PROJECT = "11111111-1111-1111-1111-111111111111";
const BU = "22222222-2222-2222-2222-222222222222";
const projectBind = { "vsb_project@odata.bind": `/vsb_projects(${PROJECT})` };
const ownerBind = { [OWNING_BU_BIND]: `/businessunits(${BU})` };
const create = (data: Record<string, unknown>, reason = "Contract created"): PlannedWrite => ({ op: "create", entitySet: "vsb_things", data, reason });

afterEach(() => { setOwnerBindGuard(null); });

describe("which creates the guard looks at", () => {
  it("UT-OWNER-001 a create that binds a project is project-scoped; one that does not (an admin row, the project itself) is not", () => {
    expect(bindsToProject(projectBind)).toBe(true);
    expect(bindsToProject({ "VSB_Project@OData.Bind": `/VSB_PROJECTS(${PROJECT})` })).toBe(true);
    expect(bindsToProject({ vsb_name: "x", "vsb_country@odata.bind": "/vsb_countries(1)" })).toBe(false);
    expect(bindsToProject(undefined)).toBe(false);
  });

  it("UT-OWNER-002 only the lower-case owning-business-unit key with a value counts as the bind", () => {
    expect(hasOwnerBind(ownerBind)).toBe(true);
    expect(hasOwnerBind({ "OwningBusinessUnit@odata.bind": `/businessunits(${BU})` })).toBe(false);
    expect(hasOwnerBind({ [OWNING_BU_BIND]: "" })).toBe(false);
    expect(hasOwnerBind({})).toBe(false);
  });
});

describe("ownerBindProblem", () => {
  it("UT-OWNER-003 a project-scoped create with the bind passes; without it the plan has a problem naming the write", () => {
    expect(ownerBindProblem([create({ ...projectBind, ...ownerBind })])).toBeNull();
    const problem = ownerBindProblem([create({ ...projectBind }, "Hedge volume 2031 created")]);
    expect(problem).toContain("Nothing was saved");
    expect(problem).toContain("Hedge volume 2031 created");
  });

  it("UT-OWNER-004 a create that is not project-scoped, an update and a delete are never touched", () => {
    expect(ownerBindProblem([
      create({ vsb_name: "admin row" }),
      { op: "update", entitySet: "vsb_things", id: "x", data: { ...projectBind }, reason: "u" },
      { op: "delete", entitySet: "vsb_things", id: "x", reason: "d" },
    ])).toBeNull();
  });

  it("UT-OWNER-005 the rows of a bulk create are checked one by one", () => {
    const ok = createMany("vsb_things", [{ id: "a", data: { ...projectBind, ...ownerBind } }], "two rows");
    const bad = createMany("vsb_things", [{ id: "a", data: { ...projectBind, ...ownerBind } }, { id: "b", data: { ...projectBind } }], "two rows");
    expect(ownerBindProblem([ok])).toBeNull();
    expect(ownerBindProblem([bad])).toContain("two rows");
  });
});

describe("executePlan", () => {
  const plan = (data: Record<string, unknown>): WritePlan => ({ writes: [create(data)], log: [] });
  const client = () => {
    const createRecordAsync = vi.fn(async () => ({ success: true, data: { vsb_thingid: "new-1" } }));
    return { createRecordAsync, updateRecordAsync: vi.fn(), deleteRecordAsync: vi.fn() };
  };

  it("UT-OWNER-006 a project-scoped create without the owner bind is refused and NOTHING is sent", async () => {
    const c = client();
    await expect(executePlan(plan({ ...projectBind }), "test", c as never)).rejects.toBeInstanceOf(PlanRefusedError);
    expect(c.createRecordAsync).not.toHaveBeenCalled();
  });

  it("UT-OWNER-007 the same create WITH the bind goes out", async () => {
    const c = client();
    await executePlan(plan({ ...projectBind, ...ownerBind }), "test", c as never);
    expect(c.createRecordAsync).toHaveBeenCalledTimes(1);
  });

  it("UT-OWNER-008 one bad create refuses the whole plan, so a plan's earlier valid creates are not sent either", async () => {
    const c = client();
    const mixed: WritePlan = { writes: [create({ ...projectBind, ...ownerBind }, "first"), create({ ...projectBind }, "second")], log: [] };
    await expect(executePlan(mixed, "test", c as never)).rejects.toBeInstanceOf(PlanRefusedError);
    expect(c.createRecordAsync).not.toHaveBeenCalled();
  });

  it("UT-OWNER-009 with the switch off the create goes out without the bind, as before D158", async () => {
    setOwnerBindGuard({ refuseCreateWithoutOwner: false });
    const c = client();
    await executePlan(plan({ ...projectBind }), "test", c as never);
    expect(c.createRecordAsync).toHaveBeenCalledTimes(1);
  });
});
