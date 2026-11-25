/**
 * Structural sharing that understands `Date`s (D162, FE-SH-01, decision D-1: the `QueryClient` default).
 *
 * TanStack Query keeps a refetch's result identical to the cached one wherever the values are equal (`replaceEqualDeep`), so an
 * unchanged refetch re-renders nothing. Its `replaceEqualDeep` only descends into plain objects and arrays: a `Date` is never
 * plain, so it always counts as new, and so does every object and array that holds one. The session project, the contracts and
 * several Cost and PM reads carry `Date`s, so every refetch of them (window focus after the stale time, any invalidation) handed
 * the screens new objects with the same values: the whole app re-rendered on a tab return, the Contracts screen on every focus,
 * and the Add Cost from Table sheet was re-seeded (CA-31).
 *
 * This is TanStack's `replaceEqualDeep` (query-core 5.102.8, `utils.js:77-105`), line for line, plus one rule: two `Date`s with
 * the same time are equal and the cached one is kept. Every other non-plain value (a `Map`, a `Set`, a class instance) is still
 * replaced, exactly as before. Keeping a cached `Date` is safe because no code mutates one in place (every `set*` call in `src`
 * works on a copy: `domain/dates.ts`, `opexRules.toDate`, `landLeaseRules.toDate`, `costing/model.periodEnd`, checked 25 Nov 2026).
 */

const hasOwn = Object.prototype.hasOwnProperty;

function isPlainArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length === Object.keys(value).length;
}

function hasObjectPrototype(o: unknown): boolean {
  return Object.prototype.toString.call(o) === "[object Object]";
}

function isPlainObject(o: unknown): o is Record<string, unknown> {
  if (!hasObjectPrototype(o)) return false;
  const ctor = (o as { constructor?: unknown }).constructor;
  if (ctor === undefined) return true;
  const prot = (ctor as { prototype?: unknown }).prototype;
  if (!hasObjectPrototype(prot)) return false;
  if (!hasOwn.call(prot, "isPrototypeOf")) return false;
  if (Object.getPrototypeOf(o) !== Object.prototype) return false;
  return true;
}

/** Equal times (two invalid dates are equal too: both print "Invalid Date" and compare the same everywhere). */
function sameDate(a: Date, b: Date): boolean {
  const ta = a.getTime();
  const tb = b.getTime();
  return ta === tb || (Number.isNaN(ta) && Number.isNaN(tb));
}

export function replaceEqualDeepWithDates(a: unknown, b: unknown, depth = 0): unknown {
  if (a === b) return a;
  if (a instanceof Date && b instanceof Date) return sameDate(a, b) ? a : b;
  if (depth > 500) return b;
  const array = isPlainArray(a) && isPlainArray(b);
  if (!array && !(isPlainObject(a) && isPlainObject(b))) return b;
  const ao = a as Record<string | number, unknown>;
  const bo = b as Record<string | number, unknown>;
  const aSize = (array ? (a as unknown[]) : Object.keys(ao)).length;
  const bItems: (string | number)[] = array ? [...(b as unknown[]).keys()] : Object.keys(bo);
  const bSize = bItems.length;
  const copy = (array ? new Array<unknown>(bSize) : {}) as Record<string | number, unknown>;
  let equalItems = 0;
  for (let i = 0; i < bSize; i++) {
    const key = array ? i : bItems[i]!;
    const aItem = ao[key];
    const bItem = bo[key];
    if (aItem === bItem) {
      copy[key] = aItem;
      if (array ? i < aSize : hasOwn.call(ao, key)) equalItems++;
      continue;
    }
    if (aItem === null || bItem === null || typeof aItem !== "object" || typeof bItem !== "object") {
      copy[key] = bItem;
      continue;
    }
    const v = replaceEqualDeepWithDates(aItem, bItem, depth + 1);
    copy[key] = v;
    if (v === aItem) equalItems++;
  }
  return aSize === bSize && equalItems === aSize ? a : copy;
}

/** The `structuralSharing` option: TanStack calls it with (previous data, new data). */
export const structuralSharingWithDates = <T>(oldData: unknown, newData: T): T =>
  replaceEqualDeepWithDates(oldData, newData) as T;
