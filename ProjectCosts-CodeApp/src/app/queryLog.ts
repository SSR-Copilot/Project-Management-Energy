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
import { beginAction } from "@/platform/requestLog";

const MAX_KEY = 80;

const routeOf = (): string => {
  try {
    return window.location.hash.replace(/^#/, "").split("?")[0] || "/";
  } catch {
    return "/";
  }
};

/** `["projects","list",{"page":1}]` cut to a readable stem. */
export const keyText = (key: readonly unknown[]): string => {
  let text: string;
  try {
    text = JSON.stringify(key);
  } catch {
    text = String(key);
  }
  return text.length > MAX_KEY ? `${text.slice(0, MAX_KEY - 1)}…` : text;
};

export function attachQueryLog(client: QueryClient): () => void {
  const loads = new Map<string, (ok: boolean) => void>();
  const writes = new Map<number, (ok: boolean) => void>();

  const stopQueries = client.getQueryCache().subscribe((event) => {
    if (event.type !== "updated") return;
    const hash = event.query.queryHash;
    const action = event.action.type;
    if (action === "fetch" && !loads.has(hash)) {
      loads.set(hash, beginAction(`Load ${keyText(event.query.queryKey)}`));
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
      writes.set(id, beginAction(key ? `Write ${keyText(key)}` : `Write @ ${routeOf()}`));
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
