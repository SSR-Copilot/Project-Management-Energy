/**
 * Application Settings — Costs. Replaces the canvas 'Admin Cost Screen' (PM app,
 * `ProjectDocs/_extracted/msapp/projectmanagement/Src/Admin Cost Screen.pa.yaml`, D24 / D36).
 *
 * Standard cost assumptions per Country × Technology: DEVEX/CAPEX standard costs (T1) and the
 * O&M / Land Lease / Other OPEX standard contracts with their periods (T2).
 *
 *   cmp_Admin_ProjectGatest_Approvals_Header_1            page title "Costs"
 *   cmp_Admin_Costs_Assumption_NestedCountryPickerColumn  the country rail (Wind / PV)
 *   con_Admin_Costs_Assumptions_RightContent              the right-hand column
 *     Label1                                              "Standard Assumptions / Costs / …"
 *     Gallery1 over colAdminCostCategories                four sections (`SettingsAccordion`), all folded
 *       DEVEX/CAPEX                                       `DevexCostTree` + `DevexCostDrawer`
 *       Operation & Maintenance / Land Lease / Other      `OpexContractTable` + `ContractPeriodDrawer`
 *   cmp_PopUp_Confirmation_Delete_Contract_Or_Period      `ConfirmDialog`
 *   cmp_PopUp_Loading_Admin_Cost                          the `LoadingOverlay` while deleting
 *
 * Composition only: rules in `./rules.ts`, queries in `./hooks.ts`, Dataverse I/O in
 * `@/data/adminCost.ts`.
 *
 * The canvas Apply / Apply to All bars are not built (D67).
 *
 * DIVERGENCE (outcomes): the canvas shows nothing on success and a raw `Notify` on failure; this
 * screen shows short toasts (`useNotify`) for every save / delete outcome — see `MSG` in
 * `./constants.ts`.
 */
import { useMemo } from "react";
import { makeStyles, tokens } from "@fluentui/react-components";
import {
  ConfirmDialog, CountryTechnologyPicker, LoadingOverlay, NoticeBar, QueryStates, ScopeHeaderBand,
  SettingsAccordion, useNotify,
  useQueryHealth,
  VisuallyHidden,
} from "@/components";
import { useConfirmDialog, type ConfirmState } from "@/features/shared/useConfirmDialog";
import { useCountryTechnologySelection } from "@/features/shared/useCountryTechnologySelection";
import { usePanelState } from "@/features/shared/usePanelState";
import { useToggleSet } from "@/features/shared/useToggleSet";
import { COST_COUNTRY_RULE, COST_DEFAULT, pickerCountries, type CountryTechnology } from "@/domain/countryPicker";
import { localeInfo } from "@/domain/locale";
import { COST_TECHNOLOGIES } from "@/domain/technology";
import { DEVEX_ENTITY_SET, OPEX_ENTITY_SET, type DevexCost, type DevexWrite, type OpexPeriod } from "@/data/adminCost";
import { CONTRACT_TYPE, OpexFollowUpError, type OpexContractType } from "@/domain/costStandards";
import { useAdminAccess } from "@/app/useCurrentUser";
import { useTablePrivileges } from "@/platform/privileges";
import { media, palette } from "@/theme/tokens";
import { COST_CATEGORIES, COST_TECHNOLOGIES_FOR, MSG, type CostCategoryDef } from "./constants";
import {
  breadcrumbText, buildDevexTree, contractMenu, currencyCode, deleteDialogText,
  deleteKind, devexWriteFromForm, editModeFor, errorText, groupContracts, opexWriteFromForm,
  toCostSelection, toScope, type ContractView, type DevexForm, type HiddenValues, type MenuItemView,
  type OpexForm, type OpexPanelContext,
} from "./rules";
import {
  useCapexHierarchy, useCostCountries, useCostCurrencies, useCostPayerDefaults,
  useDeleteDevexCost, useDeleteOpexContract, useDeleteOpexPeriod, useDevexCosts, useInactiveOpexRows, useInflationAreas,
  useLandLeaseSubaccounts, useOpexPeriods, useOpexSubaccounts, useSaveDevexCost, useSaveOpexPeriod,
} from "./hooks";
import { CategoryCommandRow } from "./CategoryCommandRow";
import { DevexCostTree } from "./DevexCostTree";
import { OpexContractTable } from "./OpexContractTable";
import { DevexCostDrawer } from "./DevexCostDrawer";
import { ContractPeriodDrawer } from "./ContractPeriodDrawer";

const useStyles = makeStyles({
  page: {
    display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalM,
    // 29 Oct 2026 (Canvas parity run): the canvas rail starts at the content edge, as on every other settings screen, so no extra page inset.
    paddingBottom: tokens.spacingVerticalXL,
    backgroundColor: palette.white, minHeight: "100%", boxSizing: "border-box", minWidth: "0",
  },
  // `alignItems: stretch` + `flexGrow: 1` so the row FILLS the column page instead of hugging
  // its content — that is what lets the picker reach the left navigation's height.
  body: {
    display: "flex", columnGap: "5px", rowGap: "5px", alignItems: "stretch",
    flexGrow: 1, minHeight: "0",
    backgroundColor: palette.neutralLighter, paddingTop: "5px", paddingBottom: "5px", paddingLeft: "5px", paddingRight: "5px",
    minWidth: "0",
    [media.belowMd]: { flexDirection: "column", alignItems: "stretch", flexGrow: 0 },
  },
  // This column scrolls, not the picker (one scroll container per screen).
  right: {
    flexGrow: 1, minWidth: "0", minHeight: "0", backgroundColor: palette.white, paddingBottom: "10px",
    display: "flex", flexDirection: "column",
    overflowY: "auto",
  },
  sectionError: { marginTop: "8px", marginBottom: "8px" },
});

/** `cmp_Admin_ProjectGatest_Approvals_Header_1.Project` — `Name: "Costs"`, verbatim. */
const PAGE_TITLE = "Costs";

type DeleteKind = "devex" | "contract" | "period";
type DeleteTarget = { cost: DevexCost } | { contract: ContractView; row: OpexPeriod };

export default function CostsSettingsScreen() {
  const styles = useStyles();
  const notify = useNotify();
  const locale = useMemo(() => localeInfo().tag, []);
  const decimalSeparator = useMemo(() => localeInfo().decimalSeparator, []);
  /* The admin gate (`useAdminAccess`): a non-admin sees the data but every add / edit / delete is
     disabled. Table privileges (`useTablePrivileges`) are the second seam, standing in for the
     canvas `DataSourceInfo` / `RecordInfo` checks (D1); a 403 from the server becomes the
     permission message (`errorText`). */
  const isAdmin = useAdminAccess();
  const devexTable = useTablePrivileges(DEVEX_ENTITY_SET);
  const opexTable = useTablePrivileges(OPEX_ENTITY_SET);

  const countriesQ = useCostCountries();
  const hierarchyQ = useCapexHierarchy();
  const landLeaseQ = useLandLeaseSubaccounts();
  const opexSubsQ = useOpexSubaccounts();
  const currenciesQ = useCostCurrencies();
  const payerQ = useCostPayerDefaults();

  // The canvas deny-list (Spain / Greece / Romania dropped); only the six configured countries get
  // Wind / PV (ACS:650-733). Any other listed country has no technologies and can never be selected.
  const countries = useMemo(() => pickerCountries(countriesQ.data ?? [], COST_COUNTRY_RULE), [countriesQ.data]);
  const picked = useCountryTechnologySelection({
    countries, technologies: COST_TECHNOLOGIES, defaultTo: COST_DEFAULT, technologiesFor: COST_TECHNOLOGIES_FOR,
  });
  const selection = toCostSelection(picked.selection, picked.country);
  const scope = selection ? toScope(selection) : undefined;

  const devexQ = useDevexCosts(scope);
  const opexQ = useOpexPeriods(scope);
  // Best effort: if this read fails, no period action is blocked by hidden rows (the server checks
  // in `@/data/adminCost` still apply). DIVERGENCE: see `inactiveRowsReason` in `./rules.ts`.
  const inactiveQ = useInactiveOpexRows(scope);
  const areasQ = useInflationAreas(selection?.countryId, selection?.countryName === "Italy");

  // The two DEVEX writes are `WritePlan`s (D36); the plan also refuses without `isAdmin`, so a
  // write can never be sent without it — the screen's own refusals below still fire first.
  const saveDevex = useSaveDevexCost(scope, isAdmin);
  const deleteDevex = useDeleteDevexCost(scope, isAdmin);
  // The three contract writes stay multi-step data-layer flows in `@/data/adminCost.ts` (D36 §3).
  const saveOpex = useSaveOpexPeriod(scope);
  const deleteContract = useDeleteOpexContract(scope);
  const deletePeriod = useDeleteOpexPeriod(scope);

  /** `colAdminCostCategories.IsFolded: true` — all four sections collapsed on entry, each toggles independently. */
  const sections = useToggleSet();
  /** `locSelectedDevexCapexCategory` / `IsFolded` — DEVEX categories folded by default. */
  const openDevex = useToggleSet();
  /** `'IsCollapsed?'` — contracts expanded by default; fold state is UI state only. */
  const collapsed = useToggleSet();
  const devexPanel = usePanelState<{ editing?: DevexCost }>();
  const opexPanel = usePanelState<{ ctx: OpexPanelContext }>();
  const dialog = useConfirmDialog<DeleteKind, DeleteTarget>();
  /**
   * Outcomes are toasts. A scope change, opening a panel and starting a delete dismiss the open
   * toasts, so a stale outcome never lingers.
   */
  const clearNotice = () => notify.dismissAll();

  const hierarchy = useMemo(() => hierarchyQ.data ?? { categories: [], accounts: [], subaccounts: [] }, [hierarchyQ.data]);
  const devexCosts = useMemo(() => devexQ.data ?? [], [devexQ.data]);
  const opexPeriods = useMemo(() => opexQ.data ?? [], [opexQ.data]);
  const inactiveRows = useMemo(() => inactiveQ.data ?? [], [inactiveQ.data]);
  const landLeaseSubs = useMemo(() => landLeaseQ.data ?? [], [landLeaseQ.data]);
  const opexSubs = useMemo(() => opexSubsQ.data ?? [], [opexSubsQ.data]);
  const currencies = useMemo(() => currenciesQ.data ?? [], [currenciesQ.data]);
  const payerDefaults = useMemo(() => payerQ.data ?? new Map<string, number>(), [payerQ.data]);

  const devexGroups = useMemo(() => buildDevexTree(devexCosts, hierarchy), [devexCosts, hierarchy]);
  const currencyNames = useMemo(() => new Map(currencies.map((c) => [c.id, c.name])), [currencies]);
  const llNames = useMemo(() => new Map(landLeaseSubs.map((s) => [s.id, s.name])), [landLeaseSubs]);
  const opexNames = useMemo(() => new Map(opexSubs.map((s) => [s.id, s.name])), [opexSubs]);

  /* ─────────────────────────────────────────────── permissions ── */
  const canEditDevex = (c: DevexCost) => isAdmin && devexTable.forRecord(c.id).canWrite;
  const canDeleteDevex = (c: DevexCost) => isAdmin && devexTable.forRecord(c.id).canDelete;
  const canEditOpex = (r: OpexPeriod) => isAdmin && opexTable.forRecord(r.id).canWrite;
  const canDeleteOpex = (r: OpexPeriod) => isAdmin && opexTable.forRecord(r.id).canDelete;

  /* ─────────────────────────────────────────────────────── selection ── */
  const onSelect = (next: CountryTechnology) => {
    picked.select(next);
    // A scope change folds every DEVEX category (the picker's `Select(btn_Filter_Devex_Capex_Assumptions)`)
    // and re-expands every contract.
    openDevex.clear();
    collapsed.clear();
    clearNotice();
  };

  /* ─────────────────────────────────────────────────────────── DEVEX ── */
  const openDevexPanel = (editing?: DevexCost) => {
    clearNotice();
    devexPanel.open(editing ? { editing } : {});
  };

  const onSaveDevex = async (form: DevexForm) => {
    const current = devexPanel.panel;
    if (!selection || !current) return;
    if (!isAdmin) { devexPanel.setError(MSG.noPermission); return; }
    devexPanel.setError(undefined);
    let write: DevexWrite;
    try {
      // Throws `DevexRuleError` for an inactive sub-account — nothing is written.
      write = devexWriteFromForm(form, {
        ...(current.editing ? { id: current.editing.id } : {}), selection, hierarchy, locale,
      });
      await saveDevex.mutateAsync(write);
    } catch (error) {
      /*
       * DIVERGENCE: the panel stays open with the input and the error. The canvas closes it
       * BEFORE the `Patch` (`pcf_btn_AdminCost_RightPanel_Form_AddStandardCost_Button_Save.OnChange`:
       * `locIsVisibleAddCostPanel: false`) and has no `IfError` (SOURCE DEFECT: a failed save is
       * silent).
       */
      devexPanel.setError(errorText(error, MSG.devexSaveFailed, "save standard costs"));
      return;
    }
    devexPanel.close();
    // After a save only the saved category is unfolded (`locSelectedDevexCapexCategory` +
    // `Select(btn_Filter_Devex_Capex_Assumptions)`).
    openDevex.replace([write.categoryId]);
    notify.success(MSG.devexSaved);
  };

  /* ─────────────────────────────────────────────────────── contracts ── */
  const openOpexPanel = (ctx: OpexPanelContext) => {
    clearNotice();
    opexPanel.open({ ctx });
  };

  const onAddContract = (type: OpexContractType, item: MenuItemView) => {
    openOpexPanel({
      mode: "newContract", type, subaccount: { id: item.id, name: item.name, order: item.order }, decimalSeparator,
    });
  };

  const subaccountOf = (contract: ContractView) => ({ id: contract.subaccountId ?? "", name: contract.subaccountName, order: 0 });

  const onEditRow = (contract: ContractView, row: OpexPeriod) => {
    openOpexPanel({ mode: editModeFor(row), type: contract.type, subaccount: subaccountOf(contract), row, contract, decimalSeparator });
  };

  const onAddPeriod = (contract: ContractView) => {
    openOpexPanel({ mode: "addPeriod", type: contract.type, subaccount: subaccountOf(contract), contract, decimalSeparator });
  };

  const onSaveOpex = async (form: OpexForm, hidden: HiddenValues) => {
    const current = opexPanel.panel;
    if (!selection || !current) return;
    if (!isAdmin) { opexPanel.setError(MSG.noPermission); return; }
    opexPanel.setError(undefined);
    const write = opexWriteFromForm(form, { panel: current.ctx, selection, currencies, hidden, locale });
    try {
      /*
       * DIVERGENCE (OPEX period save): the canvas `pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Save_1.OnChange`
       * Patches the row, then copies Period 1's contract values to the later periods, against the
       * screen's cached collection. `saveOpexPeriod` (`@/data/adminCost.ts`, a multi-step data-layer
       * flow, D36 §3) first re-checks the contract on the SERVER (one contract per sub-account;
       * next period = highest + 1, never past 10), then writes the row, re-flags `vsb_islastperiod`
       * and propagates Period 1 one guarded PATCH per period; a failure after the row write is an
       * `OpexFollowUpError`.
       */
      await saveOpex.mutateAsync(write);
    } catch (error) {
      if (error instanceof OpexFollowUpError) {
        // The row itself is saved; close and say exactly what did not happen.
        opexPanel.close();
        notify.error(error.message);
        return;
      }
      /*
       * DIVERGENCE: the panel stays open with the input and the error. The canvas closes it before
       * the write (`locIsVisibleLandLeaseStandardContract: false`) and only `Notify`s "Error: Land
       * Lease Standard Contract could not be saved correctly. Internal error: …".
       */
      opexPanel.setError(errorText(error, MSG.contractSaveFailed, "save standard contracts"));
      return;
    }
    const key = current.ctx.contract?.key ?? current.ctx.subaccount.id;
    opexPanel.close();
    // The saved contract is expanded.
    collapsed.remove(key);
    notify.success(MSG.contractSaved);
  };

  /* ───────────────────────────────────────────────────────── deletes ── */
  /**
   * `cmp_PopUp_Confirmation_Delete_Contract_Or_Period.OnConfirm`. `closeFirst`: the dialog closes
   * at once and the delete runs under the page overlay (`locIsVisibleDeleteConfirmation: false` +
   * the "Please wait, deleting..." spinner), as in the canvas.
   */
  const runDelete = async ({ kind, payload }: ConfirmState<DeleteKind, DeleteTarget>) => {
    if (!selection) return;
    clearNotice();
    if (!isAdmin) { notify.error(MSG.noPermission); return; }
    try {
      if ("cost" in payload) {
        // `Select(btn_AdminCost_DevexCapex_Delete_StandardCost_Confirm)`: one DELETE (`planDeleteDevexCost`).
        // DIVERGENCE (D20): no `Apply and Apply All Trackings` row is written after it.
        await deleteDevex.mutateAsync(payload.cost.id);
        if (payload.cost.categoryId) openDevex.replace([payload.cost.categoryId]);
        notify.success(MSG.devexDeleted);
        return;
      }
      const contractScope = {
        countryId: selection.countryId, technology: selection.technology,
        type: payload.contract.type, subaccountId: payload.contract.subaccountId ?? "",
      };
      if (kind === "contract") {
        /*
         * SOURCE DEFECT (fixed): the canvas deletes a contract with one `RemoveIf` over the table
         * (and one over the cached collection, in `Concurrent`) whose filter is not delegable
         * (`Text(Technology) = …`), so rows beyond the row limit are never seen. `deleteOpexContract`
         * (`@/data/adminCost.ts`, D36 §3) reads every row of the contract from the server and deletes
         * them by id, later periods first and Period 1 last, one at a time; after a partial failure
         * it repairs the last-period flags and reports the counts (`ContractDeleteError`).
         */
        await deleteContract.mutateAsync(contractScope);
        notify.success(MSG.contractDeleted);
      } else {
        /*
         * SOURCE DEFECT (fixed): the canvas picks the new tail as `First(LastN(Sort(rows,
         * Description), 2))` — by DESCRIPTION, so "X - 10" sorts before "X - 2" — and Patches it
         * `'IsLastPeriod?' = Yes` concurrently with the delete. `deleteOpexPeriod`
         * (`@/data/adminCost.ts`, D36 §3) re-checks on the server that the row is still the last
         * period, deletes it, then marks the highest remaining NUMERIC period as last (repaired
         * once from the server on failure). No `newTailCanvasParity` twin exists any more (the
         * port dropped it).
         */
        await deletePeriod.mutateAsync({ id: payload.row.id, contract: contractScope });
        notify.success(MSG.periodDeleted);
      }
    } catch (error) {
      const prefix = kind === "devex" ? MSG.devexDeleteFailed
        : kind === "contract" ? MSG.contractDeleteFailed : MSG.periodDeleteFailed;
      const action = kind === "devex" ? "delete standard costs" : "delete standard contracts";
      notify.error(errorText(error, prefix, action));
    }
  };

  const target = dialog.state;
  const dialogText = target
    ? "cost" in target.payload
      ? deleteDialogText("devex", target.payload.cost.description)
      : deleteDialogText(target.kind === "contract" ? "contract" : "period", target.payload.row.description)
    : undefined;

  /* ─────────────────────────────────────────────────────────── render ── */
  const health = useQueryHealth([countriesQ, hierarchyQ, landLeaseQ, opexSubsQ, currenciesQ, payerQ]);
  const deleting = deleteDevex.isPending || deleteContract.isPending || deletePeriod.isPending;
  const cur = selection ? currencyCode(selection.countryName) : "EUR";

  /*
   * The load / error / empty texts below are NEW — no canvas equivalent (rule 19: a failed read
   * must never look like "no rows"; the canvas showed an empty gallery).
   */
  const sectionBody = (cat: CostCategoryDef) => {
    if (cat.contractType === undefined) {
      return (
        <>
          {/* `btn_Admin_Cost_DevexCapex_AddCost.DisplayMode` — `DataSourceInfo(…, CreatePermission)`. */}
          <CategoryCommandRow title={cat.title} sectionKey={cat.key} kind="devex" canCreate={isAdmin && devexTable.canCreate} onAddCost={() => openDevexPanel()} />
          {devexQ.error ? (
            <NoticeBar intent="error" className={styles.sectionError} action={{ label: "Retry", onClick: () => void devexQ.refetch() }}>
              {errorText(devexQ.error, "The standard costs could not be loaded.", "read standard costs")}
            </NoticeBar>
          ) : devexQ.isLoading ? (
            <LoadingOverlay mode="inline" label="Loading standard costs…" />
          ) : (
            <DevexCostTree
              groups={devexGroups}
              openCategories={openDevex.values}
              canEdit={canEditDevex}
              canDelete={canDeleteDevex}
              onToggle={openDevex.toggle}
              onEdit={(c) => openDevexPanel(c)}
              onDelete={(c) => dialog.ask("devex", { cost: c })}
            />
          )}
        </>
      );
    }
    const type = cat.contractType;
    const names = type === CONTRACT_TYPE.landLease ? llNames : opexNames;
    const contracts = groupContracts(opexPeriods, type, names, inactiveRows);
    return (
      <>
        <CategoryCommandRow
          title={cat.title}
          sectionKey={cat.key}
          kind="contract"
          menuItems={contractMenu(type, landLeaseSubs, opexSubs, opexPeriods)}
          canCreate={isAdmin && opexTable.canCreate && !opexQ.isLoading && !opexQ.error}
          onAddContract={(item) => onAddContract(type, item)}
        />
        {opexQ.error ? (
          <NoticeBar intent="error" className={styles.sectionError} action={{ label: "Retry", onClick: () => void opexQ.refetch() }}>
            {errorText(opexQ.error, "The standard contracts could not be loaded.", "read standard contracts")}
          </NoticeBar>
        ) : opexQ.isLoading ? (
          <LoadingOverlay mode="inline" label="Loading standard contracts…" />
        ) : (
          <OpexContractTable
            title={cat.title}
            type={type}
            contracts={contracts}
            currencyCode={cur}
            currencyNames={currencyNames}
            collapsed={collapsed.values}
            canCreate={isAdmin && opexTable.canCreate}
            // DIVERGENCE: a row without a sub-account cannot be addressed as a contract, so Edit and
            // Delete are disabled on it (the canvas offers both on every row).
            canEdit={(r) => canEditOpex(r) && Boolean(contracts.find((c) => c.periods.includes(r))?.subaccountId)}
            canDelete={(r) => canDeleteOpex(r) && Boolean(contracts.find((c) => c.periods.includes(r))?.subaccountId)}
            onToggle={collapsed.toggle}
            onEdit={onEditRow}
            onDelete={(contract, row) => dialog.ask(deleteKind(contract, row), { contract, row })}
            onAddPeriod={onAddPeriod}
          />
        )}
      </>
    );
  };

  return (
    <div className={styles.page}>
      {/* The canvas page title "Costs" (`cmp_Admin_ProjectGatest_Approvals_Header_1`) is in the shell header
          (`app/adminTitles.ts`); the screen keeps a visually hidden h1. Outcomes are toasts. */}
      <VisuallyHidden as="h1" testId="cmp_Admin_ProjectGatest_Approvals_Header_1">{PAGE_TITLE}</VisuallyHidden>
      {health.staleError !== undefined && health.phase === "ready" ? (
        <NoticeBar intent="warning" action={{ label: "Retry", onClick: health.retryFailed }}>
          {errorText(health.staleError, "The standard assumptions could not be refreshed.", "read standard assumptions")}
        </NoticeBar>
      ) : null}
      <QueryStates
        health={health}
        loadingLabel="Loading standard assumptions…"
        fatal={{
          title: "Standard cost assumptions could not be loaded",
          text: (error) => errorText(error, "", "read standard assumptions").trim(),
          retry: "all",
        }}
        empty={{ when: !selection, title: "No countries found", description: "There are no active countries to show standard cost assumptions for." }}
      >
        {() => (selection ? (
          <div className={styles.body}>
            {/*
              `cmp_Admin_Costs_Assumption_NestedCountryPickerColumn` (its name is the stem of every
              picker control's `data-testid`). Costs defaults: SVG flags, the country name as plain
              text, +/- toggles only.
            */}
            <CountryTechnologyPicker
              countries={countries}
              technologies={COST_TECHNOLOGIES}
              technologiesFor={COST_TECHNOLOGIES_FOR}
              value={picked.selection}
              onChange={onSelect}
              testIdPrefix="cmp_Admin_Costs_Assumption_NestedCountryPickerColumn"
            />
            {/* NEW — no canvas equivalent: the region's accessible name (the canvas container has none). */}
            <section className={styles.right} aria-label="Standard cost assumptions" data-testid="con_Admin_Costs_Assumptions_RightContent">
              {/* `Label1.Text` — `$"Standard Assumptions / Costs / {Country} / {Technology}"` (`breadcrumbText`). */}
              <ScopeHeaderBand live title={breadcrumbText(selection.countryName, selection.technology)} testId="Label1" />
              {/*
                `Gallery1` over `colAdminCostCategories`: one `Container5` per category, its header
                `Container6` (`Label1_2` + the `ico_…_GeneratorType_Up_2` / `_Down_2` chevrons).
                The accordion header button cannot carry the chevrons' canvas names (no prop).
              */}
              <SettingsAccordion
                variant="grey"
                openItems={[...sections.values]}
                onToggle={sections.toggle}
                items={COST_CATEGORIES.map((cat) => ({ id: cat.key, title: cat.title, content: sectionBody(cat), testId: `Container5-${cat.key}` }))}
              />
            </section>
          </div>
        ) : null)}
      </QueryStates>

      {devexPanel.panel && selection ? (
        <DevexCostDrawer
          key={devexPanel.key}
          open
          editing={devexPanel.panel.editing}
          selection={selection}
          hierarchy={hierarchy}
          costs={devexCosts}
          payerDefaults={payerDefaults}
          locale={locale}
          saving={saveDevex.isPending}
          error={devexPanel.error}
          onSave={(form) => { void onSaveDevex(form); }}
          onDismiss={devexPanel.close}
        />
      ) : null}

      {opexPanel.panel && selection ? (
        <ContractPeriodDrawer
          key={opexPanel.key}
          open
          panel={opexPanel.panel.ctx}
          selection={selection}
          currencies={currencies}
          inflationAreas={areasQ.data ?? []}
          locale={locale}
          saving={saveOpex.isPending}
          error={opexPanel.error}
          onSave={(form, hidden) => { void onSaveOpex(form, hidden); }}
          onDismiss={opexPanel.close}
        />
      ) : null}

      <ConfirmDialog
        open={dialog.state !== null}
        title={dialogText?.title ?? ""}
        description={dialogText?.description ?? ""}
        destructive
        onConfirm={() => { void dialog.confirm(runDelete, { closeFirst: true }); }}
        onCancel={dialog.cancel}
      />

      {deleting ? <LoadingOverlay label={MSG.deleting} /> : null}
    </div>
  );
}
