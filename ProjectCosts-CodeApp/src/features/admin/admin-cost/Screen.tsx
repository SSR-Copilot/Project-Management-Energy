/**
 * Application Settings — Costs. Replaces the canvas 'Admin Cost Screen'.
 *
 * Standard cost assumptions per Country × Technology: DEVEX/CAPEX standard costs (T1) and the
 * O&M / Land Lease / Other OPEX standard contracts with their periods (T2).
 *
 * Composition only: rules in `./rules.ts`, queries in `./hooks.ts`, Dataverse I/O in
 * `@/data/adminCost.ts`. *
 * Apply / Apply to All are drawn disabled with their info text, as in the canvas
 * (`ApplyStrip`); they make no data calls. Not built: the `vsb_applyandapplyalltracking` history
 * tag (no generated service).
 */
import { useMemo } from "react";
import { Text, makeStyles, tokens } from "@fluentui/react-components";
import {
  ConfirmDialog, CountryTechnologyPicker, LoadingOverlay, NoticeBar, QueryStates, ScopeHeaderBand,
  SettingsAccordion, useNotify,
  useQueryHealth,
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
import { ApplyStrip } from "./ApplyStrip";

const useStyles = makeStyles({
  page: {
    display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalM,
    paddingTop: "15px", paddingLeft: "10px", paddingRight: "10px", paddingBottom: tokens.spacingVerticalXL,
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
  title: { fontSize: "20px", lineHeight: "28px", fontWeight: tokens.fontWeightSemibold, marginTop: "0", marginBottom: "0" },
  sectionError: { marginTop: "8px", marginBottom: "8px" },
  // ACS:783-817 — the 70 px command container (20 px side margins) holds the 45 px band at Y = 10;
  // the section list starts 80 px below the breadcrumb band, so 25 px of air under the band
  // (the accordion's own 10 px top padding is the rest).
  applyBar: { paddingLeft: "20px", paddingRight: "20px", paddingTop: "10px", paddingBottom: "15px" },
});

/** The canvas page title (`cmp_Admin_ProjectGatest_Approvals_Header_1`). */
const PAGE_TITLE = "Costs";

type DeleteKind = "devex" | "contract" | "period";
type DeleteTarget = { cost: DevexCost } | { contract: ContractView; row: OpexPeriod };

export default function CostsSettingsScreen() {
  const styles = useStyles();
  const notify = useNotify();
  const locale = useMemo(() => localeInfo().tag, []);
  const decimalSeparator = useMemo(() => localeInfo().decimalSeparator, []);
  /* The admin gate (master's `useAdminAccess`): a non-admin sees the data but every add / edit /
     delete is disabled. Table privileges are the second seam (a 403 becomes `permissionMessage`). */
  const isAdmin = useAdminAccess();
  const devexTable = useTablePrivileges(DEVEX_ENTITY_SET);
  const opexTable = useTablePrivileges(OPEX_ENTITY_SET);

  const countriesQ = useCostCountries();
  const hierarchyQ = useCapexHierarchy();
  const landLeaseQ = useLandLeaseSubaccounts();
  const opexSubsQ = useOpexSubaccounts();
  const currenciesQ = useCostCurrencies();
  const payerQ = useCostPayerDefaults();

  // The canvas deny-list; only the six configured countries get Wind / PV
  // (ACS:650-733). Any other listed country has no technologies and can never be selected.
  const countries = useMemo(() => pickerCountries(countriesQ.data ?? [], COST_COUNTRY_RULE), [countriesQ.data]);
  const picked = useCountryTechnologySelection({
    countries, technologies: COST_TECHNOLOGIES, defaultTo: COST_DEFAULT, technologiesFor: COST_TECHNOLOGIES_FOR,
  });
  const selection = toCostSelection(picked.selection, picked.country);
  const scope = selection ? toScope(selection) : undefined;

  const devexQ = useDevexCosts(scope);
  const opexQ = useOpexPeriods(scope);
  // Best effort: if this read fails the screen behaves as before (server checks still apply).
  const inactiveQ = useInactiveOpexRows(scope);
  const areasQ = useInflationAreas(selection?.countryId, selection?.countryName === "Italy");

  // The two DEVEX writes are `WritePlan`s (D36); the plan refuses without `isAdmin` too, so a
  // write can never be sent without it — the screen's own refusals below still fire first.
  const saveDevex = useSaveDevexCost(scope, isAdmin);
  const deleteDevex = useDeleteDevexCost(scope, isAdmin);
  const saveOpex = useSaveOpexPeriod(scope);
  const deleteContract = useDeleteOpexContract(scope);
  const deletePeriod = useDeleteOpexPeriod(scope);

  /** All four sections collapsed on entry, each toggles independently. */
  const sections = useToggleSet();
  /** DEVEX categories folded by default. */
  const openDevex = useToggleSet();
  /** Contracts expanded by default; fold state is UI state only. */
  const collapsed = useToggleSet();
  const devexPanel = usePanelState<{ editing?: DevexCost }>();
  const opexPanel = usePanelState<{ ctx: OpexPanelContext }>();
  const dialog = useConfirmDialog<DeleteKind, DeleteTarget>();
  /**
   * Outcomes are toasts. Where the page notice used to be cleared (scope change, opening a
   * panel, starting a delete), the toasts are dismissed, so a stale outcome never lingers.
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
    // A scope change folds every DEVEX category.
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
      devexPanel.setError(errorText(error, MSG.devexSaveFailed, "save standard costs"));
      return;
    }
    devexPanel.close();
    // After a save only the saved category is unfolded.
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
      await saveOpex.mutateAsync(write);
    } catch (error) {
      if (error instanceof OpexFollowUpError) {
        // The row itself is saved; close and say exactly what did not happen.
        opexPanel.close();
        notify.error(error.message);
        return;
      }
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
  /** `closeFirst`: the dialog closes at once, the delete runs under the page overlay. */
  const runDelete = async ({ kind, payload }: ConfirmState<DeleteKind, DeleteTarget>) => {
    if (!selection) return;
    clearNotice();
    if (!isAdmin) { notify.error(MSG.noPermission); return; }
    try {
      if ("cost" in payload) {
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
        await deleteContract.mutateAsync(contractScope);
        notify.success(MSG.contractDeleted);
      } else {
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

  const sectionBody = (cat: CostCategoryDef) => {
    if (cat.contractType === undefined) {
      return (
        <>
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
            canEdit={(r) => canEditOpex(r) && Boolean(contracts.find((c) => c.periods.includes(r))?.subaccountId)}
            // Like Edit: a row without a sub-account cannot be addressed as a contract.
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
      {/* Master's shell header carries no admin page title, so the screen renders the canvas
          page title "Costs" (`cmp_Admin_ProjectGatest_Approvals_Header_1`) itself, as master's
          other admin screens do. Outcomes are toasts. */}
      <Text as="h1" className={styles.title}>{PAGE_TITLE}</Text>
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
            {/* Costs defaults: SVG flags, the country name as plain text, +/- toggles only. */}
            <CountryTechnologyPicker
              countries={countries}
              technologies={COST_TECHNOLOGIES}
              technologiesFor={COST_TECHNOLOGIES_FOR}
              value={picked.selection}
              onChange={onSelect}
            />
            <section className={styles.right} aria-label="Standard cost assumptions">
              <ScopeHeaderBand live title={breadcrumbText(selection.countryName, selection.technology)} />
              <div className={styles.applyBar}>
                <ApplyStrip scope="all" />
              </div>
              <SettingsAccordion
                variant="grey"
                openItems={[...sections.values]}
                onToggle={sections.toggle}
                items={COST_CATEGORIES.map((cat) => ({ id: cat.key, title: cat.title, content: sectionBody(cat) }))}
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
