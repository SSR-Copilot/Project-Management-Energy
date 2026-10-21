/** Query-key factory. Keys are hierarchical so a project save can invalidate a subtree. */
export const qk = {
  bootstrap: ["bootstrap"] as const,
  projects: {
    all: ["projects"] as const,
    list: (filter?: string) => ["projects", "list", filter ?? ""] as const,
    /**
     * The portfolio grid's key. Sort and paging are part of it because the server applies
     * them: keying on the filter alone would serve page 1's cache entry for every page and
     * the pager would look broken while the network was in fact idle.
     */
    page: (
      filter: string | undefined,
      sortCol: string,
      sortAsc: boolean,
      page: number,
      pageSize: number,
    ) => ["projects", "page", filter ?? "", sortCol, sortAsc, page, pageSize] as const,
    one: (id: string) => ["projects", "one", id] as const,
    scope: (id: string) => ["projects", "one", id] as const,
    privileges: (id: string) => ["projects", "privileges", id] as const,
  },
  ref: {
    countries: ["ref", "countries"] as const,
    /** Scoped: the canvas repopulates Area from the chosen Country. */
    countryAreas: (countryId?: string) => ["ref", "countryAreas", countryId ?? ""] as const,
    projectStates: ["ref", "projectStates"] as const,
    people: ["ref", "people"] as const,
    clusterStates: ["ref", "clusterStates"] as const,
    milestones: ["ref", "milestones"] as const,
    contractTypes: ["ref", "contractTypes"] as const,
    generatorTypes: ["ref", "generatorTypes"] as const,
    capexAccounts: ["ref", "capexAccounts"] as const,
  },
  child: (table: string, projectId: string) => ["child", table, projectId] as const,
} as const;
