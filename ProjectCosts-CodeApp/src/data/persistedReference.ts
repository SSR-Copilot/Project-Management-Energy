/**
 * Reference data kept across sessions in IndexedDB (D142, first user: the Generators orderable catalogue,
 * `GENERATORS_PERF.persistCatalogue`, default OFF).
 *
 * WHAT IT IS FOR: a catalogue nobody edits during a session is read again on every visit, one request per page of rows.
 * The cache lets the next session show the rows from the previous one at once and replace them as soon as the read answers
 * (stale-while-revalidate). It is a speed-up of the FIRST paint, never a source of truth: the caller always refetches, and the
 * fresh rows replace the cached ones.
 *
 * SAFETY RULES (each pinned by `persistedReference.test.ts`, UT-GENPERF-*):
 *  - a VERSION key: an entry saved under another version (a new app build, a changed select list, a changed row shape) is
 *    dropped, never read;
 *  - a MAXIMUM AGE: an entry older than `maxAgeMs` (or dated in the future, a clock that moved back) is dropped;
 *  - UNAVAILABLE storage is an empty cache: no IndexedDB (private window, blocked site data, an old browser, a test), a
 *    database that cannot be opened, or any read or write that throws or never answers, is caught and behaves as "nothing
 *    cached". Nothing here ever throws to the caller and a failed write is only traced;
 *  - a malformed entry (not our shape, or failing the caller's `validate`) is dropped like an old one;
 *  - NOTHING PERSONAL is stored: only what the caller hands to `write`, which must be reference data. The entry adds a
 *    version string and a timestamp. The caller names the columns it stores (see `GENERATORS_PERF` in the decision log).
 *  - every outcome is traced as one `[VSB] ACTION` line (CONVENTIONS rule 23): the cache name, hit / miss / dropped and why,
 *    the row count and the age. Never the rows.
 *
 * No npm dependency: a thin wrapper over the browser's `indexedDB` (the same API a test replaces with an injected store).
 */
import { logAction } from "@/platform/requestLog";

/** The few operations the cache needs. A test injects an in-memory one; the app uses `indexedDbStore()`. */
export interface ReferenceStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

const DB_NAME = "vsb-reference-cache";
const STORE_NAME = "entries";

/** How long a storage call may take before it counts as "not answering" (a blocked upgrade never fires any event). */
export const STORAGE_TIMEOUT_MS = 3000;

/** Rejects after `ms` so a storage call that never answers cannot hold the screen's first paint. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("storage timed out")), ms);
    work.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * The browser's IndexedDB as a `ReferenceStore`, or `null` when there is none (`globalThis.indexedDB` missing or throwing on
 * access, as a blocked-storage browser does). `factory` is the test seam; the database is opened lazily on first use and the
 * handle is dropped when the open fails, so a later call tries again.
 */
export function indexedDbStore(factory?: IDBFactory | null): ReferenceStore | null {
  let idb: IDBFactory | null | undefined = factory;
  if (idb === undefined) {
    try { idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB ?? null; } catch { idb = null; }
  }
  if (!idb) return null;
  const factoryInUse = idb;
  let opening: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => {
    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try { request = factoryInUse.open(DB_NAME, 1); } catch (e) { reject(e); return; }
      request.onupgradeneeded = () => { request.result.createObjectStore(STORE_NAME); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("indexedDB open failed"));
      request.onblocked = () => reject(new Error("indexedDB open blocked"));
    }).catch((e: unknown) => { opening = null; throw e; });
    return opening;
  };
  const run = <T,>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest): Promise<T> =>
    withTimeout(open().then((db) => new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = act(tx.objectStore(STORE_NAME));
      tx.oncomplete = () => resolve(request.result as T);
      tx.onerror = () => reject(tx.error ?? new Error("indexedDB transaction failed"));
      tx.onabort = () => reject(tx.error ?? new Error("indexedDB transaction aborted"));
    })), STORAGE_TIMEOUT_MS);
  return {
    get: (key) => run<unknown>("readonly", (s) => s.get(key)),
    set: (key, value) => run<unknown>("readwrite", (s) => s.put(value, key)).then(() => undefined),
    remove: (key) => run<unknown>("readwrite", (s) => s.delete(key)).then(() => undefined),
  };
}

/** A short, stable fingerprint of text (FNV-1a, base 36): the version key's part for a select list, a row shape. */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** The version string of an entry: the parts joined, so any part changing changes the version. */
export const referenceVersion = (...parts: readonly string[]): string => parts.join("|");

/** What is stored under a key. `v` is the version, `t` the save time (ms since the epoch), `data` the caller's rows. */
interface Entry<T> {
  v: string;
  t: number;
  data: T;
}

export interface PersistedHit<T> {
  data: T;
  /** When the entry was saved (ms since the epoch). */
  savedAt: number;
  ageMs: number;
}

export interface PersistedReferenceConfig<T> {
  /** Names the cache in the store's keys and in the trace lines, e.g. `generatorCatalogue`. Reference data only. */
  name: string;
  /** The version key (`referenceVersion`): an entry of another version is dropped. */
  version: string;
  /** The oldest an entry may be and still be read. */
  maxAgeMs: number;
  /** `null`: no storage (everything behaves as empty). Default: the browser's IndexedDB, or none when it is missing. */
  store?: ReferenceStore | null;
  /** The clock (a test injects one). */
  now?: () => number;
  /** Is the stored `data` the shape the caller expects? A failing entry is dropped. */
  validate?: (data: unknown) => data is T;
  /** Rows in `data` for the trace line. */
  rowsOf?: (data: T) => number;
}

export interface PersistedReference<T> {
  /** The cached entry for `key`, or `null` for a miss of any kind (none, other version, too old, malformed, storage failing). Never throws. */
  read(key: string): Promise<PersistedHit<T> | null>;
  /** Saves `data` under `key`. Never throws; a failure is traced. */
  write(key: string, data: T): Promise<void>;
  /** Forgets `key`. Never throws. */
  remove(key: string): Promise<void>;
}

const seconds = (ms: number): string => `${Math.round(ms / 1000)} s`;

export function createPersistedReference<T>(config: PersistedReferenceConfig<T>): PersistedReference<T> {
  const { name, version, maxAgeMs, validate, rowsOf } = config;
  const now = config.now ?? Date.now;
  let resolved: ReferenceStore | null | undefined = config.store;
  const store = (): ReferenceStore | null => {
    if (resolved === undefined) resolved = indexedDbStore();
    return resolved;
  };
  const storeKey = (key: string): string => `${name}:${key}`;
  const trace = (text: string): void => logAction(`Reference cache ${name}: ${text}`);

  const drop = async (s: ReferenceStore, key: string): Promise<void> => {
    try { await s.remove(storeKey(key)); } catch { /* an entry that cannot be removed is dropped again at the next read */ }
  };

  return {
    async read(key) {
      const s = store();
      if (!s) { trace("unavailable (no storage), reading from the server"); return null; }
      let stored: unknown;
      try {
        stored = await s.get(storeKey(key));
      } catch (error) {
        trace(`unavailable (${error instanceof Error ? error.message.slice(0, 80) : "read failed"}), reading from the server`);
        return null;
      }
      if (stored === undefined || stored === null) { trace("miss (nothing saved)"); return null; }
      const entry = stored as Partial<Entry<unknown>>;
      if (typeof entry !== "object" || typeof entry.v !== "string" || typeof entry.t !== "number" || !("data" in entry)) {
        trace("dropped (not a cache entry)");
        await drop(s, key);
        return null;
      }
      if (entry.v !== version) { trace("dropped (other version)"); await drop(s, key); return null; }
      const ageMs = now() - entry.t;
      if (ageMs < 0 || ageMs > maxAgeMs) {
        trace(`dropped (${ageMs < 0 ? "saved in the future" : `older than ${seconds(maxAgeMs)}`})`);
        await drop(s, key);
        return null;
      }
      let valid = true;
      try { valid = !validate || validate(entry.data); } catch { valid = false; }
      if (!valid) { trace("dropped (unexpected shape)"); await drop(s, key); return null; }
      const data = entry.data as T;
      let rows = "";
      try { rows = rowsOf ? `${rowsOf(data)} rows, ` : ""; } catch { /* a count that cannot be taken is left out of the line */ }
      trace(`hit (${rows}saved ${seconds(ageMs)} ago), shown now and re-read from the server`);
      return { data, savedAt: entry.t, ageMs };
    },

    async write(key, data) {
      const s = store();
      if (!s) return;
      try {
        await s.set(storeKey(key), { v: version, t: now(), data } satisfies Entry<T>);
        trace(`saved (${rowsOf ? `${rowsOf(data)} rows` : "entry"})`);
      } catch (error) {
        trace(`not saved (${error instanceof Error ? error.message.slice(0, 80) : "write failed"})`);
      }
    },

    async remove(key) {
      const s = store();
      if (s) await drop(s, key);
    },
  };
}
