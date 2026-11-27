/**
 * UT-BOOT-COST-01x — T-C01 (`BOOT_PREFETCH_COST_READS`) and T-C03 (`BOOT_PREFETCH_ADMIN_CHUNK`): WHEN `bootPrefetch.ts` starts a Cost
 * screen's own reads and an admin screen's chunk. What the Cost reads are, and that the screens find them, is
 * `costScreenPrefetch.test.tsx`; the waves are `costScreenPrefetch.waves.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

const s = vi.hoisted(() => ({ log: [] as string[], rejectScreen: false, holdSession: undefined as undefined | Promise<void> }));

vi.mock("@/data/project", () => ({
  loadProject: vi.fn(async (_id: string, options?: { scope?: string }) => {
    s.log.push(`session:${options?.scope}`);
    if (s.holdSession) await s.holdSession;
    return undefined;
  }),
  loadEnvironmentVariables: vi.fn(async () => ({})),
}));
vi.mock("@/platform/powerClient", async (original) => ({
  ...(await original<typeof import("@/platform/powerClient")>()),
  ensureInitialized: vi.fn(async () => ({ app: { queryParams: {} } })),
  readSession: vi.fn(async () => ({ environmentId: "e", appId: "a", launchParams: {} })),
}));
vi.mock("./screenLoaders", () => ({
  loadProjectOverviewScreen: vi.fn(async () => ({})),
  loadGeneralDataScreen: vi.fn(async () => ({})),
  loadGeneratorsScreen: vi.fn(async () => ({})),
  COST_SCREEN_LOADERS: { "/costs/capex": [vi.fn(async () => ({}))] },
  PM_SCREEN_LOADERS: {},
  ADMIN_SCREEN_LOADERS: {
    "/admin/cost": vi.fn(async () => { s.log.push("chunk:admin:cost"); return {}; }),
  },
}));
vi.mock("./costScreenPrefetch", () => ({
  prefetchCostScreenReads: vi.fn(async (_qc: unknown, path: string, id: string, ctx: { mode: string; category?: number }) => {
    s.log.push(`cost:${path}:${id}:${ctx.mode}:${ctx.category ?? "-"}`);
    if (s.rejectScreen) throw new Error("boom");
  }),
}));

import { startBootPrefetch } from "./bootPrefetch";
import { resetBootDvopt } from "@/data/bootDvoptFlags";
import { resetEntryPrefetch, setEntryPrefetchForTests } from "@/data/entryPrefetchFlags";
import { startupFlags } from "./startupFlags";

const ID = "9f5aade5-2b7c-ef11-ac20-000d3a466ab7";
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
const boot = (qc: QueryClient, hash: string) => startBootPrefetch(qc, { hash, search: "" });

beforeEach(() => {
  s.log.length = 0;
  s.rejectScreen = false;
  s.holdSession = undefined;
  startupFlags.bootPrefetch = true;
  resetBootDvopt();
  resetEntryPrefetch();
});

describe("T-C01 boot prefetch of a Cost screen's own reads", () => {
  it("UT-BOOT-COST-050 on by default: a Cost deep link starts the screen's reads (with its category) and the FULL session project", async () => {
    await boot(client(), `#/costs/capex?projectId=${ID}&category=2`);
    expect([...s.log].sort()).toEqual([`cost:/costs/capex:${ID}:boot:2`, "session:full"]);
    s.log.length = 0;
    await boot(client(), `#/costs/capex?projectId=${ID}`);
    expect([...s.log].sort()).toEqual([`cost:/costs/capex:${ID}:boot:-`, "session:full"]);
  });

  it("UT-BOOT-COST-051 the session project and the screen's reads start together: the reads do not wait for the project's answer", async () => {
    let release!: () => void;
    s.holdSession = new Promise<void>((r) => { release = r; });
    const done = boot(client(), `#/costs/capex?projectId=${ID}`);
    await new Promise((r) => setTimeout(r, 20));
    expect(s.log).toContain(`cost:/costs/capex:${ID}:boot:-`); // the project has not answered
    release();
    await done;
  });

  it("UT-BOOT-COST-052 the switch OFF restores today's boot: the session project only", async () => {
    setEntryPrefetchForTests({ costReads: false });
    await boot(client(), `#/costs/capex?projectId=${ID}`);
    expect(s.log).toEqual(["session:full"]);
  });

  it("UT-BOOT-COST-053 a Cost deep link at the root (Edit Costs) starts the Cost reads too; no project id or an invalid one starts none", async () => {
    await boot(client(), `#/costs/contracts?projectId=${ID}`);
    expect(s.log).toContain(`cost:/costs/contracts:${ID}:boot:-`);
    s.log.length = 0;
    await boot(client(), "#/costs/capex");
    await boot(client(), "#/costs/capex?projectId=nope");
    expect(s.log).toEqual([]);
  });

  it("UT-BOOT-COST-054 a failed Cost prefetch never throws and the session project still lands", async () => {
    s.rejectScreen = true;
    const qc = client();
    await expect(boot(qc, `#/costs/capex?projectId=${ID}`)).resolves.toBeUndefined();
    expect(s.log).toContain("session:full");
  });

  it("UT-BOOT-COST-055 a PM route never starts the Cost reads", async () => {
    await boot(client(), `#/project/team?projectId=${ID}`);
    expect(s.log.filter((l) => l.startsWith("cost:"))).toEqual([]);
  });
});

describe("T-C03 admin deep link (BND-17)", () => {
  it("UT-BOOT-ADMIN-010 an admin deep link starts the admin screen's chunk and nothing else (no session project, no read)", async () => {
    await boot(client(), "#/admin/cost");
    expect(s.log).toEqual(["chunk:admin:cost"]);
  });

  it("UT-BOOT-ADMIN-011 the switch OFF restores today's boot: an admin deep link starts nothing", async () => {
    setEntryPrefetchForTests({ adminChunk: false });
    await boot(client(), "#/admin/cost");
    expect(s.log).toEqual([]);
  });

});
