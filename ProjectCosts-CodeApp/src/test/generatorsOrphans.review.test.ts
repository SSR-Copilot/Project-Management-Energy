/**
 * UT-ORPH-100.. — review package F3 item 7 of `scripts/generators-orphans.mjs`: fail-closed classification (a missing lookup
 * column is not an orphan), `redirect: "error"`, `If-Match` on the DELETE (412 = changed since check) and the B7 child check.
 * Offline, with an injected fetch; every id and URL is a made-up placeholder.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLASS_IDS, classify, main, parseArgs, rowInClass, rowUnreadable, runApply, runReport,
  type Deps, type FetchLike, type Row, type Snapshot,
} from "../../scripts/generators-orphans.mjs";

const ORG = `${"https"}://org.placeholder.invalid`;
const TOKEN = `CANARY-${"T0KEN"}-review`;
const gid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const res = (status: number, body?: unknown): Awaited<ReturnType<FetchLike>> => ({ status, headers: { get: () => null }, json: async () => body });
const setOf = (url: string): string => new URL(url.split("(")[0] ?? url).pathname.replace(/\/$/, "").split("/").pop() ?? "";
const etagOf = (n: number): string => `W/"${n}"`;

interface Call { method: string; url: string; headers: Record<string, string>; redirect?: string }

function rig(handler: FetchLike, files: Record<string, string> = {}) {
  const calls: Call[] = [];
  const logs: string[] = [];
  const errs: string[] = [];
  const written: string[] = [];
  const store = new Map(Object.entries(files).map(([k, v]) => [path.resolve(k), v]));
  const deps: Deps = {
    env: { DATAVERSE_URL: ORG, DATAVERSE_TOKEN: TOKEN },
    now: () => new Date("2026-11-16T10:00:00.000Z"),
    sleep: async () => undefined,
    log: (l) => logs.push(l),
    err: (l) => errs.push(l),
    io: {
      readFile: (p) => { const v = store.get(path.resolve(p)); if (v === undefined) throw new Error("ENOENT"); return v; },
      writeFile: (p, c) => { written.push(p); store.set(path.resolve(p), c); },
      mkdirp: () => undefined,
      tmpdir: () => path.join(path.sep, "fake-tmp"),
    },
    fetchImpl: async (url, init) => {
      calls.push({ method: init.method, url, headers: init.headers, redirect: init.redirect });
      return handler(url, init);
    },
  };
  return { deps, calls, logs, errs, written };
}

const manifest = (ids: string[]) => ({ "/m/ids.txt": `${ids.join("\n")}\n` });
const argsFor = (cls: string, extra: string[] = []) => parseArgs(["--apply", "--class", cls, "--manifest", "/m/ids.txt", "--yes-delete", "--out", "/o", ...extra]);

interface TableOpts { children?: Record<string, { turbines?: boolean; bridges?: boolean }>; childStatus?: number; changed?: Set<string> }

/** A one-table in-memory Dataverse: rows by id with an optional etag; DELETE honours If-Match like Dataverse (412 on a mismatch). */
function table(set: string, idCol: string, rows: Row[], opts: TableOpts = {}) {
  const store = new Map(rows.map((r) => [String(r[idCol]), r]));
  const handler: FetchLike = async (url, init) => {
    const s = setOf(url);
    if (s === "vsb_generatorinprojects" || s === "vsb_devicetypesinprojects") {
      if (opts.childStatus) return res(opts.childStatus, {});
      const type = decodeURIComponent(url).match(/eq ([0-9a-f-]{36})/)?.[1] ?? "";
      const kids = opts.children?.[type];
      const has = s === "vsb_generatorinprojects" ? kids?.turbines : kids?.bridges;
      return res(200, { value: has ? [{ id: "child" }] : [] });
    }
    if (s !== set) return res(400, {});
    const id = /\(([^)]+)\)$/.exec(url)?.[1] ?? "";
    if (init.method === "GET") return store.has(id) ? res(200, store.get(id)) : res(404, {});
    if (init.method === "DELETE") {
      if (!store.has(id)) return res(404, {});
      const wanted = init.headers["If-Match"];
      const etag = store.get(id)?.["@odata.etag"];
      if (opts.changed?.has(id) || (wanted !== undefined && wanted !== etag)) return res(412, {});
      store.delete(id);
      return res(204);
    }
    return res(405, {});
  };
  return { handler, store };
}

const ALLOC = "vsb_landleaseallocationwtgs";
const ALLOC_ID = "vsb_landleaseallocationwtgid";
const alloc = (n: number, extra: Row = {}): Row => ({
  [ALLOC_ID]: gid(n), vsb_name: `a${n}`, _vsb_projectcost_value: gid(50), _vsb_generatorinproject_value: null, ...extra,
});

describe("UT-ORPH F3 item 7a: fail-closed classification", () => {
  it("UT-ORPH-100 rowInClass: a lookup column that is MISSING is not null, for every deletable class", () => {
    const om = new Set([gid(9)]);
    const full: Record<string, Row> = {
      B1: { _vsb_generatorinproject_value: null, _vsb_projectcost_value: gid(1) },
      B2: { _vsb_projectcost_value: null, _vsb_generatorinproject_value: gid(1) },
      B3: { _vsb_devicetypeinproject_value: null, _vsb_subaccount_value: gid(9) },
      B5: { _vsb_typeinprojectid_value: null },
      B6: { _vsb_moduletypeinprojectid_value: null },
      B7: { _vsb_generator_value: null, _vsb_project_value: gid(1) },
    };
    // The columns each class predicate needs (the others in the rows above are context only).
    const needs: Record<string, string[]> = {
      B1: ["_vsb_generatorinproject_value"], B2: ["_vsb_projectcost_value"],
      B3: ["_vsb_devicetypeinproject_value", "_vsb_subaccount_value"], B5: ["_vsb_typeinprojectid_value"],
      B6: ["_vsb_moduletypeinprojectid_value"], B7: ["_vsb_generator_value", "_vsb_project_value"],
    };
    for (const [cls, row] of Object.entries(full)) {
      expect(rowInClass(cls, row, om), `${cls} present and null`).toBe(true);
      for (const key of needs[cls] ?? []) {
        const without = Object.fromEntries(Object.entries(row).filter(([k]) => k !== key));
        expect(rowInClass(cls, without, om), `${cls} without ${key}`).toBe(false);
        expect(rowUnreadable(cls, without), `${cls} unreadable without ${key}`).toBe(true);
      }
      expect(rowUnreadable(cls, row)).toBe(false);
    }
  });

  it("UT-ORPH-101 B7 needs BOTH columns readable: one null column next to a missing one is not enough", () => {
    expect(rowInClass("B7", { _vsb_generator_value: null }, undefined)).toBe(false);
    expect(rowInClass("B7", { _vsb_project_value: null }, undefined)).toBe(false);
    expect(rowInClass("B7", { _vsb_generator_value: gid(1), _vsb_project_value: null }, undefined)).toBe(true);
  });

  it("UT-ORPH-102 classify counts unreadable rows per class and never lists them", () => {
    const snap: Snapshot = { B1: [{ [ALLOC_ID]: gid(1), vsb_name: "x" }, alloc(2)], B7: [{ vsb_generatortypeinprojectid: gid(3), _vsb_generator_value: null }] };
    const out = classify(snap);
    expect(out.counts.B1).toBe(1);
    expect(out.counts.B7).toBe(0);
    expect(out.details.unreadable).toMatchObject({ B1: 1, B7: 1, B2: 0 });
    expect(Object.keys(out.details.unreadable).sort()).toEqual(["B1", "B2", "B3", "B5", "B6", "B7"]);
    expect(CLASS_IDS).toContain("B1");
  });

  it("UT-ORPH-103 the report prints the unreadable count (counts only) and writes it to summary.json", async () => {
    const r = rig(async () => res(200, {}), { "/in/snap.json": JSON.stringify({ B1: [{ [ALLOC_ID]: gid(1) }, alloc(2)] }) });
    expect(await runReport(parseArgs(["--input", "/in/snap.json", "--out", "/o"]), r.deps)).toBe(0);
    expect(r.logs.join("\n")).toMatch(/unreadable .*: 1 \(B1 1\)/);
    expect(r.logs.join("\n")).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(r.calls).toHaveLength(0);
  });

  it("UT-ORPH-104 apply refuses a manifest row that lacks the column, says so, and deletes nothing", async () => {
    const srv = table(ALLOC, ALLOC_ID, [{ [ALLOC_ID]: gid(1), vsb_name: "no lookup column" }]);
    const r = rig(srv.handler, manifest([gid(1)]));
    expect(await runApply(argsFor("B1"), r.deps)).toBe(2);
    expect(r.errs.join()).toMatch(/1 manifest id\(s\) are not currently in class B1 \(1 of them unreadable/);
    expect(r.calls.some((c) => c.method === "DELETE")).toBe(false);
    expect(srv.store.size).toBe(1);
  });
});

describe("UT-ORPH F3 item 7b: redirect is refused", () => {
  it("UT-ORPH-105 every request, in a report and in an apply, is sent with redirect: error", async () => {
    const srv = table(ALLOC, ALLOC_ID, [alloc(1, { "@odata.etag": etagOf(1) })]);
    const a = rig(srv.handler, manifest([gid(1)]));
    expect(await runApply(argsFor("B1"), a.deps)).toBe(0);
    expect(a.calls.length).toBeGreaterThan(2);
    for (const c of a.calls) expect(c.redirect, `${c.method} ${c.url}`).toBe("error");
    const rep = rig(async () => res(200, { value: [] }));
    expect(await main(["--out", "/o"], rep.deps)).toBe(0);
    expect(rep.calls.length).toBeGreaterThan(5);
    for (const c of rep.calls) expect(c.redirect).toBe("error");
  });

  it("UT-ORPH-106 a refused redirect (fetch throws) is reported without the token or the URL", async () => {
    const rep = rig(async () => { throw Object.assign(new TypeError(`redirect mode is set to error: ${ORG}/x`), { name: "TypeError" }); });
    expect(await main(["--out", "/o"], rep.deps)).toBe(1);
    expect([...rep.logs, ...rep.errs].join("\n")).not.toContain(TOKEN);
    expect([...rep.logs, ...rep.errs].join("\n")).not.toContain("placeholder.invalid");
  });
});

describe("UT-ORPH F3 item 7c: If-Match on the DELETE", () => {
  it("UT-ORPH-107 the DELETE sends If-Match with the etag of the read-back; the GETs send none", async () => {
    const srv = table(ALLOC, ALLOC_ID, [alloc(1, { "@odata.etag": etagOf(11) }), alloc(2, { "@odata.etag": etagOf(22) })]);
    const r = rig(srv.handler, manifest([gid(1), gid(2)]));
    expect(await runApply(argsFor("B1"), r.deps)).toBe(0);
    const deletes = r.calls.filter((c) => c.method === "DELETE");
    expect(deletes).toHaveLength(2);
    expect(deletes.find((c) => c.url.includes(gid(1)))?.headers["If-Match"]).toBe(etagOf(11));
    expect(deletes.find((c) => c.url.includes(gid(2)))?.headers["If-Match"]).toBe(etagOf(22));
    expect(r.calls.filter((c) => c.method === "GET").every((c) => !("If-Match" in c.headers))).toBe(true);
    expect(srv.store.size).toBe(0);
  });

  it("UT-ORPH-108 a 412 means the row changed after the check: not deleted, counted as changed since check, others still go, exit 1", async () => {
    const srv = table(ALLOC, ALLOC_ID, [alloc(1, { "@odata.etag": etagOf(11) }), alloc(2, { "@odata.etag": etagOf(22) })], { changed: new Set([gid(1)]) });
    const r = rig(srv.handler, manifest([gid(1), gid(2)]));
    expect(await runApply(argsFor("B1"), r.deps)).toBe(1);
    expect(srv.store.has(gid(1))).toBe(true);
    expect(srv.store.has(gid(2))).toBe(false);
    expect(r.logs.join("\n")).toMatch(/deleted 1, already gone 0, delete errors 0, still present after read-back 0, changed since check 1/);
    expect(r.calls.filter((c) => c.method === "DELETE")).toHaveLength(2);
  });

  it("UT-ORPH-109 a row read back without an etag is deleted WITHOUT the header", async () => {
    const srv = table(ALLOC, ALLOC_ID, [alloc(1)]);
    const r = rig(srv.handler, manifest([gid(1)]));
    expect(await runApply(argsFor("B1"), r.deps)).toBe(0);
    const del = r.calls.find((c) => c.method === "DELETE");
    expect(del).toBeDefined();
    expect("If-Match" in (del?.headers ?? {})).toBe(false);
    expect(srv.store.size).toBe(0);
  });

  it("UT-ORPH-110 the changed row is not read back as 'still present' a second time (no double count)", async () => {
    const srv = table(ALLOC, ALLOC_ID, [alloc(1, { "@odata.etag": etagOf(1) })], { changed: new Set([gid(1)]) });
    const r = rig(srv.handler, manifest([gid(1)]));
    expect(await runApply(argsFor("B1"), r.deps)).toBe(1);
    expect(r.logs.join("\n")).toMatch(/still present after read-back 0, changed since check 1/);
  });
});

describe("UT-ORPH F3 item 7d: B7 refuses a type that still has children", () => {
  const SET = "vsb_generatortypeinprojects";
  const ID = "vsb_generatortypeinprojectid";
  const phantom = (n: number): Row => ({ [ID]: gid(n), vsb_name: `t${n}`, _vsb_generator_value: null, _vsb_project_value: gid(1), "@odata.etag": etagOf(n) });

  it("UT-ORPH-111 a type with turbines or with bridge rows is skipped; a childless one is deleted; exit 1 and the count says so", async () => {
    const srv = table(SET, ID, [phantom(1), phantom(2), phantom(3)], { children: { [gid(1)]: { turbines: true }, [gid(2)]: { bridges: true } } });
    const r = rig(srv.handler, manifest([gid(1), gid(2), gid(3)]));
    expect(await runApply(argsFor("B7"), r.deps)).toBe(1);
    expect([...srv.store.keys()].sort()).toEqual([gid(1), gid(2)]);
    expect(r.logs.join("\n")).toMatch(/deleted 1, .*2 has children, skipped/);
    const probes = r.calls.filter((c) => setOf(c.url) !== SET);
    expect(probes.some((c) => setOf(c.url) === "vsb_generatorinprojects" && decodeURIComponent(c.url).includes(`_vsb_moduletypeinprojectid_value eq ${gid(3)}`))).toBe(true);
    expect(probes.some((c) => setOf(c.url) === "vsb_devicetypesinprojects" && decodeURIComponent(c.url).includes(`_vsb_typeinprojectid_value eq ${gid(3)}`))).toBe(true);
    expect(probes.every((c) => c.method === "GET" && c.url.includes("$top=1"))).toBe(true);
  });

  it("UT-ORPH-112 only types with children: nothing is deleted, no backup, exit 1", async () => {
    const srv = table(SET, ID, [phantom(1)], { children: { [gid(1)]: { turbines: true } } });
    const r = rig(srv.handler, manifest([gid(1)]));
    expect(await runApply(argsFor("B7"), r.deps)).toBe(1);
    expect(r.calls.some((c) => c.method === "DELETE")).toBe(false);
    expect(r.written).toHaveLength(0);
    expect(srv.store.size).toBe(1);
  });

  it("UT-ORPH-113 a failed child read refuses the run (fail-closed): nothing deleted, exit 1", async () => {
    const srv = table(SET, ID, [phantom(1)], { childStatus: 500 });
    const r = rig(srv.handler, manifest([gid(1)]));
    expect(await runApply(argsFor("B7"), r.deps)).toBe(1);
    expect(r.errs.join()).toMatch(/children of 1 type\(s\) failed\. Nothing was deleted/);
    expect(r.calls.some((c) => c.method === "DELETE")).toBe(false);
    expect(srv.store.size).toBe(1);
  });

  it("UT-ORPH-114 --dry-run reports the types with children as skipped and still sends only GETs", async () => {
    const srv = table(SET, ID, [phantom(1), phantom(2)], { children: { [gid(1)]: { bridges: true } } });
    const r = rig(srv.handler, manifest([gid(1), gid(2)]));
    expect(await runApply(parseArgs(["--apply", "--dry-run", "--class", "B7", "--manifest", "/m/ids.txt"]), r.deps)).toBe(0);
    expect(r.logs.join("\n")).toMatch(/1 row\(s\) would be deleted .*1 has children, skipped/);
    expect(r.calls.every((c) => c.method === "GET")).toBe(true);
    expect(srv.store.size).toBe(2);
  });

  it("UT-ORPH-115 the child check runs for B7 only: another class sends no probe", async () => {
    const srv = table(ALLOC, ALLOC_ID, [alloc(1)]);
    const r = rig(srv.handler, manifest([gid(1)]));
    await runApply(argsFor("B1"), r.deps);
    expect(r.calls.every((c) => setOf(c.url) === ALLOC)).toBe(true);
  });
});
