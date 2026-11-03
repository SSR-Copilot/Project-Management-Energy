// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { logHttp, resetRequestLog } from "@/platform/requestLog";
import { costWriteKey } from "@/domain/writeGuard";
import { actionName, attachQueryLog, keyText } from "./queryLog";

let info: ReturnType<typeof vi.spyOn>;
const lines = () => info.mock.calls.map((c: unknown[]) => String(c[0]));

beforeEach(() => {
  resetRequestLog();
  info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("query log", () => {
  it("UT-REQLOG-020 a query load prints one ACTION line with the requests made while it ran", async () => {
    const client = new QueryClient();
    const stop = attachQueryLog(client);
    await client.fetchQuery({
      queryKey: ["projects", "list"],
      queryFn: async () => {
        logHttp({ url: "/vsb_projects", method: "GET", statusCode: 200, duration: 3 });
        return [1, 2];
      },
    });
    stop();
    expect(lines().at(-1)).toMatch(/^\[VSB\] ACTION Load \["projects","list"\]: \d+ ms, 1 request, 0 rows \[a\d+\]$/);
  });

  it("UT-REQLOG-021 a mutation prints one line, FAILED when it throws, named by the route", async () => {
    const client = new QueryClient();
    const stop = attachQueryLog(client);
    window.location.hash = "#/project/team?projectId=1";
    const run = client.getMutationCache().build(client, { mutationFn: async () => { throw new Error("x"); } }).execute(undefined);
    await expect(run).rejects.toThrow("x");
    stop();
    const warn = (console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]));
    expect(warn.at(-1)).toMatch(/^\[VSB\] ACTION Write @ \/project\/team: \d+ ms, 0 requests, 0 rows, FAILED \[a\d+\]$/);
  });

  it("UT-REQLOG-023 a record id in a query key is logged as <id>, never the GUID (rule 23)", () => {
    expect(keyText(["land-lease-book", "ABCDEF01-0000-4000-8000-00000000abcd"]))
      .toBe('["land-lease-book","<id>"]');
  });

  it("UT-REQLOG-022 a long query key is cut", () => {
    expect(keyText(["a".repeat(200)])).toHaveLength(80);
    expect(keyText(["x", 1])).toBe('["x",1]');
  });
});

describe("query log — readable names (D78)", () => {
  const PID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

  it("UT-REQLOG-ACS-001 the Add Cost from Table Save, the other Cost writes and the sheet load have names without the project id", () => {
    expect(actionName("Write", costWriteKey(PID, "add-cost-sheet"))).toBe("Add Cost from Table save");
    expect(actionName("Write", costWriteKey(PID, "capex"))).toBe("Cost write (capex)");
    expect(actionName("Write", costWriteKey(PID))).toBe("Cost write");
    expect(actionName("Load", ["add-cost-sheet", PID, 3])).toBe("Add Cost from Table load (category 3)");
  });

  it("UT-REQLOG-ACS-002 every other key keeps its key text (no name)", () => {
    expect(actionName("Load", ["projects", "list"])).toBeUndefined();
    expect(actionName("Write", ["projects"])).toBeUndefined();
    expect(actionName("Load", costWriteKey(PID, "add-cost-sheet"))).toBeUndefined(); // a write key is not a load
    expect(actionName("Write", undefined)).toBeUndefined();
  });

  it("UT-REQLOG-ACS-003 the Save's ACTION line is named, and no project id reaches it", async () => {
    const client = new QueryClient();
    const stop = attachQueryLog(client);
    await client.getMutationCache().build(client, {
      mutationKey: costWriteKey(PID, "add-cost-sheet"), mutationFn: async () => "ok",
    }).execute(undefined);
    stop();
    expect(lines().at(-1)).toMatch(/^\[VSB\] ACTION Add Cost from Table save: \d+ ms, 0 requests, 0 rows \[a\d+\]$/);
    expect(lines().join("\n")).not.toContain(PID);
  });
});
