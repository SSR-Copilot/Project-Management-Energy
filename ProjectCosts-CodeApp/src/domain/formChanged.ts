
/**
 * Whether an Edit panel's form differs from what it opened with (D111 Finance, D113 Revenues; the user's request,
 * 12 Nov 2026 — not a Canvas rule): an Edit panel's Save stays off until this is true.
 *
 * The VALUES are compared, nested objects, arrays and dates included, so a value typed back to what it was turns Save
 * off again. A screen whose form carries its own dirty flag (`formDirty`, the Canvas `locFormIsDirty`) keeps using it.
 */
export function formChanged(opened: unknown, current: unknown): boolean {
  return !sameValue(opened, current);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  }
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
    const ra = a as Record<string, unknown>;
    const rb = b as Record<string, unknown>;
    const keys = Object.keys(ra);
    return keys.length === Object.keys(rb).length && keys.every((k) => k in rb && sameValue(ra[k], rb[k]));
  }
  return false;
}
