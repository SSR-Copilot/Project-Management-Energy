/**
 * UT-BOOT-SCREENS-03x — PB-03 (`BOOT_PREFETCH_SCREEN_READS`): `bootPrefetch.ts` starts a Project Management screen's own reads
 * beside the session project, only for the screen the URL names, and only with the switch on. What the reads are, and that the
 * screens find them, is `pmScreenPrefetch.*.test.tsx`; this file pins WHEN they start.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

const s = vi.hoisted(() => ({ log: [] as string[], rejectScreen: false, holdSession: undefined as undefined | Promise<void> }));

vi.mock("@/data/project", () => ({
  loadProject: vi.fn(async (id: string) => { s.log.push("session"); if (s.holdSession) await s.holdSession; void id; return undefined; }),
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
}));
vi.mock("./pmScreenPrefetch", () => ({
  prefetchPmScreenReads: vi.fn(async (_qc: unknown, slug: string, id: string) => {
    s.log.push(`screen:${slug}:${id}`);
    if (s.rejectScreen) throw new Error("boom");
  }),
}));

import { startBootPrefetch } from "./bootPrefetch";
import { sessionProjectQueryOptions } from "./SessionContext";
import { resetBootDvopt, setBootDvoptForTests } from "@/data/bootDvoptFlags";
import { startupFlags } from "./startupFlags";
import { resetEntryPrefetch, setEntryPrefetchForTests } from "@/data/entryPrefetchFlags";

const ID = "9f5aade5-2b7c-ef11-ac20-000d3a466ab7";
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
const boot = (qc: QueryClient, hash: string) => startBootPrefetch(qc, { hash, search: "" });

beforeEach(() => {
  s.log.length = 0;
  s.rejectScreen = false;
  s.holdSession = undefined;
  startupFlags.bootPrefetch = true;
  resetBootDvopt();
  // T-C01: the Cost screen's own reads are `costScreenPrefetch.boot.test.ts`'s; this file pins the PM screens' start only.
  resetEntryPrefetch();
  setEntryPrefetchForTests({ costReads: false });
});

describe("PB-03 boot prefetch of a PM screen's own reads", () => {
  it("UT-BOOT-SCREENS-030 on by default: a deep link to each of the five screens starts that screen's reads and the session project", async () => {
    for (const slug of ["checklist", "team", "planning", "grid-operator", "milestones"]) {
      s.log.length = 0;
      await boot(client(), `#/project/${slug}?projectId=${ID}`);
      expect([...s.log].sort()).toEqual([`screen:${slug}:${ID}`, "session"]);
    }
  });

  it("UT-BOOT-SCREENS-031 the session project and the screen's reads start together: the reads do not wait for the project's answer", async () => {
    let release!: () => void;
    s.holdSession = new Promise<void>((r) => { release = r; });
    const done = boot(client(), `#/project/planning?projectId=${ID}`);
    await new Promise((r) => setTimeout(r, 20));
    expect(s.log).toContain(`screen:planning:${ID}`); // the project has not answered
    release();
    await done;
  });

  it("UT-BOOT-SCREENS-032 the switch OFF restores today's boot: the session project only", async () => {
    setBootDvoptForTests({ prefetchScreenReads: false });
    await boot(client(), `#/project/planning?projectId=${ID}`);
    expect(s.log).toEqual(["session"]);
  });

  it("UT-BOOT-SCREENS-033 only a PM screen route starts them: a Cost route, the project list and no project id start none", async () => {
    await boot(client(), `#/costs/capex?projectId=${ID}`);
    await boot(client(), "#/projects");
    await boot(client(), "#/project/planning");
    expect(s.log.filter((l) => l.startsWith("screen:"))).toEqual([]);
  });

  it("UT-BOOT-SCREENS-034 a failed screen prefetch never throws, and the session project is still primed", async () => {
    s.rejectScreen = true;
    const qc = client();
    await expect(boot(qc, `#/project/team?projectId=${ID}`)).resolves.toBeUndefined();
    expect(qc.getQueryState(sessionProjectQueryOptions(ID, "pm").queryKey)?.status).toBe("success");
  });
});
