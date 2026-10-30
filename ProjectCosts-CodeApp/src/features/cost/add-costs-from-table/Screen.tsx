/**
 * Add Cost from Table — composition only. The canvas shows it as a modal; here it is the
 * right-docked `FormPanel` (see the DIVERGENCE note at the render).
 *
 * Every decision still lives in `./rules.ts` (validation, the diff, contract/cost upserts,
 * the past-cost delete guard) or in `src/data/addCostSheet.ts` (the actual Dataverse
 * reads/writes) — unchanged. What changed in this round is the grid/UI layer: instead of a
 * plain HTML table, the actual `react-spreadsheet`-based grid the canvas's `vsb_Dev.SpreadSheet`
 * PCF control used is ported under `./spreadsheet/`. It sits in the panel body under the title
 * and cancel "X": toolbar (Add Row / Delete Row / Copy Table) -> the grid, scrollable ->
 * footer Save / Cancel (`Add Costs from Table.pa.yaml`).
 *
 * DELETION BEHAVIOUR is a single switch — `CANVAS_PARITY_DELETION` below.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Switch } from "@fluentui/react-components";
import { Add20Regular, Delete20Regular, Copy20Regular } from "@fluentui/react-icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import { EmptyState, FormPanel, LoadingOverlay, PanelButtons } from "@/components";
import { useSession } from "@/app/SessionContext";
import { serverEnforcedProvider } from "@/platform/privileges";
import { costAllowedStart, SENTINEL_YEAR } from "@/features/cost/capex-costs/clusters";
import { CATEGORY_LABELS, resolveCategory } from "@/features/cost/capex-costs/rules";
import { useAddCostSheet, useSaveAddCostSheet } from "@/features/cost/costing/useCostBook";
import { toSaveFailure } from "@/data/addCostSheet";
import { rootCauseDetail } from "@/platform/errors";
import {
  ADDCOST_MSG, buildInitialSheet, canOpenBulkEdit, canSaveBulkEdit, saveFailureText,
  sheetTitle, sheetYearRange, validateSheet, type SheetRow, type ValidationError,
} from "./rules";
import { outputRowsToSheetRows, prepareSheetSave, sheetRowsToGrid } from "./spreadsheet/adapter";
import { SpreadSheetComp, gridToJson, type SheetGrid } from "./spreadsheet/SpreadSheet";
import { currentYearIndex } from "./spreadsheet/viewColumns";
import { saveButtonDisabled, saveRequestRows } from "./saveRetry";
import { logAction } from "@/platform/requestLog";

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
  /*
   * NEW (no canvas equivalent, D67): the table opens on the current year only; the switch shows every year. It only changes
   * which columns are drawn — the grid, the read-back, validation, Copy Table and Save always use every year.
   */
  const [showAllYears, setShowAllYears] = useState(false);
  /*
   * Identity key → id of every NEW row a save attempt of THIS loaded sheet sent. Kept across a
   * failed save on purpose: the retry sends the same ids, so it updates what the failed attempt
   * created instead of duplicating it. Cleared after a successful save and on every fresh load.
   */
  const idCache = useRef(new Map<string, string>());
  /*
   * Row identities sent by failed saves of THIS loaded sheet: they may have landed, so for them
   * the snapshot (`originalRows`, `existingContracts`, `existingCosts`) no longer matches
   * Dataverse. The next save re-sends them and asks the data layer to re-read before it plans
   * (`saveRequestRows`). Same lifecycle as `idCache`: cleared after a successful save and on
   * every fresh load.
   */
  const sentInFailedAttempts = useRef(new Set<string>());

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
  /*
   * A fresh snapshot (first load, another project or category, a refetch after a save) already
   * holds whatever an earlier attempt created, as stored rows, so the cache starts over. Keyed on
   * the sheet DATA, not on `loaded`: a session refresh rebuilds `loaded` from the same, older
   * snapshot, and clearing then would let a retry duplicate rows a failed attempt created.
   */
  useEffect(() => {
    idCache.current.clear();
    sentInFailedAttempts.current.clear();
  }, [sheetQuery.data]);

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

  /*
   * How long the latest grid read-back and validation took, for the Save's one-line timing
   * log. Both run on every settled edit, not on Save — `currentRows` is already up to date
   * when Save is clicked — but they are the client-side work a Save waits behind.
   */
  const readBackMs = useRef(0);
  const validationMs = useRef(0);

  const errors: ValidationError[] = useMemo(() => {
    const t0 = performance.now();
    const out = validateSheet(currentRows);
    validationMs.current = performance.now() - t0;
    return out;
  }, [currentRows]);

  const back = () => navigate({ pathname: "/costs/capex", search: `?category=${category}` });

  const handleDataChange = (grid: SheetGrid) => {
    const t0 = performance.now();
    const json = gridToJson(grid, String(years.start));
    const rows = outputRowsToSheetRows(json, subaccounts, existingContracts);
    readBackMs.current = performance.now() - t0;
    setCurrentRows(rows);
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
     *
     * That refusal, the identity alignment, the diff, the deletion plan and the orphan clean-up
     * (which blanks the months of every (contract, year) that left the sheet, keyed on
     * identity, never on the positional `rowId`) are one pure function, `prepareSheetSave`,
     * with the same steps in the same order as when they were written out here.
     */
    const prepared = prepareSheetSave({
      loadedRows: loaded.loadedRows,
      roundTripped: loaded.roundTripped,
      originalRows,
      currentRows,
      contracts: existingContracts,
      costs: existingCosts,
      currentYear,
      canvasParityDeletion: CANVAS_PARITY_DELETION,
      now: () => performance.now(),
    });
    const t = prepared.timings;
    const ms = (n: number) => n.toFixed(1);
    // One line, so a slow Save can be pinned on the client side or the network side at a glance.
    logAction(
      `Add Cost from Table prepare: ${ms(t.total)} ms (round-trip check ${ms(t.roundTripCheck)}, `
      + `align ${ms(t.align)}, diff ${ms(t.diff)}, deletions ${ms(t.deletions)}, `
      + `orphans ${ms(t.orphans)}; last edit's grid read-back ${ms(readBackMs.current)}, `
      + `validation ${ms(validationMs.current)}; ${currentRows.length} rows)`,
    );
    if (prepared.kind === "lost") {
      setSaveError(ROUND_TRIP_FAILED(prepared.lost.map((l) => l.description)));
      return;
    }
    const { changed, orphanCleanup, deletion } = prepared;
    const contractDeleteIds = deletion.deleteIds;
    // After a failed attempt: re-send the rows it sent, and re-read before planning (F-A, M1).
    const { changedRows, refreshBeforePlan, sentIdentities } = saveRequestRows({
      changed, orphanCleanup, currentRows, sentBefore: sentInFailedAttempts.current,
    });

    // Drop the previous attempt's technical line so it never sits under a newer outcome.
    save.reset();
    try {
      await save.mutateAsync({
        changedRows,
        existingContracts,
        existingCosts,
        contractDeleteIds,
        idCache: idCache.current,
        refreshBeforePlan,
      });
      idCache.current.clear();
      sentInFailedAttempts.current.clear();
      if (deletion.blockedByPastCosts.length > 0) {
        // Saved, but something the user asked to remove was deliberately spared — stay put and
        // say so rather than navigating away from a half-applied intention.
        setSaveNotice(ADDCOST_MSG.pastCostGuard(deletion.blockedByPastCosts.map((c) => c.name)));
        // The save no longer waits for a reload (it navigates away), so staying here reloads now.
        void sheetQuery.refetch();
        return;
      }
      back();
    } catch (error) {
      // The canvas wording, plus what the bulk save says about the failure. The id cache is
      // deliberately NOT cleared here: a retry must reuse the ids this attempt sent. Part of
      // this attempt may have landed, so the retry plans against a fresh read, not the snapshot.
      for (const id of sentIdentities) sentInFailedAttempts.current.add(id);
      setSaveError(saveFailureText(toSaveFailure(error)));
      // The full chain (phase → chunk → Dataverse fault) for support; the screen shows one line.
      console.error("Add Cost from Table save failed", error);
    }
  };

  const categoryName = CATEGORY_LABELS[category] ?? "";
  const title = project ? sheetTitle(project.projectName ?? "", categoryName) : "Add Cost from Table";
  const canSave = canSaveBulkEdit(permissions, errors);

  /*
   * The panel is always mounted so the CAPEX screen behind it never flashes; what it holds depends
   * on the state of the sheet. Each non-grid state is the one the full-screen modal used to show.
   */
  let body: ReactNode;
  if (!projectId) {
    body = <EmptyState title="No project selected"
      description="Open this table from a project's DEVEX/CAPEX screen." />;
  } else if (!canOpenBulkEdit(permissions)) {
    body = <EmptyState title="Read-only" description={ADDCOST_MSG.noPermission} />;
  } else if (sheetQuery.error) {
    body = <EmptyState title="Cost data is unavailable"
      description="This category's contracts and costs could not be loaded." />;
  } else if (!sessionLoading && !project) {
    /*
     * The project itself gates the grid: its start/COD dates ARE the sheet's columns. Rendering
     * before it lands would build the grid around the current year and hide every earlier year.
     */
    body = <EmptyState title="Project is unavailable"
      description="This project's dates could not be read, so the cost table's years cannot be established." />;
  } else if (sheetQuery.isLoading || sessionLoading || initialGrid === null) {
    body = <LoadingOverlay mode="inline" label="Loading the cost table…" />;
  } else {
    body = (
      <div className="add-cost-table">
        <div className="add-cost-table-toolbar">
          <Button aria-label="Add Row" data-testid="btn_AddRow_SpreadSheet_Costs_ProjectCosts_TableCommandBar_AddDataTable" appearance="transparent" icon={<Add20Regular />} onClick={() => setAddRowToken((t) => t + 1)}>
            Add Row
          </Button>
          <Button aria-label="Delete Row" data-testid="btn_DeleteRow_SpreadSheet_Costs_ProjectCosts_TableCommandBar_AddDataTable" appearance="transparent" icon={<Delete20Regular />} onClick={() => setDeleteRowToken((t) => t + 1)}>
            Delete Row
          </Button>
          <Button aria-label="Copy Table" data-testid="btn_CopyData_SpreadSheet_Costs_ProjectCosts_TableCommandBar_AddDataTable_3" appearance="transparent" icon={<Copy20Regular />} onClick={() => setCopyTableToken((t) => t + 1)}>
            Copy Table
          </Button>
          <Switch
            label="Show all years" aria-label="Show all years" data-testid="add-costs-show-all-years"
            checked={showAllYears} onChange={(_, d) => setShowAllYears(d.checked)}
          />
        </div>

        {saveError ? <div className="canvas-error" role="alert">{saveError}</div> : null}
        {saveNotice ? <div className="canvas-error" role="status">{saveNotice}</div> : null}
        {save.error ? (
          <div className="canvas-error" role="alert">
            {[(save.error as Error).message, rootCauseDetail(save.error)].filter(Boolean).join(" Dataverse: ")}
          </div>
        ) : null}
        {errors.length > 0 ? (
          <div className="canvas-error" role="alert">
            <strong>{`${errors.length} validation error(s):`}</strong>
            <ul>
              {errors.map((e) => <li key={`${e.rowKey}-${e.message}`}>{e.message}</li>)}
            </ul>
          </div>
        ) : null}

        <div className="add-cost-table-grid">
          <SpreadSheetComp
            data={initialGrid}
            onDataChange={handleDataChange}
            subaccountDataIn={payerDefaultsKeyed}
            addRowToken={addRowToken}
            deleteRowToken={deleteRowToken}
            copyTableToken={copyTableToken}
            visibleYearIndex={showAllYears ? null : currentYearIndex(currentYear, years.start, years.years.length)}
          />
        </div>
      </div>
    );
  }

  /*
   * DIVERGENCE: the canvas shows this table as a centred 90 % x 90 % modal over a scrim. Here it is
   * the right-docked panel every other screen uses (product owner, 26 Oct 2026), at ~95 % of the
   * screen so the grid keeps the room the modal gave it. Everything inside is unchanged: same
   * header text, same close and Save / Cancel identities, same busy text. `dirty` stays false on
   * purpose: the modal's Cancel closed without asking, and so does this.
   */
  return (
    <FormPanel
      open
      title={title}
      width="grid"
      panelClassName="add-cost-table-panel"
      closeTestId="ico_PopUpConfirmation_BodyHeader_2"
      closeLabel="Cancel"
      onDismiss={back}
      {...(save.isPending ? { busyLabel: "Please wait, saving costs..." } : {})}
      footer={(
        <PanelButtons
          onSave={() => { void doSave(); }}
          // Not while the sheet reloads either (`saveButtonDisabled` says why).
          disabled={saveButtonDisabled({ canSave, isPending: save.isPending, isFetching: sheetQuery.isFetching })}
          saveTestId="pcf_Spreadsheet_Costs_ProjectCosts_BodyButtons_Save"
          cancelTestId="pcf_Spreadsheet_Costs_ProjectCosts_BodyButtons_Cancel"
        />
      )}
    >
      {body}
    </FormPanel>
  );
}
