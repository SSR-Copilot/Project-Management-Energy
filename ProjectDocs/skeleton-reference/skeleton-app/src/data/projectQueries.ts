/**
 * The Project Main Screen's single read.
 *
 * Replaces the canvas `colFilteredProjects` — and, more to the point, replaces the rebuild's
 * own `projectRepo.list({ all: true })` + client-side `.filter()`, which pulled every row on
 * every mount and is the exact pattern `CLAUDE.md` rule 1 forbids.
 *
 * This is a thin wrapper, not new plumbing: `projectRepo.list()` already accepts
 * `top`/`skip`/`count` and already returns a `Page<T>` carrying `totalCount`. What the wrapper
 * adds is three invariants:
 *
 *   1. `select` is the explicit 24-column `projectMain` projection, not the repo default.
 *   2. `all: true` is never set — one request per page, never a table walk.
 *   3. `count: true` is always set, so `totalCount` is present in *both* data modes. Live
 *      Dataverse only annotates the count when asked.
 *
 * `filter` arrives pre-built. This module deliberately takes a string rather than the filter
 * model, because `src/data` must not import from `src/features` — the model and its builder
 * live in `features/project-main/rules.ts`.
 */
import { projectRepo, type ProjectRow } from "./repos";
import { SELECT } from "./entities";
import { asc, desc } from "@/platform/odata";

export interface PageRequest {
  /** 1-based. */
  page: number;
  pageSize: number;
}

export interface SortRequest {
  /** A logical column name. Validate it against an allow-list before it gets here. */
  col: string;
  asc: boolean;
}

export interface ProjectQueryPage {
  rows: ProjectRow[];
  /** Post-filter, pre-page — the grid footer's "Total Rows". */
  totalCount: number;
}

export async function queryProjects(
  filter: string | undefined,
  page: PageRequest,
  sort: SortRequest,
): Promise<ProjectQueryPage> {
  const res = await projectRepo.list({
    select: [...SELECT.projectMain],
    filter,
    orderBy: [sort.asc ? asc(sort.col) : desc(sort.col)],
    top: page.pageSize,
    skip: Math.max(0, (Math.max(1, page.page) - 1) * page.pageSize),
    count: true,
  });

  // `?? rows.length` is a floor, not a guess: if a future data source declines to annotate
  // the count, a footer reading the page size beats one reading "undefined".
  return { rows: res.rows, totalCount: res.totalCount ?? res.rows.length };
}
