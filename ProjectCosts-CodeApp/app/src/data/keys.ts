/**
 * react-query cache keys, in one place so an invalidation cannot miss a consumer.
 *
 * Everything project-scoped carries the project id, because the Cost app is opened per
 * project via a deep link and switching projects must not show the previous one's rows.
 */
export const qk = {
  session: ["session"] as const,
  environmentVariables: ["environmentVariables"] as const,

  project: (projectId: string) => ["project", projectId] as const,
  projectCountry: (countryId: string) => ["projectCountry", countryId] as const,

  capexAccounts: ["capexAccounts"] as const,

  contracts: (projectId: string) => ["contracts", projectId] as const,
  paymentTargets: (projectId: string) => ["paymentTargets", projectId] as const,
  devCoLinks: (projectId: string) => ["devCoLinks", projectId] as const,
  devCoCapexContracts: (projectId: string) => ["devCoCapexContracts", projectId] as const,
  devCoCapexCosts: (projectId: string) => ["devCoCapexCosts", projectId] as const,
  bopStandardAssumptions: (countryId: string | undefined, technology: number | undefined) =>
    ["bopStandardAssumptions", countryId ?? "-", technology ?? -1] as const,
} as const;

/** Everything that a contract save can affect. */
export function contractInvalidations(projectId: string) {
  return [
    qk.contracts(projectId),
    qk.paymentTargets(projectId),
    qk.devCoLinks(projectId),
  ];
}
