/**
 * Console summary of every page load and every save: one `[VSB] ACTION …` line each, with its
 * duration, requests and rows (`platform/requestLog.ts`).
 *
 * A TanStack query that fetches is a LOAD, a mutation is a WRITE; both are opened when the work
 * starts and closed when it settles. The queries and mutations keep no names of their own, so a
 * load is named by its query key and a write by the screen it ran on (the route in the URL hash).
 * Attached once, to the app's one `QueryClient`.
 */
import type { QueryClient } from "@tanstack/react-query";
import { beginAction, redactIds } from "@/platform/requestLog";

const MAX_KEY = 80;

const routeOf = (): string => {
  try {
    return window.location.hash.replace(/^#/, "").split("?")[0] || "/";
  } catch {
    return "/";
  }
};

/**
 * `["projects","list",{"page":1}]` cut to a readable stem. Record ids are replaced by `<id>`: the
 * Land Lease smoke test (E2E-LANDLEASE-002, 3 Nov 2026) found the project GUID printed in
 * `[VSB] ACTION Load ["land-lease-book","<guid>"]`.
 */
export const keyText = (key: readonly unknown[]): string => {
  let text: string;
  try {
    text = JSON.stringify(key);
  } catch {
    text = String(key);
  }
  // A record id is logged as `<id>`, never the GUID (CONVENTIONS rule 23, the shared `redactIds`).
  text = redactIds(text);
  return text.length > MAX_KEY ? `${text.slice(0, MAX_KEY - 1)}…` : text;
};

/**
 * A readable name for the keys support asks about most (D78), else `undefined` and the key text is
 * used. Never a row id: the project GUID in these keys is left out.
 *  - the Add Cost from Table Save (`costWriteKey(projectId, "add-cost-sheet")`, CA-15);
 *  - any other Cost write family (`["cost-write", projectId, family]`);
 *  - the Add Cost from Table sheet load (`["add-cost-sheet", projectId, category]`).
 */
export function actionName(kind: "Load" | "Write", key: readonly unknown[] | undefined): string | undefined {
  if (!key) return undefined;
  if (kind === "Write" && key[0] === "cost-write") {
    return key[2] === "add-cost-sheet" ? "Add Cost from Table save"
      : typeof key[2] === "string" ? `Cost write (${key[2]})` : "Cost write";
  }
  if (kind === "Load" && key[0] === "add-cost-sheet") return `Add Cost from Table load (category ${String(key[2])})`;
  return undefined;
}

export function attachQueryLog(client: QueryClient): () => void {
  const loads = new Map<string, (ok: boolean) => void>();
  const writes = new Map<number, (ok: boolean) => void>();

  const stopQueries = client.getQueryCache().subscribe((event) => {
    if (event.type !== "updated") return;
    const hash = event.query.queryHash;
    const action = event.action.type;
    if (action === "fetch" && !loads.has(hash)) {
      const key = event.query.queryKey;
      loads.set(hash, beginAction(actionName("Load", key) ?? `Load ${keyText(key)}`));
    } else if (action === "success" || action === "error") {
      loads.get(hash)?.(action === "success");
      loads.delete(hash);
    }
  });

  const stopMutations = client.getMutationCache().subscribe((event) => {
    if (event.type !== "updated") return;
    const id = event.mutation.mutationId;
    const action = event.action.type;
    if (action === "pending" && !writes.has(id)) {
      const key = event.mutation.options.mutationKey;
      writes.set(id, beginAction(actionName("Write", key) ?? (key ? `Write ${keyText(key)}` : `Write @ ${routeOf()}`)));
    } else if (action === "success" || action === "error") {
      writes.get(id)?.(action === "success");
      writes.delete(id);
    }
  });

  return () => {
    stopQueries();
    stopMutations();
  };
}
