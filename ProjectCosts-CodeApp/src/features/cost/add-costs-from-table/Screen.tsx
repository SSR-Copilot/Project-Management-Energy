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
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@fluentui/react-components";
import { Dismiss24Regular, Add20Regular, Delete20Regular, Copy20Regular } from "@fluentui/react-icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import { EmptyState, LoadingOverlay, WriteStatus } from "@/components";
import { useSession } from "@/app/SessionContext";
import { serverEnforcedProvider } from "@/platform/privileges";
import { costAllowedStart, SENTINEL_YEAR } from "@/features/cost/capex-costs/clusters";
import { CATEGORY_LABELS, resolveCategory } from "@/features/cost/capex-costs/rules";
import { useAddCostSheet, useSaveAddCostSheet } from "@/features/cost/costing/useCostBook";
import { useCostWriteInFlight, useWriteFailureReport } from "@/features/cost/costing/useCostWriteFlight";
import { costWriteStatusLabel } from "@/domain/writeGuard";
import { prepareLogReport, screenSaveFailureReport, toSaveFailure } from "@/data/addCostSheet";
import { emitSaveLog } from "@/data/saveLog";
import { rootCauseDetail } from "@/platform/errors";
import {
  ADDCOST_MSG, buildInitialSheet, canOpenBulkEdit, canSaveBulkEdit, saveFailureText,
  sheetTitle, sheetYearRange, validateSheet, type SheetRow, type ValidationError,
} from "./rules";
import { outputRowsToSheetRows, prepareSheetSave, sheetRowsToGrid } from "./spreadsheet/adapter";
import { SpreadSheetComp, gridToJson, type SheetGrid } from "./spreadsheet/SpreadSheet";
import { saveButtonDisabled, saveRequestRows, sheetLocked } from "./saveRetry";

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
  /** CA-15 — a Cost write of this project still running, from any screen or an earlier visit. */
  const writeInFlight = useCostWriteInFlight(projectId);
  /** CA-15 — the banner while this screen is mounted, the error toast once it has been left. */
  const reportFailure = useWriteFailureReport("Add Costs from Table");

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
    // One line (plus a collapsed group, D59), so a slow Save can be pinned on the client side or
    // the network side at a glance.
    const readBack = readBackMs.current;
    const validation = validationMs.current;
    emitSaveLog(() => prepareLogReport(prepared.timings, readBack, validation, currentRows.length));
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
      const failure = toSaveFailure(error);
      const userText = saveFailureText(failure);
      // CA-15: the sheet's banner while it is mounted; the error toast if the user has left.
      reportFailure(userText, setSaveError);
      // The full chain (phase → chunk → Dataverse fault) for support, readable with ids replaced,
      // then the raw error object in its own collapsed group (D59); the screen shows one line.
      emitSaveLog(() => screenSaveFailureReport(error, failure.kind, userText));
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
    /*
     * No canvas control (the canvas screen sets no `LoadingSpinner`): the code app's own inline
     * "Loading the cost table…" spinner (restored by D60 after D58 had left this body empty, so
     * opening the sheet showed a blank screen through the chunk download, the sheet fetch and the
     * grid build). The grid needs `initialGrid`, so nothing else can render yet.
     */
    return <LoadingOverlay mode="inline" label="Loading the cost table…" testId="add-costs-loading" />;
  }

  const categoryName = CATEGORY_LABELS[category] ?? "";
  const title = sheetTitle(project?.projectName ?? "", categoryName);
  // D58: no scrim while saving, so the sheet and its edit/leave controls lock instead.
  const locked = sheetLocked({ isPending: save.isPending });

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
            data-testid="ico_PopUpConfirmation_BodyHeader_2"
            disabled={locked}
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
          <Button aria-label="Add Row" data-testid="btn_AddRow_SpreadSheet_Costs_ProjectCosts_TableCommandBar_AddDataTable" appearance="transparent" icon={<Add20Regular />} disabled={locked} onClick={() => setAddRowToken((t) => t + 1)}>
            Add Row
          </Button>
          <Button aria-label="Delete Row" data-testid="btn_DeleteRow_SpreadSheet_Costs_ProjectCosts_TableCommandBar_AddDataTable" appearance="transparent" icon={<Delete20Regular />} disabled={locked} onClick={() => setDeleteRowToken((t) => t + 1)}>
            Delete Row
          </Button>
          <Button aria-label="Copy Table" data-testid="btn_CopyData_SpreadSheet_Costs_ProjectCosts_TableCommandBar_AddDataTable_3" appearance="transparent" icon={<Copy20Regular />} disabled={locked} onClick={() => setCopyTableToken((t) => t + 1)}>
            Copy Table
          </Button>
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

        {/* Grid */}
        <div style={{ flex: 1, overflow: "auto", minHeight: 0 }} data-testid="add-costs-grid" inert={locked}>
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
          {/*
            * DIVERGENCE (D58): replaces `cmp_Costs_PopUpLoading_CostDescriptionAddCostFromTable`
            * (`cmp_PopUp_Loading_1`, `Visible: =locIsVisiblePopUpSpinner`,
            * `InformationText: =locSpinnerInformationText`) with one non-blocking status line in
            * the footer, same verbatim text. Save stays guarded by `saveButtonDisabled`.
            */}
          {/* CA-15: a write still running from another screen (or an earlier visit) says so. */}
          <WriteStatus testId="add-costs-write-status" label={costWriteStatusLabel({
            ownLabel: save.isPending ? "Please wait, saving costs..." : null,
            ownPending: save.isPending, writeInFlight,
          })} />
          <Button aria-label="Cancel" data-testid="pcf_Spreadsheet_Costs_ProjectCosts_BodyButtons_Cancel" appearance="outline" disabled={locked} onClick={back}>Cancel</Button>
          <Button
            aria-label="Save"
            data-testid="pcf_Spreadsheet_Costs_ProjectCosts_BodyButtons_Save"
            appearance="primary"
            // Not while the sheet reloads (`saveButtonDisabled` says why).
            disabled={saveButtonDisabled({
              canSave: canSaveBulkEdit(permissions, errors),
              // CA-15: also while a Cost write started elsewhere is still running.
              isPending: save.isPending || writeInFlight,
              isFetching: sheetQuery.isFetching,
            })}
            onClick={() => { void doSave(); }}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
