/**
 * UT-CATSCOPE — PA-12 (dvopt T-22): the persisted Generators catalogue (`persistCatalogue`, stays OFF) is filed under the environment and the
 * user. IndexedDB is per origin, so without a scope two people on one browser profile, or two environments served from one origin, would
 * read each other's last catalogue. The underlying store is one shared in-memory store, exactly as one origin's IndexedDB is.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogModel } from "@/features/pm/generators/rules";

const shared = vi.hoisted(() => ({ map: new Map<string, unknown>() }));
vi.mock("./persistedReference", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./persistedReference")>();
  return {
    ...mod,
    // The one store every scope shares: only the cache's own keys keep the entries apart.
    createPersistedReference: <T,>(config: Parameters<typeof mod.createPersistedReference<T>>[0]) => mod.createPersistedReference<T>({
      ...config,
      store: {
        get: async (k) => shared.map.get(k),
        set: async (k, v) => { shared.map.set(k, v); },
        remove: async (k) => { shared.map.delete(k); },
      },
    }),
  };
});
vi.mock("@/platform/requestLog", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/platform/requestLog")>()), logAction: () => undefined }));

import { catalogueScopeKey, generatorCatalogueCache, setGeneratorCatalogueCache } from "./generatorCatalogueCache";

const model = (id: string): CatalogModel => ({ id, prices: [], countryAvailability: [] } as unknown as CatalogModel);
const FID = "2028-06-01";
const A = { environmentId: "11111111-aaaa-aaaa-aaaa-000000000001", userId: "u-alice" };
const B = { environmentId: "11111111-aaaa-aaaa-aaaa-000000000001", userId: "u-bob" };
const OTHER_ENV = { environmentId: "22222222-bbbb-bbbb-bbbb-000000000002", userId: "u-alice" };

beforeEach(() => { shared.map.clear(); setGeneratorCatalogueCache(null); });
afterEach(() => setGeneratorCatalogueCache(null));

describe("the stored catalogue is scoped to the environment and the user (PA-12)", () => {
  it("UT-CATSCOPE-001 the same user and environment read back what they wrote", async () => {
    await generatorCatalogueCache(A).write(FID, [model("m1")]);
    expect((await generatorCatalogueCache(A).read(FID))?.data).toEqual([model("m1")]);
  });

  it("UT-CATSCOPE-002 another user of the same browser profile never gets the entry", async () => {
    await generatorCatalogueCache(A).write(FID, [model("m1")]);
    expect(await generatorCatalogueCache(B).read(FID)).toBeNull();
    await generatorCatalogueCache(B).write(FID, [model("bob")]);
    // Both entries live side by side; neither overwrote the other.
    expect((await generatorCatalogueCache(A).read(FID))?.data).toEqual([model("m1")]);
    expect((await generatorCatalogueCache(B).read(FID))?.data).toEqual([model("bob")]);
  });

  it("UT-CATSCOPE-003 the same user in another environment never gets the entry", async () => {
    await generatorCatalogueCache(A).write(FID, [model("m1")]);
    expect(await generatorCatalogueCache(OTHER_ENV).read(FID)).toBeNull();
  });

  it("UT-CATSCOPE-004 the scope key: environment ids compare case-insensitively, the user id is only a hash in the key, and unknown ids give no key", () => {
    const key = catalogueScopeKey(A)!;
    expect(key.startsWith(`${A.environmentId}.`)).toBe(true);
    expect(key).not.toContain("alice");
    expect(catalogueScopeKey({ ...A, environmentId: A.environmentId.toUpperCase() })).toBe(key);
    expect(catalogueScopeKey(B)).not.toBe(key);
    expect(catalogueScopeKey(OTHER_ENV)).not.toBe(key);
    expect(catalogueScopeKey({ environmentId: A.environmentId })).toBeNull();
    expect(catalogueScopeKey({ userId: A.userId })).toBeNull();
    expect(catalogueScopeKey({ environmentId: "", userId: "" })).toBeNull();
  });

  it("UT-CATSCOPE-005 failure injection: with either id unknown nothing is read or written, and an unscoped legacy entry is never read", async () => {
    const unknown = generatorCatalogueCache({ environmentId: A.environmentId, userId: undefined });
    await unknown.write(FID, [model("m1")]);
    expect(shared.map.size).toBe(0);
    expect(await unknown.read(FID)).toBeNull();
    // An entry an older build filed under the bare FID date is ignored by every scope.
    shared.map.set(`generatorCatalogue:${FID}`, { v: "x", t: Date.now(), data: [model("old")] });
    expect(await generatorCatalogueCache(A).read(FID)).toBeNull();
  });

  it("UT-CATSCOPE-006 the entries are filed under the scope key, so a second user's write cannot reach the first user's entry", async () => {
    await generatorCatalogueCache(A).write(FID, [model("m1")]);
    await generatorCatalogueCache(B).write(FID, [model("bob")]);
    const keys = [...shared.map.keys()];
    expect(keys).toHaveLength(2);
    expect(keys.every((k) => k.startsWith("generatorCatalogue:"))).toBe(true);
    expect(keys).toContain(`generatorCatalogue:${catalogueScopeKey(A)}:${FID}`);
    expect(keys).toContain(`generatorCatalogue:${catalogueScopeKey(B)}:${FID}`);
  });

  it("UT-CATSCOPE-007 `remove` forgets only the caller's own entry", async () => {
    await generatorCatalogueCache(A).write(FID, [model("m1")]);
    await generatorCatalogueCache(B).write(FID, [model("bob")]);
    await generatorCatalogueCache(A).remove(FID);
    expect(await generatorCatalogueCache(A).read(FID)).toBeNull();
    expect((await generatorCatalogueCache(B).read(FID))?.data).toEqual([model("bob")]);
  });
});
