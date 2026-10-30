// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { logHttp, resetRequestLog } from "@/platform/requestLog";
import { attachQueryLog, keyText } from "./queryLog";

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

  it("UT-REQLOG-022 a long query key is cut", () => {
    expect(keyText(["a".repeat(200)])).toHaveLength(80);
    expect(keyText(["x", 1])).toBe('["x",1]');
  });
});
