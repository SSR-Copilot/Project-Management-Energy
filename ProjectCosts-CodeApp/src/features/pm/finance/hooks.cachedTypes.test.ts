/**
 * UT-TYPELEAN-020.. — PA-10 (dvopt T-22): Finance's turbine count reuses the Generators types list the warm-up cached, but only while it is
 * as fresh as this visit (D109: a copy fetched before the visit began is stale at once; one fetched during it keeps the app's 30 s).
 * Cache reads only: the helper never fetches.
 */
import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { qk } from "@/data/keys";
import { cachedGeneratorTypeIds } from "./hooks";

const PID = "11111111-1111-1111-1111-111111111111";
const APP_STALE = 30 * 1000;
const visitStale = (mountedAt: number) => (query: { state: { dataUpdatedAt: number } }) => (query.state.dataUpdatedAt < mountedAt ? 0 : APP_STALE);

const seeded = (updatedAt: number) => {
  const qc = new QueryClient();
  qc.setQueryData(qk.generators(PID, "types"), [{ id: "a" }, { id: "b" }], { updatedAt });
  return qc;
};

describe("cachedGeneratorTypeIds (PA-10)", () => {
  it("UT-TYPELEAN-020 a list fetched during this visit (the warm-up, 1.5 s in) is reused", () => {
    const mountedAt = Date.now() - 5_000;
    expect(cachedGeneratorTypeIds(seeded(Date.now() - 3_000), PID, visitStale(mountedAt))).toEqual(["a", "b"]);
  });

  it("UT-TYPELEAN-021 a list cached BEFORE the visit began is not reused, however young (D109)", () => {
    const mountedAt = Date.now() - 1_000;
    expect(cachedGeneratorTypeIds(seeded(Date.now() - 10_000), PID, visitStale(mountedAt))).toBeNull();
  });

  it("UT-TYPELEAN-022 a list older than 30 s, an invalidated one and an empty cache are not reused; nothing is fetched", () => {
    const mountedAt = Date.now() - 120_000;
    expect(cachedGeneratorTypeIds(seeded(Date.now() - 60_000), PID, visitStale(mountedAt))).toBeNull();
    const qc = seeded(Date.now() - 1_000);
    void qc.invalidateQueries({ queryKey: qk.generators(PID, "types"), refetchType: "none" });
    expect(cachedGeneratorTypeIds(qc, PID, visitStale(mountedAt))).toBeNull();
    expect(cachedGeneratorTypeIds(new QueryClient(), PID, visitStale(mountedAt))).toBeNull();
  });

  it("UT-TYPELEAN-023 another project's list is never used", () => {
    const qc = seeded(Date.now() - 1_000);
    expect(cachedGeneratorTypeIds(qc, "22222222-2222-2222-2222-222222222222", visitStale(Date.now() - 5_000))).toBeNull();
  });
});
