/**
 * UT-ORPH — the Generators orphan report and guarded clean-up script (`scripts/generators-orphans.mjs`, DEL-8 of
 * `ProjectDocs/app-docs/GENERATORS-DELETE-HARDENING-PLAN.md`).
 *
 * Fully offline: the script is driven with an injected fetch (a small in-memory Dataverse), clock, file system and console.
 * Every URL, token and id below is a made-up placeholder; nothing here talks to a real system.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  APPLY_CLASSES, CLASSES, CLASS_IDS, DELETE_CONCURRENCY, MAX_PAGES, applyProblems, classify, csvCell, fetchPaged, isGuid,
  main, makeContext, parseArgs, parseManifest, retryAfterMs, runApply, runReport, toCsv,
  type ClassId, type Deps, type FetchLike, type Row, type Snapshot,
} from "../../scripts/generators-orphans.mjs";
import { ES, ES_PLANT } from "@/data/dataverseNames";

/* ───────────────────────────────────────────────────────────── fixtures ── */

const ORG = `${"https"}://org.placeholder.invalid`;
const TOKEN = `CANARY-${"T0KEN"}-${"9f3a"}-never-print-me`;
const ENV = { DATAVERSE_URL: ORG, DATAVERSE_TOKEN: TOKEN };
const gid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OM = gid(900);
const OTHER_SUB = gid(901);
const FIXED_NOW = new Date("2026-11-16T10:00:00.000Z");

const alloc = (n: number, cost: string | null, gen: string | null): Row => ({
  vsb_landleaseallocationwtgid: gid(n), vsb_name: `alloc ${n}`, _vsb_projectcost_value: cost, _vsb_generatorinproject_value: gen,
});
const om = (n: number, bridge: string | null, sub: string | null, parent: string | null = null): Row => ({
  vsb_opexprojectcostid: gid(n), vsb_name: `om ${n}`, _vsb_project_value: gid(1), _vsb_parentcost_value: parent, _vsb_devicetypeinproject_value: bridge, _vsb_subaccount_value: sub,
});
const bridge = (n: number, type: string | null, createdon: string): Row => ({
  vsb_devicetypesinprojectid: gid(n), vsb_name: `bridge ${n}`, _vsb_typeinprojectid_value: type, createdon,
});
const turbine = (n: number, type: string | null): Row => ({ vsb_generatorinprojectid: gid(n), vsb_name: `wtg ${n}`, _vsb_moduletypeinprojectid_value: type });
const gtype = (n: number, gen: string | null, project: string | null): Row => ({
  vsb_generatortypeinprojectid: gid(n), vsb_name: `type ${n}`, _vsb_generator_value: gen, _vsb_project_value: project,
});
const cost = (n: number, over: Row = {}): Row => ({
  vsb_landleaseprojectcostid: gid(n), vsb_name: `cost ${n}`, _vsb_project_value: gid(1), vsb_allwtgallocated: false, statecode: 0, ...over,
});

const SNAPSHOT: Snapshot = {
  omSubaccountIds: [OM],
  B1: [alloc(10, gid(50), null), alloc(11, gid(50), gid(60))],
  B2: [alloc(12, null, gid(60)), alloc(13, gid(50), gid(60))],
  B3: [om(20, null, OM), om(21, gid(70), OM), om(22, null, OTHER_SUB), om(23, null, OM, gid(20))],
  B4: [bridge(30, gid(80), "2026-01-02"), bridge(31, gid(80), "2026-01-01"), bridge(32, gid(81), "2026-01-01"), bridge(33, null, "2026-01-03")],
  B5: [bridge(33, null, "2026-01-03"), bridge(32, gid(81), "2026-01-01")],
  B6: [turbine(40, null), turbine(41, gid(80))],
  B7: [gtype(45, null, gid(1)), gtype(46, gid(2), null), gtype(47, gid(2), gid(1))],
  B8costs: [
    cost(50),
    cost(51),
    cost(52),
    cost(53),
    cost(54, { vsb_allwtgallocated: true }),
    cost(55, { statecode: 1 }),
  ],
  B8allocations: [alloc(60, gid(51), gid(61)), alloc(61, gid(52), null), alloc(62, gid(52), null), alloc(63, gid(53), null), alloc(64, gid(53), gid(61))],
};

/* ──────────────────────────────────────────────────────────── test rig ── */

interface Event { kind: "fetch" | "write" | "mkdir"; method?: string; url?: string; path?: string; content?: string }

function res(status: number, body?: unknown, headers: Record<string, string> = {}): Awaited<ReturnType<FetchLike>> {
  return { status, headers: { get: (n: string) => headers[n.toLowerCase()] ?? null }, json: async () => body };
}

interface Rig {
  deps: Deps; events: Event[]; logs: string[]; errs: string[]; files: Map<string, string>; sleeps: number[];
  fetches: () => Event[];
}

function rig(handler: FetchLike | undefined, over: Partial<Deps> = {}, files: Record<string, string> = {}): Rig {
  const events: Event[] = [];
  const logs: string[] = [];
  const errs: string[] = [];
  const sleeps: number[] = [];
  const store = new Map<string, string>(Object.entries(files).map(([k, v]) => [path.resolve(k), v]));
  const deps: Deps = {
    env: ENV,
    now: () => FIXED_NOW,
    sleep: async (ms) => { sleeps.push(ms); },
    log: (l) => logs.push(l),
    err: (l) => errs.push(l),
    io: {
      readFile: (p) => { const v = store.get(path.resolve(p)); if (v === undefined) throw new Error("ENOENT"); return v; },
      writeFile: (p, c) => { events.push({ kind: "write", path: p, content: c }); store.set(path.resolve(p), c); },
      mkdirp: (p) => { events.push({ kind: "mkdir", path: p }); },
      tmpdir: () => path.join(path.sep, "fake-tmp"),
    },
    fetchImpl: handler
      ? async (url, init) => {
          events.push({ kind: "fetch", method: init.method, url });
          return handler(url, init);
        }
      : async () => { throw new Error("no network expected"); },
    ...over,
  };
  return { deps, events, logs, errs, files: store, sleeps, fetches: () => events.filter((e) => e.kind === "fetch") };
}

const setOf = (url: string): string => new URL(url).pathname.replace(/\/$/, "").split("/").pop() ?? "";
const filterOf = (url: string): string => new URL(url).searchParams.get("$filter") ?? "";

/** An in-memory Dataverse for the report: answers each query by entity set (and, for two sets, by the filter). */
function reportServer(snap: Snapshot): FetchLike {
  return async (url) => {
    const set = setOf(url);
    const f = filterOf(url);
    let value: Row[] = [];
    if (set === "vsb_landleaseallocationwtgs") {
      if (f.includes("_vsb_generatorinproject_value eq null")) value = snap.B1 ?? [];
      else if (f.includes("_vsb_projectcost_value eq null")) value = snap.B2 ?? [];
      else value = snap.B8allocations ?? [];
    } else if (set === "vsb_opexsubaccounts") value = (snap.omSubaccountIds ?? []).map((id) => ({ vsb_opexsubaccountid: id, vsb_name: "Operation & Maintenance" }));
    else if (set === "vsb_opexprojectcosts") value = snap.B3 ?? [];
    else if (set === "vsb_devicetypesinprojects") value = f.includes("eq null") ? snap.B5 ?? [] : snap.B4 ?? [];
    else if (set === "vsb_generatorinprojects") value = snap.B6 ?? [];
    else if (set === "vsb_generatortypeinprojects") value = snap.B7 ?? [];
    else if (set === "vsb_landleaseprojectcosts") value = f.includes("vsb_allwtgallocated") ? snap.B8costs ?? [] : (snap.B8costs ?? []).map((c) => ({ vsb_landleaseprojectcostid: c.vsb_landleaseprojectcostid }));
    return res(200, { value });
  };
}

/** A stateful Dataverse for apply: rows by `set(id)`; GET returns the row or 404, DELETE removes it. */
function applyServer(set: string, idCol: string, rows: Row[], opts: { keepOnDelete?: Set<string>; failDelete?: Set<string>; gate?: () => Promise<void> } = {}) {
  const table = new Map(rows.map((r) => [String(r[idCol]), r]));
  let inFlight = 0;
  let peak = 0;
  const handler: FetchLike = async (url, init) => {
    const s = setOf(url.split("(")[0] ?? "");
    const m = /\(([^)]+)\)$/.exec(url);
    if (s === "vsb_opexsubaccounts") return res(200, { value: [{ vsb_opexsubaccountid: OM }] });
    if (s !== set || !m) return res(400, {});
    const id = m[1] ?? "";
    if (init.method === "GET") return table.has(id) ? res(200, table.get(id)) : res(404, {});
    if (init.method === "DELETE") {
      inFlight++; peak = Math.max(peak, inFlight);
      try {
        await opts.gate?.();
        if (opts.failDelete?.has(id)) return res(500, {});
        if (!table.has(id)) return res(404, {});
        if (!opts.keepOnDelete?.has(id)) table.delete(id);
        return res(204);
      } finally { inFlight--; }
    }
    return res(405, {});
  };
  return { handler, table, peak: () => peak };
}

const B1_ROWS = [alloc(10, gid(50), null), alloc(11, gid(50), null), alloc(12, gid(50), null)];
const manifestFile = (ids: string[]) => ({ "/m/ids.txt": `# reviewed\n${ids.join("\n")}\n` });
const applyOpts = (extra: string[] = []) => parseArgs(["--apply", "--class", "B1", "--manifest", "/m/ids.txt", "--yes-delete", "--out", "/o", ...extra]);
const allText = (r: Rig) => [...r.logs, ...r.errs, ...r.events.map((e) => `${e.url ?? ""}${e.content ?? ""}${e.path ?? ""}`)].join("\n");

/* ═════════════════════════════════════════════════════════ classification ══ */

describe("UT-ORPH — classification of B1 to B8 from a snapshot", () => {
  const out = classify(SNAPSHOT);
  const ids = (c: ClassId) => out.classes[c].map((e) => e.id);

  it("UT-ORPH-001 B1 and B2 classify allocations with no turbine and no cost", () => {
    expect(ids("B1")).toEqual([gid(10)]);
    expect(ids("B2")).toEqual([gid(12)]);
  });

  it("UT-ORPH-002 B3 needs no bridge AND an O&M sub-account; a parent link does not matter", () => {
    expect(ids("B3")).toEqual([gid(20), gid(23)]);
    expect(out.classes.B3[1]?.lookups._vsb_parentcost_value).toBe(gid(20));
  });

  it("UT-ORPH-003 B4 groups bridges by type, oldest first; a type with one bridge is not reported; the count is types", () => {
    expect(out.counts.B4).toBe(1);
    expect(out.details.B4BridgeRows).toBe(2);
    expect(out.classes.B4.map((e) => [e.id, e.rank, e.typeId])).toEqual([[gid(31), 1, gid(80)], [gid(30), 2, gid(80)]]);
  });

  it("UT-ORPH-004 B5, B6 and B7 classify bridges with no type, turbines with no type and phantom types", () => {
    expect(ids("B5")).toEqual([gid(33)]);
    expect(ids("B6")).toEqual([gid(40)]);
    expect(ids("B7")).toEqual([gid(45), gid(46)]);
  });

  it("UT-ORPH-005 B8 finds active non-all-WTG costs with no allocation or only turbine-less allocations", () => {
    const b8 = out.classes.B8.map((e) => [e.id, e.reason]);
    expect(b8).toEqual([[gid(50), "no-allocation"], [gid(52), "all-allocations-without-turbine"]]);
    expect(out.details).toMatchObject({ B8NoAllocation: 1, B8AllNullTurbine: 1 });
  });

  it("UT-ORPH-006 every row is re-checked against its class, so extra rows in a snapshot never count, and duplicates collapse", () => {
    const r = classify({ B1: [alloc(11, gid(50), gid(60)), alloc(10, gid(50), null), alloc(10, gid(50), null)], B2: [alloc(13, gid(50), gid(60))] });
    expect(r.counts.B1).toBe(1);
    expect(r.counts.B2).toBe(0);
    expect(classify(undefined).counts).toEqual(Object.fromEntries(CLASS_IDS.map((c) => [c, 0])));
  });

  it("UT-ORPH-007 a null or empty lookup counts as null; a MISSING column does not (F3 item 7a, fail-closed)", () => {
    const r = classify({ B6: [
      { vsb_generatorinprojectid: gid(1), vsb_name: "a" },
      { vsb_generatorinprojectid: gid(2), _vsb_moduletypeinprojectid_value: "" },
      { vsb_generatorinprojectid: gid(3), _vsb_moduletypeinprojectid_value: null },
    ] });
    expect(r.counts.B6).toBe(2);
    expect(r.details.unreadable.B6).toBe(1);
  });
});

describe("UT-ORPH — CSV, arguments and small helpers", () => {
  it("UT-ORPH-008 CSV cells are quoted and a leading formula character is neutralised", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell(null)).toBe("");
    const csv = toCsv("B1", classify(SNAPSHOT).classes.B1);
    expect(csv.split("\r\n")[0]).toBe("id,name,_vsb_projectcost_value,_vsb_generatorinproject_value");
    expect(csv).toContain(`${gid(10)},alloc 10,${gid(50)},`);
  });

  it("UT-ORPH-009 parseArgs defaults to a read-only report and accepts both option forms", () => {
    const d = parseArgs([]);
    expect(d).toMatchObject({ mode: "report", apply: false, dryRun: false, yesDelete: false, errors: [] });
    const o = parseArgs(["--report", `--project=${gid(1).toUpperCase()}`, "--out", "/x"]);
    expect(o).toMatchObject({ mode: "report", project: gid(1), out: "/x", errors: [] });
  });

  it("UT-ORPH-010 parseArgs rejects a bad GUID, an unknown class or flag, a missing value and --input with --apply", () => {
    expect(parseArgs(["--project", "not-a-guid"]).errors[0]).toMatch(/GUID/);
    expect(parseArgs(["--project", `{${gid(1)}}`]).errors.length).toBe(1);
    expect(parseArgs(["--class", "B9"]).errors[0]).toMatch(/--class/);
    expect(parseArgs(["--bogus"]).errors[0]).toMatch(/unknown/);
    expect(parseArgs(["--out"]).errors[0]).toMatch(/needs a value/);
    expect(parseArgs(["--apply", "--input", "x.json"]).errors.join()).toMatch(/--input/);
    expect(parseArgs(["--apply", "--project", gid(1)]).errors.join()).toMatch(/--project/);
  });

  it("UT-ORPH-011 isGuid accepts only a bare GUID", () => {
    expect(isGuid(gid(1))).toBe(true);
    for (const bad of ["", `${gid(1)} `, `'${gid(1)}'`, gid(1).slice(1), `${gid(1)}) or (1 eq 1`, null, 5]) expect(isGuid(bad)).toBe(false);
  });

  it("UT-ORPH-012 the manifest parser ignores comments, blanks and duplicates and counts malformed lines", () => {
    const m = parseManifest(`# header\n${gid(1)}  # note\n\n${gid(1).toUpperCase()}\r\nnot-a-guid\n${gid(2)}\n`);
    expect(m).toEqual({ ids: [gid(1), gid(2)], bad: 1 });
  });

  it("UT-ORPH-013 Retry-After is read as seconds or a date and bounded", () => {
    expect(retryAfterMs("2", 0)).toBe(2000);
    expect(retryAfterMs("9999", 0)).toBe(60000);
    expect(retryAfterMs(new Date(5000).toUTCString(), 1000)).toBe(4000);
    expect(retryAfterMs(null, 0)).toBeUndefined();
    expect(retryAfterMs("soon", 0)).toBeUndefined();
  });

  it("UT-ORPH-014 apply is refused for B4 and B8 (report only) and offered for the six deletable classes", () => {
    expect(APPLY_CLASSES).toEqual(["B1", "B2", "B3", "B5", "B6", "B7"]);
    expect(applyProblems({ class: "B4", manifest: "m", dryRun: false, yesDelete: true })[0]).toMatch(/report-only/);
    expect(applyProblems({ class: "B8", manifest: "m", dryRun: false, yesDelete: true })[0]).toMatch(/report-only/);
  });
});

/* ══════════════════════════════════════════════════════════ report mode ══ */

describe("UT-ORPH — report mode is read-only", () => {
  it("UT-ORPH-015 the default run sends only GETs, writes only CSVs and summary.json, and prints counts only", async () => {
    const r = rig(reportServer(SNAPSHOT));
    const code = await main([], r.deps);
    expect(code).toBe(0);
    expect(r.fetches().length).toBeGreaterThan(5);
    expect(r.fetches().every((e) => e.method === "GET")).toBe(true);
    const written = r.events.filter((e) => e.kind === "write").map((e) => path.basename(e.path ?? ""));
    expect(written.sort()).toEqual([...CLASS_IDS.map((c) => `${c}.csv`), "summary.json"].sort());
    const text = r.logs.join("\n");
    expect(text).toMatch(/B1 allocations with no turbine: 1/);
    expect(text).toMatch(/B4 types with more than one bridge: 1 \(2 bridge rows\)/);
    expect(text).toMatch(/B8 .*: 2 \(no allocation: 1, allocations without turbine: 1\)/);
    // counts only: no ids and no names on the console
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(text).not.toMatch(/alloc 1|wtg 40|om 20|cost 50/);
    const summary = JSON.parse(r.events.find((e) => e.path?.endsWith("summary.json"))?.content ?? "{}");
    expect(summary.counts.B1).toBe(1);
    expect(summary.projectScoped).toBe(false);
  });

  it("UT-ORPH-016 the entity sets and columns the script queries exist in the reference files and in dataverseNames.ts", () => {
    const refPath = path.resolve(__dirname, "../../../ProjectDocs/reference/dataverse-entities.json");
    const attrPath = path.resolve(__dirname, "../../../ProjectDocs/reference/dataverse-attributes.json");
    if (fs.existsSync(refPath)) {
      const sets = new Set((JSON.parse(fs.readFileSync(refPath, "utf8")).entities as { entitySetName: string }[]).map((e) => e.entitySetName));
      for (const c of CLASS_IDS) expect(sets.has(CLASSES[c].set), `${c} ${CLASSES[c].set}`).toBe(true);
      expect(sets.has("vsb_opexsubaccounts")).toBe(true);
    }
    if (fs.existsSync(attrPath)) {
      const ents = Object.values(JSON.parse(fs.readFileSync(attrPath, "utf8")).entities as Record<string, { entitySetName: string; attributes: Record<string, unknown> }>);
      for (const c of ["B1", "B3", "B8"] as ClassId[]) {
        const e = ents.find((x) => x.entitySetName === CLASSES[c].set);
        expect(e, c).toBeTruthy();
        for (const col of [CLASSES[c].id, CLASSES[c].name, ...CLASSES[c].lookups.map((l) => l.replace(/^_|_value$/g, ""))]) expect(e?.attributes[col], `${c} ${col}`).toBeTruthy();
      }
    }
    expect(CLASSES.B1.set).toBe(ES.landLeaseAllocationWtgs);
    expect(CLASSES.B3.set).toBe(ES_PLANT.opexProjectCosts);
    expect(CLASSES.B4.set).toBe(ES_PLANT.deviceTypesInProjects);
    expect(CLASSES.B5.set).toBe(ES_PLANT.deviceTypesInProjects);
    expect(CLASSES.B6.set).toBe(ES_PLANT.generatorInProjects);
    expect(CLASSES.B7.set).toBe(ES_PLANT.generatorTypeInProjects);
    expect(CLASSES.B8.set).toBe(ES_PLANT.landLeaseProjectCosts);
  });

  it("UT-ORPH-017 every live query names a $select and a server-side filter (B4 an $orderby), with the O&M name URL-encoded", async () => {
    const r = rig(reportServer(SNAPSHOT));
    await runReport(parseArgs([]), r.deps);
    for (const e of r.fetches()) expect(e.url).toContain("$select=");
    const urls = r.fetches().map((e) => e.url ?? "");
    expect(urls.some((u) => u.includes("vsb_opexsubaccounts") && u.includes(encodeURIComponent("vsb_name eq 'Operation & Maintenance'")))).toBe(true);
    expect(urls.some((u) => u.includes("vsb_devicetypesinprojects") && u.includes("$orderby=_vsb_typeinprojectid_value,createdon"))).toBe(true);
    const b3 = decodeURIComponent(urls.find((u) => u.includes("vsb_opexprojectcosts")) ?? "");
    expect(b3).toContain("_vsb_devicetypeinproject_value eq null");
    expect(b3).toContain(`_vsb_subaccount_value eq ${OM}`);
    const b7 = decodeURIComponent(urls.find((u) => u.includes("vsb_generatortypeinprojects")) ?? "");
    expect(b7).toContain("_vsb_generator_value eq null or _vsb_project_value eq null");
  });

  it("UT-ORPH-018 --project scopes B1, B3, B7 and B8 through the lookups and skips B2, B4, B5 and B6", async () => {
    const P = gid(1);
    const server = reportServer(SNAPSHOT);
    const r = rig(async (url, init) => {
      const set = setOf(url);
      const f = decodeURIComponent(filterOf(url));
      if (set === "vsb_landleaseprojectcosts" && f === `_vsb_project_value eq ${P}`) return res(200, { value: [{ vsb_landleaseprojectcostid: gid(50) }] });
      return server(url, init);
    });
    const code = await runReport(parseArgs(["--project", P]), r.deps);
    expect(code).toBe(0);
    const urls = r.fetches().map((e) => decodeURIComponent(e.url ?? ""));
    expect(urls.some((u) => u.includes("vsb_landleaseallocationwtgs") && u.includes(`_vsb_projectcost_value eq ${gid(50)}`) && u.includes("_vsb_generatorinproject_value eq null"))).toBe(true);
    expect(urls.some((u) => u.includes("vsb_opexprojectcosts") && u.includes(`_vsb_project_value eq ${P}`))).toBe(true);
    expect(urls.some((u) => u.includes("vsb_generatortypeinprojects") && u.includes(`_vsb_project_value eq ${P} and _vsb_generator_value eq null`))).toBe(true);
    expect(urls.some((u) => u.includes("vsb_devicetypesinprojects") || u.includes("vsb_generatorinprojects"))).toBe(false);
    expect(r.logs.join("\n")).toMatch(/skipped: B5/);
    expect(r.logs.join("\n")).not.toContain(P);
    const summary = JSON.parse(r.events.find((e) => e.path?.endsWith("summary.json"))?.content ?? "{}");
    expect(summary).toMatchObject({ projectScoped: true });
    expect(JSON.stringify(summary)).not.toContain(P);
  });

  it("UT-ORPH-019 paging follows @odata.nextLink and stops at the 50-page cap, flagging the class as truncated", async () => {
    let calls = 0;
    const ctx = makeContext({ env: ENV, fetchImpl: async () => { calls++; return res(200, { value: [{ n: calls }], "@odata.nextLink": `${ORG}/api/data/v9.2/x?page=${calls + 1}` }); } });
    if (!ctx.ok) throw new Error("ctx");
    const out = await fetchPaged(ctx, "x", { select: ["a"] });
    expect(calls).toBe(MAX_PAGES);
    expect(out.truncated).toBe(true);
    expect(out.rows.length).toBe(MAX_PAGES);
    let two = 0;
    const ctx2 = makeContext({ env: ENV, fetchImpl: async () => { two++; return res(200, { value: [{}], ...(two === 1 ? { "@odata.nextLink": `${ORG}/api/data/v9.2/x?p=2` } : {}) }); } });
    if (!ctx2.ok) throw new Error("ctx");
    expect((await fetchPaged(ctx2, "x")).truncated).toBe(false);
    expect(two).toBe(2);
  });

  it("UT-ORPH-020 a paging link to another origin is refused, so the token never leaves the org", async () => {
    const seen: string[] = [];
    const ctx = makeContext({ env: ENV, fetchImpl: async (u) => { seen.push(u); return res(200, { value: [], "@odata.nextLink": `${"https"}://elsewhere.invalid/api/data/v9.2/x` }); } });
    if (!ctx.ok) throw new Error("ctx");
    await expect(fetchPaged(ctx, "x")).rejects.toThrow(/different origin/);
    expect(seen).toHaveLength(1);
  });

  it("UT-ORPH-021 429 and 503 are retried up to 3 tries and Retry-After is honoured", async () => {
    const seq = [res(429, {}, { "retry-after": "3" }), res(503, {}), res(200, { value: [{ ok: 1 }] })];
    const sleeps: number[] = [];
    const ctx = makeContext({ env: ENV, sleep: async (ms) => { sleeps.push(ms); }, fetchImpl: async () => seq.shift() as ReturnType<FetchLike> extends Promise<infer T> ? T : never });
    if (!ctx.ok) throw new Error("ctx");
    expect((await fetchPaged(ctx, "x")).rows).toEqual([{ ok: 1 }]);
    expect(sleeps[0]).toBe(3000);
    expect(sleeps).toHaveLength(2);
    // a third 429 is returned (not retried a fourth time) and the read fails cleanly
    let n = 0;
    const ctx3 = makeContext({ env: ENV, sleep: async () => {}, fetchImpl: async () => { n++; return res(429, {}); } });
    if (!ctx3.ok) throw new Error("ctx");
    await expect(fetchPaged(ctx3, "x")).rejects.toThrow(/HTTP 429/);
    expect(n).toBe(3);
  });

  it("UT-ORPH-022 a request that never answers is aborted by the per-request timeout", async () => {
    const ctx = makeContext({ env: ENV, timeoutMs: 5, fetchImpl: (_u, init) => new Promise((_ok, bad) => { init.signal?.addEventListener("abort", () => bad(new Error("aborted"))); }) });
    if (!ctx.ok) throw new Error("ctx");
    await expect(ctx.request("GET", `${ORG}/api/data/v9.2/x`)).rejects.toThrow(/timed out/);
  });

  it("UT-ORPH-023 a failed live report exits 1 with a status code only, never the response body", async () => {
    const r = rig(async () => res(500, { error: { message: "secret detail" } }));
    expect(await main([], r.deps)).toBe(1);
    expect(r.errs.join()).toMatch(/HTTP 500/);
    expect(allText(r)).not.toContain("secret detail");
  });

  it("UT-ORPH-024 --input classifies a saved snapshot offline: no network, no environment needed", async () => {
    const r = rig(undefined, { env: {} }, { "/s/snap.json": JSON.stringify(SNAPSHOT) });
    const code = await main(["--input", "/s/snap.json", "--out", "/o"], r.deps);
    expect(code).toBe(0);
    expect(r.fetches()).toHaveLength(0);
    expect(r.logs.join("\n")).toMatch(/B5 bridge rows with no type: 1/);
    expect(r.files.get(path.resolve("/o", "B1.csv"))).toContain(gid(10));
    const bad = rig(undefined, { env: {} }, { "/s/snap.json": "{not json" });
    expect(await main(["--input", "/s/snap.json"], bad.deps)).toBe(2);
  });

  it("UT-ORPH-025 the default output folder is a new generators-orphans-<timestamp> folder under the OS temp dir", async () => {
    const r = rig(undefined, { env: {} }, { "/s/snap.json": JSON.stringify({}) });
    await main(["--input", "/s/snap.json"], r.deps);
    const dirs = r.events.filter((e) => e.kind === "mkdir").map((e) => e.path ?? "");
    expect(dirs).toHaveLength(1);
    expect((dirs[0] ?? "").startsWith(path.join(path.sep, "fake-tmp"))).toBe(true);
    expect(path.basename(dirs[0] ?? "")).toMatch(/^generators-orphans-2026-11-16T10-00-00-000Z$/);
  });
});

/* ══════════════════════════════════════════ environment and refusal checks ══ */

describe("UT-ORPH — configuration and refusals", () => {
  it("UT-ORPH-026 missing DATAVERSE_URL or DATAVERSE_TOKEN exits 2 with a clear message and sends nothing", async () => {
    for (const env of [{}, { DATAVERSE_URL: ORG }, { DATAVERSE_TOKEN: TOKEN }, { DATAVERSE_URL: "http://insecure.invalid", DATAVERSE_TOKEN: TOKEN }]) {
      const r = rig(async () => res(200, { value: [] }), { env });
      expect(await main([], r.deps)).toBe(2);
      expect(r.errs.join()).toMatch(/DATAVERSE_(URL|TOKEN)/);
      expect(r.fetches()).toHaveLength(0);
      const a = rig(async () => res(200, {}), { env }, manifestFile([gid(10)]));
      expect(await main(["--apply", "--class", "B1", "--manifest", "/m/ids.txt", "--yes-delete"], a.deps)).toBe(2);
      expect(a.fetches()).toHaveLength(0);
    }
  });

  it("UT-ORPH-027 usage errors exit 2 before anything is read", async () => {
    const r = rig(async () => res(200, {}));
    expect(await main(["--project", "x"], r.deps)).toBe(2);
    expect(r.fetches()).toHaveLength(0);
  });

  it("UT-ORPH-028 --apply refuses without --class, --manifest or --yes-delete and deletes nothing", async () => {
    const files = manifestFile([gid(10)]);
    for (const argv of [
      ["--apply"],
      ["--apply", "--manifest", "/m/ids.txt", "--yes-delete"],
      ["--apply", "--class", "B1", "--yes-delete"],
      ["--apply", "--class", "B1", "--manifest", "/m/ids.txt"],
      ["--apply", "--class", "B4", "--manifest", "/m/ids.txt", "--yes-delete"],
      ["--apply", "--class", "B8", "--manifest", "/m/ids.txt", "--yes-delete"],
    ]) {
      const r = rig(async () => res(200, {}), {}, files);
      expect(await main(argv, r.deps), argv.join(" ")).toBe(2);
      expect(r.errs.join()).toMatch(/refused/);
      expect(r.events).toHaveLength(0);
    }
  });

  it("UT-ORPH-029 a manifest with a malformed line, or no ids, or an unreadable file is refused", async () => {
    for (const files of [{ "/m/ids.txt": `${gid(10)}\nhello\n` }, { "/m/ids.txt": "# nothing\n" }, {} as Record<string, string>]) {
      const r = rig(async () => res(200, {}), {}, files);
      expect(await runApply(applyOpts(), r.deps)).toBe(2);
      expect(r.events.filter((e) => e.method === "DELETE")).toHaveLength(0);
    }
  });

  it("UT-ORPH-030 an id that is not currently in the chosen class refuses the whole run: no backup, no DELETE", async () => {
    const rows = [...B1_ROWS, alloc(13, gid(50), gid(60))]; // 13 has a turbine
    const srv = applyServer("vsb_landleaseallocationwtgs", "vsb_landleaseallocationwtgid", rows);
    const r = rig(srv.handler, {}, manifestFile([gid(10), gid(11), gid(13)]));
    expect(await runApply(applyOpts(), r.deps)).toBe(2);
    expect(r.errs.join()).toMatch(/1 manifest id\(s\) are not currently in class B1/);
    expect(r.events.some((e) => e.method === "DELETE")).toBe(false);
    expect(r.events.some((e) => e.kind === "write")).toBe(false);
    expect(srv.table.size).toBe(4);
  });

  it("UT-ORPH-031 B3 membership needs an O&M sub-account: a row of another sub-account is refused", async () => {
    const rows = [om(20, null, OM), om(22, null, OTHER_SUB)];
    const srv = applyServer("vsb_opexprojectcosts", "vsb_opexprojectcostid", rows);
    const r = rig(srv.handler, {}, manifestFile([gid(20), gid(22)]));
    expect(await runApply({ ...applyOpts(), class: "B3" }, r.deps)).toBe(2);
    const ok = rig(srv.handler, {}, manifestFile([gid(20)]));
    expect(await runApply({ ...applyOpts(), class: "B3" }, ok.deps)).toBe(0);
    expect(srv.table.has(gid(20))).toBe(false);
    expect(srv.table.has(gid(22))).toBe(true);
  });
});

/* ═════════════════════════════════════════════════════════════ apply mode ══ */

describe("UT-ORPH — guarded --apply", () => {
  const SET = "vsb_landleaseallocationwtgs";
  const ID = "vsb_landleaseallocationwtgid";

  it("UT-ORPH-032 the JSON backup of the full rows is written BEFORE the first DELETE", async () => {
    const srv = applyServer(SET, ID, B1_ROWS);
    const r = rig(srv.handler, {}, manifestFile(B1_ROWS.map((x) => String(x[ID]))));
    expect(await runApply(applyOpts(), r.deps)).toBe(0);
    const firstDelete = r.events.findIndex((e) => e.method === "DELETE");
    const backup = r.events.findIndex((e) => e.kind === "write" && /backup-B1-.*\.json$/.test(e.path ?? ""));
    expect(backup).toBeGreaterThan(-1);
    expect(firstDelete).toBeGreaterThan(backup);
    expect(r.events.filter((e) => e.kind === "write")).toHaveLength(1);
    const saved = JSON.parse(r.events[backup]?.content ?? "{}");
    expect(saved.class).toBe("B1");
    expect(saved.rows).toEqual(B1_ROWS);
    expect(srv.table.size).toBe(0);
    expect(r.logs.join("\n")).toMatch(/deleted 3, already gone 0, delete errors 0, still present after read-back 0/);
  });

  it("UT-ORPH-033 deletes run at most 4 at a time", async () => {
    const rows = Array.from({ length: 12 }, (_v, i) => alloc(100 + i, gid(50), null));
    let release: () => void = () => {};
    const gate = new Promise<void>((ok) => { release = ok; });
    const srv = applyServer(SET, ID, rows, { gate: () => gate });
    const r = rig(srv.handler, {}, manifestFile(rows.map((x) => String(x[ID]))));
    const run = runApply(applyOpts(), r.deps);
    await new Promise((ok) => setTimeout(ok, 30));
    expect(srv.peak()).toBe(DELETE_CONCURRENCY);
    expect(DELETE_CONCURRENCY).toBe(4);
    release();
    expect(await run).toBe(0);
    expect(srv.peak()).toBe(4);
    expect(r.events.filter((e) => e.method === "DELETE")).toHaveLength(12);
  });

  it("UT-ORPH-034 a 404 on the read-back or on a DELETE counts as already gone", async () => {
    const srv = applyServer(SET, ID, B1_ROWS.slice(0, 2));
    // id 12 is not in the store at all (gone before we start); id 11 disappears between the read and the delete
    const base = srv.handler;
    const r = rig(async (u, i) => {
      if (i.method === "DELETE" && u.includes(gid(11))) { srv.table.delete(gid(11)); }
      return base(u, i);
    }, {}, manifestFile([gid(10), gid(11), gid(12)]));
    expect(await runApply(applyOpts(), r.deps)).toBe(0);
    expect(r.logs.join("\n")).toMatch(/deleted 1, already gone 2, delete errors 0, still present after read-back 0/);
  });

  it("UT-ORPH-035 ids still present after the deletes are reported and the exit code is 1", async () => {
    const srv = applyServer(SET, ID, B1_ROWS, { keepOnDelete: new Set([gid(11)]), failDelete: new Set([gid(12)]) });
    const r = rig(srv.handler, {}, manifestFile(B1_ROWS.map((x) => String(x[ID]))));
    expect(await runApply(applyOpts(), r.deps)).toBe(1);
    expect(r.logs.join("\n")).toMatch(/deleted 2, already gone 0, delete errors 1, still present after read-back 2/);
    expect(srv.table.has(gid(11))).toBe(true);
    expect(r.logs.join("\n")).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it("UT-ORPH-036 --dry-run reads but neither writes a backup nor sends a DELETE, and needs no --yes-delete", async () => {
    const srv = applyServer(SET, ID, B1_ROWS);
    const r = rig(srv.handler, {}, manifestFile(B1_ROWS.map((x) => String(x[ID]))));
    const o = parseArgs(["--apply", "--dry-run", "--class", "B1", "--manifest", "/m/ids.txt"]);
    expect(o.dryRun).toBe(true);
    expect(await runApply(o, r.deps)).toBe(0);
    expect(r.fetches().every((e) => e.method === "GET")).toBe(true);
    expect(r.events.some((e) => e.kind === "write")).toBe(false);
    expect(r.logs.join("\n")).toMatch(/dry run, class B1: 3 row\(s\) would be deleted \(4 at a time\), 0 already gone/);
    expect(srv.table.size).toBe(3);
    // --dry-run together with --yes-delete still deletes nothing
    const r2 = rig(srv.handler, {}, manifestFile(B1_ROWS.map((x) => String(x[ID]))));
    await runApply(parseArgs(["--apply", "--dry-run", "--yes-delete", "--class", "B1", "--manifest", "/m/ids.txt"]), r2.deps);
    expect(r2.events.some((e) => e.method === "DELETE")).toBe(false);
  });

  it("UT-ORPH-037 a 429 on a DELETE is retried and the delete then succeeds", async () => {
    const srv = applyServer(SET, ID, B1_ROWS.slice(0, 1));
    let hits = 0;
    const r = rig(async (u, i) => {
      if (i.method === "DELETE" && hits++ === 0) return res(429, {}, { "retry-after": "1" });
      return srv.handler(u, i);
    }, {}, manifestFile([gid(10)]));
    expect(await runApply(applyOpts(), r.deps)).toBe(0);
    expect(r.sleeps).toEqual([1000]);
    expect(r.events.filter((e) => e.method === "DELETE")).toHaveLength(2);
  });

  it("UT-ORPH-038 --apply with --project is refused: the manifest is the scope", () => {
    expect(parseArgs(["--apply", "--project", gid(1), "--class", "B1", "--manifest", "m", "--yes-delete"]).errors.join()).toMatch(/--project/);
  });
});

/* ═══════════════════════════════════════════════════ secrets and literals ══ */

describe("UT-ORPH — the token and hard-coded values", () => {
  it("UT-ORPH-039 the token appears in no console line, URL, file or backup, in a report, a dry run and an apply", async () => {
    const rep = rig(reportServer(SNAPSHOT));
    await main([], rep.deps);
    const srv = applyServer("vsb_landleaseallocationwtgs", "vsb_landleaseallocationwtgid", B1_ROWS);
    const ids = B1_ROWS.map((x) => String(x.vsb_landleaseallocationwtgid));
    const dry = rig(srv.handler, {}, manifestFile(ids));
    await main(["--apply", "--dry-run", "--class", "B1", "--manifest", "/m/ids.txt"], dry.deps);
    const app = rig(srv.handler, {}, manifestFile(ids));
    await main(["--apply", "--class", "B1", "--manifest", "/m/ids.txt", "--yes-delete", "--out", "/o"], app.deps);
    const bad = rig(async () => { throw new Error(`boom ${TOKEN}`); });
    expect(await main([], bad.deps)).toBe(1);
    for (const r of [rep, dry, app, bad]) expect(allText(r)).not.toContain(TOKEN);
  });

  it("UT-ORPH-040 the token reaches fetch only as an Authorization header, and only for the org origin", async () => {
    const seen: { url: string; auth?: string }[] = [];
    const r = rig(async (u, i) => { seen.push({ url: u, auth: i.headers.Authorization }); return reportServer(SNAPSHOT)(u, i); });
    await main([], r.deps);
    expect(seen.length).toBeGreaterThan(0);
    for (const s of seen) { expect(s.url.startsWith(`${ORG}/api/data/v9.2/`)).toBe(true); expect(s.auth).toBe(`Bearer ${TOKEN}`); expect(s.url).not.toContain(TOKEN); }
  });

  it("UT-ORPH-041 the console wrapper scrubs a token even if a message carries one", async () => {
    const r = rig(undefined, {}, { "/s/snap.json": "{" });
    r.deps.io = { ...r.deps.io!, readFile: () => { throw new Error(TOKEN); } };
    await main(["--input", "/s/snap.json"], r.deps);
    expect(allText(r)).not.toContain(TOKEN);
  });

  it("UT-ORPH-042 the script and this test contain no hard-coded org URL, tenant, token or GUID", () => {
    // the patterns are assembled from fragments so that this file does not match itself
    const hosts = new RegExp([["dynamics", "com"].join("\\."), ["crm\\d*", "dynamics"].join("\\."), ["microsoft", "online"].join(""), ["share", "point", "com"].join("[.]?")].join("|"), "i");
    const script = fs.readFileSync(path.resolve(__dirname, "../../scripts/generators-orphans.mjs"), "utf8");
    expect(script).not.toMatch(hosts);
    expect(script).not.toMatch(/Bearer [A-Za-z0-9._-]{20,}/);
    expect(script).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(script.match(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []).toEqual([]);
    const self = fs.readFileSync(__filename, "utf8");
    expect(self).not.toMatch(hosts);
    expect(self.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? []).toEqual([]);
  });

  it("UT-ORPH-043 the script is listed in package.json as orphans:generators and has no other delete path than --apply", () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf8"));
    expect(pkg.scripts["orphans:generators"]).toBe("node scripts/generators-orphans.mjs");
    const script = fs.readFileSync(path.resolve(__dirname, "../../scripts/generators-orphans.mjs"), "utf8");
    const deletes = script.match(/request\("DELETE"/g) ?? [];
    expect(deletes).toHaveLength(1);
  });
});
