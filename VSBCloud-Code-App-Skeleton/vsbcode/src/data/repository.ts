/**
 * Repository factory. One repository per table; every screen goes through one.
 *
 * This is the seam that removes the canvas apps' `ForAll(..., Patch(...))` habit: a
 * repository exposes `saveMany`, which becomes ONE CALL to `dataClient.batch`, no matter how
 * many rows. Read `dataClient.batch` before relying on that: it bounds concurrency over
 * individual writes and is NOT a transactional OData `$batch` changeset, because the SDK
 * exposes no such primitive. A `saveMany` of five rows can therefore half-apply. Where that
 * matters the fix is a Dataverse custom API, not a comment — see `solution/customapi/`.
 * The original text here claimed "exactly one `$batch`", which read as a transaction it has
 * never been.
 */
import { dataClient, type Query, type Page, type WriteOp } from "@/platform/dataClient";
import { f } from "@/platform/odata";

export interface Repository<T> {
  entitySet: string;
  defaultSelect: string[];
  list(q?: Partial<Query>): Promise<Page<T>>;
  listAll(q?: Partial<Query>): Promise<T[]>;
  getById(id: string, select?: string[]): Promise<T | undefined>;
  getOne(filter: string, select?: string[]): Promise<T | undefined>;
  byProject(projectId: string, q?: Partial<Query>): Promise<T[]>;
  create(data: Record<string, unknown>): Promise<string>;
  update(id: string, data: Record<string, unknown>): Promise<void>;
  remove(id: string): Promise<void>;
  saveMany(ops: Omit<WriteOp, "entitySet">[]): Promise<void>;
}

export function makeRepository<T>(
  entitySet: string,
  defaultSelect: string[],
  opts: { projectLookup?: string } = {},
): Repository<T> {
  const projectCol = opts.projectLookup ?? "_vsb_project_value";
  return {
    entitySet,
    defaultSelect,
    list: (q = {}) => dataClient.list<T>(entitySet, { select: defaultSelect, ...q }),
    listAll: async (q = {}) =>
      (await dataClient.list<T>(entitySet, { select: defaultSelect, ...q, all: true })).rows,
    getById: (id, select) => dataClient.getById<T>(entitySet, id, select ?? defaultSelect),
    getOne: (filter, select) =>
      dataClient.getOne<T>(entitySet, { select: select ?? defaultSelect, filter }),
    byProject: async (projectId, q = {}) =>
      (
        await dataClient.list<T>(entitySet, {
          select: defaultSelect,
          ...q,
          filter: f.and(f.guid(projectCol, projectId), q.filter),
          all: true,
        })
      ).rows,
    create: (data) => dataClient.create(entitySet, data),
    update: (id, data) => dataClient.update(entitySet, id, data),
    remove: (id) => dataClient.remove(entitySet, id),
    saveMany: (ops) => dataClient.batch(ops.map((o) => ({ ...o, entitySet }))),
  };
}
