/**
 * Data wiring for `/admin/contract`. Reads and writes live in `@/data/adminContract`;
 * this file only binds them to TanStack Query. The canvas `btnGeneralPurposeReset` (refresh
 * everything, rebuild collections, keep fold state, recompute limits — ACS:4231-4293) becomes
 * invalidation of the selection's keys; fold state and limits are React-derived.
 *
 * Keys come from `qk.adminContract*` and writes invalidate through the shared
 * `invalidateAfterContractsWrite`, which also refreshes the project Contracts margin
 * seed (`qk.bopStandardAssumptions(c, t)`). Countries: `useActiveCountries()` (`@/data/countries`).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/data/keys";
import { listCapexAccounts } from "@/data/contracts";
import {
  DevCoTableUnavailableError, deleteStandardContract, getStandardContract,
  listContractDevCoRows, listStandardContracts, saveStandardContract,
  type SaveContractInput,
} from "@/data/adminContract";
import { invalidateAfterContractsWrite } from "@/data/adminInvalidation";
import type { CountryTechnology } from "@/domain/countryPicker";
import { isRetryable } from "@/platform/errors";

/** No retry for a missing table or a refusal; a couple for transient faults. */
function retry(failureCount: number, error: unknown): boolean {
  if (error instanceof DevCoTableUnavailableError) return false;
  return isRetryable(error) && failureCount < 2;
}

export function useStandardContracts(selection: CountryTechnology | undefined) {
  return useQuery({
    queryKey: qk.adminContractList(selection?.countryId ?? "-", selection?.technology ?? -1),
    queryFn: () => listStandardContracts(selection!.countryId, selection!.technology),
    enabled: Boolean(selection),
    retry,
  });
}

export function useContractDevCo(selection: CountryTechnology | undefined) {
  return useQuery({
    queryKey: qk.adminContractDevCo(selection?.countryId ?? "-", selection?.technology ?? -1),
    queryFn: () => listContractDevCoRows(selection!.countryId, selection!.technology),
    enabled: Boolean(selection),
    retry,
  });
}

/** The chart of accounts — the shared reader and key. */
export function useCapexAccounts() {
  return useQuery({
    queryKey: qk.capexAccounts,
    queryFn: listCapexAccounts,
    staleTime: 5 * 60 * 1000,
    retry,
  });
}

/** The fresh row the edit panel opens on (the canvas `Refresh` in `btn_Edit_AdminContracts.OnSelect`). */
export function useFetchContract() {
  const queryClient = useQueryClient();
  return (id: string) => queryClient.fetchQuery({
    queryKey: qk.adminContractRecord(id),
    queryFn: () => getStandardContract(id),
    staleTime: 0,
  });
}

/** Invalidates in `onSettled`: after a partial failure the parent is already written. */
export function useSaveContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveContractInput) => saveStandardContract(input),
    onSettled: (_data, _error, input) =>
      invalidateAfterContractsWrite(queryClient, { countryId: input.countryId, technology: input.technology }),
  });
}

export function useDeleteContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; selection: CountryTechnology }) => deleteStandardContract(args.id),
    onSettled: (_data, _error, args) => invalidateAfterContractsWrite(queryClient, args.selection),
  });
}
