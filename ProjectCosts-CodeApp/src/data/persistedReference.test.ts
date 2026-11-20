/**
 * UT-GENPERF-240.. — `persistedReference.ts` (D142): the version key, the maximum age, stale-while-revalidate's storage half,
 * the "storage is unavailable or throws" fallback, and the IndexedDB wrapper itself (against a small fake IDBFactory).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const logged = vi.hoisted(() => ({ lines: [] as string[] }));
vi.mock("@/platform/requestLog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/platform/requestLog")>()),
  logAction: (message: string) => { logged.lines.push(message); },
}));

import {
  STORAGE_TIMEOUT_MS, createPersistedReference, fingerprint, indexedDbStore, referenceVersion, type ReferenceStore,
} from "./persistedReference";

const HOUR = 3_600_000;

/** An in-memory store; `fail` makes the named operation throw. */
function memoryStore(fail: Partial<Record<"get" | "set" | "remove", Error>> = {}): ReferenceStore & { map: Map<string, unknown> } {
  const map = new Map<string, unknown>();
  return {
    map,
    get: async (k) => { if (fail.get) throw fail.get; return map.get(k); },
    set: async (k, v) => { if (fail.set) throw fail.set; map.set(k, v); },
    remove: async (k) => { if (fail.remove) throw fail.remove; map.delete(k); },
  };
}

const rows = [{ id: "g1" }, { id: "g2" }];
const isRows = (d: unknown): d is { id: string }[] => Array.isArray(d) && d.every((r) => typeof (r as { id?: unknown }).id === "string");

let clock = 1_000_000;
const make = (store: ReferenceStore | null, extra: { version?: string; maxAgeMs?: number } = {}) =>
  createPersistedReference<{ id: string }[]>({
    name: "testCache", version: extra.version ?? "v1", maxAgeMs: extra.maxAgeMs ?? 12 * HOUR, store, now: () => clock,
    validate: isRows, rowsOf: (r) => r.length,
  });

beforeEach(() => { clock = 1_000_000; logged.lines = []; });

describe("persistedReference: read and write", () => {
  it("UT-GENPERF-240 a saved entry is read back with its age, and the trace names the rows, never their content", async () => {
    const store = memoryStore();
    const cache = make(store);
    await cache.write("2028-06-01", rows);
    clock += 5 * 60_000;
    const hit = await cache.read("2028-06-01");
    expect(hit).toEqual({ data: rows, savedAt: 1_000_000, ageMs: 300_000 });
    expect(logged.lines).toEqual([
      "Reference cache testCache: saved (2 rows)",
      "Reference cache testCache: hit (2 rows, saved 300 s ago), shown now and re-read from the server",
    ]);
  });

  it("UT-GENPERF-241 nothing saved is a miss; another key is a miss", async () => {
    const cache = make(memoryStore());
    expect(await cache.read("a")).toBeNull();
    await cache.write("a", rows);
    expect(await cache.read("b")).toBeNull();
    expect(logged.lines.filter((l) => l.includes("miss"))).toHaveLength(2);
  });

  it("UT-GENPERF-242 a newer write replaces the older entry", async () => {
    const cache = make(memoryStore());
    await cache.write("a", rows);
    clock += 1000;
    await cache.write("a", [{ id: "g9" }]);
    expect((await cache.read("a"))?.data).toEqual([{ id: "g9" }]);
  });

  it("UT-GENPERF-243 remove forgets the entry", async () => {
    const cache = make(memoryStore());
    await cache.write("a", rows);
    await cache.remove("a");
    expect(await cache.read("a")).toBeNull();
  });
});

describe("persistedReference: expiry", () => {
  it("UT-GENPERF-244 an entry exactly at the maximum age is still served; one millisecond older is dropped and removed", async () => {
    const store = memoryStore();
    const cache = make(store, { maxAgeMs: 12 * HOUR });
    await cache.write("a", rows);
    clock += 12 * HOUR;
    expect(await cache.read("a")).not.toBeNull();
    clock += 1;
    expect(await cache.read("a")).toBeNull();
    expect(store.map.size).toBe(0);
    expect(logged.lines.some((l) => l.includes("dropped (older than 43200 s)"))).toBe(true);
  });

  it("UT-GENPERF-245 an entry dated in the future (the clock moved back) is dropped", async () => {
    const store = memoryStore();
    const cache = make(store);
    await cache.write("a", rows);
    clock -= 60_000;
    expect(await cache.read("a")).toBeNull();
    expect(store.map.size).toBe(0);
  });
});

describe("persistedReference: version", () => {
  it("UT-GENPERF-246 an entry written under another version is never read, and is removed", async () => {
    const store = memoryStore();
    await make(store, { version: "build-1" }).write("a", rows);
    expect(await make(store, { version: "build-2" }).read("a")).toBeNull();
    expect(store.map.size).toBe(0);
    expect(logged.lines.some((l) => l.includes("dropped (other version)"))).toBe(true);
  });

  it("UT-GENPERF-247 the version string changes with any part, and the fingerprint is stable and sensitive", () => {
    expect(referenceVersion("shape1", "b1", "x")).not.toBe(referenceVersion("shape1", "b2", "x"));
    expect(referenceVersion("shape1", "b1", "x")).not.toBe(referenceVersion("shape2", "b1", "x"));
    expect(fingerprint("vsb_a,vsb_b")).toBe(fingerprint("vsb_a,vsb_b"));
    expect(fingerprint("vsb_a,vsb_b")).not.toBe(fingerprint("vsb_a,vsb_c"));
  });
});

describe("persistedReference: shape", () => {
  it("UT-GENPERF-248 a stored value that is not an entry, or whose rows fail the check, is dropped", async () => {
    const store = memoryStore();
    const cache = make(store);
    store.map.set("testCache:a", "garbage");
    expect(await cache.read("a")).toBeNull();
    store.map.set("testCache:b", { v: "v1", t: clock, data: [{ nope: 1 }] });
    expect(await cache.read("b")).toBeNull();
    store.map.set("testCache:c", { v: "v1", t: "yesterday", data: rows });
    expect(await cache.read("c")).toBeNull();
    expect(store.map.size).toBe(0);
  });

  it("UT-GENPERF-249 a validator or counter that throws is a drop / a missing count, never an exception", async () => {
    const store = memoryStore();
    const boom = createPersistedReference<{ id: string }[]>({
      name: "testCache", version: "v1", maxAgeMs: HOUR, store, now: () => clock,
      validate: ((): never => { throw new Error("bad"); }) as unknown as (d: unknown) => d is { id: string }[],
    });
    await boom.write("a", rows);
    expect(await boom.read("a")).toBeNull();
    const counter = createPersistedReference<{ id: string }[]>({
      name: "testCache", version: "v1", maxAgeMs: HOUR, store, now: () => clock,
      rowsOf: () => { throw new Error("count"); },
    });
    await counter.write("b", rows);
    expect(await counter.read("b")).not.toBeNull();
  });
});

describe("persistedReference: storage unavailable or throwing behaves as an empty cache", () => {
  it("UT-GENPERF-250 no storage at all (null): read is a miss, write and remove do nothing, nothing throws", async () => {
    const cache = make(null);
    await expect(cache.write("a", rows)).resolves.toBeUndefined();
    await expect(cache.remove("a")).resolves.toBeUndefined();
    expect(await cache.read("a")).toBeNull();
    expect(logged.lines.some((l) => l.includes("unavailable (no storage)"))).toBe(true);
  });

  it("UT-GENPERF-251 a read that throws is a miss", async () => {
    const cache = make(memoryStore({ get: new Error("QuotaExceededError") }));
    expect(await cache.read("a")).toBeNull();
    expect(logged.lines.some((l) => l.includes("unavailable (QuotaExceededError)"))).toBe(true);
  });

  it("UT-GENPERF-252 a write that throws is traced and swallowed", async () => {
    const cache = make(memoryStore({ set: new Error("SecurityError") }));
    await expect(cache.write("a", rows)).resolves.toBeUndefined();
    expect(logged.lines).toEqual(["Reference cache testCache: not saved (SecurityError)"]);
  });

  it("UT-GENPERF-253 a failing remove does not hide the miss", async () => {
    const store = memoryStore({ remove: new Error("nope") });
    const cache = make(store, { version: "v2" });
    store.map.set("testCache:a", { v: "v1", t: clock, data: rows });
    expect(await cache.read("a")).toBeNull();
  });

  it("UT-GENPERF-254 with no store given, the default is the browser's IndexedDB; none there means an empty cache", async () => {
    const cache = createPersistedReference<{ id: string }[]>({ name: "testCache", version: "v1", maxAgeMs: HOUR });
    // Node has no `indexedDB`: the cache must simply be empty.
    expect(await cache.read("a")).toBeNull();
    await expect(cache.write("a", rows)).resolves.toBeUndefined();
  });
});

/* ───────────────────────────── a minimal IDBFactory, enough for the wrapper ───────────────────────────── */

interface FakeOptions { failOpen?: boolean; blocked?: boolean; hang?: boolean; throwOnOpen?: boolean }

function fakeIndexedDb(options: FakeOptions = {}) {
  const data = new Map<string, unknown>();
  let opens = 0;
  const later = (fn: () => void) => { queueMicrotask(fn); };
  const factory = {
    open() {
      opens += 1;
      if (options.throwOnOpen) throw new Error("SecurityError");
      const request: Record<string, unknown> = { result: undefined, error: null };
      later(() => {
        if (options.hang) return;
        if (options.blocked) { (request.onblocked as () => void)(); return; }
        if (options.failOpen) { request.error = new Error("open failed"); (request.onerror as () => void)(); return; }
        const db = {
          createObjectStore: () => ({}),
          transaction: () => {
            const tx: Record<string, unknown> = { error: null };
            tx.objectStore = () => ({
              get: (k: string) => op(() => data.get(k)),
              put: (v: unknown, k: string) => op(() => { data.set(k, v); return k; }),
              delete: (k: string) => op(() => { data.delete(k); return undefined; }),
            });
            const op = (run: () => unknown) => {
              const r: Record<string, unknown> = {};
              later(() => { r.result = run(); later(() => (tx.oncomplete as () => void)()); });
              return r;
            };
            return tx;
          },
        };
        request.result = db;
        (request.onupgradeneeded as () => void)();
        (request.onsuccess as () => void)();
      });
      return request;
    },
  } as unknown as IDBFactory;
  return { factory, data, opens: () => opens };
}

describe("indexedDbStore (the wrapper, against a fake IDBFactory)", () => {
  it("UT-GENPERF-260 get, set and remove round-trip through one opened database", async () => {
    const fake = fakeIndexedDb();
    const store = indexedDbStore(fake.factory)!;
    expect(await store.get("k")).toBeUndefined();
    await store.set("k", { a: 1 });
    expect(await store.get("k")).toEqual({ a: 1 });
    await store.remove("k");
    expect(await store.get("k")).toBeUndefined();
    expect(fake.opens()).toBe(1);
  });

  it("UT-GENPERF-261 no factory: null (the cache is then empty)", () => {
    expect(indexedDbStore(null)).toBeNull();
  });

  it("UT-GENPERF-262 an access to globalThis.indexedDB that throws (blocked storage) is no storage", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, get() { throw new Error("blocked"); } });
    try {
      expect(indexedDbStore()).toBeNull();
    } finally {
      if (original) Object.defineProperty(globalThis, "indexedDB", original); else delete (globalThis as { indexedDB?: unknown }).indexedDB;
    }
  });

  it("UT-GENPERF-263 a database that cannot be opened (error, blocked, throwing open) makes reads misses and a later call tries again", async () => {
    for (const failure of [{ failOpen: true }, { blocked: true }, { throwOnOpen: true }] as const) {
      const fake = fakeIndexedDb(failure);
      const cache = createPersistedReference<{ id: string }[]>({
        name: "testCache", version: "v1", maxAgeMs: HOUR, store: indexedDbStore(fake.factory), now: () => clock,
      });
      expect(await cache.read("a")).toBeNull();
      await expect(cache.write("a", rows)).resolves.toBeUndefined();
      await cache.read("a");
      expect(fake.opens()).toBeGreaterThanOrEqual(2);
    }
  });

  it("UT-GENPERF-264 a database that never answers is given up after the timeout, not waited for", async () => {
    vi.useFakeTimers();
    try {
      const fake = fakeIndexedDb({ hang: true });
      const cache = createPersistedReference<{ id: string }[]>({
        name: "testCache", version: "v1", maxAgeMs: HOUR, store: indexedDbStore(fake.factory), now: () => clock,
      });
      const pending = cache.read("a");
      await vi.advanceTimersByTimeAsync(STORAGE_TIMEOUT_MS + 1);
      expect(await pending).toBeNull();
      expect(logged.lines.some((l) => l.includes("storage timed out"))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("UT-GENPERF-265 a cache over the wrapper saves and reads an entry end to end", async () => {
    const fake = fakeIndexedDb();
    const cache = createPersistedReference<{ id: string }[]>({
      name: "testCache", version: "v1", maxAgeMs: HOUR, store: indexedDbStore(fake.factory), now: () => clock, validate: isRows,
    });
    await cache.write("2028-06-01", rows);
    expect([...fake.data.keys()]).toEqual(["testCache:2028-06-01"]);
    expect((await cache.read("2028-06-01"))?.data).toEqual(rows);
  });
});
