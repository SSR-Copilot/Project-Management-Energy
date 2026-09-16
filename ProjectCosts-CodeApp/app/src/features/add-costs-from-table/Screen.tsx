/**
 * Add Cost from Table — composition only, faithful port of the canvas modal.
 *
 * Every decision still lives in `./rules.ts` (validation, the diff, contract/cost upserts,
 * the past-cost delete guard) or in `src/data/addCostSheet.ts` (the actual Dataverse
 * reads/writes) — unchanged. What changed in this round is the grid/UI layer: instead of a
 * plain HTML table, the actual `react-spreadsheet`-based grid the canvas's `vsb_Dev.SpreadSheet`
 * PCF control used is ported under `./spreadsheet/` and rendered inside a full-screen modal
 * overlay laid out exactly like `Add Costs from Table.pa.yaml`:
 *   scrim -> centered white panel (90% x 90%) -> blue header bar with title + cancel "X" ->
 *   toolbar (Add Row / Delete Row / Copy Table) -> the grid, scrollable -> footer
 *   Cancel/Save buttons.
 *
 * DELETION BEHAVIOUR is a single switch — `CANVAS_PARITY_DELETION` below.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@fluentui/react-components";
import { Dismiss24Regular, Add20Regular, Delete20Regular, Copy20Regular } from "@fluentui/react-icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import { EmptyState, LoadingOverlay } from "@/components";
import { useSession } from "@/app/SessionContext";
import { serverEnforcedProvider } from "@/platform/privileges";
import { costAllowedStart, SENTINEL_YEAR } from "@/features/capex-costs/clusters";
import { CATEGORY_LABELS, resolveCategory } from "@/features/capex-costs/rules";
import { useAddCostSheet, useSaveAddCostSheet } from "@/features/costing/useCostBook";
import {
  ADDCOST_MSG, buildInitialSheet, canOpenBulkEdit, canSaveBulkEdit, diffRows,
  planContractDeletions, planContractDeletionsCanvasParity, sheetTitle, sheetYearRange,
  validateSheet, type SheetRow, type ValidationError,
} from "./rules";
import {
  alignOriginalRowIds, identityRoundTripFailures, outputRowsToSheetRows, rowIdentity,
  sheetRowsToGrid,
} from "./spreadsheet/adapter";
import { SpreadSheetComp, gridToJson, type SheetGrid } from "./spreadsheet/SpreadSheet";

/**
 * Canvas-exact deletion, ON — the client's explicit choice.
 *
 * `planContractDeletionsCanvasParity` (SOURCE DEFECT A-1) deletes any contract that
 * disappears from the sheet together with its ENTIRE cost history, unconditionally. That is
 * literally what the canvas does, and parity with the canvas is the requirement here.
 *
 * It is only safe while the sheet's identity round trip is perfect, and it once was not: a
 * single save on project Wirmighausen removed ~168 CAPEX cost rows nobody had touched. The
 * cause was the grid layer, not this flag — the sheet opened on the wrong year range and the
 * original rows carried ids the round trip could not match. Both are fixed and pinned by
 * tests, and the two guards below (`identityRoundTripFailures`, `alignOriginalRowIds`) stay
 * in force regardless of this constant: they refuse the save when OUR mapping breaks, which
 * is a different thing from the user genuinely removing a row.
 *
 * Flip to `false` for `planContractDeletions`, which additionally spares any contract
 * carrying costs in a past year and reports it (`ADDCOST_MSG.pastCostGuard`).
 */
export const CANVAS_PARITY_DELETION = true;

/** No canvas equivalent — the canvas has no notion of its own round trip failing. */
const ROUND_TRIP_FAILED = (names: string[]): string =>
  "This cost table could not be matched back to the contracts it was built from "
  + `(${names.join(", ")}), so saving it could delete costs you did not change. `
  + "Nothing was saved. Please reload the screen and report this if it persists.";

const emptyMonths = (): (number | null)[] => new Array(12).fill(null);

export default function AddCostsFromTableScreen() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const category = resolveCategory(search.get("category"));
  const { project, projectId, loading: sessionLoading } = useSession();

  const sheetQuery = useAddCostSheet(category);
  const save = useSaveAddCostSheet(category);

  const currentYear = new Date().getFullYear();
  const codDate = project?.milestones?.operationsStartCod;
  const codYear = codDate && codDate.getFullYear() > SENTINEL_YEAR ? codDate.getFullYear() : null;
  /*
   * `locCostAllowedStartYear` — the sheet's FIRST year, and the single most dangerous number on
   * this screen: get it wrong and every already-booked year below it falls outside the grid.
   *
   * The canvas computes `varPreferredStartDate = If(locProjectStartClusterNo > 0,
   * 'Acquisition date', 'Project Start Date')` (`CapexScreenCode.txt:75-115`), so the real
   * start-cluster number has to be passed — defaulting it to 0 silently picks the wrong date
   * for every acquired project. (The other half of that defect was in the project loader,
   * which read the wrong column entirely; see `loadProject` in `src/data/project.ts`.)
   */
  const costAllowedStartYear = costAllowedStart(project ?? {}, project?.startClusterNo ?? 0).year;
  const years = sheetYearRange(costAllowedStartYear, codYear);

  const [originalRows, setOriginalRows] = useState<SheetRow[]>([]);
  const [currentRows, setCurrentRows] = useState<SheetRow[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [addRowToken, setAddRowToken] = useState(0);
  const [deleteRowToken, setDeleteRowToken] = useState(0);
  const [copyTableToken, setCopyTableToken] = useState(0);

  const subaccounts = sheetQuery.data?.subaccounts ?? [];
  const existingContracts = sheetQuery.data?.contracts ?? [];
  const existingCosts = sheetQuery.data?.costs ?? [];

  /*
   * Built once per fresh load — this is what re-hydrates the grid; it must NOT be recreated on
   * every keystroke, or the grid (which owns its own edit state internally, PCF-style) would
   * reset mid-edit.
   *
   * `roundTripped` is the SAME data pushed straight back out through the grid. It, not
   * `loadedRows`, is what the save diffs against: `Row_ID` is positional and the grid drops
   * anything outside its year range, so comparing a user's edits against `buildInitialSheet`'s
   * raw output pairs rows that have nothing to do with each other — which is precisely how a
   * project's historical costs were emptied in one save.
   */
  const loaded = useMemo(() => {
    if (!sheetQuery.data || !project) return null;
    const loadedRows = buildInitialSheet({
      subaccounts: sheetQuery.data.subaccounts,
      contracts: sheetQuery.data.contracts,
      costs: sheetQuery.data.costs,
      currentYear,
      payerDefaults: sheetQuery.data.payerDefaults,
    });
    const grid = sheetRowsToGrid(loadedRows, sheetQuery.data.accounts, years.years);
    const roundTripped = outputRowsToSheetRows(
      gridToJson(grid, String(years.start)),
      sheetQuery.data.subaccounts,
      sheetQuery.data.contracts,
    );
    return { loadedRows, grid, roundTripped };
    // `currentYear` is stable for the component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetQuery.data, project, years.start, years.end]);

  const initialGrid: SheetGrid | null = loaded?.grid ?? null;

  // Re-hydrates whenever fresh data lands — first load, or a refetch after a save elsewhere.
  useEffect(() => {
    if (!loaded) return;
    setOriginalRows(loaded.roundTripped);
    setCurrentRows(loaded.roundTripped);
  }, [loaded]);

  const payerDefaultsKeyed = useMemo(() => {
    const map: Record<string, Record<string, unknown>> = {};
    for (const sub of subaccounts) {
      const payer = sheetQuery.data?.payerDefaults.get(sub.id);
      if (payer) {
        map[sub.number] = { vsb_devcospv: payer === "SPV" ? "952850002" : "952850001" };
      }
    }
    return [map];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetQuery.data]);

  const permissions = useMemo(() => ({
    canCreateCost: serverEnforcedProvider.forTable("vsb_capexcosts").canCreate,
    canCreateContract: serverEnforcedProvider.forTable("vsb_capexprojectcontracts").canCreate,
  }), []);

  const errors: ValidationError[] = useMemo(() => validateSheet(currentRows), [currentRows]);

  const back = () => navigate({ pathname: "/costs/capex", search: `?category=${category}` });

  const handleDataChange = (grid: SheetGrid) => {
    const json = gridToJson(grid, String(years.start));
    setCurrentRows(outputRowsToSheetRows(json, subaccounts, existingContracts));
  };

  const doSave = async () => {
    setSaveError(null);
    setSaveNotice(null);
    if (!canSaveBulkEdit(permissions, errors) || !loaded) return;

    /*
     * Refuse to save at all if a contract the sheet was BUILT from no longer resolves once the
     * grid is read back. To every deletion planner that looks exactly like "the user removed
     * this row", and the contract plus its whole cost history goes. It is never a real user
     * action, so it must fail loudly instead.
     */
    const lost = identityRoundTripFailures(loaded.loadedRows, loaded.roundTripped);
    if (lost.length > 0) {
      setSaveError(ROUND_TRIP_FAILED(lost.map((l) => l.description)));
      return;
    }

    // `Row_ID` is positional; pair rows by what they actually ARE before diffing.
    const alignedOriginals = alignOriginalRowIds(originalRows, currentRows);
    const changed = diffRows(currentRows, alignedOriginals);

    const deletion = CANVAS_PARITY_DELETION
      ? {
        deleteIds: planContractDeletionsCanvasParity({
          originalRows: alignedOriginals, sheetRows: currentRows,
        }),
        blockedByPastCosts: [] as { id: string; name: string }[],
      }
      : planContractDeletions({
        originalRows: alignedOriginals,
        sheetRows: currentRows,
        contracts: existingContracts,
        costs: existingCosts,
        currentYear,
      });
    const contractDeleteIds = deletion.deleteIds;

    /*
     * A (contract, year) that was on the sheet and no longer is has its months blanked, so the
     * cost rows behind it are removed. Keyed on identity, NOT on `rowId` — `rowId` shifts
     * whenever a row is inserted or deleted, and blanking a row that is still on the sheet
     * deletes booked money.
     */
    const stillPresent = new Set(
      currentRows.filter((r) => r.projectContractId !== null).map(rowIdentity),
    );
    const orphanCleanup = originalRows
      .filter((orig) => orig.projectContractId !== null && !stillPresent.has(rowIdentity(orig)))
      .filter((orig) => !contractDeleteIds.includes(orig.projectContractId as string))
      .map((orig) => ({ ...orig, months: emptyMonths() }));

    try {
      await save.mutateAsync({
        changedRows: [...changed, ...orphanCleanup],
        existingContracts,
        existingCosts,
        contractDeleteIds,
      });
      if (deletion.blockedByPastCosts.length > 0) {
        // Saved, but something the user asked to remove was deliberately spared — stay put and
        // say so rather than navigating away from a half-applied intention.
        setSaveNotice(ADDCOST_MSG.pastCostGuard(deletion.blockedByPastCosts.map((c) => c.name)));
        return;
      }
      back();
    } catch {
      setSaveError(ADDCOST_MSG.saveFailed);
    }
  };

  if (!projectId) {
    return (
      <EmptyState title="No project selected"
        description="Open this table from a project's DEVEX/CAPEX screen." />
    );
  }
  if (!canOpenBulkEdit(permissions)) {
    return <EmptyState title="Read-only" description={ADDCOST_MSG.noPermission} />;
  }
  if (sheetQuery.error) {
    return (
      <EmptyState title="Cost data is unavailable"
        description="This category's contracts and costs could not be loaded." />
    );
  }
  /*
   * The project itself gates the grid: its start/COD dates ARE the sheet's columns. Rendering
   * before it lands would build the grid around the current year and hide every earlier year.
   */
  if (!sessionLoading && !project) {
    return (
      <EmptyState title="Project is unavailable"
        description="This project's dates could not be read, so the cost table's years cannot be established." />
    );
  }
  if (sheetQuery.isLoading || sessionLoading || initialGrid === null) {
    return <LoadingOverlay mode="inline" label="Loading the cost table…" />;
  }

  const categoryName = CATEGORY_LABELS[category] ?? "";
  const title = sheetTitle(project?.projectName ?? "", categoryName);

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.7)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
    >
      <div
        style={{
          width: "90%", height: "90%", background: "#fff",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* Header bar */}
        <div
          style={{
            height: 42, minHeight: 42, background: "var(--colorBrandBackground, #0f6cbd)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 15px 0 20px",
          }}
        >
          <span style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>{title}</span>
          <Button
            appearance="transparent"
            icon={<Dismiss24Regular style={{ color: "#fff" }} />}
            title="Cancel"
            aria-label="Cancel"
            onClick={back}
          />
        </div>

        {/* Toolbar */}
        <div
          style={{
            height: 50, minHeight: 50, display: "flex", alignItems: "center", gap: 5,
            padding: "5px 10px", background: "#fff",
          }}
        >
          <Button appearance="transparent" icon={<Add20Regular />} onClick={() => setAddRowToken((t) => t + 1)}>
            Add Row
          </Button>
          <Button appearance="transparent" icon={<Delete20Regular />} onClick={() => setDeleteRowToken((t) => t + 1)}>
            Delete Row
          </Button>
          <Button appearance="transparent" icon={<Copy20Regular />} onClick={() => setCopyTableToken((t) => t + 1)}>
            Copy Table
          </Button>
        </div>

        {saveError ? <div className="canvas-error" role="alert">{saveError}</div> : null}
        {saveNotice ? <div className="canvas-error" role="status">{saveNotice}</div> : null}
        {save.error ? (
          <div className="canvas-error" role="alert">{(save.error as Error).message}</div>
        ) : null}
        {errors.length > 0 ? (
          <div className="canvas-error" role="alert">
            <strong>{`${errors.length} validation error(s):`}</strong>
            <ul>
              {errors.map((e) => <li key={`${e.rowKey}-${e.message}`}>{e.message}</li>)}
            </ul>
          </div>
        ) : null}

        {/* Grid */}
        <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
          <SpreadSheetComp
            data={initialGrid}
            onDataChange={handleDataChange}
            subaccountDataIn={payerDefaultsKeyed}
            addRowToken={addRowToken}
            deleteRowToken={deleteRowToken}
            copyTableToken={copyTableToken}
          />
        </div>

        {/* Footer buttons */}
        <div
          style={{
            height: 50, minHeight: 50, display: "flex", alignItems: "center",
            justifyContent: "flex-end", gap: 10, padding: "0 20px",
          }}
        >
          <Button appearance="outline" onClick={back}>Cancel</Button>
          <Button
            appearance="primary"
            disabled={!canSaveBulkEdit(permissions, errors) || save.isPending}
            onClick={() => { void doSave(); }}
          >
            Save
          </Button>
        </div>
      </div>

      {save.isPending ? <LoadingOverlay label="Please wait, saving costs..." /> : null}
    </div>
  );
}
