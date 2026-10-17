/**
 * C3 — the loading / fatal / empty / ready switch every settings page body repeats.
 *
 * It renders exactly what the screens render today: `LoadingOverlay mode="inline"` while loading,
 * `EmptyState` (or, for Check List Settings, an error `NoticeBar`) with a Retry when a query has
 * nothing to show, an `EmptyState` when the screen says the data is empty, otherwise `children()`.
 * It does NOT render the stale-refresh bar: screens keep their own `NoticeBar` where it sits
 * today, fed by `health.staleError`.
 *
 * Pass only ENABLED queries to `useQueryHealth`: a disabled TanStack v5 query stays `isPending`.
 */
import type { ReactNode } from "react";
import type { QueryHealth } from "@/app/useQueryHealth";
import { EmptyState } from "./EmptyState";
import { LoadingOverlay } from "./LoadingOverlay";
import { NoticeBar } from "./NoticeBar";

export interface QueryStatesFatal {
  /** EmptyState title (empty-state mode) or NoticeBar title (notice mode). */
  title?: string;
  /** Screen-owned wording for the error, unchanged. */
  text: (error: unknown) => string;
  /** Default "Retry" (Project Gates: "Try again"). */
  retryLabel?: string;
  /** Retry aria-label override (notice mode, e.g. "Retry loading tasks"). */
  retryAriaLabel?: string;
  /** Default "failed": only the queries with an error refetch. */
  retry?: "failed" | "all";
  /** Check List Settings renders the fatal state as an error NoticeBar. Default "empty-state". */
  as?: "empty-state" | "notice";
}

export interface QueryStatesProps {
  health: QueryHealth;
  loadingLabel: string;
  fatal: QueryStatesFatal;
  empty?: { when: boolean; title: string; description?: string };
  /** Rendered only when ready and not empty. */
  children: () => ReactNode;
}

export function QueryStates({ health, loadingLabel, fatal, empty, children }: QueryStatesProps) {
  if (health.phase === "loading") return <LoadingOverlay mode="inline" label={loadingLabel} />;
  if (health.phase === "fatal") {
    const retryLabel = fatal.retryLabel ?? "Retry";
    const retry = fatal.retry === "all" ? health.retryAll : health.retryFailed;
    const text = fatal.text(health.fatalError);
    if (fatal.as === "notice") {
      return (
        <NoticeBar
          intent="error"
          {...(fatal.title ? { title: fatal.title } : {})}
          action={{ label: retryLabel, onClick: retry, ...(fatal.retryAriaLabel ? { ariaLabel: fatal.retryAriaLabel } : {}) }}
        >
          {text}
        </NoticeBar>
      );
    }
    return <EmptyState title={fatal.title ?? ""} description={text} action={{ label: retryLabel, onClick: retry }} />;
  }
  if (empty?.when) {
    return <EmptyState title={empty.title} {...(empty.description ? { description: empty.description } : {})} />;
  }
  return <>{children()}</>;
}
